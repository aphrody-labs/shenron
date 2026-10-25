// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { getTableName, type SQL } from "drizzle-orm";
import { PgDialect, type AnyPgTable } from "drizzle-orm/pg-core";
import { wikiUpdateSnapshotHash } from "../src/lib/wiki-update-precondition";

mock.module("server-only", () => ({}));
type Row = Record<string, unknown>;
const measurements = {
  methode: "ocr-manga",
  tomes: [22],
  planches: 4,
  graphies: ["tenshinhan"],
  mesureAt: 1787661211645,
};
const reference = {
  fields: ["summary"],
  url: "https://dragonballfr.com/wiki/manga/1441?page=65",
  title: "Chapter 261",
  locator: "Volume 22, page 65",
};
const image = "./assets/wiki/generated-portraits/2235.png";
const artwork = {
  kind: "generated",
  image,
  referenceUrl: reference.url,
  referenceImageUrl: "https://cdn.dragonballfr.com/assets/manga/DB/regular/vol22/065.webp",
  referenceTitle: reference.title,
  referenceSha256: "a".repeat(64),
  outputSha256: "b".repeat(64),
  generatedAt: "2026-10-25T13:00:00Z",
  generator: "image_gen",
};
let live: Row;
let updates: Row[] = [];
let rowLocks: string[] = [];
let queries: string[] = [];
let transactions = 0;
let journal: Row[] = [];
const dialect = new PgDialect();
function select() {
  let table = "";
  const result = Promise.resolve().then(() =>
    table === "wiki_revisions" ? [journal[0]] : [structuredClone(live)],
  );
  const builder = Object.assign(result, {
    from: (value: AnyPgTable) => {
      table = getTableName(value);
      return builder;
    },
    where: () => builder,
    limit: () => builder,
    for: (strength: string) => {
      rowLocks.push(strength);
      return builder;
    },
  });
  return builder;
}
const client = {
  select,
  execute: async (statement: SQL) => {
    queries.push(dialect.sqlToQuery(statement).sql);
  },
  update: () => ({
    set: (value: Row) => ({
      where: () => ({
        returning: async () => {
          updates.push(value);
          live = { ...live, ...value };
          return [structuredClone(live)];
        },
      }),
    }),
  }),
  insert: () => ({
    values: (value: Row) => ({
      returning: async () => {
        const row = { ...value, id: `revision-${journal.length + 1}` };
        journal.push(row);
        return [{ id: row.id }];
      },
    }),
  }),
};
mock.module("@/lib/db", () => ({
  db: {
    ...client,
    transaction: async (callback: (tx: typeof client) => Promise<unknown>) => {
      transactions++;
      return callback(client);
    },
  },
}));
mock.module("@/lib/databook-pages", () => ({
  ecrireTranscription: async () => {},
  ecrireTraduction: async () => {},
}));
const { updateWiki, insertWiki } = await import("../src/lib/wiki-admin");
const { recordRevision, revertRevision } = await import("../src/lib/wiki-revisions");
const { WIKI_TABLE_SPECS } = await import("../src/lib/wiki-tables");
const options = (row: Row) => ({
  expected: structuredClone(row),
  expectedSha256: wikiUpdateSnapshotHash(row),
});
beforeEach(() => {
  live = {
    id: 2235,
    characterId: 12,
    sagaId: 9,
    slug: "tenshinhan-namek",
    image: null,
    evidence: structuredClone(measurements),
    summary: "Before",
    visible: true,
  };
  updates = [];
  rowLocks = [];
  queries = [];
  transactions = 0;
  journal = [];
});

