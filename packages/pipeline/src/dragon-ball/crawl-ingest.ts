// SPDX-License-Identifier: Apache-2.0
/** Native crawl exports enter the existing source registry without canon promotion. */
import { createHash } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type postgres from "postgres";
import { z } from "zod";

const sourceUrl = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      let decoded = value;
      for (let i = 0; i < 4; i++) {
        try {
          decoded = decodeURIComponent(decoded);
        } catch {
          break;
        }
      }
      return (
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !/(?:^|[/.])fandom\.com(?:[/:?#]|$)/i.test(decoded)
      );
    } catch {
      return false;
    }
  });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const classifications = z.enum([
  "reference",
  "publisher",
  "archive",
  "statistics",
  "community",
  "bibliography",
  "translation",
]);
export const crawlIngestPolicySchema = z
  .object({
    version: z.literal(1),
    profile: z.literal("dbfr"),
    sources: z
      .array(
        z
          .object({
            domain: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/),
            kind: classifications,
            reviewed: z.literal(true),
            evidence: sourceUrl,
            rights: z
              .object({
                ragPermitted: z.boolean(),
                trainingPermitted: z.boolean(),
                publicImagesPermitted: z.boolean(),
              })
              .strict(),
          })
          .strict(),
      )
      .min(1)
      .max(64),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (new Set(value.sources.map((source) => source.domain)).size !== value.sources.length)
      ctx.addIssue({ code: "custom", message: "Source domains must be unique" });
    if (value.sources.some((source) => /(^|\.)fandom\.com$/.test(source.domain)))
      ctx.addIssue({ code: "custom", message: "Fandom sources are forbidden" });
  });
export type CrawlIngestPolicy = z.infer<typeof crawlIngestPolicySchema>;

const nativeDocumentSchema = z.object({
  crawl_id: z.string().min(1).max(256),
  document_uid: z.string().min(1).max(256),
  canonical_url: sourceUrl,
  source_domain: z.string().min(1).max(253),
  category: z.string().min(1).max(128),
  http_status: z.number().int().min(100).max(599),
  raw_checksum: hash,
  timestamp_utc: z.string().datetime({ offset: true }),
  canonical_eligible: z.boolean().optional(),
  provenance: z.unknown().optional(),
  payload: z.object({
    title_raw: z.string().max(10000),
    body_markdown: z.string().max(1024 * 1024),
    public_excerpt: z.string().max(8000).optional(),
    embedded_media: z
      .array(
        z.object({
          url: sourceUrl,
          type: z.enum(["image", "audio", "video"]),
          caption: z.string().nullable().optional(),
        }),
      )
      .max(5000),
  }),
});
export interface ExternalCrawlRecord {
  url: string;
  kind: z.infer<typeof classifications> | "media";
  title: string;
  excerpt: string;
  httpStatus: number;
  contentHash: string;
  fetchedAt: string;
  provenance: Record<string, unknown>;
}
export interface CrawlRegistryPort {
  assertReady(): Promise<void>;
  /** Each record and its provenance are one transaction. Curated canon is preserved. */
  upsert(record: ExternalCrawlRecord): Promise<"applied" | "protected">;
}
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const text = (value: string, limit: number) => value.replaceAll("\0", "").trim().slice(0, limit);

export function projectNativeCrawl(
  value: unknown,
  policy: CrawlIngestPolicy,
): ExternalCrawlRecord[] {
  const document = nativeDocumentSchema.parse(value);
  const host = new URL(document.canonical_url).hostname;
  if (document.source_domain !== host) throw new Error("Native source domain does not match URL");
  const source = policy.sources.find((item) => item.domain === host);
  if (!source) throw new Error("Native source is absent from the reviewed policy");
  if (document.http_status < 200 || document.http_status >= 300) return [];
  const body = text(document.payload.body_markdown, 1024 * 1024);
  if (!body) return [];
  const provenance = {
    schema: "shenron-native-crawl-registry/v1",
    crawlId: document.crawl_id,
    documentUid: document.document_uid,
    category: document.category,
    rawChecksum: document.raw_checksum,
    policyDigest: digest(JSON.stringify(policy)),
    evidence: source.evidence,
    rights: source.rights,
    reviewed: source.reviewed,
    canonicalEligible: false,
  };
  const records: ExternalCrawlRecord[] = [
    {
      url: document.canonical_url,
      kind: source.kind,
      title: text(document.payload.title_raw, 1000) || document.canonical_url,
      excerpt: text(
        document.payload.public_excerpt ?? (source.rights.ragPermitted ? body : ""),
        8000,
      ).replace(/\s+/g, " "),
      contentHash: digest(body),
      httpStatus: document.http_status,
      fetchedAt: document.timestamp_utc,
      provenance,
    },
  ];
  const seen = new Set<string>([document.canonical_url]);
  for (const media of document.payload.embedded_media) {
    const mediaSource = policy.sources.find((item) => item.domain === new URL(media.url).hostname);
    if (!mediaSource || seen.has(media.url)) continue;
    seen.add(media.url);
    records.push({
      url: media.url,
      kind: "media",
      title: text(media.caption ?? media.url, 1000),
      excerpt: "",
      contentHash: digest(media.url),
      // A successful parent page does not prove the linked file exists.
      httpStatus: 0,
      fetchedAt: document.timestamp_utc,
      provenance: {
        ...provenance,
        parentUrl: document.canonical_url,
        mediaType: media.type,
        acquisition: "reference-only",
        evidence: mediaSource.evidence,
        rights: mediaSource.rights,
      },
    });
  }
  return records;
}

