// SPDX-License-Identifier: Apache-2.0
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

mock.module("server-only", () => ({}));
type Row = Record<string, unknown>;
let rows: Record<string, Row[]>;
let journalFails = false;
let failJournalAt = 0;
let journalAttempts = 0;
let committed: Row[] = [];
let statements: string[] = [];
let parameters: Array<{ sql: string; params: unknown[] }> = [];
let configuration: unknown;
const dialect = new PgDialect();
mock.module("@/lib/db", () => ({
  db: {
    transaction: async (callback: (tx: unknown) => Promise<unknown>, config: unknown) => {
      configuration = config;
      const pending: Row[] = [];
      const result = await callback({
        execute: async (query: SQL) => {
          const encoded = dialect.sqlToQuery(query);
          parameters.push(encoded);
          const text = encoded.sql;
          statements.push(text);
          const table = /SELECT \* FROM "bot"\."([^"]+)"/.exec(text)?.[1];
          return table ? structuredClone(rows[table] ?? []) : [];
        },
        insert: () => ({
          values: async (value: Row) => {
            journalAttempts++;
            if (journalFails || journalAttempts === failJournalAt)
              throw new Error("journal unavailable");
            pending.push(value);
          },
        }),
      });
      committed.push(...pending);
      return result;
    },
  },
}));
const { planCharacterConsolidation, consolidateWikiCharacters, CharacterConsolidationConflict } =
  await import("../src/lib/wiki-character-consolidation");

const roots = () => [
  {
    id: 83,
    name: "Guldo",
    name_ja: "グルド",
    visible: true,
    description: null,
    article_sources: null,
  },
  {
    id: 514,
    name: "Ghourd",
    name_ja: "グルド",
    visible: true,
    description: null,
    article_sources: null,
  },
];
beforeEach(() => {
  rows = { db_characters: roots() };
  committed = [];
  statements = [];
  parameters = [];
  journalFails = false;
  failJournalAt = 0;
  journalAttempts = 0;
});