describe("variant provenance owner writer", () => {
  test("validates complete provenance under a row lock before accepting image and evidence together", async () => {
    const evidence = { ...measurements, imageArtwork: artwork, editorialReferences: [reference] };
    const saved = await updateWiki(
      "db_character_variants",
      "2235",
      { image, evidence },
      options(live),
    );
    expect(saved).toMatchObject({ image, evidence });
    expect(transactions).toBe(1);
    expect(rowLocks).toEqual(["update"]);
    expect(queries[0]).toContain("pg_advisory_xact_lock");
    expect(updates).toEqual([{ image, evidence }]);
  });
  test("rejects evidence deletion, measurement changes, malformed JSON and mismatched artwork without a partial image write", async () => {
    for (const evidence of [
      null,
      { ...measurements, planches: 0 },
      "invalid-json",
      {
        ...measurements,
        imageArtwork: { ...artwork, image: "./assets/wiki/generated-portraits/other.png" },
      },
    ]) {
      await expect(
        updateWiki("db_character_variants", "2235", { image, evidence }, options(live)),
      ).rejects.toThrow();
    }
    expect(updates).toEqual([]);
    expect(live.image).toBeNull();
    expect(live.evidence).toEqual(measurements);
    expect(rowLocks).toHaveLength(4);
  });
  test("requires CAS for evidence and rejects a concurrent change to the complete row", async () => {
    const patch = { evidence: { ...measurements, editorialReferences: [reference] } };
    await expect(updateWiki("db_character_variants", "2235", patch)).rejects.toThrow(
      "snapshot and SHA256 required",
    );
    const previous = options(live);
    live.summary = "Concurrent edit";
    await expect(updateWiki("db_character_variants", "2235", patch, previous)).rejects.toThrow(
      "precondition changed",
    );
    expect(updates).toEqual([]);
  });
  test("legacy bodies without evidence remain compatible, including visible false for candidate 2449", async () => {
    await updateWiki("db_character_variants", "2235", { summary: "Manual edit" });
    expect(live.evidence).toEqual(measurements);
    live.id = 2449;
    await updateWiki("db_character_variants", "2449", { visible: false }, options(live));
    expect(live.visible).toBe(false);
    expect(live.evidence).toEqual(measurements);
    expect(WIKI_TABLE_SPECS.db_character_variants!.mutableColumns).toContain("visible");
  });
  test("legacy image-only writes cannot put a generated asset online without its attribution", async () => {
    await expect(updateWiki("db_character_variants", "2235", { image })).rejects.toThrow(
      "requires its provenance",
    );
    await updateWiki("db_character_variants", "2235", {
      image: "./assets/dbz/officiel-2026-08-27/portrait.jpg",
    });
    expect(updates).toHaveLength(1);
  });
  test("generic inserts cannot invent or replace OCR measurements", async () => {
    await expect(
      insertWiki("db_character_variants", { characterId: 12, sagaId: 9, evidence: measurements }),
    ).rejects.toThrow("existing measurement");
    expect(updates).toEqual([]);
  });
});

