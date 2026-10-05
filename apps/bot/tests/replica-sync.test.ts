// SPDX-License-Identifier: Apache-2.0
/**
 * Reverse-sync PostgreSQL → réplica SQLite (`src/db/replica-sync.ts`) : logique
 * pure (arguments, intersection des colonnes, conversion des valeurs, plan de
 * remplacement) et transfert complet sur un réplica migré, avec une source
 * simulée qui implémente l'interface du lecteur PostgreSQL. Aucun service réel.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { WIKI_EDITORIAL } from "../scripts/_wiki-editorial";
import {
  type ColumnPlan,
  drizzleTimestampTargets,
  dropUniqueDuplicates,
  intersectColumns,
  openReplica,
  parseSyncArgs,
  pgSelectExpression,
  planColumns,
  planTable,
  type ReplicaColumn,
  type ReplicaSource,
  REPLICA_BUSY_TIMEOUT_MS,
  rowsFingerprint,
  sameFingerprint,
  sqliteDefaultEvaluator,
  type SourceColumn,
  type SourceRow,
  syncReplica,
  timestampEncoding,
  toSqliteValue,
} from "../src/db/replica-sync";
import { WIKI_VISIBILITY_TABLES } from "../src/db/wiki-visibility";

const dir = mkdtempSync(join(tmpdir(), "shenron-replica-sync-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const MIGRATIONS = join(import.meta.dir, "../src/db/migrations");
let replicas = 0;

/** Réplica neuf, migré comme au boot du bot (sans les garanties `ensure*`). */
function migratedReplica(): string {
  const path = join(dir, `replica-${++replicas}.db`);
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL");
  migrate(drizzle(db), { migrationsFolder: MIGRATIONS });
  db.close();
  return path;
}

type FakeTable = { columns: SourceColumn[]; rows: SourceRow[] };

/** Source simulée : même interface que le lecteur PostgreSQL. */
function fakeSource(tables: Record<string, FakeTable>) {
  const calls = { snapshots: 0, reads: [] as string[] };
  const source: ReplicaSource = {
    async snapshot(read) {
      calls.snapshots++;
      return read({
        async columns(names) {
          return new Map(names.filter((n) => n in tables).map((n) => [n, tables[n]!.columns]));
        },
        async rows(name, columns) {
          calls.reads.push(`${name}:${columns.map((c) => c.name).join(",")}`);
          return tables[name]!.rows.map((row) =>
            Object.fromEntries(columns.map((c) => [c.name, row[c.name]])),
          );
        },
      });
    },
  };
  return { source, calls };
}

const col = (name: string, dataType: string): SourceColumn => ({ name, dataType });

const CHARACTERS: FakeTable = {
  columns: [
    col("id", "integer"),
    col("name", "text"),
    col("image", "text"),
    col("race", "text"),
    col("stats", "jsonb"),
    col("article", "text"),
    col("visible", "boolean"),
  ],
  rows: [
    {
      id: 1,
      name: "Goku",
      image: "goku.png",
      race: "Saiyan",
      stats: [],
      article: "…",
      visible: true,
    },
    { id: 2, name: "Vegeta", image: "vegeta.png", race: "Saiyan", visible: false },
    { id: 3, name: "Sans image", image: null, race: null, visible: false },
    // Doublon de nom (index unique du réplica, absent de PostgreSQL) : écarté.
    { id: 4, name: "Goku", image: "goku-jeu.png", race: "Saiyan", visible: false },
  ],
};

const EPISODES: FakeTable = {
  columns: [
    col("id", "integer"),
    col("series", "text"),
    col("number_in_series", "bigint"),
    col("title", "text"),
    col("air_date", "timestamp with time zone"),
    col("frames", "jsonb"),
    col("players", "jsonb"),
    col("visible", "boolean"),
  ],
  rows: [
    {
      id: 10,
      series: "dbz",
      number_in_series: "1",
      title: "Le petit Gohan",
      air_date: new Date("1989-04-26T09:00:00Z"),
      frames: [{ t: 12, src: "a.webp" }],
      players: [{ url: "x" }],
      visible: true,
    },
  ],
};

