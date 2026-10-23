// SPDX-License-Identifier: Apache-2.0
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  JOURNAL_COLUMNS,
  MemoryCursorStore,
  PgCursorStore,
  buildInsert,
  buildSelectByKeys,
  canonicalValue,
  classifyChanges,
  cursorDdl,
  diffRows,
  fingerprintRow,
  journalHighWater,
  planColumns,
  readJournalRows,
  readStateTable,
  rowHash,
  sameRecord,
  stablePostgresId,
  stableStringify,
  summarizePass,
  syncJournals,
  syncJournalsIncremental,
  toPgParam,
  type JournalRow,
  type JournalTable,
  type MemoEntry,
  type PgColumn,
  type Row,
  type SqlRunner,
  type TablePlan,
  type TableReport,
  emptyReport,
} from "./index";

const pg = (name: string, type: string): PgColumn => ({
  name,
  type,
  generated: false,
  identityAlways: false,
});

function usersPlan(): TablePlan {
  const planned = planColumns(
    "users",
    [
      { name: "id", pk: 1 },
      { name: "xp", pk: 0 },
      { name: "zeni_frozen", pk: 0 },
      { name: "updated_at", pk: 0 },
    ],
    [
      pg("id", "text"),
      pg("xp", "int8"),
      pg("zeni_frozen", "bool"),
      pg("updated_at", "timestamptz"),
    ],
  );
  if (!planned.ok) throw new Error(planned.reason);
  return planned.plan;
}

describe("exact integers", () => {
  test("a bigint above 2^53 keeps every digit through compare and bind", () => {
    const exact = 600_000_000_000_000_123n;
    expect(canonicalValue(exact, "int8", "source")).toBe("600000000000000123");
    expect(canonicalValue("600000000000000123", "int8", "target")).toBe("600000000000000123");
    expect(toPgParam(exact, "int8")).toBe("600000000000000123");
    // The lossy number it would have been read as is a different value.
    expect(canonicalValue(Number(exact), "int8", "source")).not.toBe("600000000000000123");
  });

  test("bigint 0/1 are booleans, bigint timestamps are epoch milliseconds", () => {
    expect(canonicalValue(1n, "bool", "source")).toBe(canonicalValue(true, "bool", "target"));
    expect(toPgParam(0n, "bool")).toBe(false);
    const ms = 1_790_000_000_000;
    expect(canonicalValue(BigInt(ms), "timestamptz", "source")).toBe(
      canonicalValue(new Date(ms), "timestamptz", "target"),
    );
    expect(toPgParam(BigInt(ms), "timestamptz")).toBe("2026-09-21T14:13:20.000Z");
    expect(toPgParam(5n, "numeric")).toBe("5");
    expect(stableStringify({ n: 7n })).toBe('{"n":7}');
  });

  test("the SQLite snapshot reads integers as bigint and leaves the shared statement cache alone", () => {
    const db = new Database(":memory:");
    db.exec(
      "CREATE TABLE users (id TEXT PRIMARY KEY, xp INTEGER, ratio REAL); INSERT INTO users VALUES ('a', 600000000000000123, 1.5)",
    );
    const snapshot = readStateTable(db, "users")!;
    expect(snapshot.columns.map((column) => [column.name, column.pk])).toEqual([
      ["id", 1],
      ["xp", 0],
      ["ratio", 0],
    ]);
    expect(snapshot.rows[0]).toEqual({ id: "a", xp: 600000000000000123n, ratio: 1.5 });
    expect(db.query("SELECT xp FROM users").get()).toEqual({ xp: 600000000000000100 });
    expect(readStateTable(db, "missing")).toBeUndefined();
  });
});

