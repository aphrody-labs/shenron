// SPDX-License-Identifier: Apache-2.0
/**
 * Incremental mirror of the state tables, cheap enough to run every few minutes.
 *
 * A full mirror reads the whole PostgreSQL table to compare it with SQLite. Between two full
 * verifications this engine trusts what the previous pass left (its memo: one content hash per
 * primary key, the number of rows PostgreSQL then held) and only talks to PostgreSQL about what
 * changed since:
 *
 *  1. every SQLite row is hashed (local, no network) and compared with the memo; a row is a
 *     candidate when its key is new, its hash moved, or, for tables that keep one (`users`), its
 *     `updated_at` moved (the hash still catches a writer that forgot to bump it);
 *  2. keys that left the memo's set are candidates for deletion;
 *  3. no candidate: one `count(*)` confirms PostgreSQL still holds the row count the last pass left;
 *  4. candidates: one transaction takes the advisory lock, re-checks the count, reads *only* the
 *     candidates' PostgreSQL rows, runs the usual primary-key diff on them (a touched row that is
 *     already equal writes nothing), applies the mass-delete guard, writes, and verifies the count
 *     and the candidates again.
 *
 * Anything unexpected (a count that differs, an error, a table the memo does not know, the next full
 * verification being due) falls back to the full mirror of {@link mirrorPlanned}, which also rebuilds
 * the memo. The memo lives in memory: a restart starts with one full pass.
 */
import { diffRows } from "./diff";
import { keyString } from "./diff";
import {
  acquireTableLock,
  busyReport,
  countRows,
  emptyReport,
  massDeleteReason,
  mirrorPlanned,
  pendingChanges,
  readTargetByKeys,
  reportOf,
  writeDiff,
  type MirrorOptions,
  type TableReport,
} from "./mirror";
import { planColumns, readPgColumns } from "./plan";
import type { Row, SqlClient, SqliteColumn, TablePlan } from "./types";
import { canonicalValue } from "./values";

/** Tables whose SQLite rows carry a modification stamp, compared before the content hash. */
export const DEFAULT_CHANGE_COLUMNS: Readonly<Record<string, string>> = { users: "updated_at" };
/** A table is verified against its whole PostgreSQL counterpart at least this often. */
export const DEFAULT_FULL_VERIFY_MS = 4 * 3_600_000;

export interface MemoEntry {
  /** Primary key tuple, as read from SQLite (needed to delete or fetch the row later). */
  key: unknown[];
  hash: string;
  /** Canonical value of the change column, null for tables without one. */
  mark: string | null;
}

export interface TableMemo {
  plan: TablePlan;
  entries: Map<string, MemoEntry>;
  /** Rows PostgreSQL held when the memo was built (equals the SQLite row count it mirrored). */
  targetCount: number;
  /** When the table was last compared with the whole PostgreSQL table. */
  fullAt: number;
}

export type ReplicaMemo = Map<string, TableMemo>;

export interface IncrementalOptions extends MirrorOptions {
  memo: ReplicaMemo;
  fullVerifyMs?: number;
  changeColumns?: Readonly<Record<string, string>>;
  now?: () => number;
}

const columnNames = new WeakMap<TablePlan, string[]>();

// One terminator per JavaScript type, so `1`, `"1"` and `1.0` never hash alike.
const END_STRING = String.fromCharCode(31);
const END_BIGINT = String.fromCharCode(30);
const END_NUMBER = String.fromCharCode(29);
const END_BOOLEAN = String.fromCharCode(28);
const END_NULL = String.fromCharCode(27);
const END_OTHER = String.fromCharCode(26);

/**
 * A content hash of every copied column of a row as SQLite returned it. Both sides of a comparison
 * are read the same way (the previous pass and this one), so no conversion is needed, which keeps a
 * pass over tens of thousands of rows cheap.
 */
export function rowHash(plan: TablePlan, row: Row): string {
  let names = columnNames.get(plan);
  if (!names) {
    names = plan.columns.map((column) => column.name);
    columnNames.set(plan, names);
  }
  let text = "";
  for (const name of names) {
    const value = row[name];
    switch (typeof value) {
      case "string":
        text += value + END_STRING;
        break;
      case "bigint":
        text += value.toString() + END_BIGINT;
        break;
      case "number":
        text += value + END_NUMBER;
        break;
      case "boolean":
        text += (value ? "1" : "0") + END_BOOLEAN;
        break;
      default:
        if (value === null || value === undefined) text += END_NULL;
        else if (value instanceof Uint8Array)
          text += Buffer.from(value).toString("hex") + END_OTHER;
        else text += JSON.stringify(value) + END_OTHER;
    }
  }
  return Bun.hash(text).toString(36);
}

