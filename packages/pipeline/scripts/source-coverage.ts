// SPDX-License-Identifier: Apache-2.0
import { createHash } from "node:crypto";
import { realpath, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const citation = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !/(^|\.)fandom\.com$/i.test(url.hostname);
  });
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
    try {
      if (isAbsolute(page.asset)) throw new Error("Absolute asset path");
      const path = await realpath(resolve(root, page.asset));
      const local = relative(root, path);
      if (
        local === ".." ||
        local.startsWith("../") ||
        local.startsWith("..\\") ||
        isAbsolute(local)
      )
        throw new Error("Asset escapes root");
      if (digest(await readFile(path)) !== page.sha256) issues.push(`hash:${page.number}`);
    } catch {
      issues.push(`asset:${page.number}`);
    }
  }
  for (let number = 1; number <= source.expectedPages; number++)
    if (!seen.has(number)) issues.push(`missing:${number}`);
  return { source, issues, ready: issues.length === 0, digest: digest(JSON.stringify(source)) };
}

if (import.meta.main) {
  if (Bun.argv[2] === "--audit") {
    const [, catalogPath, manifestRoot, assetRoot, output] = Bun.argv.slice(2);
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
    const [manifest, root] = Bun.argv.slice(2);
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