describe("classifyChanges", () => {
  const plan = usersPlan();
  const row = (id: string, xp: number, stamp: number): Row => ({
    id,
    xp: BigInt(xp),
    zeni_frozen: 0n,
    updated_at: BigInt(stamp),
  });
  const T0 = 1_790_000_000_000;

  function memoOf(rows: Row[]): Map<string, MemoEntry> {
    return classifyChanges(plan, rows, undefined, "updated_at").entries;
  }

  test("without a previous pass nothing is a candidate", () => {
    const result = classifyChanges(plan, [row("1", 10, T0)], undefined, "updated_at");
    expect(result.changed).toEqual([]);
    expect(result.gone).toEqual([]);
    expect(result.entries.size).toBe(1);
  });

  test("a moved updated_at, a new key, a removed key and a silent change are told apart", () => {
    const before = memoOf([row("1", 10, T0), row("2", 20, T0), row("3", 30, T0), row("4", 40, T0)]);
    const result = classifyChanges(
      plan,
      [
        row("1", 10, T0), // untouched
        row("2", 21, T0 + 1000), // xp and updated_at moved
        row("4", 41, T0), // xp moved, updated_at forgotten
        row("5", 50, T0), // new
      ],
      before,
      "updated_at",
    );
    expect(result.changed.map((changed) => changed.id)).toEqual(["2", "4", "5"]);
    expect(result.gone).toEqual([["3"]]);
    expect(result.byMark).toBe(1);
    expect(result.byHash).toBe(1);
    expect(result.added).toBe(1);
  });

  test("a table without a change column relies on the content hash", () => {
    const before = classifyChanges(plan, [row("1", 10, T0)], undefined).entries;
    const result = classifyChanges(plan, [row("1", 11, T0)], before);
    expect(result.changed).toHaveLength(1);
    expect(result.byHash).toBe(1);
    expect(result.byMark).toBe(0);
  });

  test("the hash tells rows apart in every column and keeps a number apart from its text", () => {
    const base = { id: "1", xp: 5n, zeni_frozen: 1n, updated_at: BigInt(T0) };
    expect(rowHash(plan, { ...base })).toBe(rowHash(plan, { ...base }));
    for (const change of [
      { id: "2" },
      { xp: 6n },
      { zeni_frozen: 0n },
      { updated_at: BigInt(T0 + 1) },
    ]) {
      expect(rowHash(plan, { ...base, ...change })).not.toBe(rowHash(plan, base));
    }
    expect(rowHash(plan, { ...base, xp: 5 })).not.toBe(rowHash(plan, base));
    expect(rowHash(plan, { ...base, xp: "5" })).not.toBe(rowHash(plan, { ...base, xp: 5 }));
    expect(rowHash(plan, { ...base, xp: null })).not.toBe(rowHash(plan, { ...base, xp: "" }));
  });

  test("a NULL or duplicated primary key is an error", () => {
    expect(() => classifyChanges(plan, [{ id: null }], undefined)).toThrow("NULL in primary key");
    expect(() => classifyChanges(plan, [{ id: "1" }, { id: "1" }], undefined)).toThrow(
      "duplicate primary key",
    );
  });

  test("a candidate that PostgreSQL already holds equal writes nothing", () => {
    // updated_at moved, so the row is a candidate; PostgreSQL already holds exactly that row.
    const before = memoOf([row("1", 10, T0)]);
    const touched = classifyChanges(plan, [row("1", 10, T0 + 5)], before, "updated_at");
    expect(touched.changed).toHaveLength(1);
    const same = diffRows(plan, touched.changed, [
      { id: "1", xp: "10", zeni_frozen: false, updated_at: new Date(T0 + 5) },
    ]);
    expect([same.insert.length, same.update.length, same.unchanged]).toEqual([0, 0, 1]);
  });
});