/** Stream lines with a bound independent of export size; no corpus is printed. */
async function* documents(path: string, signal?: AbortSignal): AsyncGenerator<unknown> {
  if (!isAbsolute(path)) throw new Error("Native export requires a protected absolute path");
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error("Native export must be a regular file");
  const reader = Bun.file(await realpath(path))
    .stream()
    .getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let pending = "";
  try {
    while (true) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      pending += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (Buffer.byteLength(line) > 2 * 1024 * 1024)
          throw new Error("Native export line exceeds bound");
        if (line) yield JSON.parse(line);
      }
      if (Buffer.byteLength(pending) > 2 * 1024 * 1024)
        throw new Error("Native export line exceeds bound");
      if (chunk.done) break;
    }
    if (pending.trim()) yield JSON.parse(pending);
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

export async function ingestNativeCrawl(
  options: {
    inputPath: string;
    policy: unknown;
    apply?: boolean;
    maxDocuments?: number;
    signal?: AbortSignal;
  },
  port?: CrawlRegistryPort,
) {
  const policy = crawlIngestPolicySchema.parse(options.policy);
  const maxDocuments = options.maxDocuments ?? 10000;
  if (!Number.isSafeInteger(maxDocuments) || maxDocuments < 1 || maxDocuments > 100000)
    throw new Error("maxDocuments must be 1..100000");
  if (options.apply) {
    if (!port) throw new Error("A DBFR registry owner is required for apply");
    await port.assertReady();
  }
  const report = {
    schema: "shenron-native-crawl-ingest/v1",
    profile: "dbfr",
    apply: options.apply === true,
    documents: 0,
    records: 0,
    mediaReferences: 0,
    skipped: 0,
    applied: 0,
    protected: 0,
    canonicalPromotions: 0,
    complete: false,
  };
  for await (const document of documents(options.inputPath, options.signal)) {
    if (report.documents === maxDocuments) return report;
    report.documents++;
    const records = projectNativeCrawl(document, policy);
    if (!records.length) report.skipped++;
    for (const record of records) {
      options.signal?.throwIfAborted();
      report.records++;
      if (record.kind === "media") report.mediaReferences++;
      if (options.apply) report[await port!.upsert(record)]++;
    }
  }
  report.complete = true;
  return report;
}

/** Uses already migrated tables; never creates schemas or touches editorial tables. */
export function createPostgresCrawlRegistry(sql: postgres.Sql): CrawlRegistryPort {
  return {
    assertReady: async () => {
      const rows = await sql`SELECT to_regclass('public.external_source_records') AS records,
        to_regclass('public.external_source_provenance') AS provenance`;
      if (!rows[0]?.records || !rows[0]?.provenance)
        throw new Error("The DBFR source registry requires its existing Infra migration");
    },
    upsert: async (record) =>
      sql.begin(async (transaction) => {
        const rows = await transaction`
        INSERT INTO public.external_source_records
          (url, kind, title, excerpt, http_status, content_hash, fetched_at, canonical_eligible)
        VALUES (${record.url}, ${record.kind}, ${record.title}, ${record.excerpt},
          ${record.httpStatus}, ${record.contentHash}, ${record.fetchedAt}, false)
        ON CONFLICT (url) DO UPDATE SET kind=EXCLUDED.kind, title=EXCLUDED.title,
          excerpt=EXCLUDED.excerpt, http_status=EXCLUDED.http_status,
          content_hash=EXCLUDED.content_hash, fetched_at=EXCLUDED.fetched_at
        WHERE NOT public.external_source_records.canonical_eligible
          AND public.external_source_records.fetched_at <= EXCLUDED.fetched_at
          AND (EXCLUDED.kind != 'media' OR public.external_source_records.http_status = 0)
        RETURNING url`;
        if (!rows.length) return "protected" as const;
        await transaction`
        INSERT INTO public.external_source_provenance (url, provenance, updated_at)
        VALUES (${record.url}, ${transaction.json(record.provenance as postgres.JSONValue)}, now())
        ON CONFLICT (url) DO UPDATE SET provenance=EXCLUDED.provenance, updated_at=EXCLUDED.updated_at`;
        return "applied" as const;
      }),
  };
}