const PLANETS: FakeTable = {
  columns: [
    col("id", "integer"),
    col("name", "text"),
    col("image", "text"),
    col("is_destroyed", "integer"),
    col("visible", "boolean"),
  ],
  rows: [{ id: 1, name: "Namek", image: "namek.png", is_destroyed: null, visible: true }],
};

const RACES: FakeTable = {
  columns: [
    col("id", "integer"),
    col("slug", "text"),
    col("name", "text"),
    col("visible", "boolean"),
  ],
  rows: [
    { id: 1, slug: "saiyan", name: "Saiyan", visible: true },
    { id: 2, slug: "namek", name: "Namek", visible: false },
  ],
};

const count = (db: Database, sql: string) => (db.query(sql).get() as { n: number }).n;

describe("liste éditoriale", () => {
  test("WIKI_EDITORIAL couvre WIKI_VISIBILITY_TABLES", () => {
    const editorial: readonly string[] = WIKI_EDITORIAL;
    expect(WIKI_VISIBILITY_TABLES.filter((t) => !editorial.includes(t))).toEqual([]);
  });
});

describe("arguments", () => {
  const allowed = ["db_characters", "db_planets", "db_races"];

  test("par défaut : toutes les tables, écriture", () => {
    expect(parseSyncArgs([], allowed)).toEqual({
      kind: "run",
      dryRun: false,
      allowEmpty: false,
      tables: allowed,
    });
  });

  test("--tables garde l'ordre canonique, --dry-run et --allow-empty", () => {
    expect(
      parseSyncArgs(["--tables", "db_races, db_characters", "--dry-run", "--allow-empty"], allowed),
    ).toEqual({
      kind: "run",
      dryRun: true,
      allowEmpty: true,
      tables: ["db_characters", "db_races"],
    });
    expect(parseSyncArgs(["--tables=db_planets"], allowed)).toMatchObject({
      tables: ["db_planets"],
    });
  });

  test("table hors liste, argument inconnu, liste absente, aide", () => {
    expect(parseSyncArgs(["--tables", "users"], allowed)).toMatchObject({ kind: "error" });
    expect(parseSyncArgs(["--force"], allowed)).toMatchObject({ kind: "error" });
    expect(parseSyncArgs(["--tables"], allowed)).toMatchObject({ kind: "error" });
    expect(parseSyncArgs(["--tables", "--dry-run"], allowed)).toMatchObject({ kind: "error" });
    expect(parseSyncArgs(["--help"], allowed)).toEqual({ kind: "help" });
  });
});

describe("colonnes", () => {
  const replica: ReplicaColumn[] = [
    { name: "id", type: "INTEGER", notNull: true, defaultSql: null },
    { name: "name", type: "TEXT", notNull: true, defaultSql: null },
    { name: "ki", type: "TEXT", notNull: false, defaultSql: null },
    { name: "visible", type: "INTEGER", notNull: true, defaultSql: "1" },
  ];

  test("intersection dans l'ordre du réplica, colonnes ignorées de part et d'autre", () => {
    const pg = [
      col("visible", "boolean"),
      col("article", "text"),
      col("name", "text"),
      col("id", "integer"),
    ];
    const { shared, postgresOnly, sqliteOnly } = intersectColumns(pg, replica);
    expect(shared.map((s) => s.replica.name)).toEqual(["id", "name", "visible"]);
    expect(shared.map((s) => s.source.dataType)).toEqual(["integer", "text", "boolean"]);
    expect(postgresOnly).toEqual(["article"]);
    expect(sqliteOnly).toEqual(["ki"]);
  });

  test("représentation des dates : schéma Drizzle, puis affinité", () => {
    const targets = drizzleTimestampTargets();
    const at = (table: string, name: string, type = "INTEGER") =>
      timestampEncoding(table, { name, type, notNull: false, defaultSql: null }, targets);
    expect(at("db_episodes", "air_date")).toBe("seconds");
    expect(at("users", "created_at")).toBe("milliseconds");
    expect(at("media_editions", "published_at", "TEXT")).toBe("iso");
    expect(at("db_battles", "happened_at", "INTEGER")).toBe("seconds");
    expect(at("db_battles", "happened_at", "TEXT")).toBe("iso");
  });

  test("lecture PostgreSQL : json/jsonb et tableaux en texte JSON, dates en epoch ms", () => {
    expect(pgSelectExpression(col("stats", "jsonb"))).toBe('"stats"::text AS "stats"');
    expect(pgSelectExpression(col("tags", "ARRAY"))).toBe('to_json("tags")::text AS "tags"');
    expect(pgSelectExpression(col("air_date", "timestamp with time zone"))).toBe(
      '(extract(epoch FROM "air_date") * 1000)::float8 AS "air_date"',
    );
    expect(pgSelectExpression(col("name", "text"))).toBe('"name"');
  });
});

