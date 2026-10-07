// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { realpath, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
function allowedCitation(value: string): boolean {
  try {
    const original = new URL(value);
    if (original.protocol !== "https:") return false;
    let wrapped = `${original.pathname}${original.search}`;
    for (let depth = 0; depth < 4; depth++) {
      let decoded: string;
      try {
        decoded = decodeURIComponent(wrapped);
      } catch {
        break;
      }
      if (decoded === wrapped) break;
      wrapped = decoded;
    }
    const urls = [original];
    for (const match of wrapped.matchAll(/https?:\/\/[^/\s]+/giu)) urls.push(new URL(match[0]));
    return urls.every(
      (url) =>
        !url.username &&
        !url.password &&
        !/(^|\.)fandom\.com$/i.test(url.hostname.replace(/\.+$/u, "")),
    );
  } catch {
    return false;
  }
}
const citation = z.string().url().refine(allowedCitation);
export const sourceManifestSchema = z.object({
  version: z.literal(1),
  family: z.enum(["soshuhen", "kai_dragon_book", "full_color", "weekly_shonen_jump", "interview"]),
  id: z.string().regex(/^[a-z0-9_]{1,64}$/),
  title: z.string().trim().min(1),
  edition: z.object({
    publisher: z.string().trim().min(1),
    format: z.enum(["print", "digital"]),
    language: z.enum(["ja", "fr", "en"]),
    identifier: z.string().trim().min(1),
  }),
  citation,
  expectedPages: z.number().int().positive().max(10000),
  pageCountEvidence: citation,
  databaseTarget: z
    .discriminatedUnion("table", [
      z.object({ table: z.literal("db_databooks"), id: z.number().int().positive() }),
      z.object({ table: z.literal("db_manga_volumes"), id: z.number().int().positive() }),
    ])
    .optional(),
  rights: z.object({
    basis: z.enum(["licensed", "owned", "permission", "public_domain"]),
    evidence: z.string().trim().min(1),
    ragPermitted: z.literal(true),
    publicImagesPermitted: z.boolean(),
  }),
  pages: z.array(
    z.object({
      number: z.number().int().positive(),
      asset: z.string().min(1),
      readerImage: z.string().min(1).optional(),
      mangaReader: z
        .object({
          chapterId: z.number().int().positive(),
          pageIndex: z.number().int().positive(),
          planche: z.number().int().positive(),
        })
        .optional(),
      sha256: hash,
      review: z.enum(["approved", "pending", "rejected"]),
      text: z.string(),
      noText: z.boolean(),
      lang: z.enum(["ja", "fr", "en"]),
    }),
  ),
});
export type SourceManifest = z.infer<typeof sourceManifestSchema>;
export const sourceCatalogSchema = z.object({
  version: z.literal(1),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  families: z.array(
    z.object({
      family: sourceManifestSchema.shape.family,
      expectedIds: z.array(z.string().regex(/^[a-z0-9_]{1,64}$/)),
      enumerationEvidence: citation,
      enumerationReviewed: z.boolean(),
    }),
  ),
});