export interface Classification {
  entries: Map<string, MemoEntry>;
  /** Source rows that are new or changed since `previous`. */
  changed: Row[];
  /** Key tuples of `previous` rows no longer in the source. */
  gone: unknown[][];
  added: number;
  /** Changed rows detected through the change column. */
  byMark: number;
  /** Changed rows detected through the content hash only. */
  byHash: number;
}

/**
 * Hashes every source row and compares it with the previous pass. Throws on a NULL or duplicated
 * primary key, like the full diff does.
 */
export function classifyChanges(
  plan: TablePlan,
  rows: readonly Row[],
  previous: ReadonlyMap<string, MemoEntry> | undefined,
  changeColumn?: string,
): Classification {
  const entries = new Map<string, MemoEntry>();
  const changed: Row[] = [];
  let added = 0;
  let byMark = 0;
  let byHash = 0;
  const markType = changeColumn
    ? plan.columns.find((column) => column.name === changeColumn)?.type
    : undefined;
  for (const row of rows) {
    const missing = plan.primaryKey.find((name) => row[name] === null || row[name] === undefined);
    if (missing) throw new Error(`${plan.table}: NULL in primary key column ${missing}`);
    const key = keyString(row, plan, "source");
    if (entries.has(key)) throw new Error(`${plan.table}: duplicate primary key ${key} in SQLite`);
    const entry: MemoEntry = {
      key: plan.primaryKey.map((name) => row[name]),
      hash: rowHash(plan, row),
      mark: changeColumn && markType ? canonicalValue(row[changeColumn], markType, "source") : null,
    };
    entries.set(key, entry);
    if (!previous) continue;
    const before = previous.get(key);
    if (!before) {
      added++;
      changed.push(row);
    } else if (entry.mark !== before.mark) {
      byMark++;
      changed.push(row);
    } else if (entry.hash !== before.hash) {
      byHash++;
      changed.push(row);
    }
  }
  const gone: unknown[][] = [];
  if (previous) {
    for (const [key, entry] of previous) if (!entries.has(key)) gone.push(entry.key);
  }
  return { entries, changed, gone, added, byMark, byHash };
}

/** The cheap path gave up: PostgreSQL is not what the previous pass left, compare it in full. */
interface Fallback {
  fallback: string;
}
const isFallback = (value: TableReport | Fallback): value is Fallback => "fallback" in value;

/**
 * One state table of one pass: incremental when the memo allows it, a full mirror (which rebuilds
 * the memo) otherwise. `options.apply` must be true: a dry run is always full.
 */
export async function syncStateTable(
  sql: SqlClient,
  table: string,
  sqliteColumns: readonly SqliteColumn[],
  rows: readonly Row[],
  options: IncrementalOptions,
): Promise<TableReport> {
  const now = options.now ?? Date.now;
  const memo = options.memo.get(table);
  const changeColumn = (options.changeColumns ?? DEFAULT_CHANGE_COLUMNS)[table];
  const due = memo ? now() - memo.fullAt >= (options.fullVerifyMs ?? DEFAULT_FULL_VERIFY_MS) : true;

  let drift: string | undefined;
  if (memo && !due && options.apply && !options.keepAbsent) {
    try {
      const result = await incrementalPass(sql, memo, rows, changeColumn, options);
      if (!isFallback(result)) return result;
      drift = result.fallback;
    } catch (error) {
      options.memo.delete(table);
      return failure(rows.length, memo.plan, error);
    }
  }
  return fullPass(sql, table, sqliteColumns, rows, changeColumn, options, memo, drift);
}

function failure(source: number, plan: TablePlan, error: unknown): TableReport {
  return {
    ...emptyReport(source),
    status: "error",
    reason: error instanceof Error ? error.message : String(error),
    sqliteOnlyColumns: plan.sqliteOnly,
    pgOnlyColumns: plan.pgOnly,
    unsupportedColumns: plan.unsupported,
  };
}

