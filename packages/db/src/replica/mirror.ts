// SPDX-License-Identifier: Apache-2.0
/**
 * Full mirror of one SQLite table into `schema.table`: rows missing from PostgreSQL are inserted,
 * rows that differ are updated, rows that vanished from SQLite are deleted (unless told otherwise).
 * Everything for one table happens in one transaction, in bounded batches, and is read back before
 * it commits. Without `apply` it only measures the gap.
 */
import { diffRows, type TableDiff } from "./diff";
import { planColumns, readPgColumns } from "./plan";
import {
  buildDelete,
  buildInsert,
  buildSelectByKeys,
  buildUpdate,
  canUpdate,
  qualified,
  quoteIdent,
  rowsPerStatement,
  splitBatches,
} from "./statements";
import type { Row, SqlClient, SqlRunner, SqliteColumn, TablePlan } from "./types";

export const DEFAULT_BATCH_SIZE = 500;
export const MAX_BATCH_SIZE = 5_000;
/** A run that would delete more than this share of a table (above `MASS_DELETE_FLOOR` rows) stops. */
export const MASS_DELETE_RATIO = 0.25;
export const MASS_DELETE_FLOOR = 50;
/** Serialises two sync runs: both would otherwise compute their diff from the same stale target. */
export const ADVISORY_LOCK = "shenron-bot-runtime-sync";

export type TableStatus =
  | "in-sync"
  | "drift"
  | "applied"
  | "skipped"
  | "blocked"
  | "error"
  /** Another run holds the advisory lock: nothing was read or written, try again later. */
  | "busy";

export interface TableReport {
  status: TableStatus;
  reason?: string;
  source: number;
  target: number;
  insert: number;
  update: number;
  delete: number;
  /** Primary keys held several times in PostgreSQL, rewritten as one row. */
  duplicates: number;
  /** PostgreSQL rows SQLite no longer has, left in place by `keepAbsent`. */
  keptAbsent: number;
  unchanged: number;
  changedColumns: Record<string, number>;
  /** Columns SQLite has and PostgreSQL lacks: not replicated until Infra adds them. */
  sqliteOnlyColumns: string[];
  /** Columns PostgreSQL has and SQLite lacks: left untouched. */
  pgOnlyColumns: string[];
  unsupportedColumns: string[];
  samples: TableDiff["samples"];
  /** How the pass compared the table: whole table, or only the rows that changed since the last pass. */
  mode?: "full" | "incremental";
  /** Incremental passes: rows compared with PostgreSQL (changed or removed since the last pass). */
  candidates?: number;
  /** Incremental passes: changed rows whose `updated_at` did not move (caught by the content hash). */
  changedWithoutMark?: number;
  /** The replica was not what the previous pass left: an outside write, or a repair. */
  drift?: string;
}

export interface MirrorOptions {
  schema: string;
  apply: boolean;
  /** Keep PostgreSQL rows that SQLite no longer has. */
  keepAbsent: boolean;
  allowMassDelete: boolean;
  batchSize: number;
  /**
   * `wait` (default) queues behind a run holding the advisory lock, as the manual script does;
   * `try` gives up at once with status `busy`, which a periodic pass prefers to a blocked connection.
   */
  lock?: "wait" | "try";
  /** Aborts any statement of the table's transaction that runs longer (PostgreSQL `statement_timeout`). */
  statementTimeoutMs?: number;
}

export const emptyReport = (source: number): TableReport => ({
  status: "skipped",
  source,
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
});

/** The reason a deletion must not run unattended, or null when it may proceed. */
export function massDeleteReason(
  table: string,
  sourceRows: number,
  targetRows: number,
  deletions: number,
): string | null {
  if (deletions === 0) return null;
  if (sourceRows === 0 && targetRows > 0) {
    return `${table}: SQLite table is empty while PostgreSQL holds ${targetRows} rows`;
  }
  if (deletions > Math.max(MASS_DELETE_FLOOR, targetRows * MASS_DELETE_RATIO)) {
    return `${table}: ${deletions} of ${targetRows} PostgreSQL rows would be deleted`;
  }
  return null;
}