describe("complete character identity consolidation plan", () => {
  test("blank prose is filled while zero and false remain real conflicting values", () => {
    for (const value of ["", " \n\t"]) {
      rows.db_characters![0]!.description = value;
      rows.db_characters![1]!.description = "Sourced description";
      const plan = planCharacterConsolidation(83, 514, rows);
      expect(plan.blockers).toEqual([]);
      expect(plan.changes[0]?.after?.description).toBe("Sourced description");
    }
    for (const value of [0, false]) {
      rows.db_characters![0]!.description = value;
      expect(planCharacterConsolidation(83, 514, rows).blockers).toContain(
        "db_characters.description: distinct published values require editorial review",
      );
    }
  });
  test("reparents simple references and preserves combat text while replacing IDs", () => {
    for (const table of ["db_transformations", "db_power_levels", "contributor_credits"])
      rows[table] = [{ id: 1, character_id: 514, description: "Primary source text" }];
    rows.db_techniques = [{ id: 2, creator_id: 514, name: "Technique" }];
    rows.db_battles = [
      {
        id: 3,
        winner_id: 514,
        winner_name: "Ghourd",
        combatants: [
          { characterId: 514, name: "Ghourd", side: "a" },
          { characterId: 1, name: "Goku", side: "b" },
        ],
      },
    ];
    rows.db_assets = [
      { id: 4, entity_id: 514, entity_type: "character", path: "/image.png", role: "portrait" },
    ];
    rows.db_wiki_sections = [
      {
        id: 5,
        entity_id: 514,
        entity_type: "character",
        key: "history",
        body: "Sourced history",
        visible: true,
      },
    ];
    const plan = planCharacterConsolidation(83, 514, rows);
    expect(plan.blockers).toEqual([]);
    expect(plan.changes.find((change) => change.table === "db_battles")?.after).toMatchObject({
      winner_id: 83,
      winner_name: "Ghourd",
      combatants: [
        { characterId: 83, name: "Ghourd", side: "a" },
        { characterId: 1, name: "Goku", side: "b" },
      ],
    });
    expect(plan.changes.find((change) => change.table === "db_wiki_sections")?.after).toMatchObject(
      { entity_id: 83, body: "Sourced history" },
    );
    expect(plan.changes.find((change) => change.table === "db_assets")?.after?.entity_id).toBe(83);
    for (const table of ["db_transformations", "db_power_levels", "contributor_credits"])
      expect(plan.changes.find((change) => change.table === table)?.after).toMatchObject({
        character_id: 83,
        description: "Primary source text",
      });
  });

  test("unions composite links and fills compatible contextual nulls before removing redundant links", () => {
    rows.db_character_arcs = [
      { character_id: 83, arc_id: 2, note: null, appearance_image: "/same.png" },
      { character_id: 514, arc_id: 2, note: "Source note", appearance_image: "/same.png" },
    ];
    rows.db_character_techniques = [
      { character_id: 83, technique_id: 2 },
      { character_id: 514, technique_id: 2 },
      { character_id: 514, technique_id: 3 },
    ];
    rows.db_game_characters = [{ game_id: 1, character_id: 514 }];
    rows.narrative_event_participants = [
      { event_id: 1, character_id: 83, role: "participant", outcome: "winner" },
      { event_id: 1, character_id: 514, role: "participant", outcome: "winner" },
    ];
    const plan = planCharacterConsolidation(83, 514, rows);
    expect(plan.blockers).toEqual([]);
    expect(
      plan.changes.find((change) => change.table === "db_character_arcs" && change.after)?.after,
    ).toMatchObject({ character_id: 83, note: "Source note" });
    expect(plan.changes.filter((change) => change.after === null)).toHaveLength(3);
    expect(
      plan.changes.find((change) => change.after?.technique_id === 3)?.after?.character_id,
    ).toBe(83);
    expect(rows.db_character_arcs[0]?.note).toBeNull();
  });

  test("distinct root prose and conflicting relation payloads block the complete plan", () => {
    rows.db_characters![0]!.description = "Canonical prose";
    rows.db_characters![1]!.description = "Other sourced prose";
    rows.narrative_event_participants = [
      { event_id: 1, character_id: 83, role: "participant", outcome: "winner" },
      { event_id: 1, character_id: 514, role: "participant", outcome: "loser" },
    ];
    const plan = planCharacterConsolidation(83, 514, rows);
    expect(plan.blockers).toHaveLength(2);
    expect(plan.differences.map((difference) => difference.field)).toEqual([
      "description",
      "outcome",
    ]);
  });

  test("fills empty root fields and unions bibliography without renumbering citations", () => {
    rows.db_characters![0]!.article_sources = [
      { n: 1, label: "Manga", url: "/manga", kind: "manga" },
    ];
    rows.db_characters![1]!.article_sources = [
      { n: 2, label: "Guide", url: "/guide", kind: "databook" },
    ];
    rows.db_characters![1]!.description = "Sourced description";
    const plan = planCharacterConsolidation(83, 514, rows);
    expect(plan.blockers).toEqual([]);
    expect(plan.changes[0]?.after).toMatchObject({
      description: "Sourced description",
      article_sources: [{ n: 1 }, { n: 2 }],
    });
    rows.db_characters![1]!.article_sources = [
      { n: 1, label: "Guide", url: "/guide", kind: "databook" },
    ];
    expect(planCharacterConsolidation(83, 514, rows).blockers).toContain(
      "article_sources: citation number 1 conflicts",
    );
  });

  test("unknown references, unreviewed identities and protected variants are rejected", () => {
    rows.__character_foreign_keys = [
      { schema_name: "bot", table_name: "new_links", column_name: "character_id" },
    ];
    expect(planCharacterConsolidation(83, 514, rows).blockers[0]).toContain(
      "unsupported character reference",
    );
    expect(planCharacterConsolidation(1, 2, rows).blockers).toContain(
      "pair is outside reviewed identity allow-list",
    );
    rows.db_character_variants = [
      { id: 2330, character_id: 514, saga_id: 1, slug: "protected", visible: true },
    ];
    expect(planCharacterConsolidation(83, 514, rows).blockers).toContain(
      "variant #2330 is outside identity consolidation",
    );
  });

  test("two duplicate sections with the same key cannot bypass collision checks", () => {
    rows.db_wiki_sections = [
      {
        id: 1,
        entity_id: 514,
        entity_type: "character",
        key: "history",
        body: "First source",
        visible: true,
      },
      {
        id: 2,
        entity_id: 514,
        entity_type: "character",
        key: "history",
        body: "Different source",
        visible: true,
      },
    ];
    expect(planCharacterConsolidation(83, 514, rows).blockers[0]).toContain("conflicting relation");
  });
});

