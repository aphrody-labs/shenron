// SPDX-License-Identifier: Apache-2.0
import { z } from "zod";

export const SOURCE_IMPORT_MAX_BYTES = 1_048_576;
export const SOURCE_IMPORT_MAX_RECORDS = 100;

function safeUrl(value: string, sitemap = false): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === "https://voir-anime.to" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.href === value &&
      (sitemap
        ? /^\/[a-z0-9_-]+\.xml$/.test(url.pathname)
        : /^\/anime\/[a-z0-9-]+\/(?:[a-z0-9-]+\/)?$/.test(url.pathname))
    );
  } catch {
    return false;
  }
}

const cleanText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !s.includes("\0"));
const capturedAt = z
  .string()
  .datetime({ offset: true })
  .refine((s) => Date.parse(s) <= Date.now() + 60_000);
const contentHash = z.string().regex(/^[a-f0-9]{64}$/);
const toriyamaFamily = z.enum([
  "dragon_ball",
  "dr_slump",
  "sand_land",
  "blue_dragon",
  "dragon_quest",
  "chrono_trigger",
  "other_toriyama",
]);

function safeToeiCatalogUrl(value: string, listing = false): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === "https://www.toei-animation.com" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.href === value &&
      (listing
        ? /^\/catalog\/(?:page\/[1-9][0-9]*\/)?$/.test(url.pathname)
        : /^\/catalog\/[a-z0-9-]+\/$/.test(url.pathname))
    );
  } catch {
    return false;
  }
}

const catalogProof = z
  .object({
    entryUrl: z
      .string()
      .max(2048)
      .refine((url) => safeToeiCatalogUrl(url)),
    entryTitle: cleanText(1000),
    listingUrl: z
      .string()
      .max(2048)
      .refine((url) => safeToeiCatalogUrl(url, true)),
    observedAt: capturedAt,
    contentHash,
    method: z.literal("GET"),
    httpStatus: z.literal(200),
  })
  .strict();
const capturedProvenance = z.object({
  sourceUrl: z
    .string()
    .max(2048)
    .refine((url) => safeUrl(url)),
  sitemap: z
    .string()
    .max(2048)
    .refine((url) => safeUrl(url, true)),
  observedAt: capturedAt,
  method: z.literal("GET"),
  httpStatus: z.literal(200),
  kind: z.enum(["series", "episode_candidate"]),
  edition: z.enum(["vf", "vostfr", "unspecified"]),
});
const sourceProvenance = z.union([
  capturedProvenance.extend({ family: toriyamaFamily }).strict(),
  capturedProvenance.extend({ scope: z.literal("toei_catalog"), catalogProof }).strict(),
]);
const sourceRecord = z
  .object({
    url: z
      .string()
      .max(2048)
      .refine((url) => safeUrl(url)),
    title: cleanText(1000),
    excerpt: z
      .string()
      .max(8000)
      .refine((s) => !s.includes("\0")),
    contentHash,
    provenance: sourceProvenance,
  })
  .strict()
  .refine((r) => r.url === r.provenance.sourceUrl, { message: "Source URL must match record URL" })
  .refine(
    (r) =>
      r.provenance.kind === "series"
        ? /^https:\/\/voir-anime\.to\/anime\/[a-z0-9-]+\/$/.test(r.url)
        : /^https:\/\/voir-anime\.to\/anime\/[a-z0-9-]+\/[a-z0-9-]+\/$/.test(r.url),
    { message: "Source kind must match URL depth" },
  );

export const externalSourceImportSchema = z
  .object({
    apply: z.boolean().default(false),
    records: z.array(sourceRecord).min(1).max(SOURCE_IMPORT_MAX_RECORDS),
  })
  .strict()
  .superRefine(({ records }, ctx) => {
    if (new Set(records.map((r) => r.url)).size !== records.length)
      ctx.addIssue({ code: "custom", message: "Duplicate source URL" });
  });

export type ExternalSourceImport = z.infer<typeof externalSourceImportSchema>;
export type ExternalSourceImportRecord = ExternalSourceImport["records"][number];
export type SourceImportActor = { id: string; name: string | null };
const relationships: Record<z.infer<typeof toriyamaFamily>, string> = {
  dragon_ball: "original_author",
  dr_slump: "original_author",
  sand_land: "original_author",
  blue_dragon: "franchise_character_design",
  dragon_quest: "franchise_character_design",
  chrono_trigger: "franchise_character_design",
  other_toriyama: "requires_title_credit_verification",
};
export interface ExternalSourceImportStore {
  existing(urls: string[]): Promise<string[]>;
  insertMissing(records: ExternalSourceImportRecord[], actor: SourceImportActor): Promise<string[]>;
}

