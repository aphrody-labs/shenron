// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, chmod, lstat, mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  hash,
  prepareSourceBatches,
  runSourcePipeline,
  type PipelineDatabase,
  type RegistryRow,
  type SourcePipelineConfig,
} from "./bun-source-pipeline";
import type { ObjectStore } from "../../deploy/cloudflare/cli/transfer";
import type { ExternalCrawlRecord } from "../../packages/pipeline/src/dragon-ball/crawl-ingest";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
const doc = (url = "https://source.example/a") => ({
  crawl_id: "fixture",
  document_uid: hash(url),
  canonical_url: url,
  source_domain: new URL(url).hostname,
  category: "reference",
  http_status: 200,
  raw_checksum: hash("日本語 'quoted'"),
  timestamp_utc: "2026-10-15T00:00:00Z",
  payload: { title_raw: "Fixture", body_markdown: "日本語 'quoted'", embedded_media: [] },
});
async function fixture(documents: unknown[] = [doc()], extra: Partial<SourcePipelineConfig> = {}) {
  const root = await mkdtemp(join(tmpdir(), "bun-source-pipeline-"));
  roots.push(root);
  await chmod(root, 0o700);
  const input = join(root, "export.jsonl"),
    policy = join(root, "policy.json"),
    configPath = join(root, "config.json");
  await Bun.write(input, documents.map((value) => JSON.stringify(value)).join("\n") + "\n");
  await Bun.write(
    policy,
    JSON.stringify({
      version: 1,
      profile: "dbfr",
      sources: [
        {
          domain: "source.example",
          kind: "reference",
          reviewed: true,
          evidence: "https://source.example/",
          rights: { ragPermitted: false, trainingPermitted: false, publicImagesPermitted: false },
        },
        {
          domain: "127.0.0.1",
          kind: "reference",
          reviewed: true,
          evidence: "https://127.0.0.1/",
          rights: { ragPermitted: false, trainingPermitted: false, publicImagesPermitted: false },
        },
      ],
    }),
  );
  const config: SourcePipelineConfig = {
    version: 1,
    input,
    policy,
    job: join(root, "job"),
    ...extra,
  };
  await Bun.write(configPath, JSON.stringify(config));
  return { root, input, policy, config, configPath };
}
test("source batches resume disjoint ordered membership without authorizing delivery", async () => {
  const documents = Array.from({ length: 7 }, (_, i) => doc(`https://source.example/${i}`));
  documents[4] = documents[1]!;
  const f = await fixture(documents, {
    maxDocuments: 3,
    crawl: { mode: "attach", config: "/private/campaign.json", output: "/private/crawl" },
  });
  const source = await Bun.file(f.input).text();
  const first = await prepareSourceBatches(f.configPath, {
    snapshotSha256: hash(source),
    batchSize: 3,
  });
  const second = await prepareSourceBatches(f.configPath, {
    snapshotSha256: hash(source),
    batchSize: 3,
    cursor: first.nextCursor,
    manifestSha256: first.manifestSha256,
  });
  const third = await prepareSourceBatches(f.configPath, {
    snapshotSha256: hash(source),
    batchSize: 3,
    cursor: second.nextCursor,
    manifestSha256: first.manifestSha256,
  });
  expect(
    [first, second, third].map(({ cursor, nextCursor, count, exportComplete }) => [
      cursor,
      nextCursor,
      count,
      exportComplete,
    ]),
  ).toEqual([
    [0, 3, 3, false],
    [3, 6, 3, false],
    [6, 7, 1, true],
  ]);
  const recovered: unknown[] = [];
  for (const batch of [first, second, third]) {
    const body = await Bun.file(batch.exportPath).text();
    expect(hash(body)).toBe(batch.exportSha256);
    const members = body
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const membership = members
      .map((value, i) => JSON.stringify([batch.cursor + i, hash(JSON.stringify(value))]) + "\n")
      .join("");
    expect(hash(membership)).toBe(batch.membershipSha256);
    expect(batch.deliveryAuthorized).toBe(false);
    expect(hash(await Bun.file(batch.receiptPath).text())).toBe(batch.receiptSha256);
    recovered.push(...members);
  }
  expect(recovered).toEqual(documents);
  const manifest = await Bun.file(first.manifestPath).json();
  expect(manifest.campaign).toEqual(f.config.crawl);
  expect(manifest.totalDocuments).toBe(7);
  expect(manifest.membershipSha256).toBe(
    hash(
      documents.map((value, i) => JSON.stringify([i, hash(JSON.stringify(value))]) + "\n").join(""),
    ),
  );
  expect(hash(await Bun.file(first.manifestPath).text())).toBe(first.manifestSha256);
  expect(await Bun.file(f.configPath).json()).toEqual(f.config);
  expect(await Bun.file(f.policy).text()).toBe(
    await Bun.file(join(f.config.job, "batches", hash(source), "policy.json")).text(),
  );
  for (const path of [first.exportPath, first.manifestPath, first.receiptPath]) {
    if (process.platform !== "win32") expect((await lstat(path)).mode & 0o777).toBe(0o600);
  }
  const before = await lstat(second.exportPath);
  expect(
    await prepareSourceBatches(f.configPath, {
      snapshotSha256: hash(source),
      batchSize: 3,
      cursor: 3,
      manifestSha256: first.manifestSha256,
    }),
  ).toEqual(second);
  expect((await lstat(second.exportPath)).mtimeMs).toBe(before.mtimeMs);
  expect(await Bun.file(join(f.config.job, ".pipeline-lock")).exists()).toBe(false);
  expect(await Bun.file(join(f.config.job, "plan.json")).exists()).toBe(false);
  expect(await Bun.file(join(f.config.job, "checkpoint.sqlite")).exists()).toBe(false);
});

