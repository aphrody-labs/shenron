// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { type SQL } from "drizzle-orm";
import {
  CatalogMediaConflictError,
  isbnVariants,
  parseMediaCatalogBody,
} from "../src/lib/catalog-media-contracts";
import {
  WikiUpdatePreconditionError,
  wikiUpdateSnapshotHash,
} from "../src/lib/wiki-update-precondition";

type Row = Record<string, unknown>;
const dialect = new PgDialect();
const queries: Array<{ sql: string; params: unknown[] }> = [];
const inserts: Row[] = [];
const updates: Row[] = [];
const reads: Row[][] = [];
let identityOverrides = 0;
let databooksFrozen = false;
const rowLocks: string[] = [];
mock.module("@/lib/databooks-freeze", () => ({
  assertDatabooksWritable: () => {
    if (databooksFrozen) throw new Error("DATABOOKS_FROZEN");
  },
}));
mock.module("server-only", () => ({}));
mock.module("@/lib/databook-pages", () => ({
  ecrireTraduction: async () => {},
  ecrireTranscription: async () => {},
}));
function select() {
  const result = Promise.resolve(reads.shift() ?? []);
  const builder = Object.assign(result, {
    from: () => builder,
    where: (condition: SQL) => {
      queries.push(dialect.sqlToQuery(condition));
      return builder;
    },
    limit: () => builder,
    for: (strength: string) => {
      rowLocks.push(strength);
      return builder;
    },
  });
  return builder;
}
function insert() {
  const builder = {
    overridingSystemValue: () => {
      identityOverrides++;
      return builder;
    },
    values: (row: Row) => {
      inserts.push(row);
      return { returning: async () => [{ id: 900, ...row }] };
    },
  };
  return builder;
}
function update() {
  return {
    set: (row: Row) => {
      updates.push(row);
      return { where: () => ({ returning: async () => [{ id: 4, ...row }] }) };
    },
  };
}
const client = {
  select,
  insert,
  update,
  execute: async (statement: SQL) => {
    queries.push(dialect.sqlToQuery(statement));
  },
};
mock.module("@/lib/db", () => ({
  db: {
    ...client,
    transaction: async (callback: (tx: typeof client) => Promise<unknown>) => callback(client),
  },
}));
const { insertWiki, updateWiki, getWikiRow, deleteWiki } = await import("../src/lib/wiki-admin");
const { recordRevision } = await import("../src/lib/wiki-revisions");

beforeEach(() => {
  queries.length = 0;
  inserts.length = 0;
  updates.length = 0;
  reads.length = 0;
  identityOverrides = 0;
  databooksFrozen = false;
  rowLocks.length = 0;
});

