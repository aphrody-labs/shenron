// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  externalSourceImportSchema,
  externalSourceImportStore,
  importExternalSources,
} from "../src/lib/external-source-import";

const actor = { id: "admin-1", name: "Admin" };
const record = {
  url: "https://voir-anime.to/anime/dragon-ball/",
  title: "Dragon Ball",
  excerpt: "Captured metadata",
  contentHash: "a".repeat(64),
  provenance: {
    sourceUrl: "https://voir-anime.to/anime/dragon-ball/",
    sitemap: "https://voir-anime.to/anime-sitemap.xml",
    observedAt: "2026-01-01T00:00:00Z",
    method: "GET",
    httpStatus: 200,
    kind: "series",
    family: "dragon_ball",
    edition: "unspecified",
  },
};
const { family: _family, ...capturedProvenance } = record.provenance;
const toeiRecord = {
  ...record,
  url: "https://voir-anime.to/anime/one-piece/one-piece-01-vf/",
  title: "One Piece 01 VF",
  provenance: {
    ...capturedProvenance,
    sourceUrl: "https://voir-anime.to/anime/one-piece/one-piece-01-vf/",
    kind: "episode_candidate",
    edition: "vf",
    scope: "toei_catalog",
    catalogProof: {
      entryUrl: "https://www.toei-animation.com/catalog/one-piece/",
      entryTitle: "ONE PIECE",
      listingUrl: "https://www.toei-animation.com/catalog/",
      contentHash: "b".repeat(64),
      observedAt: "2026-01-01T00:00:00Z",
      method: "GET",
      httpStatus: 200,
    },
  },
};
const dialect = new PgDialect();
let queries: { sql: string; params: unknown[] }[] = [];
let transactions = 0;
let fail = false;
let stored = new Set<string>();
let orphanProvenance = new Set<string>();
let provenanceConflict = false;
mock.module("@/lib/db", () => ({
  db: {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      queries.push(dialect.sqlToQuery(query));
      return [...new Set([...stored, ...orphanProvenance])].map((url) => ({ url }));
    },
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      transactions++;
      const pending = new Set(stored);
      const result = await callback({
        execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
          const compiled = dialect.sqlToQuery(query);
          queries.push(compiled);
          if (compiled.sql.startsWith("SET LOCAL")) return [];
          const input = JSON.parse(compiled.params[0] as string) as { url: string }[];
          const added = input.filter((r) => !pending.has(r.url) && !orphanProvenance.has(r.url));
          for (const r of added) pending.add(r.url);
          if (fail) throw new Error("provenance storage failed");
          return added.map((row) => ({ url: row.url, provenance_inserted: !provenanceConflict }));
        },
      });
      stored = pending;
      return result;
    },
  },
}));
beforeEach(() => {
  queries = [];
  transactions = 0;
  fail = false;
  stored = new Set();
  orphanProvenance = new Set();
  provenanceConflict = false;
});

