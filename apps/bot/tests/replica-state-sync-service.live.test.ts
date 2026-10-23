// SPDX-License-Identifier: Apache-2.0
/**
 * ReplicaSyncService end to end against a real PostgreSQL, through the pool the bot really uses
 * (Bun.SQL via PgService): SQLite changes show up in PostgreSQL pass after pass.
 *
 * Runs only with `SHENRON_LIVE=1` and `SHENRON_TEST_DATABASE_URL` (a throwaway database; the test
 * creates a schema of its own and drops it).
 *
 *   SHENRON_LIVE=1 SHENRON_TEST_DATABASE_URL=postgres://postgres:x@127.0.0.1:55432/postgres \
 *     bun test --isolate tests/replica-state-sync-service.live.test.ts
 */
import "./setup";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { container } from "tsyringe";
import { DatabaseService } from "../src/db/index";
import { PgService } from "../src/db/pg";
import { EventBusService } from "../src/services/EventBusService";
import { ReplicaSyncService } from "../src/services/ReplicaSyncService";
import { SettingsService } from "../src/services/SettingsService";

const url = process.env.SHENRON_TEST_DATABASE_URL;
const live = process.env.SHENRON_LIVE === "1" && Boolean(url);

describe.if(live)("ReplicaSyncService against PostgreSQL", () => {
  const dbs = container.resolve(DatabaseService);
  const env = { DATABASE_URL: url, NODE_ENV: "production" };
  const pg = PgService.withEnv(env);
  const service = new ReplicaSyncService(dbs, pg, container.resolve(SettingsService));
  service.env = env;
  service.schema = `bot_replica_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const sql = () => pg.get()!.sql;
  const rows = (query: string) => sql().unsafe(`SELECT * FROM ${service.schema}.${query}`);

  beforeAll(async () => {
    await sql().unsafe(`CREATE SCHEMA ${service.schema}`);
    await sql()
      .unsafe(`CREATE TABLE ${service.schema}.users (id text PRIMARY KEY, xp bigint, zeni bigint,
      level bigint, zeni_frozen bigint, updated_at bigint, legacy_note text DEFAULT 'kept')`);
    await sql()
      .unsafe(`CREATE TABLE ${service.schema}.action_logs (id bigint PRIMARY KEY, user_id text,
      moderator_id text, action text, reason text, meta text, created_at bigint)`);
    dbs.sqlite.exec(`DELETE FROM users; DELETE FROM action_logs;
      INSERT INTO users (id, xp, zeni, updated_at) VALUES ('100', 600000000000000123, 1000, 1790000000000),
        ('101', 20, 2000, 1790000000000), ('102', 30, 3000, 1790000000000);
      INSERT INTO action_logs (user_id, action, meta, created_at) VALUES
        ('100', 'warn', '{}', 1790000000001), ('101', 'jail', '{}', 1790000000002);`);
  });

  afterAll(async () => {
    await sql().unsafe(`DROP SCHEMA IF EXISTS ${service.schema} CASCADE`);
    await pg.close();
  });

  it("the first pass mirrors users in full and copies the journals under the stable ids", async () => {
    const pass = await service.runPass("manual");
    expect(pass?.totals?.errors).toEqual([]);
    expect(pass?.totals).toMatchObject({ full: expect.any(Number), journalWritten: 2 });
    const users = await sql().unsafe(
      `SELECT id, xp::text AS xp, legacy_note FROM ${service.schema}.users ORDER BY id`,
    );
    expect(users.map((row: { id: string; xp: string }) => `${row.id}:${row.xp}`)).toEqual([
      "100:600000000000000123",
      "101:20",
      "102:30",
    ]);
    expect(users[0]!.legacy_note).toBe("kept");
    const logs = await rows("action_logs ORDER BY created_at");
    expect(logs).toHaveLength(2);
    expect(logs.every((row: { id: string }) => String(row.id).startsWith("-"))).toBe(true);
    expect(service.status()).toMatchObject({ passes: 1, consecutiveFailures: 0 });
    expect(service.status().memoTables).toBeGreaterThan(0);
  });

  it("the next pass is incremental: an idle one writes nothing, a change writes one row", async () => {
    const idle = await service.runPass("cron");
    expect(idle?.totals).toMatchObject({ insert: 0, update: 0, delete: 0, journalWritten: 0 });
    expect(idle?.totals?.incremental).toBeGreaterThan(0);

    dbs.sqlite.exec(`UPDATE users SET xp = 31, updated_at = 1790000009000 WHERE id = '102';
      INSERT INTO action_logs (user_id, action, meta, created_at) VALUES ('102', 'ban', '{}', 1790000000003)`);
    const changed = await service.runPass("cron");
    expect(changed?.totals).toMatchObject({ update: 1, journalWritten: 1 });
    expect((await rows("users WHERE id = '102'"))[0]!.xp).toBe("31");
    expect(await rows("action_logs")).toHaveLength(3);
    expect(changed?.journals?.action_logs).toMatchObject({ cursor: 3, written: 1, complete: true });
  });

  it("a mass deletion is blocked, reported, and PostgreSQL keeps its rows", async () => {
    dbs.sqlite.exec("DELETE FROM users");
    const blocked = await service.runPass("cron");
    expect(blocked?.outcome).toBe("blocked");
    expect(blocked?.attention.some((entry) => entry.table === "users")).toBe(true);
    expect(await rows("users")).toHaveLength(3);
    expect(service.status().consecutiveFailures).toBe(1);
  });

  it("the health endpoint payload carries the status and nothing secret", () => {
    const status = JSON.stringify(service.status());
    expect(status).toContain("lastPass");
    expect(status).not.toContain(String(url));
    // Keeps the shared bus quiet for the other suites of this process.
    container.resolve(EventBusService);
  });
});