test.each(["input", "policy", "config"] as const)(
  "source batch resume refuses %s drift",
  async (kind) => {
    const f = await fixture([doc(), doc("https://source.example/b")], { maxDocuments: 1 });
    const snapshotSha256 = hash(await Bun.file(f.input).text());
    const first = await prepareSourceBatches(f.configPath, { snapshotSha256, batchSize: 1 });
    if (kind === "input")
      await Bun.write(f.input, JSON.stringify(doc("https://source.example/changed")) + "\n");
    if (kind === "policy") {
      const policy = await Bun.file(f.policy).json();
      policy.sources[0].rights.ragPermitted = true;
      await Bun.write(f.policy, JSON.stringify(policy));
    }
    if (kind === "config")
      await Bun.write(f.configPath, JSON.stringify({ ...f.config, maxRecords: 3 }));
    await expect(
      prepareSourceBatches(f.configPath, {
        snapshotSha256,
        batchSize: 1,
        cursor: 1,
        manifestSha256: first.manifestSha256,
      }),
    ).rejects.toThrow();
    expect(
      await Bun.file(join(f.config.job, "batches", snapshotSha256, "1-2", "receipt.json")).exists(),
    ).toBe(false);
    expect(await Bun.file(join(f.config.job, ".pipeline-lock")).exists()).toBe(false);
  },
);

test.each(["snapshot.jsonl", "membership.json", "0-1/export.jsonl", "0-1/receipt.json"])(
  "source batch replay refuses corrupted %s",
  async (name) => {
    const f = await fixture([doc(), doc("https://source.example/b")], { maxDocuments: 1 });
    const snapshotSha256 = hash(await Bun.file(f.input).text());
    const options = { snapshotSha256, batchSize: 1 };
    const first = await prepareSourceBatches(f.configPath, options);
    const path = join(f.config.job, "batches", snapshotSha256, name);
    await Bun.write(path, "{}\n");
    await expect(
      prepareSourceBatches(f.configPath, { ...options, manifestSha256: first.manifestSha256 }),
    ).rejects.toThrow();
    expect(await Bun.file(path).text()).toBe("{}\n");
    expect(await Bun.file(join(f.config.job, ".pipeline-lock")).exists()).toBe(false);
    expect(await Bun.file(first.exportPath + ".tmp").exists()).toBe(false);
  },
);

test("batch partition bounds are independent of the validation prefix budget", async () => {
  const f = await fixture([doc(), { invalid: true }, doc("https://source.example/c")], {
    maxDocuments: 2,
  });
  const snapshotSha256 = hash(await Bun.file(f.input).text());
  await expect(
    prepareSourceBatches(f.configPath, { snapshotSha256, batchSize: 3 }),
  ).rejects.toThrow("validation budget");
  await expect(
    prepareSourceBatches(f.configPath, { snapshotSha256, batchSize: 100001 }),
  ).rejects.toThrow("batch size");
  const first = await prepareSourceBatches(f.configPath, { snapshotSha256, batchSize: 2 });
  expect(
    (await Bun.file(first.exportPath).text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  ).toEqual([doc(), { invalid: true }]);
  expect(first.exportComplete).toBe(false);
  await expect(
    prepareSourceBatches(f.configPath, { snapshotSha256, batchSize: 2, cursor: 2 }),
  ).rejects.toThrow("manifest SHA-256");
  for (const cursor of [1, 4, -1, 0.5]) {
    await expect(
      prepareSourceBatches(f.configPath, {
        snapshotSha256,
        batchSize: 2,
        cursor,
        manifestSha256: first.manifestSha256,
      }),
    ).rejects.toThrow();
  }
  await expect(
    prepareSourceBatches(f.configPath, {
      snapshotSha256,
      batchSize: 1,
      cursor: 2,
      manifestSha256: first.manifestSha256,
    }),
  ).rejects.toThrow("manifest differs");
  const plan = await runSourcePipeline("plan", f.configPath);
  expect(plan).toMatchObject({ documents: 2, budgetExceeded: true, complete: false });
  expect(plan.invalid).toHaveLength(1);
});

test("batch command emits private artifacts with no collection or delivery ports", async () => {
  const f = await fixture([doc(), doc("https://source.example/b")], { maxDocuments: 1 });
  const child = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      join(import.meta.dir, "bun-source-pipeline.ts"),
      "batch",
      "--config",
      f.configPath,
      "--snapshot-sha256",
      hash(await Bun.file(f.input).text()),
      "--batch-size",
      "1",
    ],
    { cwd: f.root, env: { PATH: process.env.PATH ?? "" }, stdout: "pipe", stderr: "pipe" },
  );
  const output = await new Response(child.stdout).text();
  const error = await new Response(child.stderr).text();
  expect(JSON.parse(output)).toMatchObject({
    cursor: 0,
    nextCursor: 1,
    totalDocuments: 2,
    exportComplete: false,
    deliveryAuthorized: false,
  });
  expect(error).toBe("");
  expect(await child.exited).toBe(0);
});

