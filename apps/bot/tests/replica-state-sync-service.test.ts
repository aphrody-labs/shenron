// SPDX-License-Identifier: Apache-2.0
/**
 * ReplicaSyncService: settings, guard rails and status around the replica engine. The engine itself
 * is qualified in packages/db (pure and live suites); here it is replaced by a recording fake and
 * PostgreSQL by a stub, so nothing connects anywhere.
 */
import "./setup";
import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import { BOT_STATE_REPLICA_NAMES } from "@aphrody/shenron-db/bot-schema";
import type { ReplicaPassOptions, ReplicaPassReport } from "@aphrody/shenron-db/replica";
import { DatabaseService } from "../src/db/index";
import { PgService, type PgHandle } from "../src/db/pg";
import { logger } from "../src/lib/logger";
import { EventBusService } from "../src/services/EventBusService";
import { ReplicaSyncService } from "../src/services/ReplicaSyncService";
import {
  REPLICA_SYNC_DEFAULT_SOURCE_ID,
  REPLICA_SYNC_ENABLED,
  REPLICA_SYNC_INTERVAL_MINUTES,
  REPLICA_SYNC_JOURNALS,
  REPLICA_SYNC_SOURCE_ID,
  SETTINGS_KEYS,
  SettingsService,
  findSettingDef,
} from "../src/services/SettingsService";

const ENV = {
  DATABASE_URL: "postgres://bot:secret@127.0.0.1:1/shenron_test",
  NODE_ENV: "production",
};

function totals(over: Partial<ReplicaPassReport["totals"]> = {}): ReplicaPassReport["totals"] {
  return {
    tables: 25,
    inSync: 25,
    applied: 0,
    skipped: 0,
    busy: 0,
    full: 0,
    incremental: 25,
    insert: 0,
    update: 0,
    delete: 0,
    blocked: [],
    errors: [],
    drift: [],
    journalRead: 0,
    journalWritten: 0,
    journalPending: false,
    ...over,
  };
}

function report(over: Partial<ReplicaPassReport> = {}): ReplicaPassReport {
  return {
    startedAt: Date.now(),
    durationMs: 42,
    ok: true,
    state: {},
    journals: null,
    totals: totals(),
    ...over,
  };
}

interface Harness {
  service: ReplicaSyncService;
  settings: SettingsService;
  calls: ReplicaPassOptions[];
  next: { run: () => Promise<ReplicaPassReport> };
  cursorTableExists: { value: boolean; creatable: boolean };
}

function memoryDb(): DatabaseService {
  const dbs = DatabaseService.forPath(":memory:");
  dbs.sqlite.exec(
    "CREATE TABLE IF NOT EXISTS guild_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0)",
  );
  return dbs;
}

function harness(env: Record<string, string | undefined> = ENV): Harness {
  const bus = new EventBusService();
  const dbs = memoryDb();
  const settings = new SettingsService(dbs, bus);
  const cursorTableExists = { value: true, creatable: true };
  const sql = {
    async unsafe(text: string) {
      if (text.includes("to_regclass")) {
        return [{ name: cursorTableExists.value ? "bot.sqlite_sync_cursor" : null }];
      }
      if (text.startsWith("CREATE TABLE")) {
        if (!cursorTableExists.creatable) throw new Error("permission denied");
        cursorTableExists.value = true;
        return [];
      }
      return [];
    },
    async begin() {
      throw new Error("not used");
    },
  };
  const handle = { sql, db: {} } as unknown as PgHandle;
  const pg = PgService.withEnv(env, () => handle);
  const service = new ReplicaSyncService(dbs, pg, settings);
  service.env = env;
  const calls: ReplicaPassOptions[] = [];
  const next = { run: async () => report() };
  service.engine = async (options) => {
    calls.push(options);
    return next.run();
  };
  return { service, settings, calls, next, cursorTableExists };
}

beforeEach(() => {
  spyOn(logger, "info")
    .mockImplementation(() => {})
    .mockClear();
});