/** Rows the write would touch; absent rows count only when they are going to be deleted. */
export function pendingChanges(diff: TableDiff, keepAbsent: boolean): number {
  return diff.insert.length + diff.update.length + (keepAbsent ? 0 : diff.absent.length);
}

export function reportOf(
  plan: TablePlan,
  diff: TableDiff,
  sourceRows: number,
  targetRows: number,
  keepAbsent: boolean,
): TableReport {
  return {
    ...emptyReport(sourceRows),
    status: pendingChanges(diff, keepAbsent) > 0 ? "drift" : "in-sync",
    target: targetRows,
    insert: diff.insert.length - diff.duplicated.length,
    update: diff.update.length,
    delete: keepAbsent ? 0 : diff.absent.length,
    keptAbsent: keepAbsent ? diff.absent.length : 0,
    duplicates: diff.duplicated.length,
    unchanged: diff.unchanged,
    changedColumns: diff.changedColumns,
    sqliteOnlyColumns: plan.sqliteOnly,
    pgOnlyColumns: plan.pgOnly,
    unsupportedColumns: plan.unsupported,
    samples: diff.samples,
  };
}

// ---------------------------------------------------------------------------
// PostgreSQL I/O
// ---------------------------------------------------------------------------

export async function readTarget(
  client: SqlRunner,
  schema: string,
  plan: TablePlan,
): Promise<Row[]> {
  const names = plan.columns.map((column) => quoteIdent(column.name)).join(", ");
  return [...(await client.unsafe(`SELECT ${names} FROM ${qualified(schema, plan.table)}`))];
}

/** The rows whose primary key is in `keys`, read in bounded statements. */
export async function readTargetByKeys(
  client: SqlRunner,
  schema: string,
  plan: TablePlan,
  keys: readonly (readonly unknown[])[],
  batchSize: number,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (const batch of splitBatches(keys, rowsPerStatement(batchSize, plan.primaryKey.length))) {
    const statement = buildSelectByKeys(schema, plan, batch);
    rows.push(...(await client.unsafe(statement.text, statement.params)));
  }
  return rows;
}

export async function countRows(client: SqlRunner, schema: string, table: string): Promise<number> {
  const rows = await client.unsafe(`SELECT count(*)::text AS n FROM ${qualified(schema, table)}`);
  return Number(rows[0]?.n ?? 0);
}

/**
 * Takes the advisory lock of the transaction (and arms its statement timeout). False when
 * `lock: "try"` and another run holds the lock.
 */
export async function acquireTableLock(
  tx: SqlRunner,
  options: Pick<MirrorOptions, "lock" | "statementTimeoutMs">,
): Promise<boolean> {
  if (options.statementTimeoutMs) {
    await tx.unsafe("SELECT set_config('statement_timeout', $1, true)", [
      String(options.statementTimeoutMs),
    ]);
  }
  if (options.lock === "try") {
    const rows = await tx.unsafe("SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked", [
      ADVISORY_LOCK,
    ]);
    return rows[0]?.locked === true;
  }
  await tx.unsafe("SELECT pg_advisory_xact_lock(hashtext($1))", [ADVISORY_LOCK]);
  return true;
}

export const busyReport = (source: number, plan?: TablePlan): TableReport => ({
  ...emptyReport(source),
  status: "busy",
  reason: "another sync holds the advisory lock",
  sqliteOnlyColumns: plan?.sqliteOnly ?? [],
  pgOnlyColumns: plan?.pgOnly ?? [],
  unsupportedColumns: plan?.unsupported ?? [],
});