/** Availability-only plan. Recovery needs a separately verified acquired file and CDN owner. */
export async function auditNativeCrawlMedia(options: {
  inputPath: string;
  policy: unknown;
  maxFiles?: number;
  maxDocuments?: number;
  concurrency?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}) {
  const policy = crawlIngestPolicySchema.parse(options.policy);
  const maxFiles = options.maxFiles ?? 250;
  const maxDocuments = options.maxDocuments ?? 10000;
  const concurrency = options.concurrency ?? 2;
  const timeoutMs = options.timeoutMs ?? 10000;
  if (
    !Number.isSafeInteger(maxFiles) ||
    maxFiles < 1 ||
    maxFiles > 5000 ||
    !Number.isSafeInteger(maxDocuments) ||
    maxDocuments < 1 ||
    maxDocuments > 100000 ||
    !Number.isSafeInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 8 ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 60000
  )
    throw new Error("Media audit exceeds bounded file/document/concurrency/deadline limits");
  const media = new Map<string, ExternalCrawlRecord>();
  let scanned = 0;
  let completeInventory = true;
  for await (const document of documents(options.inputPath, options.signal)) {
    if (scanned === maxDocuments) {
      completeInventory = false;
      break;
    }
    scanned++;
    for (const record of projectNativeCrawl(document, policy)) {
      if (record.kind !== "media" || media.has(record.url)) continue;
      if (media.size === maxFiles) {
        completeInventory = false;
        break;
      }
      media.set(record.url, record);
    }
    if (!completeInventory) break;
  }
  type MediaProbe = {
    urlDigest: string;
    status: number;
    state: "available" | "missing" | "invalid-content" | "unavailable";
  };
  const records = [...media.values()];
  const probes: MediaProbe[] = [];
  const fetcher = options.fetcher ?? fetch;
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, records.length) }, async () => {
      while (cursor < records.length) {
        options.signal?.throwIfAborted();
        const index = cursor++;
        const record = records[index]!;
        const deadline = AbortSignal.timeout(timeoutMs);
        const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
        let status = 0;
        let state: MediaProbe["state"] = "unavailable";
        try {
          let response = await fetcher(record.url, {
            method: "HEAD",
            redirect: "manual",
            signal,
            cache: "no-store",
          });
          if (response.status === 405 || response.status === 501) {
            await response.body?.cancel();
            response = await fetcher(record.url, {
              method: "GET",
              headers: { Range: "bytes=0-511" },
              redirect: "manual",
              signal,
              cache: "no-store",
            });
          }
          status = response.status;
          const contentType = response.headers.get("content-type") ?? "";
          const type = record.provenance.mediaType;
          state =
            status === 404 || status === 410
              ? "missing"
              : response.ok
                ? contentType.startsWith(`${type}/`)
                  ? "available"
                  : "invalid-content"
                : "unavailable";
          await response.body?.cancel();
        } catch {
          options.signal?.throwIfAborted();
        }
        probes[index] = { urlDigest: digest(record.url), status, state };
      }
    }),
  );
  return {
    schema: "shenron-native-media-audit/v1",
    profile: "dbfr",
    measuredAt: new Date().toISOString(),
    documents: scanned,
    checkedFiles: probes.length,
    completeInventory,
    available: probes.filter((probe) => probe.state === "available").length,
    repairCandidates: probes.filter((probe) =>
      ["missing", "invalid-content"].includes(probe.state),
    ),
    unavailable: probes.filter((probe) => probe.state === "unavailable"),
    fullFileHashes: "not-measured",
    recoveredFiles: 0,
    probes,
  };
}