describe("settings", () => {
  it("declares the four keys with the documented defaults", () => {
    const defaults = Object.fromEntries(
      SETTINGS_KEYS.filter((def) => def.key.startsWith("replica.sync.")).map((def) => [
        def.key,
        def.default,
      ]),
    );
    expect(defaults).toEqual({
      [REPLICA_SYNC_ENABLED]: true,
      [REPLICA_SYNC_INTERVAL_MINUTES]: 15,
      [REPLICA_SYNC_JOURNALS]: true,
      [REPLICA_SYNC_SOURCE_ID]: "dbfr-bot-20261023",
    });
    expect(findSettingDef(REPLICA_SYNC_INTERVAL_MINUTES)).toMatchObject({ min: 1, max: 1440 });
  });

  it("refuses an invalid cadence or source id", async () => {
    const { settings } = harness();
    await expect(settings.set(REPLICA_SYNC_INTERVAL_MINUTES, "0")).rejects.toThrow("≥ 1");
    await expect(settings.set(REPLICA_SYNC_INTERVAL_MINUTES, "5000")).rejects.toThrow("≤ 1440");
    await expect(settings.set(REPLICA_SYNC_SOURCE_ID, "Bad Id")).rejects.toThrow("minuscules");
    await settings.set(REPLICA_SYNC_SOURCE_ID, "dbfr-bot-20261101");
    expect(await settings.getString(REPLICA_SYNC_SOURCE_ID, "")).toBe("dbfr-bot-20261101");
  });

  it("reads the cadence in minutes, clamped, with the source id of the manual copy by default", async () => {
    const { service, settings } = harness();
    expect(await service.readConfig()).toEqual({
      enabled: true,
      intervalMinutes: 15,
      journals: true,
      sourceId: REPLICA_SYNC_DEFAULT_SOURCE_ID,
    });
    await settings.set(REPLICA_SYNC_INTERVAL_MINUTES, "5");
    expect(await service.intervalMs()).toBe(5 * 60_000);
  });
});

describe("configuration", () => {
  it("is inactive without DATABASE_URL or under test", () => {
    expect(harness({}).service.isConfigured()).toBe(false);
    expect(harness({ DATABASE_URL: "  " }).service.isConfigured()).toBe(false);
    expect(harness({ ...ENV, NODE_ENV: "test" }).service.isConfigured()).toBe(false);
    expect(harness().service.isConfigured()).toBe(true);
  });

  it("does nothing, and says why, without a database", async () => {
    const { service, calls } = harness({});
    const pass = await service.runPass();
    expect(pass?.outcome).toBe("skipped-unconfigured");
    expect(calls).toHaveLength(0);
    expect(service.status()).toMatchObject({ configured: false, passes: 0 });
  });

  it("does nothing while the setting is off, and starts again when it is back on", async () => {
    const { service, settings, calls } = harness();
    await settings.set(REPLICA_SYNC_ENABLED, "false");
    expect((await service.runPass())?.outcome).toBe("skipped-disabled");
    expect(calls).toHaveLength(0);
    await settings.set(REPLICA_SYNC_ENABLED, "true");
    expect((await service.runPass())?.outcome).toBe("ok");
    expect(calls).toHaveLength(1);
  });
});

