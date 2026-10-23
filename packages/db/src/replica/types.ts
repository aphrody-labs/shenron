// SPDX-License-Identifier: Apache-2.0
/**
 * Shared shapes of the SQLite -> PostgreSQL replica engine.
 *
 * The engine talks to PostgreSQL through two methods only (`unsafe` and `begin`), which both
 * postgres-js and Bun.SQL provide, so the same code serves the manual scripts (postgres-js) and the
 * bot (the Bun.SQL pool of `PgService`).
 */

/** A row as a SQL client or `bun:sqlite` returns it. */
export type Row = Record<string, unknown>;

/** Anything that can run a statement with bind parameters: a pool, a reserved connection, a transaction. */
export interface SqlRunner {
  unsafe(text: string, params?: unknown[]): PromiseLike<readonly Row[]>;
}

/** A pool that can also open a transaction. */
export interface SqlClient extends SqlRunner {
  begin<T>(run: (tx: SqlRunner) => Promise<T>): Promise<T>;
}

/** A PostgreSQL column as `information_schema` reports it (`type` is the `udt_name`). */
export interface PgColumn {
  name: string;
  type: string;
  /** `GENERATED ALWAYS` columns cannot be written at all. */
  generated: boolean;
  /** `GENERATED ALWAYS AS IDENTITY` columns need `OVERRIDING SYSTEM VALUE`. */
  identityAlways: boolean;
}

export interface SqliteColumn {
  name: string;
  /** 1-based position in the primary key, 0 when the column is not part of it. */
  pk: number;
}

export interface PlannedColumn {
  name: string;
  type: string;
  primary: boolean;
}

export interface TablePlan {
  table: string;
  primaryKey: string[];
  /** Columns present on both sides with a supported type, primary key first. */
  columns: PlannedColumn[];
  sqliteOnly: string[];
  pgOnly: string[];
  /** Present on both sides but of a type the mirror does not convert. */
  unsupported: string[];
  identityAlways: boolean;
}

export type PlanResult = { ok: true; plan: TablePlan } | { ok: false; reason: string };

/** A SQLite table read in one statement, with its column catalogue. */
export interface StateSnapshot {
  columns: SqliteColumn[];
  rows: Row[];
}
