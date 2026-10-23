// SPDX-License-Identifier: Apache-2.0
/**
 * The append-only journals (`action_logs`, `rag_eval_history`): copied, never updated or deleted.
 *
 * A SQLite row `id` maps to a negative PostgreSQL identifier derived from the source id and the
 * table ({@link stablePostgresId}), so the copy cannot collide with the positive identifiers of the
 * historical import and a run can be repeated: a row already there is compared (a divergent row stops
 * the run), a row missing is inserted with `ON CONFLICT (id) DO NOTHING`, and what was inserted is
 * read back. Two ways to drive it:
 *
 *  - {@link syncJournals}: every row of a snapshot, with a fingerprint of both sides (the manual script);
 *  - {@link syncJournalsIncremental}: only the rows after a persistent cursor, a bounded amount per
 *    pass (the bot).
 */
import { createHash } from "node:crypto";
import type { Database } from "bun:sqlite";
import { planColumns, readPgColumns } from "./plan";
import {
  JOURNAL_COLUMNS,
  JOURNAL_TABLES,
  journalHighWater,
  readJournalRows,
  type JournalRow,
  type JournalTable,
} from "./snapshot";
import { buildInsert, qualified, quoteIdent, rowsPerStatement, splitBatches } from "./statements";
import type { CursorStore } from "./cursor";
import type { Row, SqlRunner, TablePlan } from "./types";

const MAX_ID = 0x3fffffffffffffffn;
/** Identifiers per `IN (...)` lookup. */
const LOOKUP_BATCH = 1_000;
export const DEFAULT_JOURNAL_BATCH = 500;
/** Rows one incremental pass copies at most per journal, so a first run on a big journal is spread over passes. */
export const DEFAULT_JOURNAL_PASS_ROWS = 100_000;

/** Negative IDs cannot collide with the positive IDs of the historical import. */
export function stablePostgresId(
  table: JournalTable,
  row: { id: number } & Record<string, unknown>,
  source: string,
): string {
  if (!Number.isSafeInteger(row.id) || row.id < 1)
    throw new Error(`${table}: invalid SQLite row ID`);
  const payload = JSON.stringify([source, table, row.id]);
  const digest = createHash("sha256").update(payload).digest();
  return (-((digest.readBigUInt64BE(0) & MAX_ID) + 1n)).toString();
}

export function sameRecord(
  table: JournalTable,
  source: JournalRow,
  target: Record<string, unknown>,
): boolean {
  return JOURNAL_COLUMNS[table].every((column) => {
    if (column === "id") return true;
    const left = source[column];
    const right = target[column];
    return left === null ? right === null : String(left) === String(right);
  });
}

export function fingerprintRow(
  table: JournalTable,
  row: Record<string, unknown>,
  id: string,
): string {
  return JSON.stringify([
    id,
    ...JOURNAL_COLUMNS[table]
      .filter((column) => column !== "id")
      .map((column) => (row[column] === null ? null : String(row[column]))),
  ]);
}

export interface JournalCounts {
  source: number;
  existing: number;
  missing: number;
  written: number;
  fingerprintMatch?: boolean;
}

export type JournalReport = Record<JournalTable, JournalCounts>;

export interface JournalOptions {
  apply: boolean;
  schema: string;
  sourceId: string;
  batchSize?: number;
}

/** The plan of a journal table: the SQLite columns against the PostgreSQL ones. */
async function planJournal(
  sql: SqlRunner,
  schema: string,
  table: JournalTable,
): Promise<TablePlan> {
  const pgColumns = await readPgColumns(sql, schema, table);
  if (pgColumns.length === 0) {
    throw new Error(`${schema}.${table} does not exist in PostgreSQL (Infra migration needed)`);
  }
  const planned = planColumns(
    table,
    JOURNAL_COLUMNS[table].map((name) => ({ name, pk: name === "id" ? 1 : 0 })),
    pgColumns,
  );
  if (!planned.ok) throw new Error(`${table}: ${planned.reason}`);
  return planned.plan;
}