describe("statements", () => {
  const plan = usersPlan();

  test("select by keys binds typed key tuples", () => {
    expect(buildSelectByKeys("bot", plan, [["1"], ["2"]])).toEqual({
      text: 'SELECT "id", "updated_at", "xp", "zeni_frozen" FROM "bot"."users" WHERE "id" IN ($1::text, $2::text)',
      params: ["1", "2"],
    });
  });

  test("insert accepts a conflict suffix", () => {
    const { text } = buildInsert(
      "bot",
      plan,
      [{ id: "1", xp: 1, zeni_frozen: 0, updated_at: 0 }],
      ' ON CONFLICT ("id") DO NOTHING',
    );
    expect(text.endsWith(' ON CONFLICT ("id") DO NOTHING')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Journals
// ---------------------------------------------------------------------------

describe("journal identifiers", () => {
  const row = { id: 1, created_at: 1 };

  test("they match the ones the manual copy of 2026-10-23 wrote", () => {
    // Pinned from scripts/ops/sync-bot-runtime-sqlite-to-postgres.ts before the engine moved.
    const source = "dbfr-bot-20261023";
    expect(stablePostgresId("action_logs", row, source)).toBe("-2850822225704779453");
    expect(stablePostgresId("action_logs", { id: 241710 }, source)).toBe("-4524705106059927411");
    expect(stablePostgresId("rag_eval_history", row, source)).toBe("-2764373047764746657");
    expect(stablePostgresId("rag_eval_history", { id: 37 }, source)).toBe("-791487769862829842");
  });

  test("a new source id is a new identifier space, an invalid row id is refused", () => {
    expect(stablePostgresId("action_logs", row, "dbfr-bot-replacement")).not.toBe(
      stablePostgresId("action_logs", row, "dbfr-bot-20261023"),
    );
    expect(() => stablePostgresId("action_logs", { id: 0 }, "x")).toThrow("invalid SQLite row ID");
  });

  test("sameRecord compares every column but the id, as strings", () => {
    const source: JournalRow = {
      id: 1,
      user_id: "42",
      moderator_id: null,
      action: "warn",
      reason: null,
      meta: "{}",
      created_at: 1791904905000,
    };
    expect(
      sameRecord("action_logs", source, { ...source, id: "-1", created_at: "1791904905000" }),
    ).toBe(true);
    expect(sameRecord("action_logs", source, { ...source, reason: "x" })).toBe(false);
    expect(fingerprintRow("action_logs", source, "-1")).toBe(
      JSON.stringify(["-1", "42", null, "warn", null, "{}", "1791904905000"]),
    );
  });
});

/** A PostgreSQL that only knows the journal statements, in memory. */
function fakeJournalPg(columns: Record<JournalTable, [string, string][]>) {
  const stored = new Map<JournalTable, Map<string, Row>>([
    ["action_logs", new Map()],
    ["rag_eval_history", new Map()],
  ]);
  const statements: string[] = [];
  const runner: SqlRunner = {
    async unsafe(text, params = []) {
      statements.push(text);
      if (text.includes("information_schema.columns")) {
        const table = params[1] as JournalTable;
        return (columns[table] ?? []).map(([name, type]) => ({
          column_name: name,
          udt_name: type,
          is_generated: "NEVER",
          identity_generation: null,
        }));
      }
      const table = (/"bot"\."(\w+)"/.exec(text)?.[1] ?? "") as JournalTable;
      const rows = stored.get(table)!;
      if (text.startsWith("SELECT")) {
        return params.flatMap((id) => {
          const found = rows.get(String(id));
          return found ? [found] : [];
        });
      }
      if (text.startsWith("INSERT INTO")) {
        const names = /\(([^)]*)\)/
          .exec(text)![1]!
          .split(", ")
          .map((name) => name.replaceAll('"', ""));
        for (let at = 0; at < params.length; at += names.length) {
          const row: Row = {};
          names.forEach((name, index) => (row[name] = params[at + index]));
          if (!rows.has(String(row.id))) rows.set(String(row.id), row);
        }
        return [];
      }
      throw new Error(`unexpected statement: ${text}`);
    },
  };
  return { runner, stored, statements };
}

const ACTION_LOG_COLUMNS: [string, string][] = [
  ["id", "int8"],
  ["user_id", "text"],
  ["moderator_id", "text"],
  ["action", "text"],
  ["reason", "text"],
  ["meta", "text"],
  ["created_at", "int8"],
];
const RAG_COLUMNS: [string, string][] = JOURNAL_COLUMNS.rag_eval_history.map((name) => [
  name,
  name === "id" ||
  name.endsWith("_count") ||
  name === "created_at" ||
  name === "duration_ms" ||
  name === "sidecar_online"
    ? "int8"
    : name === "misses_json"
      ? "text"
      : "float8",
]);

function botDb(logs: number): Database {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE action_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, moderator_id TEXT,
      action TEXT NOT NULL, reason TEXT, meta TEXT, created_at INTEGER NOT NULL);
    CREATE TABLE rag_eval_history (id INTEGER PRIMARY KEY AUTOINCREMENT, recall_1 REAL, recall_3 REAL, recall_5 REAL,
      recall_10 REAL, mrr REAL, ndcg REAL, duration_ms INTEGER, cases_count INTEGER, sidecar_online INTEGER,
      misses_count INTEGER, misses_json TEXT, created_at INTEGER NOT NULL)`);
  const insert = db.prepare(
    "INSERT INTO action_logs (user_id, action, meta, created_at) VALUES (?, 'interaction', '{}', ?)",
  );
  for (let index = 1; index <= logs; index++)
    insert.run(`u${index % 7}`, 1_790_000_000_000 + index);
  return db;
}

const OPTIONS = { schema: "bot", sourceId: "dbfr-bot-20261023" };

describe("journals, whole snapshot (manual script)", () => {
  test("a dry run counts what is missing and writes nothing", async () => {
    const db = botDb(5);
    const fake = fakeJournalPg({ action_logs: ACTION_LOG_COLUMNS, rag_eval_history: RAG_COLUMNS });
    const snapshots = new Map([["action_logs" as const, readJournalRows(db, "action_logs")]]);
    const report = await syncJournals(
      fake.runner,
      { ...OPTIONS, apply: false },
      ["action_logs"],
      snapshots,
    );
    expect(report.action_logs).toMatchObject({ source: 5, existing: 0, missing: 5, written: 0 });
    expect(report.action_logs.fingerprintMatch).toBe(false);
    expect(fake.stored.get("action_logs")!.size).toBe(0);
  });

  test("apply writes under the stable negative ids and a second run adds nothing", async () => {
    const db = botDb(1200);
    const fake = fakeJournalPg({ action_logs: ACTION_LOG_COLUMNS, rag_eval_history: RAG_COLUMNS });
    const snapshots = new Map([["action_logs" as const, readJournalRows(db, "action_logs")]]);
    const first = await syncJournals(
      fake.runner,
      { ...OPTIONS, apply: true, batchSize: 500 },
      ["action_logs"],
      snapshots,
    );
    expect(first.action_logs).toMatchObject({
      source: 1200,
      existing: 0,
      missing: 1200,
      written: 1200,
      fingerprintMatch: true,
    });
    const ids = [...fake.stored.get("action_logs")!.keys()];
    expect(ids).toHaveLength(1200);
    expect(ids.every((id) => BigInt(id) < 0n)).toBe(true);
    expect(ids).toContain(stablePostgresId("action_logs", { id: 1 }, OPTIONS.sourceId));

    const second = await syncJournals(
      fake.runner,
      { ...OPTIONS, apply: true },
      ["action_logs"],
      snapshots,
    );
    expect(second.action_logs).toMatchObject({ existing: 1200, missing: 0, written: 0 });
    expect(fake.stored.get("action_logs")!.size).toBe(1200);
  });

  test("a row that differs from the one already stored stops the run", async () => {
    const db = botDb(3);
    const fake = fakeJournalPg({ action_logs: ACTION_LOG_COLUMNS, rag_eval_history: RAG_COLUMNS });
    const rows = readJournalRows(db, "action_logs");
    const id = stablePostgresId("action_logs", rows[0]!, OPTIONS.sourceId);
    fake.stored.get("action_logs")!.set(id, { ...rows[0], id, action: "tampered" });
    await expect(
      syncJournals(
        fake.runner,
        { ...OPTIONS, apply: true },
        ["action_logs"],
        new Map([["action_logs" as const, rows]]),
      ),
    ).rejects.toThrow("ID collision or divergent row");
  });

  test("a missing PostgreSQL table is reported, not guessed", async () => {
    const fake = fakeJournalPg({ action_logs: [], rag_eval_history: RAG_COLUMNS });
    const db = botDb(1);
    await expect(
      syncJournals(
        fake.runner,
        { ...OPTIONS, apply: true },
        ["action_logs"],
        new Map([["action_logs" as const, readJournalRows(db, "action_logs")]]),
      ),
    ).rejects.toThrow("bot.action_logs does not exist in PostgreSQL");
  });
});

describe("journals, incremental (the bot)", () => {
  const pass = (
    fake: ReturnType<typeof fakeJournalPg>,
    db: Database,
    cursors: MemoryCursorStore,
    over: { maxRows?: number; batchSize?: number } = {},
  ) =>
    syncJournalsIncremental(fake.runner, db, cursors, {
      ...OPTIONS,
      tables: ["action_logs"],
      batchSize: 100,
      ...over,
    });

  test("a first pass copies everything, the next ones only what is new", async () => {
    const db = botDb(250);
    const fake = fakeJournalPg({ action_logs: ACTION_LOG_COLUMNS, rag_eval_history: RAG_COLUMNS });
    const cursors = new MemoryCursorStore();
    const first = (await pass(fake, db, cursors)).action_logs!;
    expect(first).toMatchObject({
      status: "ok",
      cursorBefore: 0,
      cursorAfter: 250,
      read: 250,
      written: 250,
      complete: true,
    });
    expect(await cursors.get(OPTIONS.sourceId, "action_logs")).toBe(250);

    const idle = (await pass(fake, db, cursors)).action_logs!;
    expect(idle).toMatchObject({ read: 0, written: 0, complete: true });

    db.exec("INSERT INTO action_logs (action, created_at) VALUES ('warn', 1790000009999)");
    const next = (await pass(fake, db, cursors)).action_logs!;
    expect(next).toMatchObject({ cursorBefore: 250, cursorAfter: 251, read: 1, written: 1 });
    expect(fake.stored.get("action_logs")!.size).toBe(251);
  });

  test("rows already copied under the same source are recognised, never duplicated", async () => {
    const db = botDb(120);
    const fake = fakeJournalPg({ action_logs: ACTION_LOG_COLUMNS, rag_eval_history: RAG_COLUMNS });
    // The manual copy ran first and left no cursor behind.
    await syncJournals(
      fake.runner,
      { ...OPTIONS, apply: true },
      ["action_logs"],
      new Map([["action_logs" as const, readJournalRows(db, "action_logs")]]),
    );
    const before = new Set(fake.stored.get("action_logs")!.keys());
    const inserts = () => fake.statements.filter((text) => text.startsWith("INSERT")).length;
    const written = inserts();
    const cursors = new MemoryCursorStore();
    const adopted = (await pass(fake, db, cursors)).action_logs!;
    expect(adopted).toMatchObject({
      status: "ok",
      read: 120,
      existing: 120,
      written: 0,
      cursorAfter: 120,
    });
    expect(new Set(fake.stored.get("action_logs")!.keys())).toEqual(before);
    expect(inserts()).toBe(written);
  });

  test("a pass is bounded and resumes from the cursor", async () => {
    const db = botDb(230);
    const fake = fakeJournalPg({ action_logs: ACTION_LOG_COLUMNS, rag_eval_history: RAG_COLUMNS });
    const cursors = new MemoryCursorStore();
    const first = (await pass(fake, db, cursors, { maxRows: 100 })).action_logs!;
    expect(first).toMatchObject({ read: 100, cursorAfter: 100, complete: false });
    const second = (await pass(fake, db, cursors, { maxRows: 100 })).action_logs!;
    expect(second).toMatchObject({ cursorBefore: 100, cursorAfter: 200, complete: false });
    const third = (await pass(fake, db, cursors, { maxRows: 100 })).action_logs!;
    expect(third).toMatchObject({ cursorAfter: 230, complete: true });
    expect(fake.stored.get("action_logs")!.size).toBe(230);
  });

  test("a SQLite behind the cursor is a replaced database: blocked, nothing written", async () => {
    const db = botDb(10);
    const fake = fakeJournalPg({ action_logs: ACTION_LOG_COLUMNS, rag_eval_history: RAG_COLUMNS });
    const cursors = new MemoryCursorStore();
    await cursors.advance(OPTIONS.sourceId, "action_logs", 241_710, 0);
    const blocked = (await pass(fake, db, cursors)).action_logs!;
    expect(blocked.status).toBe("blocked");
    expect(blocked.reason).toContain("use a new source id");
    expect(fake.stored.get("action_logs")!.size).toBe(0);
  });

  test("purging the newest rows does not look like a replaced database", async () => {
    const db = botDb(10);
    const fake = fakeJournalPg({ action_logs: ACTION_LOG_COLUMNS, rag_eval_history: RAG_COLUMNS });
    const cursors = new MemoryCursorStore();
    await pass(fake, db, cursors);
    db.exec("DELETE FROM action_logs WHERE id > 6");
    expect(journalHighWater(db, "action_logs")).toBe(10);
    const after = (await pass(fake, db, cursors)).action_logs!;
    expect(after.status).toBe("ok");
  });

  test("a failing batch leaves the cursor where it was", async () => {
    const db = botDb(150);
    const fake = fakeJournalPg({ action_logs: ACTION_LOG_COLUMNS, rag_eval_history: RAG_COLUMNS });
    const cursors = new MemoryCursorStore();
    const rows = readJournalRows(db, "action_logs");
    const id = stablePostgresId("action_logs", rows[120]!, OPTIONS.sourceId);
    fake.stored.get("action_logs")!.set(id, { ...rows[120], id, action: "tampered" });
    const failed = (await pass(fake, db, cursors)).action_logs!;
    expect(failed.status).toBe("error");
    expect(failed.reason).toContain("divergent");
    // The first batch of 100 was verified and kept; the second is retried next time.
    expect(await cursors.get(OPTIONS.sourceId, "action_logs")).toBe(100);
  });
});

describe("cursor store", () => {
  test("the memory store never moves backward", async () => {
    const store = new MemoryCursorStore();
    await store.advance("s", "t", 10, 10);
    await store.advance("s", "t", 4, 0);
    expect(await store.get("s", "t")).toBe(10);
    expect(await store.get("other", "t")).toBe(0);
  });

  test("the PostgreSQL store upserts monotonically and reads the bigint back", async () => {
    const calls: { text: string; params: unknown[] }[] = [];
    const store = new PgCursorStore({
      async unsafe(text, params = []) {
        calls.push({ text, params });
        return text.startsWith("SELECT last_id") ? [{ last_id: "241710" }] : [];
      },
    });
    expect(await store.get("dbfr-bot-20261023", "action_logs")).toBe(241710);
    await store.advance("dbfr-bot-20261023", "action_logs", 241_800, 90);
    const upsert = calls.at(-1)!;
    expect(upsert.text).toContain("GREATEST");
    expect(upsert.text).toContain('"bot"."sqlite_sync_cursor"');
    expect(upsert.params).toEqual(["dbfr-bot-20261023", "action_logs", 241_800, 90]);
  });

  test("ensure creates the table once and reports whether it exists afterwards", async () => {
    let created = false;
    const store = new PgCursorStore({
      async unsafe(text) {
        if (text.startsWith("CREATE TABLE")) {
          created = true;
          return [];
        }
        return [{ name: created ? "bot.sqlite_sync_cursor" : null }];
      },
    });
    expect(await store.ensure()).toBe(true);
    expect(created).toBe(true);
    const denied = new PgCursorStore({
      async unsafe(text) {
        if (text.startsWith("CREATE TABLE")) throw new Error("permission denied");
        return [{ name: null }];
      },
    });
    expect(await denied.ensure()).toBe(false);
    expect(cursorDdl("bot")).toContain("PRIMARY KEY (source_id, table_name)");
  });
});

describe("pass summary", () => {
  const report = (over: Partial<TableReport>): TableReport => ({ ...emptyReport(10), ...over });

  test("counts statuses, modes and writes, and lists what needs attention", () => {
    const totals = summarizePass(
      {
        users: report({ status: "applied", mode: "incremental", update: 3, insert: 1 }),
        inventory: report({ status: "in-sync", mode: "incremental" }),
        warns: report({
          status: "blocked",
          reason: "warns: 9 of 10 PostgreSQL rows would be deleted",
        }),
        bans: report({ status: "error", reason: "boom" }),
        tickets: report({ status: "busy" }),
        fusions: report({
          status: "applied",
          mode: "full",
          drift: "PostgreSQL holds 3 rows, the previous pass left 5",
        }),
        giveaways: report({ status: "skipped", reason: "bot.giveaways does not exist" }),
      },
      {
        action_logs: {
          status: "ok",
          cursorBefore: 0,
          cursorAfter: 100,
          highWater: 300,
          read: 100,
          existing: 40,
          written: 60,
          complete: false,
        },
      },
    );
    expect(totals).toMatchObject({
      tables: 7,
      inSync: 1,
      applied: 2,
      busy: 1,
      skipped: 1,
      full: 1,
      incremental: 2,
      insert: 1,
      update: 3,
      journalRead: 100,
      journalWritten: 60,
      journalPending: true,
    });
    expect(totals.blocked).toHaveLength(1);
    expect(totals.errors).toEqual(["bans: boom"]);
    expect(totals.drift).toHaveLength(1);
  });
});