describe("conversion des valeurs", () => {
  const instant = new Date("2024-03-01T12:34:56.789Z");

  test("booléens en 0/1, NULL conservé", () => {
    expect(toSqliteValue(true, "boolean", "seconds")).toBe(1);
    expect(toSqliteValue(false, "boolean", "seconds")).toBe(0);
    expect(toSqliteValue("f", "boolean", "seconds")).toBe(0);
    expect(toSqliteValue(null, "boolean", "seconds")).toBeNull();
    expect(toSqliteValue(undefined, "text", "iso")).toBeNull();
  });

  test("dates en secondes, millisecondes ou ISO ; `date` en jour ISO", () => {
    const tz = "timestamp with time zone";
    expect(toSqliteValue(instant, tz, "seconds")).toBe(1709296496);
    expect(toSqliteValue(instant, tz, "milliseconds")).toBe(1709296496789);
    expect(toSqliteValue(instant, tz, "iso")).toBe("2024-03-01T12:34:56.789Z");
    // Contrat du lecteur PostgreSQL : epoch en millisecondes (float8).
    expect(toSqliteValue(1709296496789.5, "timestamp without time zone", "seconds")).toBe(
      1709296496,
    );
    expect(toSqliteValue(Date.UTC(2024, 2, 1), "date", "iso")).toBe("2024-03-01");
    expect(toSqliteValue(Number.POSITIVE_INFINITY, tz, "seconds")).toBeNull();
  });

  test("json/jsonb et tableaux en texte JSON", () => {
    expect(toSqliteValue({ a: [1, "b"] }, "jsonb", "iso")).toBe('{"a":[1,"b"]}');
    expect(toSqliteValue('{"a":1}', "jsonb", "iso")).toBe('{"a":1}');
    expect(toSqliteValue(["x", "y"], "ARRAY", "iso")).toBe('["x","y"]');
    expect(toSqliteValue("[1,2]", "ARRAY", "iso")).toBe("[1,2]");
  });

  test("bigint et numeric texte en nombres, binaire conservé", () => {
    expect(toSqliteValue("42", "bigint", "seconds")).toBe(42);
    expect(toSqliteValue("9223372036854775807", "bigint", "seconds")).toBe(9223372036854775807n);
    expect(toSqliteValue("1.5", "numeric", "seconds")).toBe(1.5);
    expect(toSqliteValue("NaN", "numeric", "seconds")).toBeNull();
    expect(toSqliteValue(7n, "bigint", "seconds")).toBe(7);
    const blob = new Uint8Array([1, 2]);
    expect(toSqliteValue(blob, "bytea", "iso")).toBe(blob);
    expect(toSqliteValue("texte", "text", "iso")).toBe("texte");
  });
});

