import { describe, expect, test } from "bun:test";
import { BOT_JOURNAL_REPLICA_NAMES, BOT_STATE_REPLICA_NAMES } from "@aphrody/shenron-db/bot-schema";
import {
  KNOWN_TABLES,
  formatStateReport,
  parseOptions,
  sameRecord,
  stablePostgresId,
} from "./sync-bot-runtime-sqlite-to-postgres";
import { emptyReport } from "./sync-bot-runtime-state";

describe("bot runtime PostgreSQL mapping", () => {
  const row = {
    id: 1,
    user_id: "42",
    moderator_id: null,
    action: "interaction",
    reason: null,
    meta: '{"name":"ping"}',
    created_at: 1791904905000,
  };

  test("uses stable source and row identities without cloning mutations", () => {
    const first = stablePostgresId("action_logs", row, "dbfr-bot-20261013");
    expect(first).toBe(stablePostgresId("action_logs", row, "dbfr-bot-20261013"));
    expect(BigInt(first)).toBeLessThan(0n);
    expect(
      stablePostgresId(
        "action_logs",
        { ...row, created_at: row.created_at + 1 },
        "dbfr-bot-20261013",
      ),
    ).toBe(first);
    expect(stablePostgresId("action_logs", row, "dbfr-bot-replacement")).not.toBe(first);
  });

  test("refuses a conflicting target instead of silently dropping it", () => {
    expect(sameRecord("action_logs", row, { ...row, id: "-1" })).toBe(true);
    expect(sameRecord("action_logs", row, { ...row, id: "-1", action: "other" })).toBe(false);
  });
});

describe("command line", () => {
  const env = { DATABASE_URL: "postgres://user:secret@127.0.0.1/db" };
  const base = ["--sqlite", "bot.db", "--source-id", "dbfr-bot-20261023"];
  const parse = (
    extra: string[] = [],
    platform = "linux",
    variables: Record<string, string | undefined> = env,
  ) => parseOptions([...base, ...extra], variables, platform);

  test("a bare run is read-only and mirrors every table", () => {
    const options = parse([], "win32");
    expect(options).toMatchObject({
      apply: false,
      prepare: false,
      dryRun: false,
      tables: null,
      schema: "bot",
      batchSize: 500,
      keepAbsent: false,
      allowMassDelete: false,
    });
  });

  test("--dry-run excludes every writing mode", () => {
    expect(parse(["--dry-run"], "win32").dryRun).toBe(true);
    expect(() => parse(["--dry-run", "--apply", "--checkpoint", "c.json"])).toThrow("excludes");
    expect(() => parse(["--dry-run", "--prepare-checkpoint", "--checkpoint", "c.json"])).toThrow(
      "excludes",
    );
  });

  test("writing modes keep their guards", () => {
    expect(() => parse(["--apply"])).toThrow("--checkpoint is required");
    expect(() => parse(["--apply", "--checkpoint", "c.json"], "win32")).toThrow("requires Linux");
    expect(parse(["--apply", "--checkpoint", "c.json"]).apply).toBe(true);
    expect(parse(["--prepare-checkpoint", "--checkpoint", "c.json"], "win32").prepare).toBe(true);
    expect(() => parse(["--apply", "--prepare-checkpoint", "--checkpoint", "c.json"])).toThrow(
      "mutually exclusive",
    );
  });

  test("the identity of the source and the database are required", () => {
    expect(() => parseOptions(["--source-id", "dbfr-bot-20261023"], env, "linux")).toThrow("Usage");
    expect(() => parseOptions(["--sqlite", "bot.db", "--source-id", "x"], env, "linux")).toThrow(
      "stable --source-id",
    );
    expect(() => parse([], "linux", {})).toThrow("DATABASE_URL");
  });

  test("--tables accepts journals and state tables, and refuses anything else", () => {
    expect(parse(["--tables", "users, inventory,users,action_logs"]).tables).toEqual([
      "users",
      "inventory",
      "action_logs",
    ]);
    expect(() => parse(["--tables", "users,jails"])).toThrow("Unknown --tables jails");
    expect(() => parse(["--tables", "db_characters"])).toThrow("Unknown --tables");
    expect(() => parse(["--tables"])).toThrow("comma-separated");
    expect(parse(["--tables", "state"]).tables).toEqual([...BOT_STATE_REPLICA_NAMES]);
    expect(parse(["--tables", "journals"]).tables).toEqual(["action_logs", "rag_eval_history"]);
    expect(parse(["--tables", "journals,users"]).tables).toEqual([
      "action_logs",
      "rag_eval_history",
      "users",
    ]);
  });

  test("batch size, schema and deletion flags", () => {
    expect(parse(["--batch-size", "100"]).batchSize).toBe(100);
    for (const bad of ["0", "5001", "abc", "1.5"]) {
      expect(() => parse(["--batch-size", bad])).toThrow("--batch-size");
    }
    expect(parse(["--schema", "bot_test"]).schema).toBe("bot_test");
    expect(() => parse(["--schema", "bot; drop"])).toThrow("--schema");
    expect(parse(["--no-delete", "--allow-mass-delete"])).toMatchObject({
      keepAbsent: true,
      allowMassDelete: true,
    });
  });
});

describe("table registry", () => {
  test("the journals are exactly the ones this script copies by stable identifier", () => {
    expect([...BOT_JOURNAL_REPLICA_NAMES]).toEqual(["action_logs", "rag_eval_history"]);
    expect(KNOWN_TABLES.slice(0, 2)).toEqual(["action_logs", "rag_eval_history"]);
  });

  test("the audited state tables are mirrored, the ones with another owner are not", () => {
    for (const table of [
      "users",
      "inventory",
      "fusions",
      "shop_items",
      "level_rewards",
      "race_level_roles",
      "guild_settings",
      "economy_flags",
      "economy_index",
      "achievements",
      "warns",
      "tickets",
      "giveaways",
    ]) {
      expect(BOT_STATE_REPLICA_NAMES).toContain(table);
    }
    for (const table of [
      "jails",
      "dm_contacts",
      "dm_messages",
      "discord_user_profiles",
      "ba_session",
      "ba_account",
    ]) {
      expect(KNOWN_TABLES).not.toContain(table);
    }
    expect(new Set(KNOWN_TABLES).size).toBe(KNOWN_TABLES.length);
  });

  test("parents are written before their children", () => {
    const order = (name: string) => BOT_STATE_REPLICA_NAMES.indexOf(name);
    expect(order("users")).toBeLessThan(order("inventory"));
    expect(order("users")).toBeLessThan(order("achievements"));
    expect(order("giveaways")).toBeLessThan(order("giveaway_entries"));
  });
});

describe("operator report", () => {
  test("one line per table with the gap and the notes", () => {
    const text = formatStateReport({
      users: {
        ...emptyReport(8037),
        status: "drift",
        target: 7845,
        insert: 200,
        update: 5,
        delete: 8,
        changedColumns: { xp: 5 },
        sqliteOnlyColumns: ["zeni_frozen"],
      },
      guild_settings: { ...emptyReport(0), reason: "guild_settings does not exist in PostgreSQL" },
    });
    const lines = text.split(/\r?\n/);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("users");
    expect(lines[1]).toContain("drift");
    expect(lines[1]).toContain("8037");
    expect(lines[1]).toContain("not in PostgreSQL: zeni_frozen");
    expect(lines[1]).toContain("changed: xp(5)");
    expect(lines[2]).toContain("skipped");
  });
});