describe("external reference import", () => {
  test("accepts mixed legacy and Toei references without assigning a Toriyama or studio credit", async () => {
    const store = await externalSourceImportStore();
    expect(
      (await importExternalSources({ records: [record, toeiRecord] }, actor, store)).wouldInsert,
    ).toBe(2);
    expect(transactions).toBe(0);
    expect(
      (await importExternalSources({ apply: true, records: [record, toeiRecord] }, actor, store))
        .inserted,
    ).toBe(2);
    const payload = JSON.parse(queries.at(-1)!.params[0] as string);
    const source = payload.find((r: { url: string }) => r.url === toeiRecord.url);
    expect(source.provenance.catalogProof).toEqual(toeiRecord.provenance.catalogProof);
    expect(source.provenance.scope).toBe("toei_catalog");
    expect(source.provenance).not.toHaveProperty("family");
    expect(source.provenance).not.toHaveProperty("studio");
    expect(source.provenance.relationship).toBe("official_catalog_match_candidate");
    expect(source.provenance.creditScope).toBe("catalogue_not_studio");
    expect(source.provenance.parentUrl).toBe("https://voir-anime.to/anime/one-piece/");
    expect(source.provenance.editionMeaning).toBe(
      "source_url_label_not_verified_playback_language",
    );
    expect(source.provenance.canonicalEligible).toBe(false);
    expect(payload.find((r: { url: string }) => r.url === record.url).provenance.relationship).toBe(
      "original_author",
    );
    expect(
      (await importExternalSources({ apply: true, records: [toeiRecord] }, actor, store)).skipped,
    ).toBe(1);
  });
  test("accepts a newly observed catalog entry and paginated listing without a frozen title inventory", () => {
    const input = {
      records: [
        {
          ...toeiRecord,
          provenance: {
            ...toeiRecord.provenance,
            catalogProof: {
              ...toeiRecord.provenance.catalogProof,
              entryUrl: "https://www.toei-animation.com/catalog/newly-observed-title/",
              entryTitle: "Newly observed title",
              listingUrl: "https://www.toei-animation.com/catalog/page/9/",
            },
          },
        },
      ],
    };
    expect(externalSourceImportSchema.parse(input).apply).toBe(false);
  });
  test.each([
    { entryUrl: "https://www.toei-animation.com.evil.example/catalog/one-piece/" },
    { entryUrl: "https://evil.example/catalog/one-piece/" },
    { entryUrl: "https://toei-animation.com/catalog/one-piece/" },
    { entryUrl: "https://sub.www.toei-animation.com/catalog/one-piece/" },
    { entryUrl: "http://www.toei-animation.com/catalog/one-piece/" },
    { entryUrl: "https://user:secret@www.toei-animation.com/catalog/one-piece/" },
    { entryUrl: "https://www.toei-animation.com:8443/catalog/one-piece/" },
    { entryUrl: "https://www.toei-animation.com/catalog/one-piece/?token=x" },
    { entryUrl: "https://www.toei-animation.com/catalog/one-piece/#credit" },
    { entryUrl: "https://www.toei-animation.com/press/one-piece/" },
    { entryUrl: "https://www.toei-animation.com/catalog/one-piece/../digimon/" },
    { entryUrl: "https://www.toei-animation.com/catalog/%6fne-piece/" },
    { entryUrl: "https://www.toei-animation.com/catalog/page/2/" },
    { entryUrl: "javascript:alert(1)" },
    { listingUrl: "https://www.toei-animation.com/catalog/one-piece/" },
    { listingUrl: "https://www.toei-animation.com/catalog/page/0/" },
    { listingUrl: "https://www.toei-animation.com/catalog/page/2/?cat=family" },
    { listingUrl: "https://evil.example/catalog/" },
    { entryTitle: " " },
    { entryTitle: "x".repeat(1001) },
    { entryTitle: "ONE\0PIECE" },
    { contentHash: "unverified" },
    { observedAt: "2099-01-01T00:00:00Z" },
    { method: "POST" },
    { httpStatus: 301 },
    { studio: "Toei Animation" },
  ])("rejects an invalid or unbounded official catalog attestation: %j", async (patch) => {
    await expect(
      importExternalSources(
        {
          records: [
            {
              ...toeiRecord,
              provenance: {
                ...toeiRecord.provenance,
                catalogProof: { ...toeiRecord.provenance.catalogProof, ...patch },
              },
            },
          ],
        },
        actor,
        await externalSourceImportStore(),
      ),
    ).rejects.toThrow();
    expect(queries).toHaveLength(0);
    expect(transactions).toBe(0);
  });
  test.each([
    { scope: "toei_studio" },
    { family: "other_toriyama" },
    { studio: "Toei Animation" },
    { canonicalEligible: true },
    { catalogProof: undefined },
  ])("rejects missing proof and mixed or invented Toei attribution: %j", (patch) => {
    expect(() =>
      externalSourceImportSchema.parse({
        records: [
          {
            ...toeiRecord,
            provenance: { ...toeiRecord.provenance, ...patch },
          },
        ],
      }),
    ).toThrow();
  });
  test("defaults to dry-run without a transaction or write", async () => {
    const result = await importExternalSources(
      { records: [record] },
      actor,
      await externalSourceImportStore(),
    );
    expect(result).toEqual({ dryRun: true, inserted: 0, wouldInsert: 1, skipped: 0 });
    expect(transactions).toBe(0);
    expect(queries).toHaveLength(1);
    expect(queries[0]!.sql).toStartWith("SELECT");
  });
  test("insert-missing is idempotent and preserves existing metadata and provenance", async () => {
    const store = await externalSourceImportStore();
    const created = await importExternalSources({ apply: true, records: [record] }, actor, store);
    expect(created.inserted).toBe(1);
    expect(created).toHaveProperty("insertedUrls", [record.url]);
    expect(
      (
        await importExternalSources(
          { apply: true, records: [{ ...record, title: "Changed" }] },
          actor,
          store,
        )
      ).skipped,
    ).toBe(1);
    expect(transactions).toBe(2);
    const statement = queries.find((q) => q.sql.includes("WITH input"))!;
    expect(statement.sql).toContain("public.external_source_records");
    expect(statement.sql).toContain("public.external_source_provenance");
    expect(statement.sql).toContain("JOIN inserted USING (url)");
    expect(statement.sql.match(/ON CONFLICT \(url\) DO NOTHING/g)).toHaveLength(2);
    expect(statement.sql).not.toContain("DO UPDATE");
    const payload = JSON.parse(statement.params[0] as string);
    expect(payload[0].provenance.import.actor).toEqual(actor);
    expect(payload[0].provenance.sourceUrl).toBe(record.url);
    expect(payload[0].provenance.sitemap).toBe(record.provenance.sitemap);
    expect(payload[0].provenance.contentHash).toBe(record.contentHash);
    expect(payload[0].provenance.parentUrl).toBeNull();
    expect(payload[0].provenance.relationship).toBe("original_author");
    expect(payload[0].provenance.creditScope).toBe("franchise_not_adaptation_specific");
    expect(payload[0].provenance.editionMeaning).toBe(
      "source_url_label_not_verified_playback_language",
    );
    expect(payload[0].provenance.canonicalEligible).toBe(false);
    expect(statement.sql).toContain("200");
    expect(statement.sql).toContain("false");
  });
  test("propagates transaction failure without committing partial state", async () => {
    fail = true;
    await expect(
      importExternalSources(
        { apply: true, records: [record] },
        actor,
        await externalSourceImportStore(),
      ),
    ).rejects.toThrow("provenance storage failed");
    expect(stored.size).toBe(0);
    expect(transactions).toBe(1);
  });
  test("derives candidate parent and bounded franchise relationship from captured family", async () => {
    for (const [family, relationship] of Object.entries({
      dragon_ball: "original_author",
      dr_slump: "original_author",
      sand_land: "original_author",
      blue_dragon: "franchise_character_design",
      dragon_quest: "franchise_character_design",
      chrono_trigger: "franchise_character_design",
      other_toriyama: "requires_title_credit_verification",
    })) {
      const url = `https://voir-anime.to/anime/${family.replaceAll("_", "-")}/episode-01/`;
      await importExternalSources(
        {
          apply: true,
          records: [
            {
              ...record,
              url,
              provenance: {
                ...record.provenance,
                sourceUrl: url,
                kind: "episode_candidate",
                family,
              },
            },
          ],
        },
        actor,
        await externalSourceImportStore(),
      );
      const payload = JSON.parse(queries.at(-1)!.params[0] as string);
      expect(payload[0].provenance.sourceUrl).toBe(url);
      expect(payload[0].provenance.parentUrl).toBe(new URL("../", url).href);
      expect(payload[0].provenance.relationship).toBe(relationship);
      expect(payload[0].provenance.canonicalEligible).toBe(false);
    }
  });
  test("orphan provenance is skipped and a concurrent provenance conflict rolls back", async () => {
    orphanProvenance.add(record.url);
    const store = await externalSourceImportStore();
    expect(await importExternalSources({ records: [record] }, actor, store)).toEqual({
      dryRun: true,
      inserted: 0,
      wouldInsert: 0,
      skipped: 1,
    });
    expect(
      (await importExternalSources({ apply: true, records: [record] }, actor, store)).inserted,
    ).toBe(0);
    expect(queries.find((q) => q.sql.includes("WITH input"))!.sql).toContain("WHERE NOT EXISTS");
    orphanProvenance.clear();
    provenanceConflict = true;
    await expect(
      importExternalSources({ apply: true, records: [record] }, actor, store),
    ).rejects.toThrow("Source provenance conflict");
    expect(stored.size).toBe(0);
  });
  test("rejects unsourced, duplicate, non-200, foreign, query and oversized imports", () => {
    for (const input of [
      { records: [] },
      { records: Array.from({ length: 101 }, () => record) },
      { records: [record, record] },
      { records: [{ ...record, url: "https://evil.example/anime/db/" }] },
      { records: [{ ...record, url: record.url + "?token=x" }] },
      { records: [{ ...record, contentHash: "invented" }] },
      { records: [{ ...record, title: "x".repeat(1001) }] },
      { records: [{ ...record, canonical_eligible: true }] },
      { records: [{ ...record, provenance: { ...record.provenance, kind: "episode_candidate" } }] },
      {
        records: [
          {
            ...record,
            url: record.url + "episode-01/",
            provenance: {
              ...record.provenance,
              sourceUrl: record.url + "episode-01/",
              kind: "series",
            },
          },
        ],
      },
      { records: [{ ...record, provenance: { ...record.provenance, httpStatus: 403 } }] },
      { records: [{ ...record, provenance: { ...record.provenance, method: "POST" } }] },
      {
        records: [
          {
            ...record,
            provenance: { ...record.provenance, sitemap: "https://evil.example/a.xml" },
          },
        ],
      },
      {
        records: [
          {
            ...record,
            provenance: { ...record.provenance, sourceUrl: "https://voir-anime.to/anime/other/" },
          },
        ],
      },
      {
        records: [
          { ...record, provenance: { ...record.provenance, observedAt: "2099-01-01T00:00:00Z" } },
        ],
      },
    ])
      expect(externalSourceImportSchema.safeParse(input).success).toBe(false);
  });
});