export async function writeDiff(
  tx: SqlRunner,
  schema: string,
  plan: TablePlan,
  diff: TableDiff,
  options: Pick<MirrorOptions, "keepAbsent" | "batchSize">,
): Promise<void> {
  const removals = [...diff.duplicated, ...(options.keepAbsent ? [] : diff.absent)];
  const perStatement = rowsPerStatement(options.batchSize, plan.primaryKey.length);
  for (const keys of splitBatches(removals, perStatement)) {
    const statement = buildDelete(schema, plan, keys);
    await tx.unsafe(statement.text, statement.params);
  }
  const perInsert = rowsPerStatement(options.batchSize, plan.columns.length);
  for (const rows of splitBatches(diff.insert, perInsert)) {
    const statement = buildInsert(schema, plan, rows);
    await tx.unsafe(statement.text, statement.params);
  }
  if (!canUpdate(plan)) return;
  for (const rows of splitBatches(diff.update, Math.min(options.batchSize, 200))) {
    // One connection: the statements are pipelined and run in order.
    await Promise.all(
      rows.map((row) => {
        const statement = buildUpdate(schema, plan, row);
        return tx.unsafe(statement.text, statement.params);
      }),
    );
  }
}

/**
 * Mirrors one SQLite table into `schema.table`. Without `apply` it only measures the gap.
 * With `apply` the whole table is rewritten in one transaction that re-reads the table and
 * rolls back unless PostgreSQL then equals SQLite.
 */
export async function mirrorTable(
  sql: SqlClient,
  table: string,
  sqliteColumns: readonly SqliteColumn[],
  sourceRows: readonly Row[],
  options: MirrorOptions,
): Promise<TableReport> {
  const pgColumns = await readPgColumns(sql, options.schema, table);
  if (pgColumns.length === 0) {
    return {
      ...emptyReport(sourceRows.length),
      reason: `${options.schema}.${table} does not exist in PostgreSQL (Infra migration needed)`,
    };
  }
  const planned = planColumns(table, sqliteColumns, pgColumns);
  if (!planned.ok)
    return { ...emptyReport(sourceRows.length), status: "error", reason: planned.reason };
  return mirrorPlanned(sql, planned.plan, sourceRows, options);
}

/** {@link mirrorTable} once the plan is known. */
export async function mirrorPlanned(
  sql: SqlClient,
  plan: TablePlan,
  sourceRows: readonly Row[],
  options: MirrorOptions,
): Promise<TableReport> {
  const table = plan.table;
  try {
    if (!options.apply) {
      const target = await readTarget(sql, options.schema, plan);
      const diff = diffRows(plan, sourceRows, target);
      const report = reportOf(plan, diff, sourceRows.length, target.length, options.keepAbsent);
      const refusal = options.keepAbsent
        ? null
        : massDeleteReason(table, sourceRows.length, target.length, diff.absent.length);
      if (refusal && !options.allowMassDelete) {
        return {
          ...report,
          status: "blocked",
          reason: `${refusal}; rerun with --allow-mass-delete`,
        };
      }
      return report;
    }

    return await sql.begin(async (tx) => {
      if (!(await acquireTableLock(tx, options))) return busyReport(sourceRows.length, plan);
      const target = await readTarget(tx, options.schema, plan);
      const diff = diffRows(plan, sourceRows, target);
      const report = reportOf(plan, diff, sourceRows.length, target.length, options.keepAbsent);
      const refusal = options.keepAbsent
        ? null
        : massDeleteReason(table, sourceRows.length, target.length, diff.absent.length);
      if (refusal && !options.allowMassDelete) {
        return {
          ...report,
          status: "blocked" as const,
          reason: `${refusal}; rerun with --allow-mass-delete`,
        };
      }
      if (report.status === "in-sync") return report;
      await writeDiff(tx, options.schema, plan, diff, options);

      const verify = diffRows(plan, sourceRows, await readTarget(tx, options.schema, plan));
      const remaining = pendingChanges(verify, options.keepAbsent) + verify.duplicated.length;
      if (remaining > 0) {
        throw new Error(`${table}: ${remaining} rows still differ after the write, rolled back`);
      }
      return { ...report, status: "applied" as const };
    });
  } catch (error) {
    return {
      ...emptyReport(sourceRows.length),
      status: "error",
      reason: error instanceof Error ? error.message : String(error),
      sqliteOnlyColumns: plan.sqliteOnly,
      pgOnlyColumns: plan.pgOnly,
      unsupportedColumns: plan.unsupported,
    };
  }
}