describe("authoritative consolidation transaction", () => {
  const input = { winnerId: 83, duplicateId: 514, actor: { id: "admin", name: "Editor" } };
  test("simulation is read-only and never writes a journal", async () => {
    const result = await consolidateWikiCharacters({ ...input, dryRun: true });
    expect(result.applied).toBe(false);
    expect(committed).toEqual([]);
    expect(statements.some((statement) => /UPDATE|DELETE|LOCK TABLE/.test(statement))).toBe(false);
    expect(configuration).toEqual({ isolationLevel: "repeatable read", accessMode: "read only" });
  });
  test("a Date from the SQL reader remains a driver parameter rather than a JSONB cast", async () => {
    const date = new Date("2026-10-25T12:00:00Z");
    rows.db_assets = [
      { id: 1, entity_id: 83, path: "/same.png", role: "portrait", created_at: null },
      { id: 2, entity_id: 514, path: "/same.png", role: "portrait", created_at: date },
    ];
    const preview = await consolidateWikiCharacters({ ...input, dryRun: true });
    await consolidateWikiCharacters({
      ...input,
      dryRun: false,
      expectedPlanSha256: preview.plan.sha256,
    });
    const update = parameters.find((query) => query.sql.startsWith('UPDATE "bot"."db_assets"'));
    expect(update).toBeDefined();
    expect(update!.sql).not.toContain("::jsonb");
    expect(
      update!.params.some((value) => value instanceof Date && value.getTime() === date.getTime()),
    ).toBe(true);
  });
  test("a changed complete plan rejects execution before the first write", async () => {
    const preview = await consolidateWikiCharacters({ ...input, dryRun: true });
    rows.db_power_levels = [{ id: 1, character_id: 514, battle_power: "12000" }];
    await expect(
      consolidateWikiCharacters({
        ...input,
        dryRun: false,
        expectedPlanSha256: preview.plan.sha256,
      }),
    ).rejects.toBeInstanceOf(CharacterConsolidationConflict);
    expect(committed).toEqual([]);
    expect(statements.some((statement) => /^UPDATE|^DELETE/.test(statement))).toBe(false);
  });
  test("applies inside a serializable transaction and writes complete actor-attributed snapshots", async () => {
    rows.db_character_variants = [
      {
        id: 5,
        character_id: 514,
        saga_id: 1,
        slug: "guldo-namek",
        visible: true,
        technique_ids: [1, 2],
        evidence: { methode: "manga" },
      },
    ];
    const preview = await consolidateWikiCharacters({ ...input, dryRun: true });
    const result = await consolidateWikiCharacters({
      ...input,
      dryRun: false,
      expectedPlanSha256: preview.plan.sha256,
    });
    expect(result.applied).toBe(true);
    expect(configuration).toEqual({ isolationLevel: "serializable", accessMode: "read write" });
    expect(committed).toHaveLength(2);
    expect(committed[0]).toMatchObject({
      editorId: "admin",
      before: { characterId: 514, techniqueIds: [1, 2], evidence: { methode: "manga" } },
      after: { characterId: 83 },
    });
    expect(committed[1]?.before).toEqual(
      expect.objectContaining({ name: "Ghourd", nameJa: "グルド" }),
    );
    const locks = statements.filter((statement) => statement.startsWith("LOCK TABLE"));
    expect(locks).toHaveLength(13);
    expect(locks).toEqual(locks.toSorted());
  });
  test("journal failure rejects the transaction and commits no partial records", async () => {
    rows.db_transformations = [{ id: 1, character_id: 514 }];
    const preview = await consolidateWikiCharacters({ ...input, dryRun: true });
    failJournalAt = 2;
    await expect(
      consolidateWikiCharacters({
        ...input,
        dryRun: false,
        expectedPlanSha256: preview.plan.sha256,
      }),
    ).rejects.toThrow("journal unavailable");
    expect(committed).toEqual([]);
    expect(journalAttempts).toBe(2);
  });
});
