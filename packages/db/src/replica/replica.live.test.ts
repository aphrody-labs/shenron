// SPDX-License-Identifier: Apache-2.0
/**
 * Live qualification of the replica engine against a real PostgreSQL, through both clients the
 * repository uses (postgres-js for the scripts, Bun.SQL for the bot).
 *
 * Runs only with `SHENRON_LIVE=1` and `SHENRON_TEST_DATABASE_URL` pointing at a throwaway database:
 * every test file creates its own schema and drops it, nothing else is touched. The PostgreSQL
 * tables are created loosely on purpose (bigint and text, no NOT NULL), like the replica Infra
 * provisions.
 *
 *   docker run -d --rm -e POSTGRES_PASSWORD=x -p 127.0.0.1:55432:5432 postgres:18-alpine
 *   SHENRON_LIVE=1 SHENRON_TEST_DATABASE_URL=postgres://postgres:x@127.0.0.1:55432/postgres \
 *     bun test packages/db/src/replica/replica.live.test.ts
 */
import { SQL } from "bun";
import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import postgres from "postgres";
import {
  PgCursorStore,
  readJournalRows,
  runReplicaPass,
  stablePostgresId,
  syncJournals,
  type ReplicaMemo,
  type ReplicaPassOptions,
  type ReplicaPassReport,
  type SqlClient,
  type SqlRunner,
} from "./index";

const url = process.env.SHENRON_TEST_DATABASE_URL;
const live = process.env.SHENRON_LIVE === "1" && Boolean(url);
const SOURCE = "dbfr-bot-20261023";
const STATE_TABLES = ["users", "inventory", "race_level_roles"] as const;

interface Connection {
  name: string;
  client: SqlClient;
  close(): Promise<void>;
}

function connect(kind: "postgres-js" | "bun-sql"): Connection {
  if (kind === "postgres-js") {
    const sql = postgres(url!, { max: 2, onnotice: () => {} });
    return { name: kind, client: sql, close: () => sql.end() };
  }
  const sql = new SQL(url!, { max: 2 });
  return { name: kind, client: sql as unknown as SqlClient, close: () => sql.close() };
}

/** A client that remembers every statement it ran, transactions included. */
function counting(client: SqlClient): { client: SqlClient; statements: string[] } {
  const statements: string[] = [];
  const wrap = (runner: SqlRunner): SqlRunner => ({
    unsafe(text, params) {
      statements.push(text);
      return runner.unsafe(text, params);
    },
  });
  return {
    statements,
    client: {
      ...wrap(client),
      unsafe: wrap(client).unsafe,
      begin: (run) => client.begin((tx) => run(wrap(tx))),
    },
  };
}