test("aborted batch preparation leaves no job artifacts", async () => {
  const f = await fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(
    prepareSourceBatches(f.configPath, {
      snapshotSha256: hash(await Bun.file(f.input).text()),
      batchSize: 1,
      signal: controller.signal,
    }),
  ).rejects.toThrow();
  expect(await Bun.file(join(f.config.job, "batches")).exists()).toBe(false);
});

test("batch completion requires a contiguous verified predecessor chain", async () => {
  const documents = Array.from({ length: 5 }, (_, i) => doc(`https://source.example/${i}`));
  const f = await fixture(documents, { maxDocuments: 2 });
  const snapshotSha256 = hash(await Bun.file(f.input).text());
  const first = await prepareSourceBatches(f.configPath, { snapshotSha256, batchSize: 2 });
  const options = { snapshotSha256, batchSize: 2, manifestSha256: first.manifestSha256 };
  await expect(prepareSourceBatches(f.configPath, { ...options, cursor: 4 })).rejects.toThrow();
  expect(
    await Bun.file(join(f.config.job, "batches", snapshotSha256, "4-5", "receipt.json")).exists(),
  ).toBe(false);
  const second = await prepareSourceBatches(f.configPath, { ...options, cursor: 2 });
  const before = await Bun.file(first.exportPath).text();
  await Bun.write(first.exportPath, JSON.stringify(doc("https://source.example/tampered")) + "\n");
  await expect(prepareSourceBatches(f.configPath, { ...options, cursor: 4 })).rejects.toThrow(
    "predecessor",
  );
  await Bun.write(first.exportPath, before);
  const priorReceipt = await Bun.file(second.receiptPath).text();
  await Bun.write(second.receiptPath, "{}\n");
  await expect(prepareSourceBatches(f.configPath, { ...options, cursor: 4 })).rejects.toThrow(
    "predecessor",
  );
  await Bun.write(second.receiptPath, priorReceipt);
  const final = await prepareSourceBatches(f.configPath, { ...options, cursor: 4 });
  expect(final).toMatchObject({
    cursor: 4,
    nextCursor: 5,
    count: 1,
    exportComplete: true,
    deliveryAuthorized: false,
  });
  const terminal = await prepareSourceBatches(f.configPath, { ...options, cursor: 5 });
  expect(terminal).toMatchObject({ count: 0, exportComplete: true });
});

test("batch temporary evidence and symlinks are preserved by exclusive unique files", async () => {
  const f = await fixture();
  const snapshotSha256 = hash(await Bun.file(f.input).text());
  const root = join(f.config.job, "batches", snapshotSha256);
  await mkdir(join(root, "0-1"), { recursive: true, mode: 0o700 });
  const sentinel = join(f.root, "previous-evidence");
  await Bun.write(sentinel, "protected evidence");
  const paths = [
    "snapshot.jsonl.tmp",
    "policy.json.tmp",
    "original-config.json.tmp",
    "membership.json.tmp",
    "0-1/export.jsonl.tmp",
    "0-1/receipt.json.tmp",
  ];
  for (const [index, name] of paths.entries()) {
    const path = join(root, name);
    if (process.platform !== "win32" && index % 2) await symlink(sentinel, path);
    else await Bun.write(path, "previous temporary evidence");
  }
  const batch = await prepareSourceBatches(f.configPath, { snapshotSha256, batchSize: 1 });
  expect(batch.exportComplete).toBe(true);
  expect(await Bun.file(sentinel).text()).toBe("protected evidence");
  for (const [index, name] of paths.entries()) {
    const path = join(root, name);
    if (process.platform !== "win32" && index % 2)
      expect((await lstat(path)).isSymbolicLink()).toBe(true);
    else expect(await Bun.file(path).text()).toBe("previous temporary evidence");
  }
});

