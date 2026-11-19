// SPDX-License-Identifier: Apache-2.0
// Mirrors a Cloudflare R2 bucket into Garage over the S3 API: resumable (objects already present with
// the same size are skipped), sha256-verified end to end, parallel, with a dry-run mode.
//
//   bun scripts/ops/r2-to-garage.ts [--dry-run] [--verify-only] [--no-verify] [--concurrency N]
//       [--prefix P] [--part-mib N] [--state FILE]
//
// Environment (values never printed):
//   R2_ACCOUNT_ID | CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY (or CLOUDFLARE_API_TOKEN:
//   the S3 pair is derived from it: key id = token id, secret = sha256(token)), R2_BUCKET (default: the
//   bucket of deploy/garage/cluster.toml)
//   GARAGE_ACCESS_KEY_ID, GARAGE_SECRET_ACCESS_KEY, GARAGE_ENDPOINT (default: first active node of
//   deploy/garage/cluster.toml on its mesh address), GARAGE_BUCKET, GARAGE_REGION
import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { S3, sha256Hex, type S3Listed } from "../../deploy/garage/s3";
import { loadCluster, meshAddresses } from "./garage-config";

const HEX64 = /^_objects\/([a-f0-9]{64})$/;

interface Options {
  dryRun: boolean;
  verifyOnly: boolean;
  verify: boolean;
  concurrency: number;
  prefix: string;
  partBytes: number;
  state: string;
}

export function parseArgs(argv: string[]): Options {
  const options: Options = {
    dryRun: false,
    verifyOnly: false,
    verify: true,
    concurrency: 24,
    prefix: "",
    partBytes: 64 * 1024 * 1024,
    state: "r2-to-garage.state.jsonl",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const value = () => argv[++i] ?? "";
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--verify-only") options.verifyOnly = true;
    else if (arg === "--no-verify") options.verify = false;
    else if (arg === "--concurrency") options.concurrency = Math.max(1, Number(value()));
    else if (arg === "--prefix") options.prefix = value();
    else if (arg === "--part-mib") options.partBytes = Math.max(5, Number(value())) * 1024 * 1024;
    else if (arg === "--state") options.state = value();
    else throw new Error(`unknown argument ${arg}`);
  }
  return options;
}

const need = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

async function r2Client(bucket: string) {
  const account = process.env.R2_ACCOUNT_ID ?? need("CLOUDFLARE_ACCOUNT_ID");
  let accessKeyId = process.env.R2_ACCESS_KEY_ID;
  let secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    const token = need("CLOUDFLARE_API_TOKEN");
    const verify = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${account}/tokens/verify`,
      {
        headers: { authorization: `Bearer ${token}` },
      },
    );
    const body = (await verify.json()) as { result?: { id?: string } };
    if (!body.result?.id) throw new Error("CLOUDFLARE_API_TOKEN: token id unavailable");
    accessKeyId = body.result.id;
    secretAccessKey = sha256Hex(token);
  }
  return new S3({
    endpoint: `https://${account}.r2.cloudflarestorage.com`,
    region: "auto",
    accessKeyId,
    secretAccessKey,
    bucket,
  });
}

async function garageClient() {
  const cluster = await loadCluster();
  const mesh = await meshAddresses();
  const first = cluster.nodes.find((node) => node.status === "active");
  const endpoint =
    process.env.GARAGE_ENDPOINT ?? (first ? `http://${mesh(first.triad)}:${cluster.ports.s3}` : "");
  if (!endpoint) throw new Error("GARAGE_ENDPOINT is required (no active node in cluster.toml)");
  return {
    bucket: cluster.bucket.name,
    client: new S3({
      endpoint,
      region: process.env.GARAGE_REGION ?? cluster.garage.s3_region,
      accessKeyId: need("GARAGE_ACCESS_KEY_ID"),
      secretAccessKey: need("GARAGE_SECRET_ACCESS_KEY"),
      bucket: process.env.GARAGE_BUCKET ?? cluster.bucket.name,
    }),
  };
}