describe("plan de remplacement", () => {
  const evalDefault = sqliteDefaultEvaluator(new Database(":memory:"));
  const replica: ReplicaColumn[] = [
    { name: "id", type: "INTEGER", notNull: true, defaultSql: null },
    { name: "name", type: "TEXT", notNull: true, defaultSql: null },
    { name: "is_destroyed", type: "INTEGER", notNull: true, defaultSql: "false" },
    { name: "language", type: "TEXT", notNull: true, defaultSql: "'ja'" },
    { name: "visible", type: "INTEGER", notNull: true, defaultSql: "1" },
  ];
  const pg = [
    col("id", "integer"),
    col("name", "text"),
    col("is_destroyed", "integer"),
    col("language", "text"),
    col("visible", "boolean"),
  ];
  const columns: ColumnPlan[] = planColumns(
    "t",
    intersectColumns(pg, replica).shared,
    new Map(),
    evalDefault,
  );

  test("NULL dans une colonne NOT NULL : défaut SQLite, sinon valeur neutre", () => {
    const plan = planTable("t", columns, [
      { id: 1, name: null, is_destroyed: null, language: null, visible: false },
    ]);
    expect(plan.rows).toEqual([[1, "", 0, "ja", 0]]);
    expect(plan.nullsReplaced).toEqual({ name: 1, is_destroyed: 1, language: 1 });
    expect(plan.hidden).toBe(1);
  });

  test("doublons d'index unique : la ligne visible puis le plus petit id restent", () => {
    const rows = [
      [3, "Goku", 0, "ja", 0],
      [2, "Goku", 0, "ja", 1],
      [1, "Vegeta", 0, "ja", 0],
      [5, "Vegeta", 0, "ja", 0],
      [6, null, 0, "ja", 1],
      [7, null, 0, "ja", 1],
    ];
    const { rows: kept, dropped } = dropUniqueDuplicates(columns, rows, [
      { name: "t_name_unique", columns: ["name"] },
    ]);
    expect(kept.map((r) => r[0])).toEqual([2, 1, 6, 7]);
    expect(dropped).toEqual({ t_name_unique: 2 });
  });

  test("lignes lues et écrites, masquées des deux côtés", () => {
    const plan = planTable(
      "t",
      columns,
      [
        { id: 1, name: "A", is_destroyed: 0, language: "fr", visible: true },
        { id: 2, name: "A", is_destroyed: 0, language: "fr", visible: false },
      ],
      [{ name: "t_name_unique", columns: ["name"] }],
    );
    expect([plan.rowsRead, plan.hiddenRead, plan.rows.length, plan.hidden]).toEqual([2, 1, 1, 0]);
    expect(plan.duplicatesDropped).toEqual({ t_name_unique: 1 });
  });

  test("empreinte indépendante de l'ordre des lignes, sensible aux types", () => {
    const a = rowsFingerprint([
      [1, "a"],
      [2, "b"],
    ]);
    expect(
      sameFingerprint(
        a,
        rowsFingerprint([
          [2, "b"],
          [1, "a"],
        ]),
      ),
    ).toBe(true);
    expect(
      sameFingerprint(
        a,
        rowsFingerprint([
          [1, "a"],
          [2, 2],
        ]),
      ),
    ).toBe(false);
    expect(sameFingerprint(a, rowsFingerprint([[1, "a"]]))).toBe(false);
  });
});