describe("a pass", () => {
  it("hands the engine every state table, the source id and the journal cursors", async () => {
    const { service, settings, calls } = harness();
    await settings.set(REPLICA_SYNC_SOURCE_ID, "dbfr-bot-20261101");
    await service.runPass();
    expect(calls[0]).toMatchObject({ sourceId: "dbfr-bot-20261101", schema: "bot" });
    expect(calls[0]!.stateTables).toEqual(BOT_STATE_REPLICA_NAMES);
    expect(calls[0]!.cursors).toBeDefined();
    expect(calls[0]!.statementTimeoutMs).toBeGreaterThan(0);
  });

  it("keeps the same memo between passes, so the next one is incremental", async () => {
    const { service, calls } = harness();
    await service.runPass();
    await service.runPass();
    expect(calls[1]!.memo).toBe(calls[0]!.memo);
  });

  it("skips the journals when their setting is off", async () => {
    const { service, settings, calls } = harness();
    await settings.set(REPLICA_SYNC_JOURNALS, "false");
    await service.runPass();
    expect(calls[0]!.cursors).toBeUndefined();
  });

  it("copies the state without the journals while the cursor table is missing", async () => {
    const { service, calls, cursorTableExists } = harness();
    cursorTableExists.value = false;
    cursorTableExists.creatable = false;
    const warn = spyOn(logger, "warn").mockImplementation(() => {});
    const pass = await service.runPass();
    expect(calls[0]!.cursors).toBeUndefined();
    expect(pass?.journalsUnavailable).toContain("sqlite_sync_cursor");
    expect(pass?.outcome).toBe("ok");
    await service.runPass();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("creates the cursor table when the role may", async () => {
    const { service, calls, cursorTableExists } = harness();
    cursorTableExists.value = false;
    await service.runPass();
    expect(cursorTableExists.value).toBe(true);
    expect(calls[0]!.cursors).toBeDefined();
  });

  it("never overlaps itself", async () => {
    const { service, calls, next } = harness();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    next.run = async () => {
      await held;
      return report();
    };
    const first = service.runPass();
    await Bun.sleep(10);
    expect(service.status().running).toBe(true);
    expect((await service.runPass("manual"))?.outcome).not.toBe("skipped-running");
    release();
    await first;
    expect(calls).toHaveLength(1);
    expect(service.status().running).toBe(false);
  });
});

describe("status and logging", () => {
  it("summarises the last pass for the admin health endpoint", async () => {
    const { service, next } = harness();
    next.run = async () =>
      report({
        durationMs: 120,
        totals: totals({ applied: 1, inSync: 23, update: 4, busy: 1, journalWritten: 9 }),
        state: {
          users: {
            status: "applied",
            source: 8000,
            target: 8000,
            insert: 0,
            update: 4,
            delete: 0,
            duplicates: 0,
            keptAbsent: 0,
            unchanged: 7996,
            changedColumns: { xp: 4 },
            sqliteOnlyColumns: [],
            pgOnlyColumns: [],
            unsupportedColumns: [],
            samples: { insert: [], update: [], delete: [] },
            mode: "incremental",
          },
          warns: {
            status: "busy",
            reason: "another sync holds the advisory lock",
            source: 3,
            target: 0,
            insert: 0,
            update: 0,
            delete: 0,
            duplicates: 0,
            keptAbsent: 0,
            unchanged: 0,
            changedColumns: {},
            sqliteOnlyColumns: [],
            pgOnlyColumns: [],
            unsupportedColumns: [],
            samples: { insert: [], update: [], delete: [] },
          },
        },
        journals: {
          action_logs: {
            status: "ok",
            cursorBefore: 100,
            cursorAfter: 109,
            highWater: 109,
            read: 9,
            existing: 0,
            written: 9,
            complete: true,
          },
        },
      });
    await service.runPass("startup");
    const status = service.status();
    expect(status).toMatchObject({
      configured: true,
      enabled: true,
      passes: 1,
      consecutiveFailures: 0,
      memoTables: 0,
      sourceId: REPLICA_SYNC_DEFAULT_SOURCE_ID,
    });
    expect(status.lastOkAt).not.toBeNull();
    expect(status.lastPass).toMatchObject({
      trigger: "startup",
      outcome: "partial",
      durationMs: 120,
      attention: [{ table: "warns", status: "busy" }],
      journals: { action_logs: { cursor: 109, written: 9, complete: true } },
    });
    expect(JSON.stringify(status)).not.toContain("secret");
  });

  it("logs one info line per pass with the totals", async () => {
    const { service, next } = harness();
    const info = spyOn(logger, "info").mockImplementation(() => {});
    next.run = async () => report({ totals: totals({ applied: 2, update: 7, journalWritten: 3 }) });
    await service.runPass();
    const lines = info.mock.calls.filter((call) => call[1] === "[replica] pass");
    expect(lines).toHaveLength(1);
    expect(lines[0]![0]).toMatchObject({ outcome: "ok", applied: 2, update: 7, journalWritten: 3 });
  });

  it("logs a blocked mass deletion as an error, once, and reports the pass as blocked", async () => {
    const { service, next } = harness();
    const error = spyOn(logger, "error").mockImplementation(() => {});
    next.run = async () =>
      report({
        ok: false,
        totals: totals({ blocked: ["users: 900 of 1000 PostgreSQL rows would be deleted"] }),
      });
    const first = await service.runPass();
    await service.runPass();
    expect(first?.outcome).toBe("blocked");
    expect(error).toHaveBeenCalledTimes(1);
    expect(service.status().consecutiveFailures).toBe(2);
    error.mockRestore();
  });

  it("warns about drift and about columns that are not replicated, once each", async () => {
    const { service, next } = harness();
    const warn = spyOn(logger, "warn").mockImplementation(() => {});
    next.run = async () =>
      report({
        totals: totals({ drift: ["users: PostgreSQL holds 3 rows, the previous pass left 5"] }),
        state: {
          users: {
            status: "applied",
            drift: "PostgreSQL holds 3 rows, the previous pass left 5",
            source: 5,
            target: 3,
            insert: 2,
            update: 0,
            delete: 0,
            duplicates: 0,
            keptAbsent: 0,
            unchanged: 3,
            changedColumns: {},
            sqliteOnlyColumns: ["zeni_frozen"],
            pgOnlyColumns: [],
            unsupportedColumns: [],
            samples: { insert: [], update: [], delete: [] },
          },
        },
      });
    await service.runPass();
    await service.runPass();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls.map((call) => call[1])).toEqual([
      "[replica] PostgreSQL had drifted from the previous pass and was repaired",
      "[replica] columns not replicated (Infra migration needed or unsupported type)",
    ]);
    warn.mockRestore();
  });
});

describe("failure never reaches the bot", () => {
  it("an engine that throws is recorded, counted and cleared by the next good pass", async () => {
    const { service, next } = harness();
    const warn = spyOn(logger, "warn").mockImplementation(() => {});
    next.run = async () => {
      throw new Error("connection terminated");
    };
    const failed = await service.runPass();
    expect(failed).toMatchObject({ outcome: "error", error: "connection terminated" });
    expect(service.status()).toMatchObject({ passes: 1, consecutiveFailures: 1, lastOkAt: null });
    expect(service.status().running).toBe(false);

    next.run = async () => report();
    await service.runPass();
    expect(service.status()).toMatchObject({ passes: 2, consecutiveFailures: 0 });
    expect(service.status().lastOkAt).not.toBeNull();
    warn.mockRestore();
  });

  it("a hung engine is abandoned and its memo discarded", async () => {
    const { service, calls, next } = harness();
    const warn = spyOn(logger, "warn").mockImplementation(() => {});
    service.passTimeoutMs = 30;
    next.run = () => new Promise(() => {});
    const pass = await service.runPass();
    expect(pass).toMatchObject({ outcome: "error" });
    expect(pass?.error).toContain("timed out");
    expect(service.status().running).toBe(false);
    next.run = async () => report();
    await service.runPass();
    expect(calls[1]!.memo).not.toBe(calls[0]!.memo);
    warn.mockRestore();
  });

  it("an unreadable pool is a skipped pass, not an exception", async () => {
    const dbs = memoryDb();
    const settings = new SettingsService(dbs, new EventBusService());
    const pg = PgService.withEnv(ENV, () => {
      throw new Error("invalid connection string");
    });
    const service = new ReplicaSyncService(dbs, pg, settings);
    service.env = ENV;
    const warn = spyOn(logger, "warn").mockImplementation(() => {});
    expect((await service.runPass())?.outcome).toBe("skipped-unconfigured");
    warn.mockRestore();
  });
});