test("batch buffered writer preserves UTF-8 bytes across its one MiB boundary", async () => {
  const large = doc();
  large.payload.body_markdown = "日".repeat(400000);
  const documents = [large, doc("https://source.example/b")];
  const f = await fixture(documents, { maxDocuments: 2 });
  const snapshot = await Bun.file(f.input).text();
  const batch = await prepareSourceBatches(f.configPath, {
    snapshotSha256: hash(snapshot),
    batchSize: 2,
  });
  expect(await Bun.file(batch.exportPath).text()).toBe(snapshot);
  expect(batch.exportSha256).toBe(hash(snapshot));
  expect(batch).toMatchObject({ count: 2, exportComplete: true });
  expect((await Bun.file(batch.manifestPath).json()).sourceBytes).toBe(Buffer.byteLength(snapshot));
});
const fakeFetch = (
  implementation: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
): typeof fetch => Object.assign(implementation, { preconnect: fetch.preconnect });
function database(initial: RegistryRow[] = [], protectedUrls = new Set<string>()) {
  const rows = new Map(initial.map((row) => [row.url, row]));
  let writes = 0,
    snapshots = 0;
  const port: PipelineDatabase = {
    registry: {
      async assertReady() {},
      async upsert(record: ExternalCrawlRecord) {
        writes++;
        if (protectedUrls.has(record.url)) return "protected";
        rows.set(record.url, {
          url: record.url,
          content_hash: record.contentHash,
          fetched_at: record.fetchedAt,
          canonical_eligible: false,
          http_status: record.httpStatus,
          provenance: record.provenance,
        });
        return "applied";
      },
    },
    async snapshot(urls) {
      snapshots++;
      return {
        rows: [...rows.values()]
          .filter((row) => urls.includes(row.url))
          .toSorted((a, b) => a.url.localeCompare(b.url)),
      };
    },
  };
  return { port, rows, writes: () => writes, snapshots: () => snapshots };
}
test("pinned plan applies canonical records, keeps backup, proves replay and verifies", async () => {
  const f = await fixture(),
    db = database();
  const plan = await runSourcePipeline("plan", f.configPath);
  expect(plan.complete).toBe(true);
  expect(db.writes()).toBe(0);
  const result = await runSourcePipeline(
    "apply",
    f.configPath,
    { planSha256: plan.planSha256 },
    { database: db.port },
  );
  expect(result).toMatchObject({
    complete: true,
    added: 1,
    applied: 1,
    canonicalPromotions: 0,
    replayVerified: true,
  });
  expect(db.writes()).toBe(2);
  expect(await Bun.file(join(f.config.job, "registry-before.json")).json()).toEqual({ rows: [] });
  const verify = await runSourcePipeline(
    "verify",
    f.configPath,
    { planSha256: plan.planSha256 },
    { database: db.port },
  );
  expect(verify.complete).toBe(true);
  expect(db.writes()).toBe(2);
  expect((db.rows.get("https://source.example/a") as any).provenance.rights.ragPermitted).toBe(
    false,
  );
});
test("changed export fails before registry or object store side effects", async () => {
  const f = await fixture(),
    db = database();
  const plan = await runSourcePipeline("plan", f.configPath);
  await Bun.write(f.input, JSON.stringify(doc("https://source.example/changed")) + "\n");
  await expect(
    runSourcePipeline(
      "apply",
      f.configPath,
      { planSha256: plan.planSha256 },
      { database: db.port },
    ),
  ).rejects.toThrow("Inputs differ");
  expect(db.writes()).toBe(0);
  expect(db.snapshots()).toBe(0);
});
test("invalid documents remain pinned and produce incomplete receipt alongside supported rows", async () => {
  const bad = {
    ...doc("https://source.example/bad"),
    payload: {
      ...doc().payload,
      embedded_media: [{ url: "http://unsafe.example/image.png", type: "image" }],
    },
  };
  const f = await fixture([doc(), bad]),
    db = database();
  const plan = await runSourcePipeline("plan", f.configPath);
  expect(plan).toMatchObject({ documents: 2, records: 1, complete: false });
  expect(plan.invalid).toHaveLength(1);
  const applied = await runSourcePipeline(
    "apply",
    f.configPath,
    { planSha256: plan.planSha256 },
    { database: db.port },
  );
  expect(applied).toMatchObject({ complete: false, applied: 1 });
  expect(await Bun.file(f.input).text()).toContain("unsafe.example");
  expect(db.rows.size).toBe(1);
});
test("canonical protected rows survive apply and replay", async () => {
  const f = await fixture(),
    existing = {
      url: "https://source.example/a",
      title: "Curated",
      canonical_eligible: true,
      http_status: 200,
      fetched_at: "2026-10-16T00:00:00Z",
    };
  const db = database([existing], new Set([existing.url]));
  const plan = await runSourcePipeline("plan", f.configPath);
  expect(
    await runSourcePipeline(
      "apply",
      f.configPath,
      { planSha256: plan.planSha256 },
      { database: db.port },
    ),
  ).toMatchObject({ protected: 1, added: 0 });
  expect(db.rows.get(existing.url)).toEqual(existing);
});
test("media uses local HTTP, pinned MIME/hash and the canonical CAS owner; verify uses receipts", async () => {
  const bytes = new TextEncoder().encode("fixture-image");
  using server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(bytes, { headers: { "Content-Type": "image/png" } }),
  });
  const f = await fixture();
  const mediaPath = join(f.root, "media.json");
  await Bun.write(
    mediaPath,
    JSON.stringify([
      {
        url: server.url.href + "image",
        size: bytes.length,
        sha256: hash(bytes),
        contentType: "image/png",
      },
    ]),
  );
  f.config.media = mediaPath;
  await Bun.write(f.configPath, JSON.stringify(f.config));
  const calls: string[] = [];
  let remoteVerified = 0;
  const store: ObjectStore = {
    async verify(key, entry) {
      expect(key).toBe("_objects/" + entry.sha256);
      remoteVerified++;
    },
    async put(key, actual, digest, type, cache) {
      calls.push(key);
      expect(hash(actual)).toBe(digest);
      expect(type).toBe("image/png");
      expect(cache.startsWith("private")).toBe(true);
    },
    async attestStaged() {
      throw Error("not used");
    },
  };
  const db = database(),
    plan = await runSourcePipeline("plan", f.configPath);
  expect(
    await runSourcePipeline(
      "apply",
      f.configPath,
      { planSha256: plan.planSha256 },
      { database: db.port, store },
    ),
  ).toMatchObject({ collected: 1, transferred: 1 });
  expect(calls).toEqual(["_objects/" + hash(bytes)]);
  await runSourcePipeline(
    "verify",
    f.configPath,
    { planSha256: plan.planSha256 },
    { database: db.port, store },
  );
  expect(remoteVerified).toBe(2);
});
test("hash mismatch stops before CAS and database; failed transfers release the lock", async () => {
  const bytes = new TextEncoder().encode("wrong");
  const f = await fixture();
  const media = join(f.root, "media.json");
  await Bun.write(
    media,
    JSON.stringify([
      {
        url: "https://source.example/media",
        size: bytes.length,
        sha256: hash("other"),
        contentType: "image/png",
      },
    ]),
  );
  f.config.media = media;
  await Bun.write(f.configPath, JSON.stringify(f.config));
  const db = database();
  const plan = await runSourcePipeline("plan", f.configPath);
  let uploaded = false;
  const store = {
    async verify() {},
    async put() {
      uploaded = true;
    },
    async attestStaged() {
      throw Error("not used");
    },
  } as ObjectStore;
  await expect(
    runSourcePipeline(
      "apply",
      f.configPath,
      { planSha256: plan.planSha256 },
      {
        database: db.port,
        store,
        http: {
          fetch: fakeFetch(
            async () => new Response(bytes, { headers: { "content-type": "image/png" } }),
          ),
        },
      },
    ),
  ).rejects.toThrow("Acquired MIME");
  expect(uploaded).toBe(false);
  expect(db.writes()).toBe(0);
  expect(await Bun.file(join(f.config.job, ".pipeline-lock")).exists()).toBe(false);
});
test("public activation is rejected without reviewed image rights", async () => {
  const f = await fixture();
  const media = join(f.root, "media.json");
  await Bun.write(
    media,
    JSON.stringify([
      {
        url: "https://source.example/a.png",
        size: 1,
        sha256: hash("x"),
        contentType: "image/png",
        publicPath: "/a.png",
      },
    ]),
  );
  f.config.media = media;
  await Bun.write(f.configPath, JSON.stringify(f.config));
  await expect(runSourcePipeline("plan", f.configPath)).rejects.toThrow("reviewed rights");
});

