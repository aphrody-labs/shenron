// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { S3Client } from "bun";
import { mkdir, chmod, stat, realpath, rmdir, lstat } from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";
import { digest, validateManifest, type Manifest } from "./cloudflare-ops";
import { validateProfile } from "./s3-profile";
import { nativeS3Signer } from "./native-s3-signer";
export interface Entry {
  path: string;
  sha256: string;
  size: number;
  sourcePath: string;
  contentType: string;
}
export function inventory(value: unknown): Entry[] {
  if (!Array.isArray(value) || value.length > 1000000) throw new Error("Invalid inventory");
  const seen = new Set<string>();
  return value.filter((e: Entry) => {
    if (
      !e ||
      typeof e.path !== "string" ||
      !/^\/(?!\/)/.test(e.path) ||
      [...e.path].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
      e.path.includes("\\") ||
      e.path.split("/").includes("..") ||
      !/^[a-f0-9]{64}$/.test(e.sha256) ||
      !Number.isSafeInteger(e.size) ||
      e.size < 0 ||
      e.size > 33 * 1024 * 1024 ||
      typeof e.sourcePath !== "string" ||
      !isAbsolute(e.sourcePath) ||
      typeof e.contentType !== "string" ||
      !e.contentType ||
      /[\r\n]/.test(e.contentType)
    )
      throw new Error("Invalid inventory entry");
    if (seen.has(e.sha256)) throw new Error("Inventory must contain unique object digests");
    seen.add(e.sha256);
    return true;
  });
}
export function within(path: string, root: string) {
  const r = relative(root, path);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
}
export function verifiedHeaders(r: Response, e: Entry) {
  return (
    r.status === 200 &&
    (r.headers.get("Content-Length") ?? r.headers.get("X-Content-Size")) === String(e.size) &&
    r.headers.get("X-Content-SHA256") === e.sha256
  );
}
export function credentialFingerprint(p: {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiresAt: string;
}) {
  return digest(JSON.stringify([p.accessKeyId, p.secretAccessKey, p.sessionToken, p.expiresAt]));
}
export interface SignedClient {
  fetch(url: string, init: RequestInit): Promise<Response>;
}
export interface ObjectStore {
  /** Read current remote bytes and signed metadata without mutating them. */
  verify?(key: string, entry: Pick<Entry, "sha256" | "size" | "contentType">): Promise<void>;
  put(
    key: string,
    body: Uint8Array,
    sha256: string,
    contentType: string,
    cacheControl: string,
  ): Promise<void>;
  attestStaged(
    key: string,
    entry: Pick<Entry, "sha256" | "size" | "contentType">,
    budget?: StagedBudget,
  ): Promise<StagedAttestation>;
}
export interface StagedBudget {
  maxBytes: number;
  timeoutMs: number;
}
export interface StagedAttestation {
  schema: "shenron-staged-cas-attestation/v1";
  qualifiedAt: string;
  key: string;
  sha256: string;
  size: number;
  metadataUpdated: boolean;
  actualGets: number;
  budget: StagedBudget;
  beforeEtag: string;
  afterEtag: string;
  beforeBodySha256: string;
  afterBodySha256: string;
  headMetadata: { sha256: string; size: number; contentType: string; cacheControl: string };
  objectBytesUploaded: 0;
}
async function stagedBytes(response: Response, entry: Pick<Entry, "sha256" | "size">) {
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel();
    throw new Error("Staged GET HTTP " + response.status);
  }
  const reader = response.body.getReader(),
    hash = new Bun.CryptoHasher("sha256");
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > entry.size) {
        await reader.cancel();
        throw new Error("Staged bytes exceed pinned size");
      }
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  const sha256 = hash.digest("hex");
  if (size !== entry.size || sha256 !== entry.sha256) throw new Error("Staged bytes SHA differs");
  return sha256;
}
/** Qualify owner-staged CAS bytes and merge SHA metadata; never upload an object body. */
export async function attestStagedObject(
  signed: SignedClient,
  url: string,
  entry: Pick<Entry, "sha256" | "size" | "contentType">,
  budget: StagedBudget = { maxBytes: 33 * 1024 * 1024, timeoutMs: 120000 },
): Promise<StagedAttestation> {
  entry = { sha256: entry.sha256, size: entry.size, contentType: entry.contentType };
  budget = { maxBytes: budget.maxBytes, timeoutMs: budget.timeoutMs };
  const target = new URL(url),
    parts = target.pathname.split("/"),
    bucket = parts[1],
    key = "_objects/" + entry.sha256;
  if (
    target.protocol !== "https:" ||
    !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(target.hostname) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.port ||
    !/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket ?? "") ||
    target.pathname !== "/" + bucket + "/" + key ||
    !/^[a-f0-9]{64}$/.test(entry.sha256) ||
    !Number.isSafeInteger(entry.size) ||
    entry.size <= 0 ||
    !Number.isSafeInteger(budget.maxBytes) ||
    budget.maxBytes < 1 ||
    budget.maxBytes > 128 * 1024 * 1024 ||
    !Number.isSafeInteger(budget.timeoutMs) ||
    budget.timeoutMs < 1 ||
    budget.timeoutMs > 300000 ||
    entry.size > budget.maxBytes ||
    typeof entry.contentType !== "string" ||
    entry.contentType.length > 128 ||
    ![
      "image/png",
      "image/webp",
      "image/jpeg",
      "application/json",
      "application/gzip",
      "application/x-gzip",
      "application/zstd",
      "application/x-zstd",
      "application/x-tar",
    ].includes(entry.contentType)
  )
    throw new Error("Invalid staged CAS identity");
  const cacheControl = "public, max-age=31536000, immutable";
  metadataHeaders(entry.sha256, entry.contentType, cacheControl);
  const request = (method: string, headers?: Record<string, string>) =>
    signed.fetch(url, {
      method,
      headers,
      signal: AbortSignal.timeout(budget.timeoutMs),
      redirect: "error",
    });
  const before = await request("HEAD");
  const etag = before.headers.get("etag");
  if (
    before.status !== 200 ||
    before.headers.get("content-length") !== String(entry.size) ||
    !etag ||
    !/^"[a-zA-Z0-9-]+"$/.test(etag)
  ) {
    await before.body?.cancel();
    throw new Error("Staged HEAD differs");
  }
  const beforeBodySha256 = await stagedBytes(await request("GET", { "If-Match": etag }), entry);
  const metadataUpdated =
    before.headers.get("x-amz-meta-sha256") !== entry.sha256 ||
    before.headers.get("content-type") !== entry.contentType ||
    before.headers.get("cache-control") !== cacheControl;
  if (metadataUpdated) {
    const copied = await request("PUT", {
      "x-amz-copy-source": "/" + bucket + "/" + key,
      "x-amz-copy-source-if-match": etag,
      "cf-copy-destination-if-match": etag,
      "x-amz-metadata-directive": "MERGE",
      "x-amz-meta-sha256": entry.sha256,
      "Content-Type": entry.contentType,
      "Cache-Control": cacheControl,
    });
    if (copied.status !== 200 || !copied.body) {
      await copied.body?.cancel();
      throw new Error("Staged CopyObject HTTP " + copied.status);
    }
    const reader = copied.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 8192) {
          await reader.cancel();
          throw new Error("Staged CopyObject receipt exceeds budget");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const xml = new TextDecoder().decode(Buffer.concat(chunks));
    if (!xml.includes("<CopyObjectResult") || /<Error[\s>]/.test(xml))
      throw new Error("Staged CopyObject failed");
  }
  const after = await request("HEAD"),
    afterEtag = after.headers.get("etag");
  if (
    after.status !== 200 ||
    after.headers.get("content-length") !== String(entry.size) ||
    after.headers.get("x-amz-meta-sha256") !== entry.sha256 ||
    after.headers.get("content-type") !== entry.contentType ||
    after.headers.get("cache-control") !== cacheControl ||
    !afterEtag ||
    !/^"[a-zA-Z0-9-]+"$/.test(afterEtag)
  ) {
    await after.body?.cancel();
    throw new Error("Staged metadata readback differs");
  }
  const afterBodySha256 = await stagedBytes(await request("GET", { "If-Match": afterEtag }), entry);
  return {
    schema: "shenron-staged-cas-attestation/v1",
    qualifiedAt: new Date().toISOString(),
    key,
    sha256: entry.sha256,
    size: entry.size,
    metadataUpdated,
    actualGets: 2,
    budget,
    beforeEtag: etag,
    afterEtag,
    beforeBodySha256,
    afterBodySha256,
    headMetadata: {
      sha256: after.headers.get("x-amz-meta-sha256")!,
      size: Number(after.headers.get("content-length")),
      contentType: after.headers.get("content-type")!,
      cacheControl: after.headers.get("cache-control")!,
    },
    objectBytesUploaded: 0,
  };
}
export function metadataHeaders(sha256: string, contentType: string, cacheControl: string) {
  if (!/^[a-f0-9]{64}$/.test(sha256) || /[\r\n]/.test(contentType + cacheControl))
    throw new Error("Invalid object metadata");
  return {
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
    "x-amz-meta-sha256": sha256,
    "x-amz-checksum-sha256": Buffer.from(sha256, "hex").toString("base64"),
  };
}
/** Independent GET bytes and signed HEAD metadata; no upload or metadata mutation. */
export async function verifyStoredObject(
  signed: SignedClient,
  url: string,
  entry: Pick<Entry, "sha256" | "size" | "contentType">,
) {
  if (
    !/^[a-f0-9]{64}$/.test(entry.sha256) ||
    !Number.isSafeInteger(entry.size) ||
    entry.size < 1 ||
    entry.size > 33 * 1024 * 1024
  )
    throw new Error("Invalid remote CAS identity");
  const response = await signed.fetch(url, { method: "GET", signal: AbortSignal.timeout(120000) });
  await stagedBytes(response, entry);
  const head = await signed.fetch(url, { method: "HEAD", signal: AbortSignal.timeout(30000) });
  try {
    if (
      head.status !== 200 ||
      head.headers.get("x-amz-meta-sha256") !== entry.sha256 ||
      head.headers.get("x-amz-checksum-sha256") !==
        Buffer.from(entry.sha256, "hex").toString("base64") ||
      head.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !==
        entry.contentType.split(";", 1)[0]?.trim().toLowerCase()
    )
      throw new Error("Remote CAS metadata differs");
  } finally {
    await head.body?.cancel();
  }
}
/** Native Curl signs S3 metadata; an explicitly configured legacy SDK stays an explicit owner choice. */
export async function validateProfileFile(profile: string, consumerProfileRoot?: string) {
  const info = await lstat(profile);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("Profile must be a regular file");
  if (process.platform === "win32") return;
  if (info.mode & 0o077) throw new Error("Profile permissions invalid");
  if (info.uid === 0) return;
  const uid = process.getuid?.();
  if (
    !uid ||
    info.uid !== uid ||
    !consumerProfileRoot ||
    !isAbsolute(consumerProfileRoot) ||
    !isAbsolute(profile)
  )
    throw new Error("Profile consumer owner is not trusted");
  const root = resolve(consumerProfileRoot),
    path = resolve(profile),
    child = relative(root, path),
    directory = await lstat(root);
  if (
    !child ||
    isAbsolute(child) ||
    child === ".." ||
    child.startsWith("../") ||
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    directory.uid !== uid ||
    (directory.mode & 0o777) !== 0o700 ||
    (await realpath(root)) !== root ||
    (await realpath(path)) !== path ||
    (info.mode & 0o777) !== 0o400
  )
    throw new Error("Profile consumer boundary is not private");
}
export async function objectStore(
  profile: string,
  manifest: Manifest,
  sdkModule?: string,
  options: { consumerProfileRoot?: string } = {},
): Promise<ObjectStore> {
  if (sdkModule !== undefined && (!sdkModule || !isAbsolute(sdkModule)))
    throw new Error("Explicit S3 SDK path must be absolute");
  const sdk = sdkModule
    ? ((await import(await realpath(sdkModule))) as {
        AwsClient: new (options: Record<string, string>) => SignedClient;
      })
    : undefined;
  let identity = "",
    signed: SignedClient,
    client: S3Client,
    endpoint = "";
  async function refresh() {
    await validateProfileFile(profile, options.consumerProfileRoot);
    const p = await Bun.file(profile).json();
    validateProfile(p, manifest);
    if (Date.parse(p.expiresAt) < Date.now() + 30000) throw new Error("Scoped credential expired");
    const next = credentialFingerprint(p);
    if (next !== identity) {
      signed = sdk
        ? new sdk.AwsClient({
            accessKeyId: p.accessKeyId,
            secretAccessKey: p.secretAccessKey,
            sessionToken: p.sessionToken,
            region: "auto",
            service: "s3",
          })
        : nativeS3Signer(p);
      client = new S3Client(p);
      endpoint = p.endpoint + "/" + p.bucket + "/";
      identity = next;
    }
  }
  return {
    async verify(key, entry) {
      if (key !== "_objects/" + entry.sha256) throw new Error("Remote CAS key differs");
      await refresh();
      await verifyStoredObject(
        {
          async fetch(url, init) {
            await refresh();
            return signed.fetch(url, init);
          },
        },
        endpoint + key,
        entry,
      );
    },
    async attestStaged(key, entry, budget) {
      if (key !== "_objects/" + entry.sha256) throw new Error("Staged key differs");
      await refresh();
      return attestStagedObject(
        {
          async fetch(url, init) {
            await refresh();
            return signed.fetch(url, init);
          },
        },
        endpoint + key,
        entry,
        budget,
      );
    },
    async put(key, body, sha256, contentType, cacheControl) {
      if (
        !/^(_objects\/[a-f0-9]{64}|_migration\/manifests\/[a-z0-9-]+\/[a-f0-9]{2}\.json)$/.test(
          key,
        ) ||
        digest(body) !== sha256
      )
        throw new Error("Object key or bytes differ");
      await refresh();
      const checksum = Buffer.from(sha256, "hex").toString("base64");
      const head = await signed.fetch(endpoint + key, {
        method: "HEAD",
        signal: AbortSignal.timeout(30000),
      });
      if (head.status !== 200 && head.status !== 404)
        throw new Error("S3 HEAD HTTP " + head.status);
      if (
        head.status !== 200 ||
        head.headers.get("x-amz-meta-sha256") !== sha256 ||
        head.headers.get("x-amz-checksum-sha256") !== checksum
      ) {
        const response = await signed.fetch(endpoint + key, {
          method: "PUT",
          body: body as BodyInit,
          headers: metadataHeaders(sha256, contentType, cacheControl),
          signal: AbortSignal.timeout(120000),
        });
        if (!response.ok) throw new Error("S3 PUT HTTP " + response.status);
        await response.body?.cancel();
      }
      const readback = new Uint8Array(await client.file(key).arrayBuffer());
      if (readback.length !== body.length || digest(readback) !== sha256)
        throw new Error("S3 GET bytes differ");
      const after = await signed.fetch(endpoint + key, {
        method: "HEAD",
        signal: AbortSignal.timeout(30000),
      });
      if (
        after.status !== 200 ||
        after.headers.get("x-amz-meta-sha256") !== sha256 ||
        after.headers.get("x-amz-checksum-sha256") !== checksum
      )
        throw new Error("S3 metadata differs");
    },
  };
}
export class ByteBudget {
  used = 0;
  constructor(readonly max: number) {}
  async reserve(size: number) {
    if (size < 0 || size > this.max) throw new Error("Object exceeds byte budget");
    while (this.used + size > this.max) await Bun.sleep(20);
    this.used += size;
  }
  release(size: number) {
    this.used -= size;
    if (this.used < 0) throw new Error("Unbalanced byte budget");
  }
}
export async function run(args: string[]) {
  const action = args[0];
  if (action === "--help") {
    console.log(
      "transfer status|sync|verify --manifest FILE --objects FILE --objects-sha256 HASH --state DIR --profile FILE --worker-origin HTTPS [--source-root DIR] [--sdk-module FILE --s3-readback] [--apply] [--limit N]",
    );
    return;
  }
  const flag = (s: string) => {
    const i = args.indexOf(s);
    if (i < 0 || !args[i + 1]) throw new Error("Missing " + s);
    return args[i + 1]!;
  };
  if (!["status", "sync", "verify"].includes(action ?? "")) throw new Error("Invalid action");
  if (action !== "status" && !args.includes("--apply"))
    throw new Error("Remote sync/verification requires --apply");
  const m = (await Bun.file(resolve(flag("--manifest"))).json()) as Manifest;
  validateManifest(m);
  const raw = await Bun.file(resolve(flag("--objects"))).arrayBuffer();
  const sha = digest(new Uint8Array(raw));
  if (sha !== flag("--objects-sha256")) throw new Error("Pinned inventory differs");
  const objects = inventory(JSON.parse(new TextDecoder().decode(raw)));
  const s3Readback = args.includes("--s3-readback");
  if (s3Readback && action !== "sync") throw new Error("S3 readback only supports staging sync");
  const state = resolve(flag("--state"));
  const receipt = join(state, "transfer-receipts.sqlite");
  if (action === "status") {
    let verified = 0;
    if (await Bun.file(receipt).exists()) {
      const info = await stat(state);
      if (process.platform !== "win32" && (info.mode & 0o077 || info.uid !== process.getuid?.()))
        throw new Error("State directory must be private");
      const read = new Database(receipt, { readonly: true });
      try {
        verified = (
          read
            .query("SELECT count(*) AS n FROM receipts WHERE manifest_sha=? AND status='verified'")
            .get(sha) as { n: number }
        ).n;
      } finally {
        read.close();
      }
    }
    console.log(
      JSON.stringify({
        manifestSha256: sha,
        total: objects.length,
        verified,
        complete: verified === objects.length,
      }),
    );
    return;
  }
  await mkdir(state, { recursive: true, mode: 0o700 });
  const info = await stat(state);
  if (process.platform !== "win32" && (info.mode & 0o077 || info.uid !== process.getuid?.()))
    throw new Error("State directory must be private");
  const lock = join(state, "transfer.lock");
  await mkdir(lock);
  let db: Database | undefined;
  let progress: ReturnType<typeof setInterval> | undefined;
  try {
    db = new Database(receipt, { create: true });
    await chmod(receipt, 0o600);
    db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS jobs(manifest_sha TEXT PRIMARY KEY,total INTEGER NOT NULL,started TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipts(manifest_sha TEXT NOT NULL,sha256 TEXT NOT NULL,path TEXT NOT NULL,size INTEGER NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL,http_status INTEGER,checked_at TEXT NOT NULL,PRIMARY KEY(manifest_sha,sha256))",
    );
    const saved = new Set(
      (
        db
          .query("SELECT sha256 FROM receipts WHERE manifest_sha=? AND status IN ('verified',?)")
          .all(sha, s3Readback ? "staged" : "verified") as { sha256: string }[]
      ).map((r) => r.sha256),
    );
    const origin = new URL(flag("--worker-origin"));
    if (
      origin.protocol !== "https:" ||
      origin.username ||
      origin.password ||
      origin.search ||
      origin.hash ||
      origin.pathname !== "/"
    )
      throw new Error("Invalid verifier origin");
    const roots: string[] = [];
    for (let i = 0; i < args.length; i++)
      if (args[i] === "--source-root") roots.push(await realpath(resolve(args[++i]!)));
    if (action === "sync" && !roots.length)
      throw new Error("Explicit public source roots required");
    const profile = resolve(flag("--profile"));
    const store =
      action === "sync" ? await objectStore(profile, m, flag("--sdk-module")) : undefined;
    const limit = args.includes("--limit") ? Number(flag("--limit")) : objects.length;
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid bounded limit");
    const pending = (
      action === "sync" ? objects.filter((o) => !saved.has(o.sha256)) : objects
    ).slice(0, limit);
    db.query("INSERT OR IGNORE INTO jobs VALUES(?,?,?)").run(
      sha,
      objects.length,
      new Date().toISOString(),
    );
    const save = db.query(
      "INSERT INTO receipts VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(manifest_sha,sha256) DO UPDATE SET status=excluded.status,attempts=receipts.attempts+excluded.attempts,http_status=excluded.http_status,checked_at=excluded.checked_at",
    );
    const budget = new ByteBudget(256 * 1024 * 1024);
    let cursor = 0,
      passed = 0,
      failed = 0;
    progress = setInterval(
      () =>
        console.log(
          JSON.stringify({
            action,
            manifestSha256: sha,
            passed,
            failed,
            selected: pending.length,
            bytesReserved: budget.used,
            time: new Date().toISOString(),
          }),
        ),
      10000,
    );
    await Promise.all(
      Array.from({ length: 64 }, async () => {
        while (cursor < pending.length) {
          const e = pending[cursor++]!;
          await budget.reserve(e.size);
          let ok = false;
          let http = 0;
          let attempts = 0;
          try {
            for (attempts = 1; attempts <= 5; attempts++) {
              try {
                if (action === "sync") {
                  const source = await realpath(e.sourcePath);
                  if (
                    !roots.some((root) => within(source, root)) ||
                    /(?:^|[\\/])(?:\.ssh|\.env|data[\\/]home)(?:[\\/.]|$)/.test(source)
                  )
                    throw new Error("Source outside approved public roots");
                  const body = new Uint8Array(await Bun.file(source).arrayBuffer());
                  if (body.length !== e.size || digest(body) !== e.sha256)
                    throw new Error("Source changed after inventory");
                  await store!.put(
                    "_objects/" + e.sha256,
                    body,
                    e.sha256,
                    e.contentType,
                    "public, max-age=31536000, immutable",
                  );
                  if (s3Readback) {
                    ok = true;
                    http = 200;
                    break;
                  }
                }
                const url = new URL(e.path.split("/").map(encodeURIComponent).join("/"), origin);
                const r = await fetch(url, {
                  method: "HEAD",
                  redirect: "error",
                  signal: AbortSignal.timeout(120000),
                  headers: { "Accept-Encoding": "identity" },
                });
                http = r.status;
                ok = verifiedHeaders(r, e);
                if (!ok && r.status === 200) {
                  const get = await fetch(url, {
                    redirect: "error",
                    signal: AbortSignal.timeout(120000),
                    headers: { "Accept-Encoding": "identity", "Cache-Control": "no-cache" },
                  });
                  const bytes = new Uint8Array(await get.arrayBuffer());
                  ok = get.status === 200 && bytes.length === e.size && digest(bytes) === e.sha256;
                  http = get.status;
                }
                if (ok) break;
              } catch {}
              if (attempts < 5) await Bun.sleep(Math.min(10000, 1000 * 2 ** attempts));
            }
          } finally {
            budget.release(e.size);
          }
          save.run(
            sha,
            e.sha256,
            e.path,
            e.size,
            ok ? (s3Readback ? "staged" : "verified") : "failed",
            Math.min(attempts, 5),
            http,
            new Date().toISOString(),
          );
          if (ok) passed++;
          else failed++;
        }
      }),
    );
    console.log(
      JSON.stringify({
        manifestSha256: sha,
        total: objects.length,
        selected: pending.length,
        passed,
        failed,
        resumed: action === "sync" ? saved.size : 0,
        partial:
          action === "sync"
            ? saved.size + passed !== objects.length
            : pending.length !== objects.length,
        status: failed ? "failed" : "ok",
        verificationScope: s3Readback ? "s3-bytes-and-metadata" : "public-bytes-or-digest-headers",
      }),
    );
    if (failed) process.exitCode = 1;
  } finally {
    if (progress) clearInterval(progress);
    db?.close();
    await rmdir(lock);
  }
}
if (import.meta.main)
  run(Bun.argv.slice(2)).catch(() => {
    console.error(
      "Transfer failed; inspect pinned inventory, source roots, credentials, verifier or state lock",
    );
    process.exitCode = 1;
  });