async function listAll(client: S3, prefix: string) {
  const map = new Map<string, S3Listed>();
  for await (const entry of client.list(prefix)) map.set(entry.key, entry);
  return map;
}

const totalBytes = (map: Map<string, S3Listed>) => {
  let bytes = 0;
  for (const entry of map.values()) bytes += entry.size;
  return bytes;
};

async function pool<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) await work(items[next++]!);
    }),
  );
}

async function retry<T>(label: string, run: () => Promise<T>, attempts = 5): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts) throw error;
      await Bun.sleep(500 * 2 ** attempt);
      void label;
    }
  }
}

const PASS_HEADERS = [
  "content-type",
  "cache-control",
  "content-disposition",
  "content-encoding",
  "content-language",
];

function carriedHeaders(source: Headers) {
  const headers: Record<string, string> = {};
  for (const name of PASS_HEADERS) {
    const value = source.get(name);
    if (value) headers[name] = value;
  }
  for (const [name, value] of source) if (name.startsWith("x-amz-meta-")) headers[name] = value;
  return headers;
}

/** Copies one object, hashing while streaming; returns the verified sha256. */
async function copyObject(
  source: S3,
  destination: S3,
  entry: S3Listed,
  partBytes: number,
): Promise<string> {
  const response = await source.get(entry.key);
  if (!response?.body) throw new Error(`source object vanished: ${entry.key}`);
  const declared = Number(response.headers.get("content-length"));
  if (declared !== entry.size) {
    await response.body.cancel();
    throw new Error(`size differs on source GET: ${entry.key}`);
  }
  const expected = HEX64.exec(entry.key)?.[1];
  const headers = carriedHeaders(response.headers);
  if (expected) headers["x-amz-meta-sha256"] = expected;
  const hash = createHash("sha256");
  const reader = response.body.getReader();
  let buffer: Uint8Array[] = [];
  let buffered = 0;
  let uploadId: string | undefined;
  const etags: string[] = [];
  let total = 0;
  const flush = async () => {
    const part = Buffer.concat(buffer, buffered);
    buffer = [];
    buffered = 0;
    if (!uploadId)
      uploadId = await retry("create", () => destination.createMultipart(entry.key, headers));
    const number = etags.length + 1;
    etags.push(
      await retry("part", () => destination.uploadPart(entry.key, uploadId!, number, part)),
    );
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      hash.update(value);
      total += value.byteLength;
      buffer.push(value);
      buffered += value.byteLength;
      if (buffered >= partBytes) await flush();
    }
    if (total !== entry.size) throw new Error(`short read: ${entry.key} ${total}/${entry.size}`);
    const actual = hash.digest("hex");
    if (expected && actual !== expected)
      throw new Error(`source sha256 differs from its key: ${entry.key}`);
    if (!uploadId) {
      const body = Buffer.concat(buffer, buffered);
      await retry("put", () =>
        destination.put(entry.key, body, { ...headers, "x-amz-meta-sha256": actual }),
      );
    } else {
      if (buffered > 0) await flush();
      await retry("complete", () => destination.completeMultipart(entry.key, uploadId!, etags));
    }
    return actual;
  } catch (error) {
    if (uploadId) await destination.abortMultipart(entry.key, uploadId).catch(() => {});
    throw error;
  }
}

async function streamSha256(client: S3, key: string) {
  const response = await client.get(key);
  if (!response?.body) return undefined;
  const hash = createHash("sha256");
  for await (const chunk of response.body) hash.update(chunk);
  return hash.digest("hex");
}