describe("catalogue identities and editorial revisions", () => {
  test("episode frame updates require complete preconditions in the owner writer", async () => {
    await expect(updateWiki("db_episodes", "875", { frames: [] })).rejects.toThrow(
      "snapshot and SHA256 required",
    );
    expect(updates).toHaveLength(0);
    expect(queries).toHaveLength(0);
    await expect(
      updateWiki("db_episodes", "875", { durationSec: 1397 }, { expectedSha256: "0".repeat(64) }),
    ).rejects.toThrow("snapshot and SHA256 required");
    expect(updates).toHaveLength(0);
    expect(queries).toHaveLength(0);
  });
  test("episode frames compare the locked complete row before updating", async () => {
    const before = { id: 875, frames: null, durationSec: 1397, title: "Current" };
    reads.push([before]);
    await updateWiki(
      "db_episodes",
      "875",
      { frames: [], durationSec: 1397 },
      { expected: before, expectedSha256: wikiUpdateSnapshotHash(before) },
    );
    expect(queries[0]!.sql).toContain("pg_advisory_xact_lock");
    expect(queries[0]!.params).toContain("shenron:wiki:db_episodes:875");
    expect(rowLocks).toEqual(["update"]);
    expect(updates).toEqual([{ frames: [], durationSec: 1397 }]);
  });
  test("concurrent source, frame or title changes prevent an episode write", async () => {
    const expected = {
      id: 875,
      frames: null,
      durationSec: 1397,
      title: "Current",
      videoUrl: "https://example.test/episode",
    };
    for (const changed of [
      { ...expected, frames: [] },
      { ...expected, title: "Concurrent" },
      { ...expected, videoUrl: "https://example.test/changed" },
    ]) {
      reads.push([changed]);
      await expect(
        updateWiki(
          "db_episodes",
          "875",
          { frames: [] },
          { expected, expectedSha256: wikiUpdateSnapshotHash(expected) },
        ),
      ).rejects.toBeInstanceOf(WikiUpdatePreconditionError);
    }
    expect(rowLocks).toEqual(["update", "update", "update"]);
    expect(updates).toHaveLength(0);
  });
  test("blocks whole-page restoration in the owner writer during the databook freeze", async () => {
    databooksFrozen = true;
    await expect(updateWiki("db_databooks", "63", { pages: [] })).rejects.toThrow(
      "DATABOOKS_FROZEN",
    );
    await expect(
      insertWiki("db_databooks", { title: "Existing book", pages: null }),
    ).rejects.toThrow("DATABOOKS_FROZEN");
    expect(queries).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });
  test("recognizes the same publication under ISBN-10 and ISBN-13", () => {
    expect(isbnVariants("4-08-873467-X")).toContain("9784088734675");
    expect(isbnVariants("978-4-08-873467-5")).toContain("408873467X");
    expect(isbnVariants("9784083217271")).toEqual([]);
  });

  test("rejects invalid dates, languages and publication identity before insertion", () => {
    const body = { workId: 1, edition: "tankobon", label: "English edition" };
    expect(() =>
      parseMediaCatalogBody("media_editions", { ...body, publishedAt: "2026-02-30" }, true),
    ).toThrow();
    expect(() =>
      parseMediaCatalogBody("media_editions", { ...body, language: "unknown" }, true),
    ).toThrow();
    expect(() =>
      parseMediaCatalogBody("media_editions", { ...body, isbn: "9784083217271" }, true),
    ).toThrow();
  });

  test("does not turn an English colour edition into Japanese N&B during a label patch", () => {
    expect(parseMediaCatalogBody("media_editions", { label: "Corrected label" }, false)).toEqual({
      label: "Corrected label",
    });
  });

  test("refuses an existing NULL-ISBN edition while preserving both existing identifiers", async () => {
    reads.push([{ id: 4 }, { id: 8 }]);
    try {
      await insertWiki("media_editions", {
        workId: 1,
        edition: "full_color",
        label: "Dragon Ball Full Color (32 tomes)",
        pageColor: "color",
      });
      throw new Error("Expected a duplicate conflict");
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogMediaConflictError);
      expect((error as CatalogMediaConflictError).existingIds).toEqual([4, 8]);
    }
    expect(inserts).toHaveLength(0);
    expect(queries[0].sql).toContain("pg_advisory_xact_lock");
    expect(queries[1].sql).toContain("lower(trim(");
    expect(queries[1].sql).not.toContain("is null");
  });

  test("checks the editorial identity even when an ISBN becomes known", async () => {
    reads.push([{ id: 4 }]);
    await expect(
      insertWiki("media_editions", {
        workId: 1,
        edition: "full_color",
        label: "Dragon Ball Full Color",
        pageColor: "color",
        isbn: "4-08-873467-X",
      }),
    ).rejects.toBeInstanceOf(CatalogMediaConflictError);
    expect(inserts).toHaveLength(0);
    expect(queries[1].sql).toContain(" or ");
    expect(queries[1].sql).toContain("lower(trim(");
    expect(queries[1].params).toContain("9784088734675");
    expect(queries[1].sql).toContain("is null");
  });

  test("restores a historical media identity through PostgreSQL override only", async () => {
    reads.push([]);
    const body = {
      id: "17",
      slug: "neko-majin",
      kind: "manga",
      series: "NEKO_MAJIN",
      title: "Neko Majin",
    };
    const row = await insertWiki("media_works", body, { restoreId: 17 });
    expect(row.id).toBe(17);
    expect(identityOverrides).toBe(1);
    expect(inserts[0].id).toBe(17);
    expect(() => parseMediaCatalogBody("media_works", body, true)).toThrow();
  });

  test("rejects invalid restoration identifiers before accessing PostgreSQL", async () => {
    await expect(
      insertWiki(
        "media_works",
        { slug: "neko-majin", kind: "manga", series: "NEKO_MAJIN", title: "Neko Majin" },
        { restoreId: Number.NaN },
      ),
    ).rejects.toThrow("Invalid media restoration identity");
    expect(queries).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  test("uses the existing PostgreSQL identity rather than inventing max+1 IDs", async () => {
    reads.push([]);
    const row = await insertWiki("media_works", {
      slug: "neko-majin",
      kind: "manga",
      series: "NEKO_MAJIN",
      title: "Neko Majin",
    });
    expect(row.id).toBe(900);
    expect(inserts[0]).not.toHaveProperty("id");
  });

  test("blocks remapping a volume onto an already linked historical volume", async () => {
    reads.push(
      [{ id: 4, editionId: 4, legacyVolumeId: 701, number: "1", slug: "sosh-1" }],
      [{ id: 19 }],
    );
    await expect(updateWiki("media_volumes", "4", { legacyVolumeId: 702 })).rejects.toBeInstanceOf(
      CatalogMediaConflictError,
    );
    expect(updates).toHaveLength(0);
  });

  test("permits metadata repairs on an existing duplicate without changing its identity", async () => {
    reads.push([]);
    reads.push([
      {
        id: 4,
        workId: 1,
        edition: "full_color",
        language: "ja",
        label: "Dragon Ball Full Color",
        pageColor: "color",
        isbn: null,
      },
    ]);
    await updateWiki("media_editions", "4", { publisher: "Shueisha" });
    expect(updates).toEqual([{ publisher: "Shueisha" }]);
    expect(queries).toHaveLength(3);
  });

  test("excludes retained edition aliases from duplicate matching", async () => {
    reads.push([]);
    await insertWiki("media_editions", {
      workId: 1,
      edition: "tankobon",
      label: "Different edition",
      language: "ja",
    });
    expect(queries[1].sql).toContain("NOT EXISTS");
    expect(queries[1].sql).toContain("bot.media_edition_aliases");
  });

  test("reads the historical row without replacing its requested ID or visibility", async () => {
    reads.push([{ id: 5, visible: false, label: "Historical edition" }], [{ canonicalId: 1 }]);
    expect(await getWikiRow("media_editions", "5")).toEqual({
      id: 5,
      visible: false,
      label: "Historical edition",
      canonicalId: 1,
    });
  });

  test("refuses mutation and visibility changes of retained aliases", async () => {
    reads.push([{ canonicalId: 1 }]);
    await expect(updateWiki("media_editions", "5", { label: "Changed" })).rejects.toMatchObject({
      existingIds: [1],
    });
    reads.push([{ canonicalId: 1 }]);
    await expect(deleteWiki("media_editions", "5")).rejects.toMatchObject({ existingIds: [1] });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  test("canonicalizes an alias before testing a new volume identity", async () => {
    reads.push([{ canonicalId: 1 }], []);
    const row = await insertWiki("media_volumes", {
      editionId: 5,
      number: "43",
      slug: "alias-volume",
    });
    expect(row.editionId).toBe(1);
    expect(inserts[0].editionId).toBe(1);
    expect(queries[2].params).toContain(1);
    expect(queries[2].params).not.toContain(5);
  });

  test("rejects an alias volume request that conflicts with an existing canonical volume", async () => {
    reads.push([{ canonicalId: 1 }], [{ id: 71 }]);
    await expect(
      insertWiki("media_volumes", { editionId: 5, number: "1", slug: "alias-volume" }),
    ).rejects.toMatchObject({ existingIds: [71] });
    expect(inserts).toHaveLength(0);
  });

  test("records the actual subtitle change while keeping large unrelated blobs out", async () => {
    const before = [{ lang: "ja", label: "Japanese", src: "/assets/subtitles/ja.vtt" }];
    const after = [{ lang: "fr", label: "French", src: "/assets/subtitles/fr.vtt" }];
    await recordRevision({
      table: "db_episodes",
      id: "1",
      action: "update",
      before: { subtitles: before, frames: [{ private: true }] },
      after: { subtitles: after },
    });
    expect(inserts[0].before).toEqual({ subtitles: before });
    expect(inserts[0].after).toEqual({ subtitles: after });
  });
});