/** The administrative caller attests to the captured GET; this never fetches remote content. */
export async function importExternalSources(
  input: unknown,
  actor: SourceImportActor,
  store: ExternalSourceImportStore,
) {
  const request = externalSourceImportSchema.parse(input);
  const urls = request.records.map((r) => r.url);
  if (!request.apply) {
    const existing = new Set(await store.existing(urls));
    return {
      dryRun: true,
      inserted: 0,
      wouldInsert: urls.filter((url) => !existing.has(url)).length,
      skipped: existing.size,
    };
  }
  const inserted = await store.insertMissing(request.records, actor);
  return {
    dryRun: false,
    inserted: inserted.length,
    insertedUrls: inserted,
    wouldInsert: 0,
    skipped: urls.length - inserted.length,
  };
}

/** Reuses the site's shared Drizzle pool; no DDL and no external I/O inside the transaction. */
export async function externalSourceImportStore(): Promise<ExternalSourceImportStore> {
  const [{ db }, { sql }] = await Promise.all([import("./db"), import("drizzle-orm")]);
  return {
    async existing(urls) {
      const rows = await db.execute(sql`SELECT url FROM public.external_source_records
        WHERE url IN (${sql.join(
          urls.map((url) => sql`${url}`),
          sql`, `,
        )}) UNION SELECT url FROM public.external_source_provenance WHERE url IN (${sql.join(
          urls.map((url) => sql`${url}`),
          sql`, `,
        )})`);
      return Array.from(rows as unknown as { url: string }[]).map((r) => r.url);
    },
    async insertMissing(records, actor) {
      const payload = JSON.stringify(
        records.map((r) => ({
          url: r.url,
          title: r.title,
          excerpt: r.excerpt,
          content_hash: r.contentHash,
          fetched_at: r.provenance.observedAt,
          provenance: {
            ...r.provenance,
            contentHash: r.contentHash,
            parentUrl:
              r.provenance.kind === "episode_candidate" ? new URL("../", r.url).href : null,
            relationship:
              "family" in r.provenance
                ? relationships[r.provenance.family]
                : "official_catalog_match_candidate",
            creditScope:
              "family" in r.provenance
                ? "franchise_not_adaptation_specific"
                : "catalogue_not_studio",
            editionMeaning: "source_url_label_not_verified_playback_language",
            canonicalEligible: false,
            import: {
              actor,
              importedAt: new Date().toISOString(),
              owner: "external-source-import/v1",
            },
          },
        })),
      );
      return db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
        const rows = await tx.execute(sql`
          WITH input AS (
            SELECT * FROM jsonb_to_recordset(${payload}::jsonb)
              AS x(url text, title text, excerpt text, content_hash text, fetched_at timestamptz, provenance jsonb)
          ), inserted AS (
            INSERT INTO public.external_source_records
              (url, kind, title, excerpt, http_status, content_hash, fetched_at, canonical_eligible)
            SELECT url, 'reference', title, excerpt, 200, content_hash, fetched_at, false FROM input
            WHERE NOT EXISTS (SELECT 1 FROM public.external_source_provenance p WHERE p.url = input.url)
            ORDER BY url
            ON CONFLICT (url) DO NOTHING RETURNING url
          ), provenance_insert AS (
            INSERT INTO public.external_source_provenance (url, provenance, updated_at)
            SELECT input.url, input.provenance, now() FROM input JOIN inserted USING (url)
            ON CONFLICT (url) DO NOTHING RETURNING url
          ) SELECT inserted.url, (provenance_insert.url IS NOT NULL) AS provenance_inserted
            FROM inserted LEFT JOIN provenance_insert USING (url)
        `);
        const inserted = Array.from(
          rows as unknown as { url: string; provenance_inserted: boolean }[],
        );
        // A concurrent orphan provenance insert must roll back the new record as well.
        if (inserted.some((row) => !row.provenance_inserted))
          throw new Error("Source provenance conflict");
        return inserted.map((r) => r.url);
      });
    },
  };
}
