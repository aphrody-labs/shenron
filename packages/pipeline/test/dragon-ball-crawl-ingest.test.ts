// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import {
  crawlIngestPolicySchema,
  auditNativeCrawlMedia,
  ingestNativeCrawl,
  projectNativeCrawl,
  type CrawlRegistryPort,
  type ExternalCrawlRecord,
} from "../src/dragon-ball/crawl-ingest";

const roots: string[] = [];
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

test("restart replays stable URLs and preserves curated entries through the existing registry owner", async () => {
  const inputPath = await exportFile([document()]);
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
    expect(await ingestNativeCrawl({ inputPath, policy, apply: true }, port)).toMatchObject({
      applied: 1,
      protected: 1,
      canonicalPromotions: 0,
      complete: true,
    });
  }
  expect(records.size).toBe(1);
  await expect(ingestNativeCrawl({ inputPath, policy, apply: true })).rejects.toThrow();
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