/** Global completeness requires a reviewed enumeration, including open-ended publications. */
export function auditCatalog(
  input: unknown,
  sources: { source: SourceManifest; ready: boolean }[],
  requiredAsOf = new Date().toISOString().slice(0, 10),
) {
  const catalog = sourceCatalogSchema.parse(input);
  const issues: string[] = [];
  if (catalog.asOf !== requiredAsOf) issues.push(`stale-enumeration:${catalog.asOf}`);
  for (const family of sourceManifestSchema.shape.family.options) {
    const entries = catalog.families.filter((entry) => entry.family === family);
    if (entries.length !== 1) {
      issues.push(`enumeration:${family}`);
      continue;
    }
    const entry = entries[0]!;
    if (entry.expectedIds.length === 0) issues.push(`empty-enumeration:${family}`);
    if (!entry.enumerationReviewed) issues.push(`unreviewed:${family}`);
    if (new Set(entry.expectedIds).size !== entry.expectedIds.length)
      issues.push(`duplicate-ids:${family}`);
    if (family === "soshuhen" && entry.expectedIds.length !== 18)
      issues.push("expected-volumes:soshuhen");
    for (const id of entry.expectedIds) {
      const matches = sources.filter(
        (item) => item.source.id === id && item.source.family === family,
      );
      if (matches.length !== 1 || !matches[0]?.ready) issues.push(`source:${family}:${id}`);
    }
  }
  return { version: 1 as const, asOf: catalog.asOf, complete: issues.length === 0, issues };
}
export const digest = (bytes: string | Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

async function verifyLocalAsset(
  root: string,
  asset: string,
  sha256: string,
): Promise<"asset" | "hash" | null> {
  try {
    if (isAbsolute(asset)) return "asset";
    const path = await realpath(resolve(root, asset));
    const local = relative(root, path);
    if (local === ".." || local.startsWith("../") || local.startsWith("..\\") || isAbsolute(local))
      return "asset";
    return digest(await readFile(path)) === sha256 ? null : "hash";
  } catch {
    return "asset";
  }
}

/** Validate actual assets, including symlink resolution, before any external write. */
export async function verifySource(input: unknown, assetRoot: string) {
  const source = sourceManifestSchema.parse(input);
  const root = await realpath(assetRoot);
  const issues: string[] = [];
  const seen = new Set<number>();
  for (const page of source.pages) {
    if (seen.has(page.number)) issues.push(`duplicate:${page.number}`);
    seen.add(page.number);
    if (page.number > source.expectedPages) issues.push(`unexpected:${page.number}`);
    if (page.review !== "approved") issues.push(`review:${page.number}`);
    if (page.noText === Boolean(page.text.trim())) issues.push(`text:${page.number}`);
    const issue = await verifyLocalAsset(root, page.asset, page.sha256);
    if (issue) issues.push(`${issue}:${page.number}`);
  }
  for (let number = 1; number <= source.expectedPages; number++)
    if (!seen.has(number)) issues.push(`missing:${number}`);
  return { source, issues, ready: issues.length === 0, digest: digest(JSON.stringify(source)) };
}

/** Dataset families are editorial classes, independent of crawler source IDs. */
export const DRAGON_BALL_DATASET_FAMILIES = [
  "manga",
  "databooks",
  "soshuhen",
  "kai_dragon_book",
  "full_color",
  "weekly_shonen_jump",
  "interview",
  "guides",
  "timeline",
  "official_news",
  "official_episodes",
  "toriyama_biography",
  "archives",
  "catalogues",
  "reference",
  "community",
] as const;
const datasetFamily = z.enum(DRAGON_BALL_DATASET_FAMILIES);
const identifier = z.string().regex(/^[a-z0-9_]{1,64}$/);
const review = z.enum(["approved", "pending", "rejected"]);
export const datasetManifestSchema = z.object({
  version: z.literal(1),
  id: identifier,
  family: datasetFamily,
  title: z.string().trim().min(1),
  citation,
  edition: sourceManifestSchema.shape.edition,
  unit: z.enum(["page", "document", "event", "asset"]),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  enumerationEvidence: citation,
  enumerationReviewed: z.boolean(),
  expectedIds: z.array(z.string().trim().min(1)).max(100000),
  editorialTarget: z.enum(["manga", "databook", "wiki", "none"]),
  rights: z.object({
    basis: z.enum(["licensed", "owned", "permission", "public_domain", "unverified"]),
    evidence: z.string().trim().min(1),
    ragPermitted: z.boolean(),
    trainingPermitted: z.boolean(),
    publicImagesPermitted: z.boolean(),
  }),
  trainingReview: review,
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        asset: z.string().min(1),
        sha256: hash,
        review,
        text: z.string(),
        noText: z.boolean(),
        lang: z.enum(["ja", "fr", "en"]),
      }),
    )
    .max(100000),
});
export type DatasetManifest = z.infer<typeof datasetManifestSchema>;
export interface CoverageGap {
  family: (typeof DRAGON_BALL_DATASET_FAMILIES)[number];
  datasetId?: string;
  itemId?: string;
  code: string;
}
export interface VerifiedDataset {
  manifest: DatasetManifest;
  digest: string;
  gaps: CoverageGap[];
}
export const datasetCatalogSchema = z.object({
  version: z.literal(1),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  families: z.array(
    z.object({
      family: datasetFamily,
      expectedIds: z.array(identifier),
      enumerationEvidence: citation,
      enumerationReviewed: z.boolean(),
    }),
  ),
});