describe("transfert vers un réplica migré", () => {
  test("ouverture : WAL, busy_timeout, clés étrangères coupées sur la connexion", () => {
    const sqlite = openReplica(migratedReplica(), { readonly: false });
    expect(sqlite.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    expect(sqlite.query("PRAGMA busy_timeout").get()).toEqual({ timeout: REPLICA_BUSY_TIMEOUT_MS });
    expect(sqlite.query("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 0 });
    sqlite.close();
  });

  test("miroir complet : lignes masquées, colonnes ignorées, tables absentes, idempotence", async () => {
    const path = migratedReplica();
    const seed = new Database(path);
    seed.exec(
      "INSERT INTO db_sagas (id, slug, name, series, order_idx) VALUES (1, 'saiyan', 'Saga Saiyan', 'dbz', 1)",
    );
    seed.exec("INSERT INTO db_characters (id, name, image) VALUES (99, 'Ancienne fiche', 'x.png')");
    seed.close();

    const { source, calls } = fakeSource({
      db_characters: CHARACTERS,
      db_episodes: EPISODES,
      db_planets: PLANETS,
      db_battles: { columns: [col("id", "integer")], rows: [{ id: 1 }] },
    });
    const tables = ["db_characters", "db_episodes", "db_planets", "db_sagas", "db_battles"];
    const sqlite = openReplica(path, { readonly: false });
    const report = await syncReplica({ sqlite, source, tables });

    expect(report.ok).toBe(true);
    expect(calls.snapshots).toBe(1);
    // Seules les colonnes communes sont lues dans PostgreSQL.
    expect(calls.reads).toContain("db_characters:id,name,image,race,visible");

    const characters = report.tables.db_characters!;
    expect(characters).toMatchObject({
      status: "written",
      rowsRead: 4,
      rowsWritten: 3,
      hiddenRead: 3,
      hiddenWritten: 2,
      columns: 5,
      nullsReplaced: { image: 1 },
      duplicatesDropped: { db_characters_name_unique: 1 },
    });
    expect(characters.ignoredColumns.postgres).toEqual(["stats", "article"]);
    expect(characters.ignoredColumns.sqlite).toContain("portrait_xv2");
    expect(
      sqlite.query("SELECT id, name, image, visible FROM db_characters ORDER BY id").all(),
    ).toEqual([
      { id: 1, name: "Goku", image: "goku.png", visible: 1 },
      { id: 2, name: "Vegeta", image: "vegeta.png", visible: 0 },
      { id: 3, name: "Sans image", image: "", visible: 0 },
    ]);

    expect(
      sqlite.query("SELECT number_in_series, air_date, frames FROM db_episodes").get(),
    ).toEqual({ number_in_series: 1, air_date: 609584400, frames: '[{"t":12,"src":"a.webp"}]' });
    expect(report.tables.db_episodes!.ignoredColumns.postgres).toEqual(["players"]);
    expect(sqlite.query("SELECT is_destroyed, visible FROM db_planets").get()).toEqual({
      is_destroyed: 0,
      visible: 1,
    });

    // Table absente d'un côté : rien n'est touché.
    expect(report.tables.db_sagas).toMatchObject({
      status: "skipped",
      reason: "absente de PostgreSQL",
    });
    expect(count(sqlite, "SELECT count(*) AS n FROM db_sagas")).toBe(1);
    expect(report.tables.db_battles).toMatchObject({
      status: "skipped",
      reason: "absente du réplica SQLite",
    });
    expect(report.totals).toMatchObject({
      rowsWritten: 5,
      hiddenWritten: 2,
      written: 3,
      skipped: 2,
    });

    // Second passage : contenu identique, aucune réécriture.
    const again = await syncReplica({ sqlite, source, tables });
    expect(again.ok).toBe(true);
    expect(again.tables.db_characters).toMatchObject({ status: "unchanged", rowsWritten: 0 });
    expect(again.totals.written).toBe(0);
    sqlite.close();
  });

  test("--dry-run : comptes et plan, aucune écriture ni modification de schéma", async () => {
    const path = migratedReplica();
    const { source } = fakeSource({
      db_characters: CHARACTERS,
      db_tools: {
        columns: [
          col("id", "integer"),
          col("slug", "text"),
          col("name", "text"),
          col("url", "text"),
        ],
        rows: [{ id: 1, slug: "x", name: "X", url: "https://example.org" }],
      },
    });
    const sqlite = openReplica(path, { readonly: true });
    const report = await syncReplica({
      sqlite,
      source,
      tables: ["db_characters", "db_tools"],
      dryRun: true,
    });
    sqlite.close();
    expect(report).toMatchObject({ ok: true, dryRun: true, visibleAdded: [] });
    expect(report.tables.db_characters).toMatchObject({
      status: "planned",
      rowsRead: 4,
      hiddenRead: 3,
      rowsWritten: 0,
      duplicatesDropped: { db_characters_name_unique: 1 },
    });
    // db_tools n'existe pas encore : le plan suit le schéma garanti, la base reste intacte.
    expect(report.tables.db_tools).toMatchObject({ status: "planned", rowsRead: 1 });
    const check = new Database(path, { readonly: true });
    expect(count(check, "SELECT count(*) AS n FROM db_characters")).toBe(0);
    expect(count(check, "SELECT count(*) AS n FROM sqlite_master WHERE name = 'db_tools'")).toBe(0);
    check.close();
  });

  test("échec d'une table : rollback de cette table seule, code d'échec", async () => {
    const path = migratedReplica();
    const seed = new Database(path);
    seed.exec("INSERT INTO db_races (id, slug, name) VALUES (7, 'ancienne', 'Ancienne race')");
    seed.exec(`CREATE TRIGGER boom BEFORE INSERT ON db_races WHEN NEW.slug = 'namek'
      BEGIN SELECT RAISE(ABORT, 'insertion refusée'); END`);
    seed.close();
    const { source } = fakeSource({ db_races: RACES, db_planets: PLANETS });
    const sqlite = openReplica(path, { readonly: false });
    const report = await syncReplica({ sqlite, source, tables: ["db_planets", "db_races"] });
    expect(report.ok).toBe(false);
    expect(report.tables.db_races).toMatchObject({ status: "failed", rowsWritten: 0 });
    expect(report.tables.db_races!.error).toContain("insertion refusée");
    // DELETE annulé avec l'INSERT : l'ancien contenu est intact.
    expect(sqlite.query("SELECT id, slug FROM db_races").all()).toEqual([
      { id: 7, slug: "ancienne" },
    ]);
    expect(report.tables.db_planets).toMatchObject({ status: "written", rowsWritten: 1 });
    expect(report.totals.failed).toBe(1);
    sqlite.close();
  });

  test("source vide : table conservée, sauf --allow-empty", async () => {
    const path = migratedReplica();
    const seed = new Database(path);
    seed.exec("INSERT INTO db_races (id, slug, name) VALUES (1, 'saiyan', 'Saiyan')");
    seed.close();
    const { source } = fakeSource({ db_races: { columns: RACES.columns, rows: [] } });
    const sqlite = openReplica(path, { readonly: false });
    const refused = await syncReplica({ sqlite, source, tables: ["db_races"] });
    expect(refused.ok).toBe(false);
    expect(refused.tables.db_races!.error).toContain("--allow-empty");
    expect(count(sqlite, "SELECT count(*) AS n FROM db_races")).toBe(1);
    const allowed = await syncReplica({ sqlite, source, tables: ["db_races"], allowEmpty: true });
    expect(allowed.tables.db_races).toMatchObject({ status: "written", rowsWritten: 0 });
    expect(count(sqlite, "SELECT count(*) AS n FROM db_races")).toBe(0);
    sqlite.close();
  });

  test("échec de lecture PostgreSQL : aucune écriture, schéma compris", async () => {
    const path = migratedReplica();
    const sqlite = openReplica(path, { readonly: false });
    const before = sqlite.query("SELECT sql FROM sqlite_master ORDER BY name").all();
    const failing: ReplicaSource = {
      snapshot: () => Promise.reject(new Error("connexion refusée")),
    };
    await expect(
      syncReplica({ sqlite, source: failing, tables: ["db_characters", "db_tools"] }),
    ).rejects.toThrow("connexion refusée");
    expect(sqlite.query("SELECT sql FROM sqlite_master ORDER BY name").all()).toEqual(before);
    sqlite.close();
  });

  test("réplica non migré : refus, la base reste vide", async () => {
    const path = join(dir, "vide.db");
    new Database(path).close();
    const sqlite = openReplica(path, { readonly: false });
    const { source, calls } = fakeSource({ db_characters: CHARACTERS });
    await expect(syncReplica({ sqlite, source, tables: ["db_characters"] })).rejects.toThrow(
      "non migrée",
    );
    expect(calls.snapshots).toBe(0);
    expect(count(sqlite, "SELECT count(*) AS n FROM sqlite_master")).toBe(0);
    sqlite.close();
  });
});