async function fullPass(
  sql: SqlClient,
  table: string,
  sqliteColumns: readonly SqliteColumn[],
  rows: readonly Row[],
  changeColumn: string | undefined,
  options: IncrementalOptions,
  previous?: TableMemo,
  fallbackDrift?: string,
): Promise<TableReport> {
  const now = options.now ?? Date.now;
  options.memo.delete(table);
  const pgColumns = await readPgColumns(sql, options.schema, table);
  if (pgColumns.length === 0) {
    return {
      ...emptyReport(rows.length),
      reason: `${options.schema}.${table} does not exist in PostgreSQL (Infra migration needed)`,
    };
  }
  const planned = planColumns(table, sqliteColumns, pgColumns);
  if (!planned.ok) return { ...emptyReport(rows.length), status: "error", reason: planned.reason };
  const { plan } = planned;

  let classification: Classification;
  try {
    classification = classifyChanges(plan, rows, previous?.entries, changeColumn);
  } catch (error) {
    return failure(rows.length, plan, error);
  }
  const report = await mirrorPlanned(sql, plan, rows, options);
  report.mode = "full";
  if ((report.status === "applied" || report.status === "in-sync") && !options.keepAbsent) {
    options.memo.set(table, {
      plan,
      entries: classification.entries,
      targetCount: rows.length,
      fullAt: now(),
    });
  }
  if (previous && (report.status === "applied" || report.status === "in-sync")) {
    // The previous pass believed PostgreSQL equal to SQLite as it then was: writing more rows than
    // SQLite changed since means someone else moved PostgreSQL.
    const expected = classification.changed.length + classification.gone.length;
    const written = report.insert + report.update + report.delete + report.duplicates;
    if (fallbackDrift) report.drift = fallbackDrift;
    else if (written > expected) {
      report.drift = `full comparison wrote ${written} rows, SQLite changed ${expected} since the previous pass`;
    }
  }
  return report;
}

async function incrementalPass(
  sql: SqlClient,
  memo: TableMemo,
  rows: readonly Row[],
  changeColumn: string | undefined,
  options: IncrementalOptions,
): Promise<TableReport | Fallback> {
  const { plan } = memo;
  const table = plan.table;
  const batch = options.batchSize;
  const classification = classifyChanges(plan, rows, memo.entries, changeColumn);
  const candidates = classification.changed.length + classification.gone.length;
  const annotate = (report: TableReport): TableReport => ({
    ...report,
    mode: "incremental",
    candidates,
    changedWithoutMark: classification.byHash,
  });
  const remember = () => {
    memo.entries = classification.entries;
    memo.targetCount = rows.length;
  };
  const drifted = (count: number): Fallback => ({
    fallback: `PostgreSQL holds ${count} rows, the previous pass left ${memo.targetCount}`,
  });

  if (candidates === 0) {
    const count = await countRows(sql, options.schema, table);
    if (count !== memo.targetCount) {
      options.memo.delete(table);
      return drifted(count);
    }
    return annotate({
      ...emptyReport(rows.length),
      status: "in-sync",
      target: count,
      unchanged: rows.length,
      sqliteOnlyColumns: plan.sqliteOnly,
      pgOnlyColumns: plan.pgOnly,
      unsupportedColumns: plan.unsupported,
    });
  }

  const keys = [
    ...classification.changed.map((row) => plan.primaryKey.map((name) => row[name])),
    ...classification.gone,
  ];
  return sql.begin(async (tx) => {
    if (!(await acquireTableLock(tx, options))) return annotate(busyReport(rows.length, plan));
    const count = await countRows(tx, options.schema, table);
    if (count !== memo.targetCount) {
      options.memo.delete(table);
      return drifted(count);
    }
    const target = await readTargetByKeys(tx, options.schema, plan, keys, batch);
    const diff = diffRows(plan, classification.changed, target);
    const report = annotate(reportOf(plan, diff, rows.length, count, false));
    const refusal = massDeleteReason(table, rows.length, count, diff.absent.length);
    if (refusal && !options.allowMassDelete) {
      return {
        ...report,
        status: "blocked" as const,
        reason: `${refusal}; rerun with --allow-mass-delete`,
      };
    }
    if (pendingChanges(diff, false) === 0 && diff.duplicated.length === 0) {
      remember();
      return report;
    }
    await writeDiff(tx, options.schema, plan, diff, options);

    const after = await countRows(tx, options.schema, table);
    if (after !== rows.length) {
      throw new Error(
        `${table}: ${after} rows after the write, expected ${rows.length}, rolled back`,
      );
    }
    const verify = diffRows(
      plan,
      classification.changed,
      await readTargetByKeys(tx, options.schema, plan, keys, batch),
    );
    const remaining = pendingChanges(verify, false) + verify.duplicated.length;
    if (remaining > 0) {
      throw new Error(`${table}: ${remaining} rows still differ after the write, rolled back`);
    }
    remember();
    return { ...report, status: "applied" as const };
  });
}