import { SQL } from "bun";
import { autoSourcePipeline, nativeDatabase } from "./bun-source-pipeline";
import { verifyStoredObject } from "../../deploy/cloudflare/cli/transfer";
test("auto media discovery derives real hashes and immutable revision identity", async () => {
  const source = doc();
  source.payload.embedded_media = [
    { url: "https://source.example/image.png", type: "image" },
  ] as never[];
  const f = await fixture([source]);
  const db = database(),
    bytes = new TextEncoder().encode("actual-image");
  let requests = 0,
    remoteVerifications = 0;
  const store = {
    async put() {},
    async verify() {
      remoteVerifications++;
    },
    async attestStaged() {
      throw Error("unused");
    },
  } as ObjectStore;
  const ports = {
    database: db.port,
    store,
    http: {
      fetch: fakeFetch(async () => {
        requests++;
        return new Response(bytes, { headers: { "content-type": "image/png" } });
      }),
    },
  };
  const first = await autoSourcePipeline(f.configPath, ports);
  expect(first).toMatchObject({ complete: true, transferred: 1 });
  const manifest = await Bun.file(join(first.revision, "discovered-media.json")).json();
  expect(manifest).toEqual([
    {
      url: "https://source.example/image.png",
      sha256: hash(bytes),
      size: bytes.length,
      contentType: "image/png",
    },
  ]);
  const second = await autoSourcePipeline(f.configPath, ports);
  expect(second.revision).toBe(first.revision);
  expect(requests).toBe(1);
  await Bun.write(f.input, JSON.stringify(doc("https://source.example/new")) + "\n");
  const third = await autoSourcePipeline(f.configPath, ports);
  expect(third.revision).not.toBe(first.revision);
  expect(await Bun.file(join(first.revision, "native-export.jsonl")).text()).toContain("image.png");
  expect(remoteVerifications).toBeGreaterThanOrEqual(2);
});
test("unavailable discovered media keeps pipeline incomplete and records repair evidence", async () => {
  const source = doc();
  source.payload.embedded_media = [
    { url: "https://source.example/missing", type: "image" },
  ] as never[];
  const f = await fixture([source]),
    db = database();
  const result = await autoSourcePipeline(f.configPath, {
    database: db.port,
    http: { fetch: fakeFetch(async () => new Response("missing", { status: 404 })) },
  });
  expect(result.complete).toBe(false);
  expect("blockedStages" in result && result.blockedStages).toEqual([
    "publication",
    "rag",
    "production",
  ]);
  const discovery = await Bun.file(join(result.revision, "discovery.json")).json();
  expect(discovery.failures).toEqual([
    { urlSha256: hash("https://source.example/missing"), code: "ERR_SOURCE_STATUS" },
  ]);
});
test("configured RAG without explicit rights fails during plan before any database writes", async () => {
  const f = await fixture([doc()], {
    delivery: {
      rag: {
        productOrigin: "https://dragonballfr.com",
        probeQuery: "fixture",
        expectedSourceUrl: "https://source.example/a",
      },
    },
  });
  await expect(runSourcePipeline("plan", f.configPath)).rejects.toThrow("reviewed rights");
});
test("remote CAS verification reads current GET bytes and HEAD metadata without writes", async () => {
  const bytes = new TextEncoder().encode("verified");
  const sha256 = hash(bytes);
  const methods: string[] = [];
  const signed = {
    async fetch(_url: string, init: RequestInit) {
      methods.push(init.method!);
      return init.method === "GET"
        ? new Response(bytes)
        : new Response(null, {
            headers: {
              "x-amz-meta-sha256": sha256,
              "x-amz-checksum-sha256": Buffer.from(sha256, "hex").toString("base64"),
              "content-type": "image/png",
            },
          });
    },
  };
  await verifyStoredObject(signed, "https://store.example/_objects/" + sha256, {
    sha256,
    size: bytes.length,
    contentType: "image/png",
  });
  expect(methods).toEqual(["GET", "HEAD"]);
  await expect(
    verifyStoredObject(
      { fetch: async () => new Response("tampered") },
      "https://store.example/object",
      { sha256, size: bytes.length, contentType: "image/png" },
    ),
  ).rejects.toThrow("SHA differs");
});
test("native source campaign is delegated, kept incomplete, and never enables downstream delivery", async () => {
  const f = await fixture([doc()], {
    crawl: { mode: "attach", config: "/private/campaign.json", output: "/private/output" },
  });
  const calls: string[] = [];
  const campaign = async (_config: unknown, phase: string) => {
    calls.push(phase);
    return { complete: false, pending: 100, errors: 2, sourcePlansSha256: hash("owner-plan") };
  };
  const db = database();
  const plan = await runSourcePipeline("plan", f.configPath, {}, { campaign });
  const result = await runSourcePipeline(
    "apply",
    f.configPath,
    { planSha256: plan.planSha256 },
    { campaign, database: db.port },
  );
  expect(result.complete).toBe(false);
  expect(result.campaign).toMatchObject({ pending: 100, errors: 2 });
  expect("publicActivation" in result && result.publicActivation).toBe(false);
  expect(calls).toEqual(["plan", "plan"]);
});
const pgUrl = process.env.SHENRON_CRAWL_PG_URL;
test.skipIf(!pgUrl)(
  "real isolated PostgreSQL: unified native SQL apply, backup, replay and readback",
  async () => {
    const target = new URL(pgUrl!);
    if (
      !["localhost", "127.0.0.1"].includes(target.hostname) ||
      target.pathname !== "/shenron_crawl_fixture"
    )
      throw Error("Isolated fixture required");
    const sql = new SQL(pgUrl!, { max: 1 });
    let recordsCreated = false,
      provenanceCreated = false;
    try {
      await sql`CREATE TABLE public.external_source_records (url text PRIMARY KEY, kind text NOT NULL, title text NOT NULL, excerpt text NOT NULL, http_status integer NOT NULL, content_hash text NOT NULL, fetched_at timestamptz NOT NULL, canonical_eligible boolean NOT NULL DEFAULT false)`;
      recordsCreated = true;
      await sql`CREATE TABLE public.external_source_provenance (url text PRIMARY KEY REFERENCES public.external_source_records(url), provenance jsonb NOT NULL, updated_at timestamptz NOT NULL)`;
      provenanceCreated = true;
      const f = await fixture();
      const native = nativeDatabase(sql);
      native.close = undefined;
      const plan = await runSourcePipeline("plan", f.configPath);
      const result = await runSourcePipeline(
        "apply",
        f.configPath,
        { planSha256: plan.planSha256 },
        { database: native },
      );
      expect(result).toMatchObject({ added: 1, complete: true, replayVerified: true });
      const [row] = await sql`SELECT provenance FROM public.external_source_provenance`;
      expect(row.provenance.reviewed).toBe(true);
      expect(row.provenance.rights.ragPermitted).toBe(false);
      expect(
        await runSourcePipeline(
          "verify",
          f.configPath,
          { planSha256: plan.planSha256 },
          { database: native },
        ),
      ).toMatchObject({ complete: true });
    } finally {
      if (provenanceCreated) await sql`DROP TABLE public.external_source_provenance`;
      if (recordsCreated) await sql`DROP TABLE public.external_source_records`;
      await sql.close();
    }
  },
);

