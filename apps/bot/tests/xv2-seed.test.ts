/**
 * XV2 content seed (`src/db/xv2/`): real committed catalog (DBXV2 v1.25.02),
 * applied to a migrated SQLite replica that holds a small curated fixture.
 * Proves the counts against the extracted source, a few records, the editorial
 * rules (no overwrite, no resurrection of hidden rows, editor portrait mapping)
 * and idempotence. No service, no game file.
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { ensureWikiReplicaSchema, ensureWikiVisibility } from "../src/db/wiki-visibility";
import { applyXv2PlanSqlite, readXv2SnapshotSqlite, xv2Revisions } from "../src/db/xv2/apply";
import { parseXv2Args } from "../src/db/xv2/cli";
import {
  canonCharacter,
  loadXv2Source,
  normTechnique,
  planXv2Content,
  selectXv2Steps,
  summarizeXv2Plan,
  XV2_CHARACTER_DESCRIPTION,
  XV2_PORTRAIT_DIR,
  XV2_SKILL_TYPES,
  type Xv2Plan,
} from "../src/db/xv2/content";

const ASSETS = join(import.meta.dir, "../assets/dbz");
const source = loadXv2Source(ASSETS);
const CURATED_KAMEHAMEHA = "Technique de kikō mise au point par Kamé Sennin (Daizenshuu 7).";

function curatedReplica(): Database {
  const sqlite = new Database(":memory:");
  migrate(drizzle(sqlite), { migrationsFolder: join(import.meta.dir, "../src/db/migrations") });
  ensureWikiReplicaSchema(sqlite);
  ensureWikiVisibility(sqlite);
  sqlite.exec(`
    INSERT INTO db_characters (id, name, image, race, gender, portrait_xv2, visible) VALUES
      (1, 'Son Goku', './assets/dbz/characters/goku.webp', 'Saiyan', 'Male', NULL, 1),
      (2, 'Vegeta', './assets/dbz/characters/vegeta.webp', 'Saiyan', 'Male', NULL, 1),
      (3, 'Majin Boo', './assets/dbz/characters/buu.webp', 'Majin', 'Male', './assets/dbz/xv2-portraits/BUL.png', 1),
      (4, 'Zamasu', './assets/dbz/characters/zamasu.webp', NULL, NULL, NULL, 0),
      (5, 'Broly (DBS)', './assets/dbz/characters/broly.webp', 'Saiyan', 'Male', NULL, 1),
      (6, 'C-18', './assets/dbz/characters/c18.webp', 'Terrienne', 'Female', NULL, 1);
    INSERT INTO db_techniques (id, slug, name, type, description, visible) VALUES
      (1, 'kamehameha', 'Kamehameha', 'kikoha', '${CURATED_KAMEHAMEHA}', 1),
      (2, 'genkidama', 'Genkidama', NULL, NULL, 1),
      (3, 'kamehameha-distordu', 'Kamehameha distordu', 'super', NULL, 0);
    INSERT INTO db_transformations (id, name, image, character_id) VALUES
      (1, 'Super Saiyan', './assets/wiki/transformations/ss.png', 1);
    INSERT INTO db_character_techniques (character_id, technique_id) VALUES (1, 1);
  `);
  return sqlite;
}

const one = <T>(sqlite: Database, query: string, ...params: (string | number)[]) =>
  sqlite.query<T, (string | number)[]>(query).get(...params);
const count = (sqlite: Database, query: string, ...params: (string | number)[]) =>
  one<{ n: number }>(sqlite, query, ...params)!.n;

describe("extracted XV2 source (committed catalog)", () => {
  test("catalog, loadouts and portraits have the counts of DBXV2 v1.25.02", () => {
    expect(source.catalog.source).toContain("v1.25.02");
    expect(Object.keys(source.catalog.characters)).toHaveLength(164);
    expect(Object.keys(source.catalog.skills.super)).toHaveLength(516);
    expect(Object.keys(source.catalog.skills.ultimate)).toHaveLength(290);
    expect(Object.keys(source.catalog.skills.awoken)).toHaveLength(35);
    expect(Object.keys(source.catalog.skills.evasive)).toHaveLength(66);
    expect(Object.keys(source.skillsets)).toHaveLength(153);
    expect(source.portraitCodes.size).toBe(145);
  });

  test("every portrait and loadout belongs to a catalog code, every loadout skill is named", () => {
    for (const code of source.portraitCodes) {
      expect(source.catalog.characters[code]).toBeString();
      expect(existsSync(join(ASSETS, "xv2-portraits", `${code}.png`))).toBe(true);
    }
    const names = new Set(
      XV2_SKILL_TYPES.flatMap((t) =>
        Object.values(source.catalog.skills[t]).map((s) => normTechnique(s.name)),
      ),
    );
    // Loadouts without a catalog name: the custom avatar presets (race × gender).
    const avatars = Object.keys(source.skillsets).filter((c) => !source.catalog.characters[c]);
    expect(avatars.toSorted()).toEqual([
      "FRI",
      "HUF",
      "HUM",
      "MAF",
      "MAM",
      "MAP",
      "NMC",
      "SYF",
      "SYM",
    ]);
    for (const categories of Object.values(source.skillsets)) {
      for (const skill of Object.values(categories).flat())
        expect(names.has(normTechnique(skill!))).toBe(true);
    }
  });

  test("known records: Son Goku = GOK, Kamehameha = spe_skill_0000, Goku's loadout", () => {
    expect(source.catalog.characters.GOK).toBe("Son Goku");
    expect(source.catalog.characters.GK4).toBe("Son Goku (Super Saiyen 4)");
    expect(source.catalog.skills.super.spe_skill_0000!.name).toBe("Kamehameha");
    expect(source.skillsets.GOK.super).toContain("Kamehameha");
    expect(source.skillsets.GOK.ultimate).toContain("Super Genkidama");
  });
});

describe("plan and apply on a curated replica", () => {
  let sqlite: Database;
  let plan: Xv2Plan;
  beforeAll(() => {
    sqlite = curatedReplica();
    plan = planXv2Content(readXv2SnapshotSqlite(sqlite), source);
    applyXv2PlanSqlite(sqlite, plan);
  });

  test("techniques: one row per distinct catalog name absent from the table", () => {
    const distinct = new Set(
      XV2_SKILL_TYPES.flatMap((t) =>
        Object.values(source.catalog.skills[t]).map((s) => normTechnique(s.name)),
      ),
    );
    const present = new Set(["Kamehameha", "Genkidama", "Kamehameha distordu"].map(normTechnique));
    const expected = [...distinct].filter((k) => !present.has(k)).length;
    expect(plan.techniques).toHaveLength(expected);
    expect(count(sqlite, "SELECT count(*) n FROM db_techniques")).toBe(3 + expected);
    expect(count(sqlite, "SELECT count(DISTINCT slug) n FROM db_techniques")).toBe(3 + expected);
    expect(plan.unresolvedSkills).toEqual([]);
  });

  test("known super and ultimate attacks carry the game text; curated text stays", () => {
    const ult = Object.values(source.catalog.skills.ultimate).find(
      (s) => s.name === "Super Genkidama",
    )!;
    expect(
      one(sqlite, "SELECT type, description FROM db_techniques WHERE name = 'Super Genkidama'"),
    ).toEqual({ type: "ultimate", description: ult.desc });
    expect(count(sqlite, "SELECT count(*) n FROM db_techniques WHERE name = 'Kamehameha'")).toBe(1);
    expect(one(sqlite, "SELECT description FROM db_techniques WHERE id = 1")).toEqual({
      description: CURATED_KAMEHAMEHA,
    });
    const genki = Object.values(source.catalog.skills.super).find((s) => s.name === "Genkidama")!;
    expect(one(sqlite, "SELECT description FROM db_techniques WHERE id = 2")).toEqual({
      description: genki.desc,
    });
    // hidden row: neither resurrected nor duplicated
    expect(
      one(
        sqlite,
        "SELECT count(*) n, max(visible) v FROM db_techniques WHERE name = 'Kamehameha distordu'",
      ),
    ).toEqual({ n: 1, v: 0 });
  });

  test("characters: XV2 base forms with portrait (Bardock), race and gender (Cabba, Videl)", () => {
    expect(
      one(
        sqlite,
        "SELECT image, portrait_xv2, description FROM db_characters WHERE name = 'Bardock'",
      ),
    ).toEqual({
      image: `${XV2_PORTRAIT_DIR}/BDK.png`,
      portrait_xv2: `${XV2_PORTRAIT_DIR}/BDK.png`,
      description: XV2_CHARACTER_DESCRIPTION,
    });
    expect(one(sqlite, "SELECT race, gender FROM db_characters WHERE name = 'Cabba'")).toEqual({
      race: "Saiyan",
      gender: "Male",
    });
    expect(one(sqlite, "SELECT race, gender FROM db_characters WHERE name = 'Videl'")).toEqual({
      race: "Human",
      gender: "Female",
    });
    for (const c of plan.characters) {
      expect(c.name).not.toMatch(/[(]/);
      expect(source.portraitCodes.has(c.code)).toBe(true);
    }
  });

  test("editor choices win: hand-mapped portrait, hidden row, curated race", () => {
    // « Majin Boo » holds BUL: no second « Buu » row, the BUL loadout links to it.
    expect(count(sqlite, "SELECT count(*) n FROM db_characters WHERE name = 'Buu'")).toBe(0);
    expect(
      count(sqlite, "SELECT count(*) n FROM db_character_techniques WHERE character_id = 3"),
    ).toBeGreaterThan(0);
    // Hidden « Zamasu »: no duplicate, no link, no edit.
    expect(count(sqlite, "SELECT count(*) n FROM db_characters WHERE name = 'Zamasu'")).toBe(1);
    expect(
      count(sqlite, "SELECT count(*) n FROM db_character_techniques WHERE character_id = 4"),
    ).toBe(0);
    expect(one(sqlite, "SELECT race FROM db_characters WHERE id = 4")).toEqual({ race: null });
    // Curated race label kept.
    expect(one(sqlite, "SELECT race FROM db_characters WHERE id = 6")).toEqual({
      race: "Terrienne",
    });
  });

  test("portraits: exact game name for a subtitled wiki name, base name otherwise", () => {
    expect(one(sqlite, "SELECT portrait_xv2 FROM db_characters WHERE id = 1")).toEqual({
      portrait_xv2: `${XV2_PORTRAIT_DIR}/GOK.png`,
    });
    expect(one(sqlite, "SELECT portrait_xv2 FROM db_characters WHERE id = 6")).toEqual({
      portrait_xv2: `${XV2_PORTRAIT_DIR}/G18.png`,
    });
    expect(one(sqlite, "SELECT portrait_xv2 FROM db_characters WHERE id = 5")).toEqual({
      portrait_xv2: null,
    });
  });

  test("transformations: Son Goku (Super Saiyen 4) attached to Son Goku, no duplicate form", () => {
    expect(
      one(
        sqlite,
        "SELECT image FROM db_transformations WHERE character_id = 1 AND name = 'Super Saiyen 4'",
      ),
    ).toEqual({ image: `${XV2_PORTRAIT_DIR}/GK4.png` });
    expect(
      count(
        sqlite,
        "SELECT count(*) n FROM db_transformations WHERE character_id = 1 AND name IN ('Super Saiyan', 'Super Saiyen')",
      ),
    ).toBe(1);
    for (const t of plan.transformations) expect(t.name).not.toMatch(/^(DB Super|mini|Retenu)$/i);
  });

  test("links: Goku's game loadout, never towards a hidden technique", () => {
    const goku = sqlite
      .query<{ name: string }, []>(
        "SELECT t.name FROM db_character_techniques l JOIN db_techniques t ON t.id = l.technique_id WHERE l.character_id = 1",
      )
      .all()
      .map((r) => r.name);
    for (const name of ["Kamehameha", "Genkidama", "Super Genkidama", "Super Kamehameha"])
      expect(goku).toContain(name);
    expect(goku).not.toContain("Kamehameha distordu");
    expect(
      count(
        sqlite,
        "SELECT count(*) n FROM db_character_techniques WHERE character_id = 1 AND technique_id = 1",
      ),
    ).toBe(1);
    const dangling = count(
      sqlite,
      `SELECT count(*) n FROM db_character_techniques l
        WHERE NOT EXISTS (SELECT 1 FROM db_characters c WHERE c.id = l.character_id)
           OR NOT EXISTS (SELECT 1 FROM db_techniques t WHERE t.id = l.technique_id)`,
    );
    expect(dangling).toBe(0);
  });

  test("a second run plans nothing (idempotent)", () => {
    const again = summarizeXv2Plan(planXv2Content(readXv2SnapshotSqlite(sqlite), source));
    expect({ ...again, unlinkedForms: 0 }).toEqual({
      techniques: 0,
      techniqueDescriptions: 0,
      characters: 0,
      charMeta: 0,
      portraits: 0,
      transformations: 0,
      charTechniques: 0,
      unresolvedSkills: 0,
      unlinkedForms: 0,
    });
  });

  test("one revision per created or updated row (PostgreSQL journal)", () => {
    const revisions = xv2Revisions(plan);
    const s = summarizeXv2Plan(plan);
    expect(revisions).toHaveLength(
      s.techniques +
        s.techniqueDescriptions +
        s.characters +
        s.charMeta +
        s.portraits +
        s.transformations +
        s.charTechniques,
    );
    expect(revisions.find((r) => r.tableName === "db_character_techniques")?.rowId).toMatch(
      /^\d+:\d+$/,
    );
  });
});

describe("partial steps and CLI arguments", () => {
  test("a step never writes an id created by a step left out", () => {
    const sqlite = curatedReplica();
    const full = planXv2Content(readXv2SnapshotSqlite(sqlite), source);
    const links = selectXv2Steps(full, ["char-techniques"]);
    expect(links.techniques).toEqual([]);
    expect(links.links.length).toBeGreaterThan(0);
    expect(links.links.length).toBeLessThan(full.links.length);
    applyXv2PlanSqlite(sqlite, links);
    expect(
      count(sqlite, "SELECT count(*) n FROM db_character_techniques WHERE technique_id > 3"),
    ).toBe(0);
  });

  test("parseXv2Args", () => {
    expect(parseXv2Args([])).toMatchObject({ target: "pg", dryRun: false });
    expect(parseXv2Args(["--target=sqlite", "--dry-run", "--only", "portraits"])).toEqual({
      target: "sqlite",
      dryRun: true,
      steps: ["portraits"],
    });
    expect(() => parseXv2Args(["--only", "nope"])).toThrow();
    expect(() => parseXv2Args(["--target", "mysql"])).toThrow();
  });

  test("canonical names", () => {
    expect(canonCharacter("Son Goku (Super Saiyen 4)")).toBe("goku");
    expect(canonCharacter("C-18")).toBe("android18");
    expect(canonCharacter("Beerus, dieu de la destruction")).toBe("beerus");
  });
});