/** The PostgreSQL rows for `ids`, by identifier. */
async function lookup(
  sql: SqlRunner,
  schema: string,
  plan: TablePlan,
  ids: readonly string[],
): Promise<Map<string, Row>> {
  const found = new Map<string, Row>();
  const names = plan.columns.map((column) => quoteIdent(column.name)).join(", ");
  for (const batch of splitBatches(ids, LOOKUP_BATCH)) {
    const marks = batch.map((_, index) => `$${index + 1}::int8`).join(", ");
    const rows = await sql.unsafe(
      `SELECT ${names} FROM ${qualified(schema, plan.table)} WHERE "id" IN (${marks})`,
      [...batch],
    );
    for (const row of rows) found.set(String(row.id), row);
  }
  return found;
}

interface Digests {
  source: ReturnType<typeof createHash>;
  target: ReturnType<typeof createHash>;
}

export interface BatchCounts {
  existing: number;
  missing: number;
  written: number;
}

/**
 * Compares a batch of SQLite rows with PostgreSQL and, with `apply`, inserts the missing ones and
 * reads them back. Throws on a divergent row or a failed readback.
 */
export async function reconcileJournalBatch(
  sql: SqlRunner,
  plan: TablePlan,
  rows: readonly JournalRow[],
  options: JournalOptions,
  digests?: Digests,
): Promise<BatchCounts> {
  const table = plan.table as JournalTable;
  const { schema, sourceId, apply } = options;
  const ids = rows.map((row) => stablePostgresId(table, row, sourceId));
  const present = await lookup(sql, schema, plan, ids);
  const counts: BatchCounts = { existing: 0, missing: 0, written: 0 };
  const toInsert: Row[] = [];
  const insertedIds: string[] = [];
  rows.forEach((row, index) => {
    const id = ids[index]!;
    digests?.source.update(fingerprintRow(table, row, id));
    const found = present.get(id);
    if (found) {
      if (!sameRecord(table, row, found))
        throw new Error(`${table}: ID collision or divergent row`);
      counts.existing++;
      return;
    }
    counts.missing++;
    toInsert.push({ ...row, id });
    insertedIds.push(id);
  });

  const verified = new Map<string, Row>();
  if (apply && toInsert.length > 0) {
    for (const batch of splitBatches(
      toInsert,
      rowsPerStatement(options.batchSize ?? DEFAULT_JOURNAL_BATCH, plan.columns.length),
    )) {
      const statement = buildInsert(schema, plan, batch, ' ON CONFLICT ("id") DO NOTHING');
      await sql.unsafe(statement.text, statement.params);
    }
    for (const [id, row] of await lookup(sql, schema, plan, insertedIds)) verified.set(id, row);
    rows.forEach((row, index) => {
      const id = ids[index]!;
      if (present.has(id)) return;
      const readback = verified.get(id);
      if (!readback || !sameRecord(table, row, readback)) {
        throw new Error(`${table}: PostgreSQL readback mismatch`);
      }
    });
    counts.written = toInsert.length;
  }
  if (digests) {
    rows.forEach((row, index) => {
      const id = ids[index]!;
      const stored = present.get(id) ?? verified.get(id);
      if (stored) digests.target.update(fingerprintRow(table, stored, id));
    });
  }
  return counts;
}

/**
 * Copies whole journal snapshots (the manual script): every row compared, every missing row
 * inserted, the two sides fingerprinted. Throws when the counts or the fingerprints disagree.
 */