import { campaignComplete } from "./bun-source-pipeline";
test("a last-source report cannot qualify a multi-source campaign", () => {
  const target = (id: string) => ({
    id,
    completed: true,
    pending: 0,
    locked: 0,
    failed: 0,
    errors: [],
  });
  expect(
    campaignComplete(["one", "two"], { completed: true, errors: [], targets: [target("two")] }),
  ).toBe(false);
  expect(
    campaignComplete(["one", "two"], {
      completed: true,
      errors: [],
      targets: [target("one"), target("two")],
    }),
  ).toBe(true);
  for (const changed of [
    { pending: 1 },
    { locked: 1 },
    { failed: 1 },
    { errors: ["failed capture"] },
  ]) {
    expect(
      campaignComplete(["one"], {
        completed: true,
        errors: [],
        targets: [{ ...target("one"), ...changed }],
      }),
    ).toBe(false);
  }
  expect(
    campaignComplete(["one", "two"], {
      completed: true,
      errors: [],
      targets: [target("one"), target("one")],
    }),
  ).toBe(false);
});
test("different source URLs with identical bytes preserve references and upload CAS once", async () => {
  const f = await fixture();
  const bytes = new TextEncoder().encode("shared-image"),
    media = join(f.root, "media.json");
  await Bun.write(
    media,
    JSON.stringify(
      ["one", "two"].map((name) => ({
        url: "https://source.example/" + name,
        size: bytes.length,
        sha256: hash(bytes),
        contentType: "image/png",
      })),
    ),
  );
  f.config.media = media;
  await Bun.write(f.configPath, JSON.stringify(f.config));
  let gets = 0,
    puts = 0;
  const db = database();
  const store = {
    async put() {
      puts++;
    },
    async verify() {},
    async attestStaged() {
      throw Error("unused");
    },
  } as ObjectStore;
  const http = {
    fetch: fakeFetch(async () => {
      gets++;
      return new Response(bytes, { headers: { "content-type": "image/png" } });
    }),
  };
  const plan = await runSourcePipeline("plan", f.configPath);
  const receipt = await runSourcePipeline(
    "apply",
    f.configPath,
    { planSha256: plan.planSha256 },
    { database: db.port, store, http },
  );
  expect(receipt).toMatchObject({
    complete: true,
    mediaReferences: 2,
    uniqueObjects: 1,
    transferred: 1,
  });
  expect(gets).toBe(2);
  expect(puts).toBe(1);
});
test("per-cycle media quotas retain pending work and resume past previously transferred references", async () => {
  const f = await fixture();
  const media = join(f.root, "media.json");
  await Bun.write(
    media,
    JSON.stringify(
      ["one", "two"].map((name) => ({
        url: "https://source.example/" + name,
        size: name.length,
        sha256: hash(name),
        contentType: "image/png",
      })),
    ),
  );
  Object.assign(f.config, { media, maxCycleFiles: 1, maxCycleBytes: 3 });
  await Bun.write(f.configPath, JSON.stringify(f.config));
  const db = database();
  let puts = 0;
  const store = {
    async put() {
      puts++;
    },
    async verify() {},
    async attestStaged() {
      throw Error("unused");
    },
  } as ObjectStore;
  const ports = {
    database: db.port,
    store,
    http: {
      fetch: fakeFetch(
        async (url: string | URL | Request) =>
          new Response(new URL(String(url)).pathname.slice(1), {
            headers: { "content-type": "image/png" },
          }),
      ),
    },
  };
  const plan = await runSourcePipeline("plan", f.configPath);
  expect(
    await runSourcePipeline("apply", f.configPath, { planSha256: plan.planSha256 }, ports),
  ).toMatchObject({ complete: false, quotaPending: 1, cycleBytes: 3 });
  expect(
    await runSourcePipeline("apply", f.configPath, { planSha256: plan.planSha256 }, ports),
  ).toMatchObject({ complete: true, quotaPending: 0, cycleBytes: 3 });
  expect(puts).toBe(2);
  expect(
    await runSourcePipeline("verify", f.configPath, { planSha256: plan.planSha256 }, ports),
  ).toMatchObject({ complete: false, quotaPending: 1 });
  expect(
    await runSourcePipeline("verify", f.configPath, { planSha256: plan.planSha256 }, ports),
  ).toMatchObject({ complete: true, quotaPending: 0 });
});