for (const kind of ["postgres-js", "bun-sql"] as const)
  describe.if(live)(`replica engine over ${kind}`, () => {
    const connection = connect(kind);
    const { client } = connection;
    const sqlite = new Database(":memory:");
    const schema = `replica_${kind.replace("-", "")}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const memo: ReplicaMemo = new Map();
    let cursors: PgCursorStore;
    const T0 = 1_790_000_000_000;

    const rows = (query: string) => client.unsafe(`SELECT * FROM ${schema}.${query}`);

    async function pass(
      over: Partial<ReplicaPassOptions> = {},
      runner = client,
    ): Promise<ReplicaPassReport> {
      return runReplicaPass({
        sqlite,
        sql: runner,
        sourceId: SOURCE,
        memo,
        cursors,
        schema,
        stateTables: STATE_TABLES,
        journalTables: ["action_logs"],
        batchSize: 100,
        statementTimeoutMs: 30_000,
        ...over,
      });
    }

    beforeAll(async () => {
      await client.unsafe(`CREATE SCHEMA ${schema}`);
      await client.unsafe(`CREATE TABLE ${schema}.users (id text PRIMARY KEY, xp bigint, zeni_frozen boolean,
      updated_at timestamptz, legacy_note text DEFAULT 'kept')`);
      await client.unsafe(
        `CREATE TABLE ${schema}.inventory (id bigint PRIMARY KEY, user_id text, item_key text)`,
      );
      await client.unsafe(`CREATE TABLE ${schema}.race_level_roles (race text, level bigint, role_id text,
      PRIMARY KEY (race, level))`);
      await client.unsafe(`CREATE TABLE ${schema}.action_logs (id bigint PRIMARY KEY, user_id text,
      moderator_id text, action text, reason text, meta text, created_at bigint)`);
      cursors = new PgCursorStore(client, schema);
      expect(await cursors.exists()).toBe(false);
      expect(await cursors.ensure()).toBe(true);

      sqlite.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL, xp INTEGER NOT NULL DEFAULT 0,
        zeni_frozen INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, item_key TEXT NOT NULL);
      CREATE TABLE race_level_roles (race TEXT NOT NULL, level INTEGER NOT NULL, role_id TEXT NOT NULL,
        PRIMARY KEY (race, level));
      CREATE TABLE action_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, moderator_id TEXT,
        action TEXT NOT NULL, reason TEXT, meta TEXT, created_at INTEGER NOT NULL);
      INSERT INTO users VALUES ('1', 600000000000000123, 0, ${T0}), ('2', 20, 1, ${T0}), ('3', 30, 0, ${T0});
      INSERT INTO race_level_roles VALUES ('saiyan', 1, 'r1'), ('namek', 1, 'r2');
    `);
      const insertItem = sqlite.prepare("INSERT INTO inventory (user_id, item_key) VALUES (?, ?)");
      sqlite.transaction(() => {
        for (let index = 1; index <= 100; index++)
          insertItem.run(`u${index % 9}`, `badge-${index}`);
      })();
      const insertLog = sqlite.prepare(
        "INSERT INTO action_logs (user_id, action, meta, created_at) VALUES (?, 'interaction', ?, ?)",
      );
      sqlite.transaction(() => {
        for (let index = 1; index <= 250; index++)
          insertLog.run(`u${index % 7}`, '{"name":"ping"}', T0 + index);
      })();
    });

    afterAll(async () => {
      await client.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await connection.close();
      sqlite.close();
    });

    test("the first pass mirrors every table in full, exactly, and builds the memo", async () => {
      const report = await pass();
      expect(report.ok).toBe(true);
      expect(report.state.users).toMatchObject({ status: "applied", mode: "full", insert: 3 });
      expect(report.state.inventory).toMatchObject({
        status: "applied",
        mode: "full",
        insert: 100,
      });
      expect(report.state.race_level_roles).toMatchObject({ status: "applied", insert: 2 });
      expect(report.journals?.action_logs).toMatchObject({ status: "ok", read: 250, written: 250 });
      expect(report.totals).toMatchObject({ tables: 3, applied: 3, full: 3, journalWritten: 250 });

      // An XP above 2^53 reaches PostgreSQL digit for digit.
      const stored = await client.unsafe(
        `SELECT xp::text AS xp, zeni_frozen FROM ${schema}.users ORDER BY id`,
      );
      expect(stored.map((row) => row.xp)).toEqual(["600000000000000123", "20", "30"]);
      expect(stored.map((row) => row.zeni_frozen)).toEqual([false, true, false]);
      expect((await rows("users"))[0]!.legacy_note).toBe("kept");
      expect(await cursors.get(SOURCE, "action_logs")).toBe(250);
      expect(memo.size).toBe(3);
    });

    test("an idle pass only counts rows: one cheap statement per table, none for the journals", async () => {
      const spy = counting(client);
      const report = await pass({}, spy.client);
      expect(report.ok).toBe(true);
      expect(report.totals).toMatchObject({ tables: 3, inSync: 3, incremental: 3, full: 0 });
      for (const state of Object.values(report.state)) {
        expect(state).toMatchObject({ status: "in-sync", mode: "incremental", candidates: 0 });
      }
      const stateStatements = spy.statements.filter((text) => !text.includes("sqlite_sync_cursor"));
      expect(stateStatements).toHaveLength(3);
      expect(stateStatements.every((text) => text.includes("count(*)"))).toBe(true);
      expect(report.journals?.action_logs).toMatchObject({ read: 0, written: 0 });
    });

    test("only the rows that changed are read and written, silent changes included", async () => {
      sqlite.exec(`
      UPDATE users SET xp = 21, updated_at = ${T0 + 1000} WHERE id = '2';
      UPDATE users SET xp = 31 WHERE id = '3';
      DELETE FROM users WHERE id = '1';
      INSERT INTO users VALUES ('4', 40, 0, ${T0 + 2000});
    `);
      const spy = counting(client);
      const report = await pass({}, spy.client);
      expect(report.state.users).toMatchObject({
        status: "applied",
        mode: "incremental",
        candidates: 4,
        changedWithoutMark: 1,
        insert: 1,
        update: 2,
        delete: 1,
      });
      // Only the candidates were read: no statement selects the whole users table.
      expect(spy.statements.some((text) => /^SELECT "id".* FROM "\w+"\."users"$/.test(text))).toBe(
        false,
      );
      expect(spy.statements.some((text) => text.includes('WHERE "id" IN'))).toBe(true);
      const stored = await client.unsafe(
        `SELECT id, xp::text AS xp FROM ${schema}.users ORDER BY id`,
      );
      expect(stored.map((row) => `${row.id}:${row.xp}`)).toEqual(["2:21", "3:31", "4:40"]);
      expect((await rows("users WHERE id = '2'"))[0]!.legacy_note).toBe("kept");
      expect((await pass()).totals).toMatchObject({ inSync: 3, incremental: 3 });
    });

    test("a touched row PostgreSQL already holds equal writes nothing", async () => {
      await client.unsafe(
        `UPDATE ${schema}.users SET xp = 22, updated_at = $1::timestamptz WHERE id = '2'`,
        [new Date(T0 + 5000).toISOString()],
      );
      // The pass that wrote it was cut short; SQLite carries the same change.
      sqlite.exec(`UPDATE users SET xp = 22, updated_at = ${T0 + 5000} WHERE id = '2'`);
      // The count did not move, so the previous pass's memo still stands.
      const report = await pass();
      expect(report.state.users).toMatchObject({
        status: "in-sync",
        mode: "incremental",
        candidates: 1,
        insert: 0,
        update: 0,
        delete: 0,
      });
    });

    test("a row count that moved outside the sync is noticed and repaired in full", async () => {
      await client.unsafe(`DELETE FROM ${schema}.inventory WHERE id <= 5`);
      const report = await pass();
      expect(report.state.inventory).toMatchObject({ status: "applied", mode: "full", insert: 5 });
      expect(report.state.inventory!.drift).toContain("PostgreSQL holds 95 rows");
      expect(report.totals.drift).toHaveLength(1);
      expect(await client.unsafe(`SELECT count(*)::int AS n FROM ${schema}.inventory`)).toEqual([
        { n: 100 },
      ]);
      // The next pass trusts the rebuilt memo again.
      expect((await pass()).state.inventory).toMatchObject({
        status: "in-sync",
        mode: "incremental",
      });
    });

    test("a silent edit that keeps the count waits for the periodic full verification", async () => {
      await client.unsafe(
        `UPDATE ${schema}.race_level_roles SET role_id = 'tampered' WHERE race = 'namek'`,
      );
      expect((await pass()).state.race_level_roles).toMatchObject({
        status: "in-sync",
        mode: "incremental",
      });
      const verified = await pass({ fullVerifyMs: 0 });
      expect(verified.state.race_level_roles).toMatchObject({
        status: "applied",
        mode: "full",
        update: 1,
      });
      expect(verified.state.race_level_roles!.drift).toContain("changed 0 since the previous pass");
      expect((await rows("race_level_roles WHERE race = 'namek'"))[0]!.role_id).toBe("r2");
    });

    test("a large change is written in bounded batches and verified", async () => {
      sqlite.exec("UPDATE inventory SET item_key = item_key || '-v2'");
      const report = await pass();
      expect(report.state.inventory).toMatchObject({
        status: "applied",
        mode: "incremental",
        update: 100,
      });
      expect((await rows("inventory WHERE id = 100"))[0]!.item_key).toBe("badge-100-v2");
    });

    test("the deletion guard blocks, logs the reason and leaves PostgreSQL alone", async () => {
      sqlite.exec("DELETE FROM inventory WHERE id > 20");
      const blocked = await pass();
      expect(blocked.ok).toBe(false);
      expect(blocked.state.inventory).toMatchObject({ status: "blocked", mode: "incremental" });
      expect(blocked.state.inventory!.reason).toContain(
        "80 of 100 PostgreSQL rows would be deleted",
      );
      expect(blocked.totals.blocked).toHaveLength(1);
      expect(await client.unsafe(`SELECT count(*)::int AS n FROM ${schema}.inventory`)).toEqual([
        { n: 100 },
      ]);
      // Still blocked next time, still nothing lost.
      expect((await pass()).state.inventory!.status).toBe("blocked");
      const forced = await pass({ allowMassDelete: true });
      expect(forced.state.inventory).toMatchObject({ status: "applied", delete: 80 });
    });

    test("an emptied SQLite table never wipes PostgreSQL", async () => {
      sqlite.exec("DELETE FROM race_level_roles");
      const blocked = await pass();
      expect(blocked.state.race_level_roles!.status).toBe("blocked");
      expect(blocked.state.race_level_roles!.reason).toContain("SQLite table is empty");
      expect(await rows("race_level_roles")).toHaveLength(2);
      sqlite.exec("INSERT INTO race_level_roles VALUES ('saiyan', 1, 'r1'), ('namek', 1, 'r2')");
      expect((await pass()).state.race_level_roles!.status).toBe("in-sync");
    });

    test("a pass gives up on a table another run is writing instead of waiting", async () => {
      const other = connect(kind);
      let release!: () => void;
      const held = new Promise<void>((resolve) => (release = resolve));
      const holder = other.client.begin(async (tx) => {
        await tx.unsafe("SELECT pg_advisory_xact_lock(hashtext($1))", ["shenron-bot-runtime-sync"]);
        await held;
      });
      try {
        await Bun.sleep(150);
        sqlite.exec("UPDATE users SET xp = 99, updated_at = updated_at + 1 WHERE id = '3'");
        const started = performance.now();
        const busy = await pass();
        expect(performance.now() - started).toBeLessThan(5_000);
        expect(busy.state.users).toMatchObject({ status: "busy" });
        expect(busy.ok).toBe(true);
        release();
        await holder;
        expect((await pass()).state.users).toMatchObject({ status: "applied", update: 1 });
      } finally {
        release();
        await holder.catch(() => {});
        await other.close();
      }
    });

    test("journals: rows copied by hand under the same source are adopted, never duplicated", async () => {
      // Another journal on a fresh cursor, as if the manual copy of 23/10 had run and nothing else.
      const bare = new PgCursorStore(client, schema);
      const manual = readJournalRows(sqlite, "action_logs");
      await client.unsafe(`DELETE FROM ${schema}.action_logs`);
      const copied = await syncJournals(
        client,
        { apply: true, schema, sourceId: "dbfr-bot-adopted-1", batchSize: 100 },
        ["action_logs"],
        new Map([["action_logs" as const, manual]]),
      );
      expect(copied.action_logs).toMatchObject({ written: 250, fingerprintMatch: true });
      const before = await rows("action_logs ORDER BY id");

      const report = await pass({ sourceId: "dbfr-bot-adopted-1", cursors: bare, stateTables: [] });
      expect(report.journals?.action_logs).toMatchObject({
        status: "ok",
        cursorBefore: 0,
        cursorAfter: 250,
        read: 250,
        existing: 250,
        written: 0,
      });
      expect(await rows("action_logs ORDER BY id")).toEqual(before);
      expect(before.every((row) => String(row.id).startsWith("-"))).toBe(true);
      expect(String(before.find((row) => Number(row.created_at) === T0 + 1)?.id)).toBe(
        stablePostgresId("action_logs", { id: 1 }, "dbfr-bot-adopted-1"),
      );
    });

    test("journals: new rows follow the cursor, a replaced database is refused", async () => {
      sqlite.exec("INSERT INTO action_logs (action, created_at) VALUES ('warn', 1790000099999)");
      const next = await pass({ stateTables: [] });
      expect(next.journals?.action_logs).toMatchObject({
        cursorBefore: 250,
        cursorAfter: 251,
        written: 1,
      });
      expect(
        await client.unsafe(`SELECT count(*)::int AS n FROM ${schema}.action_logs WHERE id < 0`),
      ).toEqual([{ n: 251 }]);

      await cursors.advance(SOURCE, "action_logs", 900_000, 0);
      const replaced = await pass({ stateTables: [] });
      expect(replaced.ok).toBe(false);
      expect(replaced.journals?.action_logs?.status).toBe("blocked");
    });

    test("a table missing in PostgreSQL is skipped with the reason, the pass goes on", async () => {
      const report = await pass({ stateTables: ["users", "only_in_sqlite"], journalTables: [] });
      sqlite.exec("CREATE TABLE IF NOT EXISTS only_in_sqlite (id INTEGER PRIMARY KEY)");
      const again = await pass({ stateTables: ["only_in_sqlite"], journalTables: [] });
      expect(report.state.only_in_sqlite!.reason).toContain("does not exist in SQLite");
      expect(again.state.only_in_sqlite).toMatchObject({ status: "skipped" });
      expect(again.state.only_in_sqlite!.reason).toContain("does not exist in PostgreSQL");
      expect(again.ok).toBe(true);
    });
  });
