// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import postgres from "postgres";
import {
  crawlIngestPolicySchema,
  auditNativeCrawlMedia,
  ingestNativeCrawl,
  exportNativeCrawlArtifact,
  projectNativeCrawl,
  verifyNativeCrawlArtifact,
  type CrawlRegistryPort,
  type ExternalCrawlRecord,
  createBunSqlCrawlRegistry,
  createPostgresCrawlRegistry,
  createSqlCrawlRegistry,
  type CrawlRegistrySql,
} from "../src/dragon-ball/crawl-ingest";
import {
  auditDatasetCoverage,
  digest,
  sourceManifestSchema,
  type DatasetManifest,
} from "../src/dragon-ball/source-coverage";

const roots: string[] = [];

test("registry binds JSON provenance as one parameter and leaves protected records untouched", async () => {
  const provenance = { quoted: "'\\\"; SELECT 1; --", unicode: "悟空 🐉", nullable: null };
  const calls: { text: string; values: (string | number)[] }[] = [];
  let protectedRecord = false;
  let transactions = 0;
  const query: CrawlRegistrySql["query"] = async (strings, ...values) => {
    const text = strings.join("?");
    calls.push({ text, values });
    if (text.includes("to_regclass")) return [{ records: "records", provenance: "provenance" }];
    if (text.includes("RETURNING url")) return protectedRecord ? [] : [{ url: values[0] }];
    return [];
  };
  const registry = createSqlCrawlRegistry({
    query,
    begin: async (work) => {
      transactions++;
      return work(query);
    },
  });
  await registry.assertReady();
  const record = { ...projectNativeCrawl(document(), policy)[0]!, provenance };
  expect(await registry.upsert(record)).toBe("applied");
  expect(transactions).toBe(1);
  const write = calls.at(-1)!;
  expect(write.text).toContain("?::text::jsonb");
  expect(write.text).not.toContain(provenance.quoted);
  expect(write.values).toEqual([record.url, JSON.stringify(provenance)]);
  expect(JSON.parse(String(write.values[1]))).toEqual(provenance);
  protectedRecord = true;
  const before = calls.length;
  expect(await registry.upsert(record)).toBe("protected");
  expect(calls.length - before).toBe(1);
});