test("automatic media discovery resumes byte/file quotas without discarding prior references", async () => {
  const source = doc();
  source.payload.embedded_media = ["one", "two"].map((name) => ({
    url: "https://source.example/" + name,
    type: "image",
  })) as never[];
  const f = await fixture([source], { maxCycleFiles: 1, maxCycleBytes: 3 }),
    db = database();
  const requests: string[] = [];
  const ports = {
    database: db.port,
    store: {
      async put() {},
      async verify() {},
      async attestStaged() {
        throw Error("unused");
      },
    } as ObjectStore,
    http: {
      fetch: fakeFetch(async (url: string | URL | Request) => {
        const name = new URL(String(url)).pathname.slice(1);
        requests.push(name);
        return new Response(name, { headers: { "content-type": "image/png" } });
      }),
    },
  };
  const first = await autoSourcePipeline(f.configPath, ports);
  expect(first.complete).toBe(false);
  const second = await autoSourcePipeline(f.configPath, ports);
  expect(second.complete).toBe(false);
  const third = await autoSourcePipeline(f.configPath, ports);
  expect(third.complete).toBe(true);
  expect(requests).toEqual(["one", "two"]);
  expect(await Bun.file(join(third.revision, "discovered-media.json")).json()).toHaveLength(2);
});

test("required collection delegates the entire campaign and acquisition once before local SQL", async () => {
  const { collectSourcePipeline } = await import("./bun-source-pipeline");
  const f = await fixture([doc()], {
      collectionIsolation: "required",
      crawl: {
        mode: "run",
        config: "/private/fixture-campaign.json",
        output: "/private/fixture-campaign",
      },
    }),
    db = database();
  const jar = join(f.root, "search-jar.json");
  await Bun.write(jar, "{}");
  await chmod(jar, 0o600);
  f.config.search = { queries: ["fixture"], domains: ["source.example"], count: 1, cookieJar: jar };
  await Bun.write(f.configPath, JSON.stringify(f.config));
  let searches = 0;
  let delegated = 0,
    inside = false,
    networkCampaigns = 0;
  const campaign = async (_campaign: unknown, phase: "collect" | "plan") => {
    if (phase === "collect") {
      expect(inside).toBe(true);
      networkCampaigns++;
    }
    return { complete: true, pending: 0, errors: 0, sourcePlansSha256: hash("fixture-plan") };
  };
  const result = await autoSourcePipeline(f.configPath, {
    database: db.port,
    campaign,
    search: async () => {
      throw Error("host search forbidden");
    },
    collectCycle: async (request, signal) => {
      delegated++;
      expect(request.configSha256).toBe(hash(await Bun.file(f.configPath).text()));
      expect(db.writes()).toBe(0);
      inside = true;
      try {
        return await collectSourcePipeline(request.configPath, {
          signal,
          campaign,
          isolatedCollection: true,
          search: async (args) => {
            expect(inside).toBe(true);
            searches++;
            return JSON.stringify({
              query: args.at(-1),
              authenticated: true,
              transport: "fetch",
              servedFromCache: false,
              organic: [],
            });
          },
        });
      } finally {
        inside = false;
      }
    },
  });
  expect(result.complete).toBe(true);
  expect(delegated).toBe(1);
  expect(networkCampaigns).toBe(2);
  expect(searches).toBe(1);
  expect(db.writes()).toBeGreaterThan(0);
});
test("required isolation and changed shared-volume receipts fail before database writes", async () => {
  const { collectSourcePipeline } = await import("./bun-source-pipeline");
  const f = await fixture([doc()], { collectionIsolation: "required" }),
    db = database();
  await expect(autoSourcePipeline(f.configPath, { database: db.port })).rejects.toThrow(
    "controller required",
  );
  await expect(collectSourcePipeline(f.configPath)).rejects.toThrow(
    "isolated collection owner required",
  );
  await expect(
    autoSourcePipeline(f.configPath, {
      database: db.port,
      collectCycle: async (request) => {
        const receipt = await collectSourcePipeline(request.configPath, {
          isolatedCollection: true,
        });
        await Bun.write(join(receipt.pinnedConfigPath, "..", "collect.json"), "{}");
        return receipt;
      },
    }),
  ).rejects.toThrow("artifact differs");
  expect(db.writes()).toBe(0);
});
test("isolated handoff never reacquires a missing media object on the controller", async () => {
  const { collectSourcePipeline } = await import("./bun-source-pipeline");
  const bytes = new TextEncoder().encode("private-media"),
    source = doc();
  source.payload.embedded_media = [
    { url: "https://source.example/private.png", type: "image" },
  ] as never[];
  const f = await fixture([source], { collectionIsolation: "required" }),
    db = database();
  let requests = 0;
  await expect(
    autoSourcePipeline(f.configPath, {
      database: db.port,
      store: { put: async () => {}, verify: async () => {} } as unknown as ObjectStore,
      http: {
        fetch: fakeFetch(async () => {
          throw Error("host acquisition forbidden");
        }),
      },
      collectCycle: async (request) => {
        const receipt = await collectSourcePipeline(request.configPath, {
          isolatedCollection: true,
          http: {
            fetch: fakeFetch(async () => {
              requests++;
              return new Response(bytes, { headers: { "content-type": "image/png" } });
            }),
          },
        });
        await rm(join(receipt.pinnedConfigPath, "..", "objects", hash(bytes)));
        return receipt;
      },
    }),
  ).rejects.toThrow("collected object receipt missing");
  expect(requests).toBe(1);
  expect(db.writes()).toBe(0);
});