describe("variant revision JSON preservation", () => {
  test("keeps only the named public structured fields in complete before/after snapshots", async () => {
    const before = {
      ...live,
      highlights: ["Before"],
      techniqueIds: [1],
      transformationIds: [2],
      keyEpisodes: [{ id: 1, num: 1, title: "Episode" }],
      label: { secret: "malformed object" },
      privateData: { token: "never journal" },
    };
    const after = {
      ...before,
      evidence: { ...measurements, imageArtwork: artwork, editorialReferences: [reference] },
      image,
      highlights: ["After"],
    };
    await recordRevision({
      table: "db_character_variants",
      id: "2235",
      action: "update",
      before,
      after,
      actor: { id: "editor", name: "Editor" },
    });
    expect(journal).toHaveLength(1);
    expect(journal[0]!.before).toMatchObject({
      evidence: measurements,
      highlights: ["Before"],
      techniqueIds: [1],
      transformationIds: [2],
      keyEpisodes: [{ id: 1, num: 1, title: "Episode" }],
    });
    expect(journal[0]!.after).toMatchObject({ evidence: after.evidence, highlights: ["After"] });
    expect(journal[0]!.before).not.toHaveProperty("privateData");
    expect(journal[0]!.before).not.toHaveProperty("label");
    await recordRevision({
      table: "db_characters",
      id: "12",
      action: "update",
      before: { name: "Tenshinhan", stats: { token: "private" }, evidence: { token: "private" } },
      after: { name: "Tenshinhan" },
    });
    expect(journal[1]!.before).toEqual({ name: "Tenshinhan" });
  });
  test("generic revert restores original image, references and arrays through the real writer under CAS", async () => {
    const before = {
      ...live,
      highlights: ["Before"],
      techniqueIds: [1],
      transformationIds: [2],
      keyEpisodes: [{ id: 1, num: 1, title: "Episode" }],
    };
    live = structuredClone(before);
    const after = await updateWiki(
      "db_character_variants",
      "2235",
      {
        image,
        evidence: { ...measurements, imageArtwork: artwork, editorialReferences: [reference] },
        highlights: ["After"],
        techniqueIds: [3],
        transformationIds: [4],
      },
      options(live),
    );
    await recordRevision({
      table: "db_character_variants",
      id: "2235",
      action: "update",
      before,
      after,
    });
    const result = await revertRevision(String(journal[0]!.id), { id: "editor", name: "Editor" });
    expect(result.mode).toBe("restore");
    expect(live.image).toBeNull();
    expect(live.evidence).toEqual(measurements);
    expect(live.highlights).toEqual(["Before"]);
    expect(live.techniqueIds).toEqual([1]);
    expect(live.transformationIds).toEqual([2]);
    expect(live.keyEpisodes).toEqual(before.keyEpisodes);
    expect(journal[1]!.action).toBe("revert");
    expect(rowLocks).toEqual(["update", "update"]);
  });
  test("rollback preserves independent producer updates to measured evidence and keyEpisodes", async () => {
    const before = {
      ...live,
      keyEpisodes: [{ id: 1, num: 1, title: "Old episode" }],
      highlights: ["Before"],
    };
    live = structuredClone(before);
    const after = await updateWiki(
      "db_character_variants",
      "2235",
      {
        image,
        evidence: { ...measurements, imageArtwork: artwork, editorialReferences: [reference] },
        highlights: ["After"],
      },
      options(live),
    );
    await recordRevision({
      table: "db_character_variants",
      id: "2235",
      action: "update",
      before,
      after,
    });
    live = {
      ...live,
      keyEpisodes: [{ id: 2, num: 2, title: "New measured episode" }],
      evidence: { ...(live.evidence as Row), planches: 99 },
    };
    await revertRevision(String(journal[0]!.id), { id: "editor", name: "Editor" });
    expect(live.image).toBeNull();
    expect(live.evidence).toEqual({ ...measurements, planches: 99 });
    expect(live.keyEpisodes).toEqual([{ id: 2, num: 2, title: "New measured episode" }]);
    expect(live.highlights).toEqual(["Before"]);
    expect(journal[1]!.after).toMatchObject({
      evidence: { ...measurements, planches: 99 },
      keyEpisodes: [{ id: 2, num: 2, title: "New measured episode" }],
    });
  });
  test("rollback rejects historical keyEpisodes changes that the editor cannot restore", async () => {
    const before = { ...live, keyEpisodes: [{ id: 1, num: 1, title: "Before" }] };
    const after = { ...live, keyEpisodes: [{ id: 2, num: 2, title: "After" }] };
    live = structuredClone(after);
    await recordRevision({
      table: "db_character_variants",
      id: "2235",
      action: "update",
      before,
      after,
    });
    await expect(revertRevision(String(journal[0]!.id), null)).rejects.toThrow(
      "keyEpisodes historical changes cannot be restored",
    );
    expect(updates).toEqual([]);
    expect(journal).toHaveLength(1);
  });
  test("rollback rejects a later edit of the same editorial field and keeps unrelated edits", async () => {
    const before = { ...live, highlights: ["Before"] };
    live = structuredClone(before);
    const after = await updateWiki(
      "db_character_variants",
      "2235",
      { highlights: ["After"] },
      options(live),
    );
    await recordRevision({
      table: "db_character_variants",
      id: "2235",
      action: "update",
      before,
      after,
    });
    live.highlights = ["Later editorial correction"];
    live.summary = "Independent summary correction";
    await expect(revertRevision(String(journal[0]!.id), null)).rejects.toThrow(
      "precondition changed",
    );
    expect(updates).toHaveLength(1);
    live.highlights = ["After"];
    await revertRevision(String(journal[0]!.id), null);
    expect(live.highlights).toEqual(["Before"]);
    expect(live.summary).toBe("Independent summary correction");
  });
});