const crawlPgUrl = process.env.SHENRON_CRAWL_PG_URL;
test.skipIf(!crawlPgUrl)(
  "isolated PostgreSQL: both drivers preserve JSON, safeguards and rollback",
  async () => {
    const target = new URL(crawlPgUrl!);
    if (
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      target.pathname !== "/shenron_crawl_fixture"
    )
      throw new Error("Isolated crawl fixture PostgreSQL URL required");
    const sql = new Bun.SQL(crawlPgUrl!, { max: 1 });
    const compatible = postgres(crawlPgUrl!, { max: 1, prepare: false });
    let recordsCreated = false;
    let provenanceCreated = false;
    try {
      await sql`CREATE TABLE public.external_source_records (
      url text PRIMARY KEY, kind text NOT NULL, title text NOT NULL, excerpt text NOT NULL,
      http_status integer NOT NULL, content_hash text NOT NULL, fetched_at timestamptz NOT NULL,
      canonical_eligible boolean NOT NULL DEFAULT false)`;
      recordsCreated = true;
      await sql`CREATE TABLE public.external_source_provenance (
      url text PRIMARY KEY REFERENCES public.external_source_records(url),
      provenance jsonb NOT NULL CHECK (NOT provenance ? 'rejectFixture'), updated_at timestamptz NOT NULL)`;
      provenanceCreated = true;
      for (const registry of [
        createBunSqlCrawlRegistry(sql),
        createPostgresCrawlRegistry(compatible),
      ]) {
        await registry.assertReady();
        const record = {
          ...projectNativeCrawl(document(), policy)[0]!,
          provenance: { quoted: "'\\\"; DROP TABLE x; --", unicode: "悟空 🐉", nullable: null },
        };
        expect(await registry.upsert(record)).toBe("applied");
        const [stored] =
          await sql`SELECT r.title, p.provenance FROM public.external_source_records r
        JOIN public.external_source_provenance p USING(url) WHERE url=${record.url}`;
        expect(stored.provenance).toEqual(record.provenance);
        expect(stored.title).toBe(record.title);
        const failed = { ...record, title: "Must roll back", provenance: { rejectFixture: true } };
        await expect(registry.upsert(failed)).rejects.toThrow();
        const [unchanged] =
          await sql`SELECT r.title, p.provenance FROM public.external_source_records r
        JOIN public.external_source_provenance p USING(url) WHERE url=${record.url}`;
        expect(unchanged.title).toBe(record.title);
        expect(unchanged.provenance).toEqual(record.provenance);
        expect(await registry.upsert({ ...record, fetchedAt: "2020-01-01T00:00:00Z" })).toBe(
          "protected",
        );
        expect(await registry.upsert({ ...record, kind: "media", httpStatus: 0 })).toBe(
          "protected",
        );
        await sql`UPDATE public.external_source_records SET canonical_eligible=true WHERE url=${record.url}`;
        expect(await registry.upsert(record)).toBe("protected");
        await sql`DELETE FROM public.external_source_provenance`;
        await sql`DELETE FROM public.external_source_records`;
      }
    } finally {
      await compatible.end({ timeout: 5 });
      try {
        if (provenanceCreated) await sql`DROP TABLE public.external_source_provenance`;
        if (recordsCreated) await sql`DROP TABLE public.external_source_records`;
      } finally {
        await sql.close();
      }
    }
  },
);
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const resolved = await realpath(root);
    const local = relative(await realpath(tmpdir()), resolved);
    if (!local || local.startsWith("..") || isAbsolute(local))
      throw new Error("Test state left the declared temporary directory");
    await rm(resolved, { recursive: true });
  }
});
const source = (domain: string) => ({
  domain,
  kind: "reference" as const,
  reviewed: true as const,
  evidence: "https://dragon-ball-official.com/",
  rights: { ragPermitted: true as const, trainingPermitted: false, publicImagesPermitted: false },
});
const policy = crawlIngestPolicySchema.parse({
  version: 1,
  profile: "dbfr",
  sources: [source("dragon-ball-official.com"), source("cdn.dragonballfr.com")],
});
const document = () => ({
  crawl_id: "official-20261009",
  document_uid: "official-document-1",
  canonical_url: "https://dragon-ball-official.com/news/1/",
  source_domain: "dragon-ball-official.com",
  category: "official_news",
  http_status: 200,
  raw_checksum: "a".repeat(64),
  timestamp_utc: "2026-10-09T10:00:00Z",
  canonical_eligible: true,
  payload: {
    title_raw: "Official news",
    body_markdown: "Verified native export\n\nPRIVATE SOURCE BODY",
    embedded_media: [{ url: "https://cdn.dragonballfr.com/cover.webp", type: "image" }],
  },
});
async function exportFile(lines: unknown[]) {
  const root = await mkdtemp(join(tmpdir(), "shenron-native-crawl-"));
  roots.push(root);
  const path = join(root, "shenron-documents.jsonl");
  await Bun.write(path, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
  return path;
}

async function sealedArtifact(lines: unknown[], artifactPolicy = policy) {
  const inputPath = await exportFile(lines);
  const root = await mkdtemp(join(tmpdir(), "shenron-crawl-sealed-"));
  roots.push(root);
  const outputDir = join(root, "sealed");
  await exportNativeCrawlArtifact({
    inputPath,
    outputDir,
    jobReceipt: {
      key: "intent-fixture",
      host: "worker-vps",
      remoteId: "job-fixture",
      state: "succeeded",
      result: {},
      error: null,
    },
    policy: artifactPolicy,
  });
  return {
    inputPath: join(outputDir, "shenron-documents.jsonl"),
    manifestPath: join(outputDir, "manifest.json"),
  };
}

test("native sources keep reviewed classification and never promote canon or linked media health", () => {
  const records = projectNativeCrawl(document(), policy);
  expect(records).toHaveLength(2);
  expect(records[0]).toMatchObject({ kind: "reference", httpStatus: 200 });
  expect(records[0]!.provenance).toMatchObject({
    category: "official_news",
    canonicalEligible: false,
    rawChecksum: "a".repeat(64),
    rights: { trainingPermitted: false, publicImagesPermitted: false },
  });
  expect(records[1]).toMatchObject({ kind: "media", httpStatus: 0, excerpt: "" });
  expect(records[1]!.provenance.acquisition).toBe("reference-only");
});

test("unreviewed domains, malformed exports and Fandom including archive wrappers fail closed", () => {
  expect(() =>
    projectNativeCrawl({ ...document(), source_domain: "other.example" }, policy),
  ).toThrow();
  expect(() => projectNativeCrawl({ ...document(), raw_checksum: "bad" }, policy)).toThrow();
  expect(() =>
    projectNativeCrawl({ ...document(), canonical_url: "https://other.example/" }, policy),
  ).toThrow();
  for (const url of [
    "https://dragonball.fandom.com/wiki/Goku",
    "https://web.archive.org/web/2026/https%3A%2F%2Fdragonball.fandom.com%2Fwiki%2FGoku",
    "https://user:secret@dragon-ball-official.com/news/1/",
  ])
    expect(() => projectNativeCrawl({ ...document(), canonical_url: url }, policy)).toThrow();
  expect(() =>
    crawlIngestPolicySchema.parse({
      ...policy,
      sources: [{ ...source("dragon-ball-official.com"), reviewed: false }],
    }),
  ).toThrow();
});

test("reference intake preserves denied RAG, training and public image rights without canon promotion", async () => {
  const denied = crawlIngestPolicySchema.parse({
    ...policy,
    sources: policy.sources.map((entry) => ({
      ...entry,
      rights: { ragPermitted: false, trainingPermitted: false, publicImagesPermitted: false },
    })),
  });
  const records = projectNativeCrawl(document(), denied);
  expect(records).toHaveLength(2);
  expect(records[0]!.excerpt).toBe("");
  for (const record of records) {
    expect(record.provenance.rights).toEqual({
      ragPermitted: false,
      trainingPermitted: false,
      publicImagesPermitted: false,
    });
    expect(record.provenance.canonicalEligible).toBe(false);
  }
  const deposited: ExternalCrawlRecord[] = [];
  const artifact = await sealedArtifact([document()], denied);
  const report = await ingestNativeCrawl(
    { ...artifact, policy: denied, apply: true },
    {
      assertReady: async () => {},
      upsert: async (record) => {
        deposited.push(record);
        return "applied";
      },
    },
  );
  expect(report).toMatchObject({ applied: 2, canonicalPromotions: 0, complete: true });
  expect(deposited).toEqual(records);
  expect(() =>
    sourceManifestSchema.shape.rights.parse({
      ragPermitted: false,
      trainingPermitted: false,
      publicImagesPermitted: false,
    }),
  ).toThrow();
  const manifest: DatasetManifest = {
    version: 1,
    id: "official_news",
    family: "official_news",
    title: "Reference fixture",
    citation: document().canonical_url,
    edition: { publisher: "Fixture", format: "digital", language: "en", identifier: "reference" },
    unit: "document",
    asOf: "2026-10-11",
    enumerationEvidence: document().canonical_url,
    enumerationReviewed: true,
    expectedIds: ["reference"],
    editorialTarget: "none",
    rights: {
      basis: "permission",
      evidence: "Reviewed fixture",
      ragPermitted: false,
      trainingPermitted: true,
      publicImagesPermitted: false,
    },
    trainingReview: "approved",
    items: [],
  };
  const coverage = auditDatasetCoverage(
    {
      version: 1,
      asOf: manifest.asOf,
      families: [
        {
          family: manifest.family,
          expectedIds: [manifest.id],
          enumerationEvidence: manifest.citation,
          enumerationReviewed: true,
        },
      ],
    },
    [{ manifest, digest: digest(JSON.stringify(manifest)), gaps: [] }],
    { asOf: manifest.asOf, editorialFrozen: false },
  );
  expect(coverage.datasets).toContainEqual(
    expect.objectContaining({
      id: manifest.id,
      coverageComplete: true,
      ragReady: false,
      trainingReady: false,
    }),
  );
  expect(coverage.gaps).toContainEqual({
    family: manifest.family,
    datasetId: manifest.id,
    code: "rag-rights-unapproved",
  });
});

test("a reviewed public excerpt does not expose the private captured body or alter its content hash", () => {
  const input = document();
  const original = projectNativeCrawl(input, policy)[0]!;
  const summarized = projectNativeCrawl(
    { ...input, payload: { ...input.payload, public_excerpt: "Original factual summary." } },
    policy,
  )[0]!;
  expect(summarized.excerpt).toBe("Original factual summary.");
  expect(summarized.excerpt).not.toContain("PRIVATE SOURCE BODY");
  expect(summarized.contentHash).toBe(original.contentHash);
  expect(summarized.provenance.rawChecksum).toBe(original.provenance.rawChecksum);
  expect(
    projectNativeCrawl({ ...input, payload: { ...input.payload, public_excerpt: "" } }, policy)[0]!
      .excerpt,
  ).toBe("");
  expect(() =>
    projectNativeCrawl(
      { ...input, payload: { ...input.payload, public_excerpt: "x".repeat(8001) } },
      policy,
    ),
  ).toThrow();
});

test("plan streams metadata only without contacting PostgreSQL and reports bounded incomplete exports", async () => {
  const inputPath = await exportFile([document(), { ...document(), http_status: 404 }]);
  const port: CrawlRegistryPort = {
    assertReady: async () => {
      throw new Error("plan must not touch DB");
    },
    upsert: async () => {
      throw new Error("plan must not write");
    },
  };
  const report = await ingestNativeCrawl({ inputPath, policy }, port);
  expect(report).toMatchObject({
    complete: true,
    documents: 2,
    records: 2,
    skipped: 1,
    applied: 0,
  });
  expect(JSON.stringify(report)).not.toContain("PRIVATE SOURCE BODY");
  expect(await ingestNativeCrawl({ inputPath, policy, maxDocuments: 1 })).toMatchObject({
    complete: false,
    documents: 1,
    records: 2,
  });
});

test("closed crawl artifacts bind bytes, document count, job completion and reviewed policy", async () => {
  const inputPath = await exportFile([document()]);
  const root = await mkdtemp(join(tmpdir(), "shenron-crawl-artifact-"));
  roots.push(root);
  const artifactDir = join(root, "run-1");
  const receipt = {
    key: "intent-1",
    host: "worker-vps",
    remoteId: "job-1",
    state: "partial",
    result: {},
    error: null,
  };
  await expect(
    exportNativeCrawlArtifact({
      inputPath,
      outputDir: artifactDir,
      jobReceipt: receipt,
      policy,
    }),
  ).rejects.toThrow();
  const manifest = await exportNativeCrawlArtifact({
    inputPath,
    outputDir: artifactDir,
    jobReceipt: { ...receipt, state: "succeeded" },
    policy,
  });
  expect(manifest).toMatchObject({
    schema: "shenron-native-crawl-artifact",
    version: 1,
    job: { key: "intent-1", host: "worker-vps", remoteId: "job-1", status: "succeeded" },
    artifact: { file: "shenron-documents.jsonl", documents: 1 },
  });
  const payloadPath = join(artifactDir, "shenron-documents.jsonl");
  const manifestPath = join(artifactDir, "manifest.json");
  expect(await verifyNativeCrawlArtifact({ inputPath: payloadPath, manifestPath, policy })).toEqual(
    manifest,
  );
  const wrongPolicy = crawlIngestPolicySchema.parse({
    ...policy,
    sources: [source("different.example")],
  });
  await expect(
    verifyNativeCrawlArtifact({ inputPath: payloadPath, manifestPath, policy: wrongPolicy }),
  ).rejects.toThrow(/policy mismatch/);
  await Bun.write(payloadPath, `${JSON.stringify({ ...document(), crawl_id: "tampered" })}\n`);
  await expect(
    verifyNativeCrawlArtifact({ inputPath: payloadPath, manifestPath, policy }),
  ).rejects.toThrow(/SHA-256 mismatch/);
  await Bun.write(payloadPath, `${JSON.stringify(document())}\n`);
  await Bun.write(join(artifactDir, "unexpected.txt"), "extra");
  await expect(
    verifyNativeCrawlArtifact({ inputPath: payloadPath, manifestPath, policy }),
  ).rejects.toThrow(/unexpected files/);
});

test("apply refuses an unmanifested artifact before opening the registry", async () => {
  let ready = false;
  await expect(
    ingestNativeCrawl(
      { inputPath: await exportFile([document()]), policy, apply: true },
      {
        assertReady: async () => {
          ready = true;
        },
        upsert: async () => "applied",
      },
    ),
  ).rejects.toThrow(/requires a verified --manifest/);
  expect(ready).toBe(false);
});

test("restart replays stable URLs and preserves curated entries through the existing registry owner", async () => {
  const artifact = await sealedArtifact([document()]);
  const records = new Map<string, ExternalCrawlRecord>();
  const port: CrawlRegistryPort = {
    assertReady: async () => {},
    upsert: async (record) => {
      if (record.kind === "media") return "protected";
      records.set(record.url, record);
      return "applied";
    },
  };
  for (let i = 0; i < 2; i++) {
    expect(await ingestNativeCrawl({ ...artifact, policy, apply: true }, port)).toMatchObject({
      applied: 1,
      protected: 1,
      canonicalPromotions: 0,
      complete: true,
    });
  }
  expect(records.size).toBe(1);
  await expect(ingestNativeCrawl({ ...artifact, policy, apply: true })).rejects.toThrow();
});

test("missing migrated registry and cancellation stop all deposits", async () => {
  const inputPath = await exportFile([document()]);
  let writes = 0;
  const port: CrawlRegistryPort = {
    assertReady: async () => {
      throw new Error("missing migration");
    },
    upsert: async () => {
      writes++;
      return "applied";
    },
  };
  await expect(ingestNativeCrawl({ inputPath, policy, apply: true }, port)).rejects.toThrow();
  port.assertReady = async () => {};
  const controller = new AbortController();
  controller.abort();
  await expect(
    ingestNativeCrawl({ inputPath, policy, apply: true, signal: controller.signal }, port),
  ).rejects.toThrow();
  expect(writes).toBe(0);
});

test("media audit records actual missing/content failures without following redirects or storing URLs", async () => {
  const input = document();
  input.payload.embedded_media = ["ok", "gone", "html", "fallback", "redirect"].map((name) => ({
    url: `https://cdn.dragonballfr.com/${name}.webp`,
    type: "image",
  }));
  const inputPath = await exportFile([input]);
  const calls: Array<{ url: string; method: string; range: string | null; redirect: string }> = [];
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const value = String(url);
    calls.push({
      url: value,
      method: init?.method ?? "GET",
      range: new Headers(init?.headers).get("Range"),
      redirect: init?.redirect ?? "follow",
    });
    if (value.endsWith("gone.webp")) return new Response(null, { status: 404 });
    if (value.endsWith("html.webp"))
      return new Response(null, { headers: { "content-type": "text/html" } });
    if (value.endsWith("redirect.webp"))
      return new Response(null, {
        status: 302,
        headers: { location: "https://undeclared.example/" },
      });
    if (value.endsWith("fallback.webp") && init?.method === "HEAD")
      return new Response(null, { status: 405 });
    return new Response(null, { headers: { "content-type": "image/webp" } });
  }) as typeof fetch;
  const report = await auditNativeCrawlMedia({ inputPath, policy, fetcher });
  expect(report).toMatchObject({
    checkedFiles: 5,
    available: 2,
    completeInventory: true,
    recoveredFiles: 0,
  });
  expect(report.repairCandidates.map((item) => item.state)).toEqual(["missing", "invalid-content"]);
  expect(report.unavailable).toHaveLength(1);
  expect(calls.every((call) => call.redirect === "manual")).toBe(true);
  expect(calls.find((call) => call.method === "GET")?.range).toBe("bytes=0-511");
  expect(JSON.stringify(report)).not.toContain("https://");
  const bounded = await auditNativeCrawlMedia({ inputPath, policy, fetcher, maxFiles: 1 });
  expect(bounded).toMatchObject({ checkedFiles: 1, completeInventory: false });
});