async function loadState(path: string) {
  const known = new Map<string, string>();
  const file = Bun.file(path);
  if (!(await file.exists())) return known;
  for (const line of (await file.text()).split("\n")) {
    if (!line) continue;
    const { key, sha256 } = JSON.parse(line) as { key: string; sha256: string };
    known.set(key, sha256);
  }
  return known;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const { client: garage, bucket: clusterBucket } = await garageClient();
  const source = await r2Client(process.env.R2_BUCKET ?? clusterBucket);
  const started = Date.now();
  const log = (message: string) =>
    console.error(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${message}`);

  log("listing source and destination");
  const [src, dst] = await Promise.all([
    listAll(source, options.prefix),
    listAll(garage, options.prefix),
  ]);
  const todo = [...src.values()].filter((entry) => dst.get(entry.key)?.size !== entry.size);
  const summary: Record<string, unknown> = {
    source: { objects: src.size, bytes: totalBytes(src) },
    destinationBefore: { objects: dst.size, bytes: totalBytes(dst) },
    toCopy: { objects: todo.length, bytes: todo.reduce((sum, entry) => sum + entry.size, 0) },
    destinationOnly: [...dst.keys()].filter((key) => !src.has(key)).length,
  };
  if (options.dryRun) {
    console.log(JSON.stringify({ dryRun: true, ...summary }));
    return 0;
  }

  const failures: string[] = [];
  let copied = 0;
  let copiedBytes = 0;
  if (!options.verifyOnly) {
    const ticker = setInterval(
      () =>
        log(`copied ${copied}/${todo.length} (${copiedBytes} bytes), failed ${failures.length}`),
      15000,
    );
    await pool(todo, options.concurrency, async (entry) => {
      try {
        const sha256 = await retry(
          "copy",
          () => copyObject(source, garage, entry, options.partBytes),
          3,
        );
        await appendFile(
          options.state,
          `${JSON.stringify({ key: entry.key, size: entry.size, sha256 })}\n`,
        );
        copied++;
        copiedBytes += entry.size;
      } catch (error) {
        failures.push(`${entry.key}: ${(error as Error).message}`);
        if (failures.length <= 3) log(`failure: ${failures.at(-1)}`);
      }
    });
    clearInterval(ticker);
  }
  summary.copied = { objects: copied, bytes: copiedBytes };
  summary.failed = failures.length;

  if (options.verify || options.verifyOnly) {
    log("verifying");
    const after = await listAll(garage, options.prefix);
    const missing = [...src.keys()].filter((key) => !after.has(key));
    const sizeMismatch = [...src.values()].filter(
      (e) => after.has(e.key) && after.get(e.key)!.size !== e.size,
    );
    const state = await loadState(options.state);
    const hashMismatch: string[] = [];
    let verified = 0;
    await pool(
      [...src.values()].filter((e) => after.has(e.key)),
      options.concurrency,
      async (entry) => {
        try {
          const actual = await retry("hash", () => streamSha256(garage, entry.key));
          const expected =
            HEX64.exec(entry.key)?.[1] ??
            state.get(entry.key) ??
            (await retry("src-hash", () => streamSha256(source, entry.key)));
          if (actual !== expected) hashMismatch.push(entry.key);
          else verified++;
        } catch (error) {
          hashMismatch.push(`${entry.key}: ${(error as Error).message}`);
        }
      },
    );
    summary.destinationAfter = { objects: after.size, bytes: totalBytes(after) };
    summary.missing = missing.length;
    summary.sizeMismatch = sizeMismatch.length;
    summary.hashMismatch = hashMismatch.length;
    summary.verifiedSha256 = verified;
    if (missing.length) summary.missingSample = missing.slice(0, 5);
    if (hashMismatch.length) summary.hashMismatchSample = hashMismatch.slice(0, 5);
  }
  if (failures.length) summary.failureSample = failures.slice(0, 5);
  console.log(JSON.stringify(summary));
  return failures.length || summary.missing || summary.sizeMismatch || summary.hashMismatch ? 1 : 0;
}

if (import.meta.main) process.exit(await main());
