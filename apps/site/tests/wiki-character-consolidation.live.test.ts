// SPDX-License-Identifier: Apache-2.0
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { wikiUpdateSnapshotHash } from "../src/lib/wiki-update-precondition";

// Never fall back to DATABASE_URL. This suite owns a fresh disposable database.
const testUrl = process.env.SHENRON_CONSOLIDATION_TEST_DATABASE_URL?.trim();
let client: ReturnType<typeof postgres> | undefined;
let consolidate: typeof import("../src/lib/wiki-character-consolidation").consolidateWikiCharacters;
let variantAdmin: typeof import("../src/lib/wiki-admin");
let variantRevisions: typeof import("../src/lib/wiki-revisions");
let initialized = false;
const actor = { id: "qa-editor", name: "Isolated consolidation QA" };
const pair = { winnerId: 83, duplicateId: 514, actor };
const tableNames = [
  "contributor_credits",
  "db_assets",
  "db_battles",
  "db_character_arcs",
  "db_character_techniques",
  "db_character_variants",
  "db_game_characters",
  "db_power_levels",
  "db_techniques",
  "db_transformations",
  "db_wiki_sections",
  "narrative_event_participants",
  "db_characters",
];

describe.skipIf(!testUrl)("official consolidation against isolated PostgreSQL", () => {
  beforeAll(async () => {
    let url: URL;
    try {
      url = new URL(testUrl!);
    } catch {
      throw new Error("Invalid explicit consolidation QA database URL");
    }
    const databaseName = decodeURIComponent(url.pathname.slice(1));
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !/^shenron_wiki_qa_[a-z0-9_]+$/.test(databaseName)
    ) {
      throw new Error("Consolidation QA requires an explicit shenron_wiki_qa_* database");
    }
    client = postgres(testUrl!, { max: 1, prepare: false, connect_timeout: 10 });
    const [identity] = await client`SELECT current_database() AS name`;
    if (identity?.name !== databaseName) throw new Error("QA database identity mismatch");
    const [existing] = await client`SELECT count(*)::int AS n FROM pg_class c
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname NOT IN ('pg_catalog','information_schema')
        AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%'
        AND c.relkind IN ('r','p','v','m','f')`;
    if (existing?.n !== 0)
      throw new Error(
        "Consolidation QA refuses a database containing existing application relations",
      );

    // Relevant columns retain bot-schema.ts types; the two narrative FKs and
    // composite participant key follow migration 0019. Other FK constraints also
    // exercise reparenting before the source character is hidden.
    await client.unsafe(`
      CREATE SCHEMA bot;
      CREATE TABLE bot.db_characters (
        id bigint PRIMARY KEY, name text NOT NULL, name_ja text, name_romaji text,
        description text, image text, ki text, max_ki text, race text, gender text,
        affiliation text, origin_planet_id bigint, portrait_xv2 text,
        debut_episode_id bigint, debut_chapter_id bigint, debut_saga_id bigint,
        stats jsonb, article text, article_sources jsonb, article_updated_at bigint,
        visible boolean NOT NULL DEFAULT true);
      CREATE TABLE bot.db_character_variants (
        id bigint PRIMARY KEY, character_id bigint NOT NULL REFERENCES bot.db_characters(id),
        saga_id bigint NOT NULL, slug text NOT NULL, label text NOT NULL,
        display_name text, name_ja text, form text, image text, age bigint,
        power_level text, ki text, max_ki text, role text, affiliation text,
        summary text, highlights jsonb, transformation_ids jsonb, technique_ids jsonb,
        first_volume bigint, last_volume bigint, first_episode bigint, last_episode bigint,
        key_episodes jsonb, origin text, evidence jsonb, sort_order bigint NOT NULL DEFAULT 0,
        visible boolean NOT NULL DEFAULT true, UNIQUE(character_id,saga_id));
      CREATE TABLE bot.db_transformations (
        id bigint PRIMARY KEY, name text NOT NULL, character_id bigint REFERENCES bot.db_characters(id),
        image text, ki text, article text, article_sources jsonb, article_updated_at bigint,
        visible boolean NOT NULL DEFAULT true);
      CREATE TABLE bot.db_techniques (
        id bigint PRIMARY KEY, slug text NOT NULL, name text NOT NULL,
        creator_id bigint REFERENCES bot.db_characters(id), description text,
        visible boolean NOT NULL DEFAULT true);
      CREATE TABLE bot.db_character_techniques (
        character_id bigint NOT NULL REFERENCES bot.db_characters(id), technique_id bigint NOT NULL,
        PRIMARY KEY(character_id,technique_id));
      CREATE TABLE bot.db_character_arcs (
        character_id bigint NOT NULL REFERENCES bot.db_characters(id), arc_id bigint NOT NULL,
        note text, appearance_image text, PRIMARY KEY(character_id,arc_id));
      CREATE TABLE bot.db_game_characters (
        game_id bigint NOT NULL, character_id bigint NOT NULL REFERENCES bot.db_characters(id),
        PRIMARY KEY(game_id,character_id));
      CREATE TABLE bot.db_power_levels (
        id bigint PRIMARY KEY, character_id bigint REFERENCES bot.db_characters(id),
        character_name text NOT NULL, battle_power bigint, battle_power_display text NOT NULL,
        source_kind text NOT NULL, visible boolean NOT NULL DEFAULT true);
      CREATE TABLE bot.db_battles (
        id bigint PRIMARY KEY, slug text NOT NULL, title text NOT NULL, series text NOT NULL,
        winner_id bigint REFERENCES bot.db_characters(id), winner_name text, combatants jsonb NOT NULL,
        visible boolean NOT NULL DEFAULT true);
      CREATE TABLE bot.db_assets (
        id bigint PRIMARY KEY, path text NOT NULL, source_id text, source_url text, license_key text,
        attribution text, sha256 text, mime_type text, bytes bigint, width bigint, height bigint,
        entity_type text, entity_id bigint, role text, created_at bigint);
      CREATE TABLE bot.db_wiki_sections (
        id bigint PRIMARY KEY, entity_type text NOT NULL, entity_id bigint NOT NULL,
        key text NOT NULL, label text NOT NULL, accent text, body text, group_label text,
        links jsonb, sort_order bigint NOT NULL DEFAULT 0, visible boolean NOT NULL DEFAULT true);
      CREATE TABLE bot.narrative_event_participants (
        event_id bigint NOT NULL, character_id bigint NOT NULL REFERENCES bot.db_characters(id),
        role text NOT NULL DEFAULT 'participant', outcome text,
        PRIMARY KEY(event_id,character_id,role));
      CREATE TABLE bot.contributor_credits (
        id bigint PRIMARY KEY, contributor_id bigint NOT NULL, role text NOT NULL,
        credit_scope text NOT NULL, character_id bigint REFERENCES bot.db_characters(id),
        source_id text, visible boolean NOT NULL DEFAULT true);
      CREATE TABLE public.wiki_revisions (
        id text PRIMARY KEY, "tableName" text NOT NULL, "rowId" text NOT NULL,
        action text NOT NULL, label text, before jsonb, after jsonb,
        "editorId" text, "editorName" text,
        "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE FUNCTION public.qa_reject_consolidation_journal() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF current_setting('shenron_qa.fail_journal', true) = 'on'
          AND NEW."tableName" = 'db_characters' AND NEW."rowId" = '514' THEN
          RAISE EXCEPTION 'isolated QA journal failure';
        END IF;
        IF current_setting('shenron_qa.fail_variant_journal', true) = 'on'
          AND NEW."tableName" = 'db_character_variants' THEN
          RAISE EXCEPTION 'isolated QA variant journal failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER qa_reject_consolidation_journal BEFORE INSERT ON public.wiki_revisions
        FOR EACH ROW EXECUTE FUNCTION public.qa_reject_consolidation_journal();
    `);
    const database = drizzle(client);
    mock.module("server-only", () => ({}));
    mock.module("@/lib/db", () => ({ db: database }));
    consolidate = (await import("../src/lib/wiki-character-consolidation"))
      .consolidateWikiCharacters;
    variantAdmin = await import("../src/lib/wiki-admin");
    variantRevisions = await import("../src/lib/wiki-revisions");
    initialized = true;
  }, 30_000);

  beforeEach(async () => {
    if (!initialized || !client) return;
    await client`SELECT set_config('shenron_qa.fail_journal','off',false)`;
    await client`SELECT set_config('shenron_qa.fail_variant_journal','off',false)`;
    // Only these fixture tables in the verified fresh QA database are cleared.
    await client.unsafe(
      `TRUNCATE ${tableNames.map((name) => `bot.${name}`).join(",")}, public.wiki_revisions`,
    );
    await client`INSERT INTO bot.db_characters(id,name,name_ja) VALUES (83,'Guldo','グルド'),(514,'Ghourd','グルド')`;
    await client`INSERT INTO bot.db_character_variants(id,character_id,saga_id,slug,label,visible,summary,technique_ids,evidence)
      VALUES (10,83,1,'guldo-canonical','Namek',false,NULL,NULL,NULL),
      (11,514,1,'guldo-duplicate','Namek',true,'Published source narrative','[1,2]'::jsonb,'{"methode":"manga"}'::jsonb),
      (12,514,2,'guldo-next','Next saga',true,'Another narrative','[3]'::jsonb,'{"methode":"anime"}'::jsonb)`;
    await client`INSERT INTO bot.db_character_techniques VALUES (83,1),(514,1),(514,2)`;
    await client`INSERT INTO bot.db_character_arcs VALUES (83,1,NULL,'/same.png'),(514,1,'Source note','/same.png')`;
    await client`INSERT INTO bot.db_game_characters VALUES (1,83),(1,514),(2,514)`;
    await client`INSERT INTO bot.narrative_event_participants VALUES (1,83,'participant','winner'),(1,514,'participant','winner'),(2,514,'participant','participant')`;
    await client`INSERT INTO bot.db_transformations(id,name,character_id) VALUES (1,'Form',514)`;
    await client`INSERT INTO bot.db_techniques(id,slug,name,creator_id) VALUES (1,'technique','Technique',514)`;
    await client`INSERT INTO bot.db_power_levels(id,character_id,character_name,battle_power,battle_power_display,source_kind)
      VALUES (1,514,'Ghourd',12000,'12 000','databook')`;
    await client`INSERT INTO bot.contributor_credits(id,contributor_id,role,credit_scope,character_id) VALUES (1,1,'voice','character',514)`;
    await client`INSERT INTO bot.db_battles(id,slug,title,series,winner_id,winner_name,combatants)
      VALUES (1,'battle','Battle','DBZ',514,'Ghourd','[{"characterId":514,"name":"Ghourd","side":"a"}]'::jsonb)`;
    await client`INSERT INTO bot.db_assets(id,path,entity_type,entity_id,role) VALUES (1,'/portrait.png','character',514,'portrait')`;
    await client`INSERT INTO bot.db_wiki_sections(id,entity_type,entity_id,key,label,body,links)
      VALUES (1,'character',514,'history','History','Source history','[{"href":"/wiki/manga","label":"Manga"}]'::jsonb)`;
  });

  afterAll(async () => {
    await client?.end({ timeout: 5 });
  });

  const preview = () => consolidate({ ...pair, dryRun: true });
  const apply = (sha256: string) =>
    consolidate({ ...pair, dryRun: false, expectedPlanSha256: sha256 });
  const snapshot = async () => {
    const state: Record<string, unknown> = {};
    for (const table of tableNames)
      state[table] = await client!.unsafe(
        `SELECT * FROM bot.${table} ORDER BY to_jsonb(${table})::text`,
      );
    state.revisions = await client!`SELECT * FROM public.wiki_revisions ORDER BY id`;
    return JSON.stringify(state);
  };

  test("real apply preserves variant JSONB, unions links, updates FKs and writes complete audit", async () => {
    const before = await snapshot();
    const plan = await preview();
    expect(plan.plan.blockers).toEqual([]);
    expect(await snapshot()).toBe(before);
    const result = await apply(plan.plan.sha256);
    expect(result.applied).toBe(true);
    const [source] = await client!`SELECT visible,name FROM bot.db_characters WHERE id=514`;
    expect(source).toMatchObject({ visible: false, name: "Ghourd" });
    const [variant] =
      await client!`SELECT slug,visible,summary,technique_ids,evidence FROM bot.db_character_variants WHERE id=10`;
    expect(variant).toEqual({
      slug: "guldo-canonical",
      visible: true,
      summary: "Published source narrative",
      technique_ids: [1, 2],
      evidence: { methode: "manga" },
    });
    const [moved] =
      await client!`SELECT character_id,technique_ids FROM bot.db_character_variants WHERE id=12`;
    expect(Number(moved!.character_id)).toBe(83);
    expect(moved!.technique_ids).toEqual([3]);
    const links =
      await client!`SELECT character_id,technique_id FROM bot.db_character_techniques ORDER BY technique_id`;
    expect(links.map((row) => [Number(row.character_id), Number(row.technique_id)])).toEqual([
      [83, 1],
      [83, 2],
    ]);
    const arcs =
      await client!`SELECT character_id,note,appearance_image FROM bot.db_character_arcs`;
    expect(arcs).toHaveLength(1);
    expect(Number(arcs[0]!.character_id)).toBe(83);
    expect(arcs[0]).toMatchObject({ note: "Source note", appearance_image: "/same.png" });
    const games =
      await client!`SELECT game_id,character_id FROM bot.db_game_characters ORDER BY game_id`;
    expect(games.map((row) => [Number(row.game_id), Number(row.character_id)])).toEqual([
      [1, 83],
      [2, 83],
    ]);
    const participants =
      await client!`SELECT event_id,character_id,role,outcome FROM bot.narrative_event_participants ORDER BY event_id`;
    expect(
      participants.map((row) => [
        Number(row.event_id),
        Number(row.character_id),
        row.role,
        row.outcome,
      ]),
    ).toEqual([
      [1, 83, "participant", "winner"],
      [2, 83, "participant", "participant"],
    ]);
    const [battle] =
      await client!`SELECT winner_id,winner_name,combatants FROM bot.db_battles WHERE id=1`;
    expect(Number(battle!.winner_id)).toBe(83);
    expect(battle!.winner_name).toBe("Ghourd");
    expect(battle!.combatants).toEqual([{ characterId: 83, name: "Ghourd", side: "a" }]);
    for (const [table, column] of [
      ["db_transformations", "character_id"],
      ["db_techniques", "creator_id"],
      ["db_power_levels", "character_id"],
      ["contributor_credits", "character_id"],
      ["db_assets", "entity_id"],
      ["db_wiki_sections", "entity_id"],
    ]) {
      const [row] = await client!.unsafe(`SELECT ${column} AS parent FROM bot.${table} WHERE id=1`);
      expect(Number(row!.parent)).toBe(83);
    }
    const journals =
      await client!`SELECT "tableName","rowId",before,after,"editorId" FROM public.wiki_revisions`;
    expect(journals).toHaveLength(result.plan.changes.length);
    expect(journals.every((row) => row.editorId === actor.id)).toBe(true);
    expect(
      journals.find((row) => row.tableName === "db_character_variants" && row.rowId === "10")!
        .after,
    ).toMatchObject({ techniqueIds: [1, 2], evidence: { methode: "manga" } });
    expect(
      journals.find((row) => row.tableName === "db_characters" && row.rowId === "514")!.before,
    ).toMatchObject({ name: "Ghourd", nameJa: "グルド", visible: true });
  }, 20_000);

  test("a stale plan rolls back before any editorial or audit write", async () => {
    const plan = await preview();
    await client!`UPDATE bot.db_transformations SET name='Changed concurrently' WHERE id=1`;
    const before = await snapshot();
    await expect(apply(plan.plan.sha256)).rejects.toThrow("character_consolidation_conflict");
    expect(await snapshot()).toBe(before);
  }, 20_000);

  test("a conflicting composite payload prevents every write", async () => {
    await client!`UPDATE bot.narrative_event_participants SET outcome='loser' WHERE character_id=514 AND event_id=1`;
    const plan = await preview();
    expect(plan.plan.blockers.some((message) => message.includes("outcome"))).toBe(true);
    const before = await snapshot();
    await expect(apply(plan.plan.sha256)).rejects.toThrow("character_consolidation_conflict");
    expect(await snapshot()).toBe(before);
  }, 20_000);

  test("a late journal failure rolls back prior FK moves, unions, variants and audit entries", async () => {
    const plan = await preview();
    const before = await snapshot();
    await client!`SELECT set_config('shenron_qa.fail_journal','on',false)`;
    let failure: unknown;
    try {
      await apply(plan.plan.sha256);
    } catch (error) {
      failure = error;
    } finally {
      await client!`SELECT set_config('shenron_qa.fail_journal','off',false)`;
    }
    // Drizzle wraps the PostgreSQL error; inspect the original SQLSTATE instead
    // of matching its outer query message. Bound traversal also handles cycles.
    const visited = new Set<unknown>();
    while (failure !== null && typeof failure === "object" && !visited.has(failure)) {
      const error = failure as { code?: unknown; cause?: unknown };
      if (error.code === "P0001") break;
      visited.add(failure);
      failure = error.cause;
    }
    const databaseError = failure as { code?: unknown; message?: unknown } | undefined;
    expect(databaseError?.code).toBe("P0001");
    expect(databaseError?.message).toBe("isolated QA journal failure");
    expect(await snapshot()).toBe(before);
    const [audit] = await client!`SELECT count(*)::int AS n FROM public.wiki_revisions`;
    expect(audit!.n).toBe(0);
  }, 20_000);

  test("the real variant owner commits provenance and one revision, then reverts both atomically", async () => {
    const before = (await variantAdmin.getWikiRow("db_character_variants", "12"))!;
    const evidence = {
      ...(before.evidence as Record<string, unknown>),
      editorialReferences: [
        {
          fields: ["summary"],
          url: "https://dragonballfr.com/wiki/manga/1441?page=65",
          title: "QA primary reference",
          locator: "Volume22 page65",
        },
      ],
    };
    const after = await variantAdmin.updateWiki(
      "db_character_variants",
      "12",
      { summary: "Reviewed QA summary", evidence },
      { expected: before, expectedSha256: wikiUpdateSnapshotHash(before), actor },
    );
    const journal =
      await client!`SELECT id,action,"editorId",before,after FROM public.wiki_revisions ORDER BY "createdAt",id`;
    expect(journal).toHaveLength(1);
    expect(journal[0]).toMatchObject({
      action: "update",
      editorId: actor.id,
      before: { summary: before.summary, evidence: before.evidence },
      after: { summary: after.summary, evidence },
    });
    await variantRevisions.revertRevision(journal[0]!.id, actor);
    expect(await variantAdmin.getWikiRow("db_character_variants", "12")).toEqual(before);
    const restored =
      await client!`SELECT action,"editorId",after FROM public.wiki_revisions ORDER BY "createdAt",id`;
    expect(restored).toHaveLength(2);
    expect(restored[1]).toMatchObject({
      action: "revert",
      editorId: actor.id,
      after: { summary: before.summary, evidence: before.evidence },
    });
  }, 20_000);

  test("the real variant owner rolls back its update when the strict revision insert fails", async () => {
    const row = (await variantAdmin.getWikiRow("db_character_variants", "12"))!;
    const before = await snapshot();
    await client!`SELECT set_config('shenron_qa.fail_variant_journal','on',false)`;
    let failure: unknown;
    try {
      await variantAdmin.updateWiki(
        "db_character_variants",
        "12",
        { summary: "Must roll back", visible: false },
        { expected: row, expectedSha256: wikiUpdateSnapshotHash(row), actor },
      );
    } catch (error) {
      failure = error;
    } finally {
      await client!`SELECT set_config('shenron_qa.fail_variant_journal','off',false)`;
    }
    expect(failure).toMatchObject({ code: "wiki_revision_write_failed" });
    expect(await snapshot()).toBe(before);
    const [audit] = await client!`SELECT count(*)::int AS n FROM public.wiki_revisions`;
    expect(audit!.n).toBe(0);
  }, 20_000);
});
