// SPDX-License-Identifier: Apache-2.0
/**
 * Live qualification of the bot state mirror against a real PostgreSQL.
 *
 * Runs only with `SHENRON_LIVE=1` and `SHENRON_TEST_DATABASE_URL` pointing at a throwaway
 * database: every test creates its own schema and drops it, nothing else is touched. The
 * PostgreSQL tables are created loosely on purpose (bigint and text, no NOT NULL, no defaults),
 * like the replica Infra provisions.
 *
 *   docker run -d --rm -e POSTGRES_PASSWORD=x -p 127.0.0.1:55432:5432 postgres:18-alpine
 *   SHENRON_LIVE=1 SHENRON_TEST_DATABASE_URL=postgres://postgres:x@127.0.0.1:55432/postgres \
 *     bun test scripts/ops/sync-bot-runtime-state.live.test.ts
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import postgres from "postgres";
import {
  mirrorTable,
  type MirrorOptions,
  type Row,
  type SqliteColumn,
} from "./sync-bot-runtime-state";

const url = process.env.SHENRON_TEST_DATABASE_URL;
const live = process.env.SHENRON_LIVE === "1" && Boolean(url);

describe.if(live)("bot state mirror against PostgreSQL", () => {
  let sql: postgres.Sql;
  let schema: string;
  const sqlite = new Database(":memory:");
  const scratch = mkdtempSync(join(tmpdir(), "shenron-state-sync-"));

  const options = (over: Partial<MirrorOptions> = {}): MirrorOptions => ({
    schema,
    apply: true,
    keepAbsent: false,
    allowMassDelete: false,
    batchSize: 500,
    ...over,
  });

  function read(table: string): { columns: SqliteColumn[]; rows: Row[] } {
    return {
      columns: sqlite
        .query<SqliteColumn, [string]>("SELECT name, pk FROM pragma_table_info(?)")
        .all(table),
      rows: sqlite.query<Row, []>(`SELECT * FROM "${table}"`).all(),
    };
  }

  const mirror = (table: string, over: Partial<MirrorOptions> = {}) => {
    const { columns, rows } = read(table);
    return mirrorTable(sql, table, columns, rows, options(over));
  };
  const rows = (query: string) => sql.unsafe(`SELECT * FROM ${schema}.${query}`);

  beforeAll(async () => {
    sql = postgres(url!, { max: 1, onnotice: () => {} });
    schema = `bot_sync_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await sql.unsafe(`CREATE SCHEMA ${schema}`);
    await sql.unsafe(`
      CREATE TABLE ${schema}.users (id text PRIMARY KEY, xp bigint, zeni bigint, zeni_frozen bigint,
        equipped_banner text, legacy_note text DEFAULT 'kept');
      CREATE TABLE ${schema}.inventory (id bigint PRIMARY KEY, user_id text, item_type text,
        item_key text, acquired_at bigint);
      CREATE TABLE ${schema}.race_level_roles (race text, level bigint, role_id text,
        PRIMARY KEY (race, level));
      CREATE TABLE ${schema}.economy_index (day text PRIMARY KEY, supply bigint,
        index_value double precision, enabled boolean, created_at timestamptz);
      CREATE TABLE ${schema}.guild_settings (key text PRIMARY KEY, value jsonb);
      CREATE TABLE ${schema}.no_pk_in_pg (id text, v bigint);
      CREATE TABLE ${schema}.strict (id text PRIMARY KEY, v bigint, required_elsewhere text NOT NULL);
    `);

    sqlite.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL, xp INTEGER NOT NULL DEFAULT 0,
        zeni INTEGER NOT NULL DEFAULT 1000, zeni_frozen INTEGER NOT NULL DEFAULT 0, equipped_banner TEXT);
      CREATE TABLE inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
        item_type TEXT NOT NULL, item_key TEXT NOT NULL, acquired_at INTEGER NOT NULL);
      CREATE TABLE race_level_roles (race TEXT NOT NULL, level INTEGER NOT NULL, role_id TEXT NOT NULL,
        PRIMARY KEY (race, level));
      CREATE TABLE economy_index (day TEXT PRIMARY KEY, supply INTEGER NOT NULL, index_value REAL NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
      CREATE TABLE guild_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE only_in_sqlite (id INTEGER PRIMARY KEY);
      CREATE TABLE no_pk_in_pg (id TEXT PRIMARY KEY, v INTEGER);
      CREATE TABLE strict (id TEXT PRIMARY KEY, v INTEGER);
    `);
  });

  afterAll(async () => {
    await sql.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await sql.end();
    sqlite.close();
    rmSync(scratch, { recursive: true, force: true });
  });

  test("a missing PostgreSQL table is skipped with the reason, not an error", async () => {
    const report = await mirror("only_in_sqlite");
    expect(report.status).toBe("skipped");
    expect(report.reason).toContain("does not exist in PostgreSQL");
  });

  test("dry run measures the gap and writes nothing", async () => {
    sqlite.exec(`INSERT INTO users (id, xp, zeni, zeni_frozen, equipped_banner) VALUES
      ('1', 10, 1000, 0, NULL), ('2', 20, 2000, 1, 'banner-a'), ('3', 30, 3000, 0, NULL)`);
    const report = await mirror("users", { apply: false });
    expect(report).toMatchObject({ status: "drift", source: 3, target: 0, insert: 3, update: 0 });
    expect(await rows("users")).toHaveLength(0);
  });

  test("apply inserts, keeps PostgreSQL-only columns and is idempotent", async () => {
    const first = await mirror("users");
    expect(first).toMatchObject({ status: "applied", insert: 3 });
    expect(first.pgOnlyColumns).toEqual(["legacy_note"]);
    const stored = await rows("users ORDER BY id");
    expect(stored.map((row) => [row.id, String(row.xp), String(row.zeni_frozen)])).toEqual([
      ["1", "10", "0"],
      ["2", "20", "1"],
      ["3", "30", "0"],
    ]);
    expect(stored[1]!.equipped_banner).toBe("banner-a");
    expect(stored[0]!.legacy_note).toBe("kept");

    const second = await mirror("users");
    expect(second).toMatchObject({
      status: "in-sync",
      insert: 0,
      update: 0,
      delete: 0,
      unchanged: 3,
    });
    expect(await mirror("users", { apply: false })).toMatchObject({ status: "in-sync" });
  });

  test("changes, additions and removals converge; untouched PostgreSQL columns survive", async () => {
    await sql.unsafe(`UPDATE ${schema}.users SET legacy_note = 'edited-in-pg' WHERE id = '2'`);
    sqlite.exec(`UPDATE users SET xp = 25, zeni_frozen = 0 WHERE id = '2';
      DELETE FROM users WHERE id = '3';
      INSERT INTO users (id, xp, zeni, zeni_frozen) VALUES ('4', 40, 4000, 0)`);
    const plan = await mirror("users", { apply: false });
    expect(plan).toMatchObject({ status: "drift", insert: 1, update: 1, delete: 1, unchanged: 1 });
    expect(plan.changedColumns).toEqual({ xp: 1, zeni_frozen: 1 });

    const applied = await mirror("users");
    expect(applied.status).toBe("applied");
    const stored = await rows("users ORDER BY id");
    expect(stored.map((row) => row.id)).toEqual(["1", "2", "4"]);
    expect(String(stored[1]!.xp)).toBe("25");
    expect(stored[1]!.legacy_note).toBe("edited-in-pg");
    expect(await mirror("users", { apply: false })).toMatchObject({ status: "in-sync" });
  });

  test("keepAbsent leaves removed rows and does not call that drift", async () => {
    sqlite.exec("DELETE FROM users WHERE id = '4'");
    const report = await mirror("users", { keepAbsent: true });
    expect(report).toMatchObject({ status: "in-sync", delete: 0, keptAbsent: 1 });
    expect(await rows("users WHERE id = '4'")).toHaveLength(1);
    const removed = await mirror("users");
    expect(removed).toMatchObject({ status: "applied", delete: 1 });
    expect(await rows("users WHERE id = '4'")).toHaveLength(0);
  });

  test("an emptied SQLite table never wipes PostgreSQL without the explicit flag", async () => {
    const saved = sqlite.query<Row, []>("SELECT * FROM users").all();
    sqlite.exec("DELETE FROM users");
    const refused = await mirror("users");
    expect(refused.status).toBe("blocked");
    expect(refused.reason).toContain("SQLite table is empty");
    expect(await rows("users")).toHaveLength(2);
    const dry = await mirror("users", { apply: false });
    expect(dry.status).toBe("blocked");

    const forced = await mirror("users", { allowMassDelete: true });
    expect(forced).toMatchObject({ status: "applied", delete: 2 });
    expect(await rows("users")).toHaveLength(0);
    for (const row of saved) {
      sqlite
        .query(
          "INSERT INTO users (id, xp, zeni, zeni_frozen, equipped_banner) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          row.id as string,
          row.xp as number,
          row.zeni as number,
          row.zeni_frozen as number,
          row.equipped_banner as string | null,
        );
    }
    expect((await mirror("users")).status).toBe("applied");
  });

  test("large tables are written in bounded batches and read back", async () => {
    const insert = sqlite.prepare(
      "INSERT INTO inventory (id, user_id, item_type, item_key, acquired_at) VALUES (?, ?, 'badge', ?, ?)",
    );
    sqlite.transaction(() => {
      for (let id = 1; id <= 3_000; id++)
        insert.run(id, `user-${id % 97}`, `badge-${id}`, 1_790_000_000_000 + id);
    })();
    const report = await mirror("inventory", { batchSize: 250 });
    expect(report).toMatchObject({ status: "applied", insert: 3_000 });
    expect(
      Number(
        (await rows("inventory"))[0] &&
          (await sql.unsafe(`SELECT count(*)::int AS n FROM ${schema}.inventory`))[0]!.n,
      ),
    ).toBe(3_000);

    sqlite.exec(
      "UPDATE inventory SET item_key = item_key || '-v2' WHERE id % 2 = 0; DELETE FROM inventory WHERE id > 2900",
    );
    const second = await mirror("inventory", { batchSize: 250 });
    expect(second).toMatchObject({ status: "applied", update: 1_450, delete: 100, insert: 0 });
    expect(await mirror("inventory", { apply: false })).toMatchObject({
      status: "in-sync",
      source: 2_900,
      target: 2_900,
    });
  });

  test("a composite primary key is matched and deleted as a pair", async () => {
    sqlite.exec(
      `INSERT INTO race_level_roles VALUES ('saiyan', 1, 'r1'), ('saiyan', 2, 'r2'), ('namek', 1, 'r3')`,
    );
    expect((await mirror("race_level_roles")).status).toBe("applied");
    sqlite.exec(
      "DELETE FROM race_level_roles WHERE race = 'saiyan' AND level = 2; UPDATE race_level_roles SET role_id = 'r9' WHERE race = 'namek'",
    );
    expect(await mirror("race_level_roles")).toMatchObject({
      status: "applied",
      delete: 1,
      update: 1,
    });
    const stored = await rows("race_level_roles ORDER BY race, level");
    expect(stored.map((row) => `${row.race}:${row.level}:${row.role_id}`)).toEqual([
      "namek:1:r9",
      "saiyan:1:r1",
    ]);
  });

  test("booleans, doubles and timestamps are converted to the PostgreSQL types", async () => {
    sqlite.exec(`INSERT INTO economy_index VALUES ('2026-10-22', 1000000, 1.0525, 1, 1790000000000),
      ('2026-10-23', 1200000, 0.9, 0, 1790086400000)`);
    expect((await mirror("economy_index")).status).toBe("applied");
    const stored = await rows("economy_index ORDER BY day");
    expect(stored[0]!.enabled).toBe(true);
    expect(stored[1]!.enabled).toBe(false);
    expect(stored[0]!.index_value).toBe(1.0525);
    expect((stored[0]!.created_at as Date).getTime()).toBe(1_790_000_000_000);
    expect(await mirror("economy_index")).toMatchObject({ status: "in-sync" });
  });

  test("JSON text lands as a jsonb document, not a quoted string, and compares equal afterwards", async () => {
    sqlite.exec(
      `INSERT INTO guild_settings VALUES ('welcome', '{"b":[1,2],"a":true}'), ('plain', '"text"')`,
    );
    expect((await mirror("guild_settings")).status).toBe("applied");
    const stored = await sql.unsafe(
      `SELECT key, value, jsonb_typeof(value) AS kind FROM ${schema}.guild_settings ORDER BY key`,
    );
    expect(stored.map((row) => row.kind)).toEqual(["string", "object"]);
    expect(stored[1]!.value).toEqual({ a: true, b: [1, 2] });
    expect(await mirror("guild_settings", { apply: false })).toMatchObject({ status: "in-sync" });

    sqlite.exec(`UPDATE guild_settings SET value = '{bad' WHERE key = 'plain'`);
    const failed = await mirror("guild_settings");
    expect(failed.status).toBe("error");
    expect(failed.reason).toContain("guild_settings.value");
    expect(failed.reason).toContain("invalid JSON");
  });

  test("a primary key held twice in PostgreSQL is collapsed to one row", async () => {
    sqlite.exec("INSERT INTO no_pk_in_pg VALUES ('a', 1), ('b', 2)");
    await sql.unsafe(`INSERT INTO ${schema}.no_pk_in_pg VALUES ('a', 1), ('a', 1), ('stale', 9)`);
    const plan = await mirror("no_pk_in_pg", { apply: false });
    expect(plan).toMatchObject({ status: "drift", duplicates: 1, insert: 1, delete: 1 });
    expect((await mirror("no_pk_in_pg")).status).toBe("applied");
    const stored = await rows("no_pk_in_pg ORDER BY id");
    expect(stored.map((row) => row.id)).toEqual(["a", "b"]);
    expect(await mirror("no_pk_in_pg", { apply: false })).toMatchObject({ status: "in-sync" });
  });

  test("a write PostgreSQL refuses rolls the whole table back and says why", async () => {
    sqlite.exec("INSERT INTO strict VALUES ('x', 1)");
    await sql.unsafe(`INSERT INTO ${schema}.strict VALUES ('kept', 5, 'present')`);
    const report = await mirror("strict");
    expect(report.status).toBe("error");
    expect(report.reason).toContain("required_elsewhere");
    const stored = await rows("strict");
    expect(stored.map((row) => row.id)).toEqual(["kept"]);
  });

  test("a value PostgreSQL cannot hold names the table, the column and the key", async () => {
    sqlite.exec(
      "INSERT INTO inventory (id, user_id, item_type, item_key, acquired_at) VALUES (5000, 'u', 'badge', 'k', 1.5)",
    );
    const report = await mirror("inventory");
    expect(report.status).toBe("error");
    expect(report.reason).toContain('inventory.acquired_at (key ["5000"])');
    expect(await mirror("inventory", { apply: false })).toMatchObject({ target: 2_900 });
  });

  test("two runs cannot interleave: the second waits for the first transaction", async () => {
    const other = postgres(url!, { max: 1, onnotice: () => {} });
    try {
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const holder = other.begin(async (tx) => {
        await tx.unsafe("SELECT pg_advisory_xact_lock(hashtext($1))", ["shenron-bot-runtime-sync"]);
        await held;
      });
      await Bun.sleep(100);
      sqlite.exec("DELETE FROM inventory WHERE id IN (5000, 2900)");
      const waiting = mirror("inventory");
      const state = await Promise.race([
        waiting.then(() => "done"),
        Bun.sleep(300).then(() => "waiting"),
      ]);
      expect(state).toBe("waiting");
      release();
      await holder;
      expect((await waiting).status).toBe("applied");
    } finally {
      await other.end();
    }
  });

  test("the command line writes nothing on a dry run and reports the gap as JSON", async () => {
    await sql.unsafe(`CREATE TABLE ${schema}.action_logs (id bigint PRIMARY KEY, user_id text, moderator_id text,
      action text, reason text, meta text, created_at bigint)`);
    const path = join(scratch, "bot.db");
    const file = new Database(path);
    file.exec(`CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL, xp INTEGER NOT NULL DEFAULT 0, zeni INTEGER NOT NULL DEFAULT 1000,
      zeni_frozen INTEGER NOT NULL DEFAULT 0, equipped_banner TEXT);
      CREATE TABLE action_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, moderator_id TEXT, action TEXT NOT NULL,
      reason TEXT, meta TEXT, created_at INTEGER NOT NULL);
      INSERT INTO users (id, xp) VALUES ('100', 5), ('101', 6);
      INSERT INTO action_logs (user_id, action, created_at) VALUES ('100', 'warn', 1790000000000);`);
    file.close();

    const before = await rows("users");
    const run = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, "sync-bot-runtime-sqlite-to-postgres.ts"),
        "--sqlite",
        path,
        "--source-id",
        "dbfr-test-sync-20261023",
        "--schema",
        schema,
        "--tables",
        "users,action_logs",
        "--dry-run",
      ],
      { env: { ...process.env, DATABASE_URL: url! }, stdout: "pipe", stderr: "pipe" },
    );
    const [out, err, code] = await Promise.all([
      new Response(run.stdout).text(),
      new Response(run.stderr).text(),
      run.exited,
    ]);
    expect(code).toBe(0);
    const report = JSON.parse(out);
    expect(report).toMatchObject({ ok: true, apply: false, dryRun: true, schema });
    expect(report.state.users).toMatchObject({ status: "drift", source: 2, target: before.length });
    expect(report.tables.action_logs).toMatchObject({ source: 1, missing: 1, written: 0 });
    expect(err).toContain("users");
    expect(await rows("users")).toHaveLength(before.length);
    expect(await rows("action_logs")).toHaveLength(0);
  });
});