export async function syncJournals(
  sql: SqlRunner,
  options: JournalOptions,
  tables: readonly JournalTable[],
  snapshots: ReadonlyMap<JournalTable, JournalRow[]>,
): Promise<JournalReport> {
  const report = Object.fromEntries(
    JOURNAL_TABLES.map((table) => [table, { source: 0, existing: 0, missing: 0, written: 0 }]),
  ) as JournalReport;
  for (const table of tables) {
    const rows = snapshots.get(table) ?? [];
    const counts = report[table];
    counts.source = rows.length;
    const plan = rows.length > 0 ? await planJournal(sql, options.schema, table) : undefined;
    const digests: Digests = {
      source: createHash("sha256"),
      target: createHash("sha256"),
    };
    if (plan) {
      for (const batch of splitBatches(rows, options.batchSize ?? DEFAULT_JOURNAL_BATCH)) {
        const done = await reconcileJournalBatch(sql, plan, batch, options, digests);
        counts.existing += done.existing;
        counts.missing += done.missing;
        counts.written += done.written;
      }
    }
    counts.fingerprintMatch = digests.source.digest("hex") === digests.target.digest("hex");
    if (
      options.apply &&
      (counts.existing + counts.written !== counts.source || !counts.fingerprintMatch)
    ) {
      throw new Error(`${table}: count or fingerprint mismatch after PostgreSQL readback`);
    }
  }
  return report;
}

export type JournalPassStatus = "ok" | "blocked" | "skipped" | "error";

export interface JournalPassReport {
  status: JournalPassStatus;
  reason?: string;
  cursorBefore: number;
  cursorAfter: number;
  /** Highest identifier SQLite ever handed out for this journal. */
  highWater: number;
  read: number;
  existing: number;
  written: number;
  /** False when the pass stopped at its row budget with rows left to copy. */
  complete: boolean;
}

export interface JournalPassOptions {
  schema: string;
  sourceId: string;
  batchSize?: number;
  /** Rows copied per journal per pass. */
  maxRows?: number;
  tables?: readonly JournalTable[];
}

const emptyJournalReport = (): JournalPassReport => ({
  status: "ok",
  cursorBefore: 0,
  cursorAfter: 0,
  highWater: 0,
  read: 0,
  existing: 0,
  written: 0,
  complete: true,
});

/**
 * Copies the journal rows after each table's cursor, `maxRows` at most, advancing the cursor after
 * every verified batch. A SQLite whose identifiers are behind the cursor was replaced by an older
 * file: that is blocked, never silently skipped.
 */
export async function syncJournalsIncremental(
  sql: SqlRunner,
  sqlite: Database,
  cursors: CursorStore,
  options: JournalPassOptions,
): Promise<Partial<Record<JournalTable, JournalPassReport>>> {
  const reports: Partial<Record<JournalTable, JournalPassReport>> = {};
  const batchSize = Math.min(options.batchSize ?? DEFAULT_JOURNAL_BATCH, LOOKUP_BATCH);
  const budget = options.maxRows ?? DEFAULT_JOURNAL_PASS_ROWS;
  for (const table of options.tables ?? JOURNAL_TABLES) {
    const report = emptyJournalReport();
    reports[table] = report;
    try {
      report.highWater = journalHighWater(sqlite, table);
      report.cursorBefore = report.cursorAfter = await cursors.get(options.sourceId, table);
      if (report.highWater < report.cursorBefore) {
        report.status = "blocked";
        report.reason = `${table}: SQLite never went past id ${report.highWater} but the cursor is at ${report.cursorBefore}; the database was replaced, use a new source id`;
        continue;
      }
      if (report.highWater === report.cursorBefore) continue;
      const plan = await planJournal(sql, options.schema, table);
      let drained = false;
      while (report.read < budget) {
        const rows = readJournalRows(
          sqlite,
          table,
          report.cursorAfter,
          Math.min(batchSize, budget - report.read),
        );
        if (rows.length === 0) {
          drained = true;
          break;
        }
        const done = await reconcileJournalBatch(sql, plan, rows, {
          apply: true,
          schema: options.schema,
          sourceId: options.sourceId,
          batchSize,
        });
        const lastId = rows.at(-1)!.id;
        await cursors.advance(options.sourceId, table, lastId, done.written);
        report.cursorAfter = lastId;
        report.read += rows.length;
        report.existing += done.existing;
        report.written += done.written;
      }
      report.complete = drained || report.cursorAfter >= report.highWater;
    } catch (error) {
      report.status = "error";
      report.reason = error instanceof Error ? error.message : String(error);
    }
  }
  return reports;
}