/** Read actual private files; acquisition receipts alone never approve editorial text. */
export async function verifyDataset(input: unknown, assetRoot: string): Promise<VerifiedDataset> {
  const manifest = datasetManifestSchema.parse(input);
  const root = await realpath(assetRoot);
  const gaps: CoverageGap[] = [];
  const gap = (code: string, itemId?: string) =>
    gaps.push({
      family: manifest.family,
      datasetId: manifest.id,
      ...(itemId ? { itemId } : {}),
      code,
    });
  if (!manifest.enumerationReviewed) gap("unreviewed-enumeration");
  if (!manifest.expectedIds.length) gap("empty-enumeration");
  if (new Set(manifest.expectedIds).size !== manifest.expectedIds.length)
    gap("duplicate-enumeration");
  const expected = new Set(manifest.expectedIds);
  const seen = new Set<string>();
  for (const item of manifest.items) {
    if (seen.has(item.id)) gap("duplicate-item", item.id);
    seen.add(item.id);
    if (!expected.has(item.id)) gap("unexpected-item", item.id);
    if (item.review !== "approved") gap("unapproved-item", item.id);
    if (item.noText === Boolean(item.text.trim())) gap("invalid-text-state", item.id);
    const issue = await verifyLocalAsset(root, item.asset, item.sha256);
    if (issue) gap(issue === "hash" ? "hash-mismatch" : "missing-asset", item.id);
  }
  for (const id of expected) if (!seen.has(id)) gap("missing-item", id);
  return { manifest, digest: digest(JSON.stringify(manifest)), gaps };
}

