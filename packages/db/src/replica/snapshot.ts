// SPDX-License-Identifier: Apache-2.0
/**
 * Reading the bot's SQLite. Every function is synchronous on purpose: `bun:sqlite` calls do not
 * yield, so one call (or one {@link readSqliteSnapshot}) sees one consistent state even on the
 * connection the bot itself writes through.
 */
import type { Database } from "bun:sqlite";
import type { Row, SqliteColumn, StateSnapshot } from "./types";

export const JOURNAL_TABLES = ["action_logs", "rag_eval_history"] as const;
export type JournalTable = (typeof JOURNAL_TABLES)[number];
export type JournalRow = Record<string, string | number | null> & {
  id: number;
  created_at: number;
};

export const JOURNAL_COLUMNS: Record<JournalTable, readonly string[]> = {
  action_logs: ["id", "user_id", "moderator_id", "action", "reason", "meta", "created_at"],
  rag_eval_history: [
    "id",
    "recall_1",
    "recall_3",
    "recall_5",
    "recall_10",
    "mrr",
    "ndcg",
    "duration_ms",
    "cases_count",
    "sidecar_online",
    "misses_count",
    "misses_json",
    "created_at",
  ],
};

/** Quotes a name that came from the SQLite catalogue or from a constant. */
function quoted(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return `"${name}"`;
}

/**
 * One state table in one statement, or undefined when SQLite does not have it. Integers are read as
 * bigint (`safeIntegers`): an XP total above 2^53 keeps every digit on its way to PostgreSQL.
 */
export function readStateTable(db: Database, table: string): StateSnapshot | undefined {
  const columns = db
    .query<SqliteColumn, [string]>("SELECT name, pk FROM pragma_table_info(?)")
    .all(table);
  if (columns.length === 0) return undefined;
  const names = columns.map((column) => quoted(column.name)).join(", ");
  // `prepare`, not `query`: the statement cache must not hand a bigint-reading statement to the bot.
  const statement = db.prepare(`SELECT ${names} FROM ${quoted(table)}`);
  try {
    // Present at run time (Bun 1.4), missing from the published typings.
    (statement as typeof statement & { safeIntegers(enabled: boolean): void }).safeIntegers(true);
    return { columns, rows: statement.all() as Row[] };
  } finally {
    statement.finalize();
  }
}

/** Journal rows after `afterId`, oldest first, at most `limit` of them (all when omitted). */
export function readJournalRows(
  db: Database,
  table: JournalTable,
  afterId = 0,
  limit?: number,
): JournalRow[] {
  const columns = JOURNAL_COLUMNS[table].join(", ");
  if (limit === undefined) {
    return db
      .query<JournalRow, [number]>(`SELECT ${columns} FROM ${table} WHERE id > ? ORDER BY id`)
      .all(afterId);
  }
  return db
    .query<JournalRow, [number, number]>(
      `SELECT ${columns} FROM ${table} WHERE id > ? ORDER BY id LIMIT ?`,
    )
    .all(afterId, limit);
}

/**
 * The highest identifier a journal ever handed out: `sqlite_sequence` remembers rows that were
 * purged afterwards, the maximum covers a table without AUTOINCREMENT.
 */
export function journalHighWater(db: Database, table: JournalTable): number {
  let sequence = 0;
  try {
    sequence =
      db
        .query<{ seq: number }, [string]>("SELECT seq FROM sqlite_sequence WHERE name = ?")
        .get(table)?.seq ?? 0;
  } catch {
    // No AUTOINCREMENT table in this database at all.
  }
  const maximum =
    db.query<{ highest: number | null }, []>(`SELECT max(id) AS highest FROM ${table}`).get()
      ?.highest ?? 0;
  return Math.max(sequence, maximum);
}

export interface SqliteSnapshot {
  journals: Map<JournalTable, JournalRow[]>;
  state: Map<string, StateSnapshot>;
}

/** Journals and state tables read inside one SQLite transaction (what the manual script copies). */
export function readSqliteSnapshot(
  db: Database,
  want: { journals: readonly JournalTable[]; state: readonly string[] },
): SqliteSnapshot {
  const snapshot: SqliteSnapshot = { journals: new Map(), state: new Map() };
  db.exec("BEGIN");
  try {
    for (const table of want.journals) snapshot.journals.set(table, readJournalRows(db, table));
    for (const table of want.state) {
      const rows = readStateTable(db, table);
      if (rows) snapshot.state.set(table, rows);
    }
  } finally {
    db.exec("COMMIT");
  }
  return snapshot;
}