/** Metadata-only result for automation; no page text, rights evidence or private asset path. */
export function auditDatasetCoverage(
  input: unknown,
  verified: readonly VerifiedDataset[],
  options: { asOf?: string; editorialFrozen: boolean },
) {
  const catalog = datasetCatalogSchema.parse(input);
  const asOf = options.asOf ?? new Date().toISOString().slice(0, 10);
  const gaps: CoverageGap[] = [];
  const datasets: Array<{
    id: string;
    family: DatasetManifest["family"];
    digest: string;
    expected: number;
    received: number;
    coverageComplete: boolean;
    ragReady: boolean;
    trainingReady: boolean;
  }> = [];
  for (const family of DRAGON_BALL_DATASET_FAMILIES) {
    const entries = catalog.families.filter((item) => item.family === family);
    const add = (code: string, datasetId?: string) =>
      gaps.push({ family, ...(datasetId ? { datasetId } : {}), code });
    if (entries.length !== 1) {
      add("missing-or-duplicate-family-enumeration");
      continue;
    }
    const entry = entries[0]!;
    const familyGapsStart = gaps.length;
    if (catalog.asOf !== asOf) add("stale-catalog-enumeration");
    if (!entry.enumerationReviewed) add("unreviewed-family-enumeration");
    if (!entry.expectedIds.length) add("empty-family-enumeration");
    if (new Set(entry.expectedIds).size !== entry.expectedIds.length)
      add("duplicate-family-enumeration");
    if (family === "soshuhen" && entry.expectedIds.length !== 18) add("expected-volumes-soshuhen");
    const familyReady = gaps.length === familyGapsStart;
    for (const id of new Set(entry.expectedIds)) {
      const matching = verified.filter(
        (item) => item.manifest.id === id && item.manifest.family === family,
      );
      if (matching.length !== 1) {
        add("missing-or-duplicate-manifest", id);
        continue;
      }
      const report = matching[0]!;
      const manifest = report.manifest;
      const local = [...report.gaps];
      if (report.digest !== digest(JSON.stringify(manifest)))
        local.push({ family, datasetId: id, code: "changed-manifest-after-verification" });
      if (manifest.asOf !== asOf)
        local.push({ family, datasetId: id, code: "stale-dataset-enumeration" });
      const coverageComplete = familyReady && local.length === 0;
      const frozen = options.editorialFrozen && manifest.editorialTarget === "databook";
      if (frozen) local.push({ family, datasetId: id, code: "editorial-freeze" });
      const provenRights = manifest.rights.basis !== "unverified";
      if (!provenRights || !manifest.rights.ragPermitted)
        local.push({ family, datasetId: id, code: "rag-rights-unapproved" });
      if (!provenRights || !manifest.rights.trainingPermitted)
        local.push({ family, datasetId: id, code: "training-rights-unapproved" });
      if (manifest.trainingReview !== "approved")
        local.push({ family, datasetId: id, code: "training-labels-unapproved" });
      gaps.push(...local);
      const ragReady = coverageComplete && !frozen && provenRights && manifest.rights.ragPermitted;
      datasets.push({
        id,
        family,
        digest: report.digest,
        expected: manifest.expectedIds.length,
        received: new Set(manifest.items.map((item) => item.id)).size,
        coverageComplete,
        ragReady,
        trainingReady:
          ragReady && manifest.rights.trainingPermitted && manifest.trainingReview === "approved",
      });
    }
    for (const report of verified.filter(
      (item) => item.manifest.family === family && !entry.expectedIds.includes(item.manifest.id),
    ))
      add("unexpected-manifest", report.manifest.id);
  }
  const enumerationComplete = !gaps.some((gap) => /family|catalog|manifest|volumes/.test(gap.code));
  const coverageComplete =
    enumerationComplete && datasets.length > 0 && datasets.every((item) => item.coverageComplete);
  return {
    schema: "shenron-dragon-ball-dataset-coverage/v1" as const,
    asOf,
    coverageComplete,
    ragReady: coverageComplete && datasets.every((item) => item.ragReady),
    trainingReady: coverageComplete && datasets.every((item) => item.trainingReady),
    datasets,
    gaps,
  };
}

export async function runSourceCoverageCli(args: readonly string[]): Promise<void> {
  if (args[0] === "--audit") {
    const [, catalogPath, manifestRoot, assetRoot, output] = args;
    if (!catalogPath || !manifestRoot || !assetRoot)
      throw new Error(
        "Usage: bun source-coverage.ts --audit <catalog.json> <manifest-root> <asset-root> [report.json]",
      );
    const catalog = sourceCatalogSchema.parse(await Bun.file(catalogPath).json());
    const sources: Awaited<ReturnType<typeof verifySource>>[] = [];
    const unavailable: string[] = [];
    for (const entry of catalog.families)
      for (const id of entry.expectedIds) {
        try {
          sources.push(
            await verifySource(
              await Bun.file(resolve(manifestRoot, `${id}.json`)).json(),
              assetRoot,
            ),
          );
        } catch {
          unavailable.push(id);
        }
      }
    const report = {
      ...auditCatalog(catalog, sources),
      unavailable,
      sources: sources.map((item) => ({
        id: item.source.id,
        family: item.source.family,
        expectedPages: item.source.expectedPages,
        receivedPages: item.source.pages.length,
        ready: item.ready,
        issues: item.issues,
        digest: item.digest,
      })),
    };
    const json = `${JSON.stringify(report, null, 2)}\n`;
    if (output) await Bun.write(output, json);
    console.log(json);
    if (!report.complete) process.exitCode = 2;
  } else {
    const [manifest, root] = args;
    if (!manifest || !root)
      throw new Error("Usage: bun source-coverage.ts <manifest.json> <asset-root>");
    const report = await verifySource(await Bun.file(manifest).json(), root);
    console.log(
      JSON.stringify(
        {
          id: report.source.id,
          expectedPages: report.source.expectedPages,
          ready: report.ready,
          issues: report.issues,
          digest: report.digest,
        },
        null,
        2,
      ),
    );
    if (!report.ready) process.exitCode = 2;
  }
}
