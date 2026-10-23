// SPDX-License-Identifier: Apache-2.0
/**
 * Mirror engine for the bot's state tables: SQLite (the runtime source) into the PostgreSQL
 * schema `bot` (the replica). Used by `sync-bot-runtime-sqlite-to-postgres.ts`.
 *
 * The replica is created outside this repository (Infra migrations), so nothing here assumes its
 * exact layout: the PostgreSQL columns are read from `information_schema` at run time and only the
 * columns present on both sides are copied, each value converted to the PostgreSQL column type.
 * A table is mirrored by primary key: rows missing from PostgreSQL are inserted, rows that differ
 * are updated, rows that vanished from SQLite are deleted (unless told otherwise). Everything for
 * one table happens in one transaction, in bounded batches, and is read back before it commits.
 */
import type postgres from "postgres";

export type Row = Record<string, unknown>;
export type Sql = postgres.Sql;
type Queryable = Pick<postgres.Sql, "unsafe">;

/** Hard ceiling of bind parameters per statement is 65535; stay well below it. */
const MAX_PARAMETERS = 60_000;
export const DEFAULT_BATCH_SIZE = 500;
export const MAX_BATCH_SIZE = 5_000;
/** A run that would delete more than this share of a table (above `MASS_DELETE_FLOOR` rows) stops. */
export const MASS_DELETE_RATIO = 0.25;
export const MASS_DELETE_FLOOR = 50;
const SAMPLE_SIZE = 5;
/** Serialises two sync runs: both would otherwise compute their diff from the same stale target. */
const ADVISORY_LOCK = "shenron-bot-runtime-sync";

const INTEGER_TYPES = new Set(["int2", "int4", "int8"]);
const FLOAT_TYPES = new Set(["float4", "float8"]);
const TEXT_TYPES = new Set(["text", "varchar", "bpchar", "name", "citext"]);
const JSON_TYPES = new Set(["json", "jsonb"]);
const TIME_TYPES = new Set(["timestamp", "timestamptz", "date"]);
const SUPPORTED_TYPES = new Set([
  ...INTEGER_TYPES,
  ...FLOAT_TYPES,
  ...TEXT_TYPES,
  ...JSON_TYPES,
  ...TIME_TYPES,
  "numeric",
  "bool",
]);

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

/** Decides what to copy for one table from the two column lists. */
export function planColumns(
  table: string,
  sqlite: readonly SqliteColumn[],
  pg: readonly PgColumn[],
): PlanResult {
  const primaryKey = sqlite
    .filter((column) => column.pk > 0)
    .toSorted((a, b) => a.pk - b.pk)
    .map((column) => column.name);
  if (primaryKey.length === 0) return { ok: false, reason: "SQLite table has no primary key" };
  const pgByName = new Map(pg.map((column) => [column.name, column]));
  const sqliteNames = new Set(sqlite.map((column) => column.name));
  const columns: PlannedColumn[] = [];
  const unsupported: string[] = [];
  let identityAlways = false;
  for (const column of sqlite) {
    const target = pgByName.get(column.name);
    if (!target || target.generated) continue;
    if (!SUPPORTED_TYPES.has(target.type)) {
      unsupported.push(`${column.name}:${target.type}`);
      continue;
    }
    if (target.identityAlways) identityAlways = true;
    columns.push({ name: column.name, type: target.type, primary: column.pk > 0 });
  }
  for (const key of primaryKey) {
    if (!pgByName.has(key)) {
      return { ok: false, reason: `PostgreSQL table lacks the primary key column ${key}` };
    }
    if (!columns.some((column) => column.name === key)) {
      return { ok: false, reason: `primary key column ${key} has an unsupported PostgreSQL type` };
    }
  }
  return {
    ok: true,
    plan: {
      table,
      primaryKey,
      columns: columns.toSorted(
        (a, b) => Number(b.primary) - Number(a.primary) || (a.name < b.name ? -1 : 1),
      ),
      sqliteOnly: sqlite
        .map((column) => column.name)
        .filter((name) => !pgByName.has(name))
        .toSorted(),
      pgOnly: pg
        .filter((column) => !sqliteNames.has(column.name))
        .map((column) => column.name)
        .toSorted(),
      unsupported: unsupported.toSorted(),
      identityAlways,
    },
  };
}

// ---------------------------------------------------------------------------
// Value conversion
// ---------------------------------------------------------------------------

type Side = "source" | "target";

/** SQLite stores either seconds or milliseconds in integer timestamp columns. */
function epochMilliseconds(value: number): number {
  return Math.abs(value) >= 1e11 ? value : value * 1000;
}

/** JSON with sorted keys, so two equal documents compare equal whatever their key order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, member]) => member !== undefined)
    .toSorted(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${stableStringify(member)}`).join(",")}}`;
}

function booleanOf(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === 0 || value === 1) return value === 1;
  if (typeof value === "bigint" && (value === 0n || value === 1n)) return value === 1n;
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (text === "1" || text === "t" || text === "true") return true;
    if (text === "0" || text === "f" || text === "false") return false;
  }
  return undefined;
}

/**
 * A value in the shape both sides compare in. The same type means the same string, whatever the
 * driver returned: `int8` arrives as text from PostgreSQL and as a number from SQLite, `bool` as
 * true/false against 0/1, `jsonb` as a parsed document against SQLite text, a timestamp as a Date
 * against epoch milliseconds.
 */
export function canonicalValue(value: unknown, pgType: string, side: Side): string | null {
  if (value === null || value === undefined) return null;
  if (INTEGER_TYPES.has(pgType)) {
    if (typeof value === "boolean") return value ? "1" : "0";
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
      return BigInt(value.trim()).toString();
    }
    return String(Number(value));
  }
  if (FLOAT_TYPES.has(pgType) || pgType === "numeric") {
    const number = Number(value);
    return Number.isFinite(number) ? String(number) : String(value);
  }
  if (pgType === "bool") {
    const flag = booleanOf(value);
    return flag === undefined ? String(value) : flag ? "1" : "0";
  }
  if (JSON_TYPES.has(pgType)) {
    // A string read from PostgreSQL is a JSON string scalar; one read from SQLite is JSON text.
    if (typeof value === "string" && side === "source") {
      try {
        return stableStringify(JSON.parse(value));
      } catch {
        return `invalid-json:${value}`;
      }
    }
    return stableStringify(value);
  }
  if (TIME_TYPES.has(pgType)) {
    if (value instanceof Date) return String(value.getTime());
    if (typeof value === "number") return String(epochMilliseconds(value));
    const parsed = Date.parse(String(value));
    return Number.isNaN(parsed) ? String(value) : String(parsed);
  }
  if (value instanceof Uint8Array) return `blob:${Buffer.from(value).toString("hex")}`;
  return String(value);
}

/** The bind parameter for a SQLite value; throws a readable error for an inconvertible one. */
export function toPgParam(value: unknown, pgType: string): unknown {
  if (value === null || value === undefined) return null;
  if (INTEGER_TYPES.has(pgType)) {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) return value.trim();
    throw new Error(`${JSON.stringify(value)} is not an integer for ${pgType}`);
  }
  if (FLOAT_TYPES.has(pgType) || pgType === "numeric") {
    const number = Number(value);
    if (typeof value === "boolean" || !Number.isFinite(number)) {
      throw new Error(`${JSON.stringify(value)} is not a number for ${pgType}`);
    }
    return pgType === "numeric" ? String(number) : number;
  }
  if (pgType === "bool") {
    const flag = booleanOf(value);
    if (flag === undefined) throw new Error(`${JSON.stringify(value)} is not a boolean`);
    return flag;
  }
  if (JSON_TYPES.has(pgType)) {
    if (typeof value === "string") {
      try {
        JSON.parse(value);
      } catch {
        throw new Error(`invalid JSON for ${pgType}: ${value.slice(0, 40)}`);
      }
      return value;
    }
    return JSON.stringify(value);
  }
  if (TIME_TYPES.has(pgType)) {
    const milliseconds =
      value instanceof Date
        ? value.getTime()
        : typeof value === "number"
          ? epochMilliseconds(value)
          : Date.parse(String(value));
    if (!Number.isFinite(milliseconds)) throw new Error(`${JSON.stringify(value)} is not a date`);
    const iso = new Date(milliseconds).toISOString();
    return pgType === "date" ? iso.slice(0, 10) : iso;
  }
  if (value instanceof Uint8Array) throw new Error(`a blob cannot be written to ${pgType}`);
  return String(value);
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export interface TableDiff {
  /** Source rows with no counterpart in PostgreSQL. */
  insert: Row[];
  /** Source rows whose counterpart differs. */
  update: Row[];
  /** Key tuples (PostgreSQL values) of rows no longer in SQLite. */
  absent: unknown[][];
  /** Key tuples present several times in PostgreSQL (no unique constraint there): rewritten. */
  duplicated: unknown[][];
  unchanged: number;
  /** How many updated rows differ in each column. */
  changedColumns: Record<string, number>;
  samples: { insert: string[]; update: string[]; delete: string[] };
}

function keyString(row: Row, plan: TablePlan, side: Side): string {
  const types = new Map(plan.columns.map((column) => [column.name, column.type]));
  return JSON.stringify(
    plan.primaryKey.map((name) => canonicalValue(row[name], types.get(name)!, side)),
  );
}

/** Compares the SQLite rows with the PostgreSQL rows of one table, by primary key. */
export function diffRows(
  plan: TablePlan,
  source: readonly Row[],
  target: readonly Row[],
): TableDiff {
  const copied = plan.columns.filter((column) => !column.primary);
  const targetByKey = new Map<string, Row[]>();
  for (const row of target) {
    const key = keyString(row, plan, "target");
    const list = targetByKey.get(key);
    if (list) list.push(row);
    else targetByKey.set(key, [row]);
  }

  const diff: TableDiff = {
    insert: [],
    update: [],
    absent: [],
    duplicated: [],
    unchanged: 0,
    changedColumns: {},
    samples: { insert: [], update: [], delete: [] },
  };
  const seen = new Set<string>();
  const sample = (bucket: string[], key: string) => {
    if (bucket.length < SAMPLE_SIZE) bucket.push(key);
  };

  for (const row of source) {
    // A NULL in a SQLite primary key (allowed for non-integer keys) cannot be matched.
    const missing = plan.primaryKey.find((name) => row[name] === null || row[name] === undefined);
    if (missing) throw new Error(`${plan.table}: NULL in primary key column ${missing}`);
    const key = keyString(row, plan, "source");
    if (seen.has(key)) throw new Error(`${plan.table}: duplicate primary key ${key} in SQLite`);
    seen.add(key);
    const found = targetByKey.get(key);
    if (!found) {
      diff.insert.push(row);
      sample(diff.samples.insert, key);
      continue;
    }
    if (found.length > 1) {
      diff.duplicated.push(plan.primaryKey.map((name) => found[0]![name]));
      diff.insert.push(row);
      sample(diff.samples.update, key);
      continue;
    }
    const current = found[0]!;
    const changed = copied.filter(
      (column) =>
        canonicalValue(row[column.name], column.type, "source") !==
        canonicalValue(current[column.name], column.type, "target"),
    );
    if (changed.length === 0) {
      diff.unchanged++;
      continue;
    }
    diff.update.push(row);
    sample(diff.samples.update, key);
    for (const column of changed) {
      diff.changedColumns[column.name] = (diff.changedColumns[column.name] ?? 0) + 1;
    }
  }

  for (const [key, rows] of targetByKey) {
    if (seen.has(key)) continue;
    diff.absent.push(plan.primaryKey.map((name) => rows[0]![name]));
    sample(diff.samples.delete, key);
  }
  return diff;
}

// ---------------------------------------------------------------------------
// SQL generation
// ---------------------------------------------------------------------------

/** Identifiers come from `information_schema` and the SQLite catalogue, but are still checked. */
export function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return `"${name}"`;
}

/** `$n` with the cast that fixes its type (JSON goes through text: postgres.js re-encodes json). */
export function placeholder(index: number, type: string): string {
  if (JSON_TYPES.has(type)) return `($${index}::text)::${type}`;
  if (TEXT_TYPES.has(type) && type !== "text") return `$${index}::text`;
  return `$${index}::${type}`;
}

export function splitBatches<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error("Batch size must be a positive integer");
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    batches.push(items.slice(start, start + size));
  }
  return batches;
}

/** Rows per statement: the requested batch, lowered so a statement never exceeds the bind limit. */
export function rowsPerStatement(requested: number, parametersPerRow: number): number {
  return Math.max(
    1,
    Math.min(requested, Math.floor(MAX_PARAMETERS / Math.max(1, parametersPerRow))),
  );
}

const qualified = (schema: string, table: string) => `${quoteIdent(schema)}.${quoteIdent(table)}`;

/** Converts one value, appends it to `params` and returns its typed placeholder. */
function bindParameter(
  params: unknown[],
  plan: TablePlan,
  column: PlannedColumn,
  row: Row,
): string {
  try {
    params.push(toPgParam(row[column.name], column.type));
  } catch (error) {
    throw new Error(
      `${plan.table}.${column.name} (key ${keyString(row, plan, "source")}): ${(error as Error).message}`,
      { cause: error },
    );
  }
  return placeholder(params.length, column.type);
}

export function buildInsert(
  schema: string,
  plan: TablePlan,
  rows: readonly Row[],
): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const cells = plan.columns.map((column) => bindParameter(params, plan, column, row));
    return `(${cells.join(", ")})`;
  });
  const names = plan.columns.map((column) => quoteIdent(column.name)).join(", ");
  const overriding = plan.identityAlways ? " OVERRIDING SYSTEM VALUE" : "";
  return {
    text: `INSERT INTO ${qualified(schema, plan.table)} (${names})${overriding} VALUES ${tuples.join(", ")}`,
    params,
  };
}

/** The columns an UPDATE may set: everything copied except the primary key. */
function updatable(plan: TablePlan): PlannedColumn[] {
  return plan.columns.filter((column) => !column.primary);
}

export function canUpdate(plan: TablePlan): boolean {
  return updatable(plan).length > 0;
}

export function buildUpdate(
  schema: string,
  plan: TablePlan,
  row: Row,
): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const bind = (column: PlannedColumn) => bindParameter(params, plan, column, row);
  const assignments = updatable(plan).map(
    (column) => `${quoteIdent(column.name)} = ${bind(column)}`,
  );
  const keys = plan.columns
    .filter((column) => column.primary)
    .toSorted((a, b) => plan.primaryKey.indexOf(a.name) - plan.primaryKey.indexOf(b.name))
    .map((column) => `${quoteIdent(column.name)} = ${bind(column)}`);
  return {
    text: `UPDATE ${qualified(schema, plan.table)} SET ${assignments.join(", ")} WHERE ${keys.join(" AND ")}`,
    params,
  };
}

export function buildDelete(
  schema: string,
  plan: TablePlan,
  keys: readonly (readonly unknown[])[],
): { text: string; params: unknown[] } {
  const params: unknown[] = [];
  const types = plan.primaryKey.map(
    (name) => plan.columns.find((column) => column.name === name)!.type,
  );
  const tuples = keys.map((key) => {
    const cells = key.map((value, position) => {
      params.push(toPgParam(value, types[position]!));
      return placeholder(params.length, types[position]!);
    });
    return plan.primaryKey.length === 1 ? cells[0]! : `(${cells.join(", ")})`;
  });
  const columns = plan.primaryKey.map(quoteIdent);
  const left = columns.length === 1 ? columns[0]! : `(${columns.join(", ")})`;
  return {
    text: `DELETE FROM ${qualified(schema, plan.table)} WHERE ${left} IN (${tuples.join(", ")})`,
    params,
  };
}

// ---------------------------------------------------------------------------
// PostgreSQL I/O
// ---------------------------------------------------------------------------

/** Columns of `schema.table`, empty when the table does not exist. */
export async function readPgColumns(
  client: Queryable,
  schema: string,
  table: string,
): Promise<PgColumn[]> {
  const rows = await client.unsafe(
    `SELECT column_name, udt_name, is_generated, identity_generation
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position`,
    [schema, table],
  );
  return rows.map((row) => ({
    name: String(row.column_name),
    type: String(row.udt_name),
    generated: row.is_generated === "ALWAYS",
    identityAlways: row.identity_generation === "ALWAYS",
  }));
}

async function readTarget(client: Queryable, schema: string, plan: TablePlan): Promise<Row[]> {
  const names = plan.columns.map((column) => quoteIdent(column.name)).join(", ");
  return [...(await client.unsafe(`SELECT ${names} FROM ${qualified(schema, plan.table)}`))];
}

export type TableStatus = "in-sync" | "drift" | "applied" | "skipped" | "blocked" | "error";

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
}

export interface MirrorOptions {
  schema: string;
  apply: boolean;
  /** Keep PostgreSQL rows that SQLite no longer has. */
  keepAbsent: boolean;
  allowMassDelete: boolean;
  batchSize: number;
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
function pendingChanges(diff: TableDiff, keepAbsent: boolean): number {
  return diff.insert.length + diff.update.length + (keepAbsent ? 0 : diff.absent.length);
}

function reportOf(
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

async function writeDiff(
  tx: Queryable,
  schema: string,
  plan: TablePlan,
  diff: TableDiff,
  options: MirrorOptions,
): Promise<void> {
  const removals = [...diff.duplicated, ...(options.keepAbsent ? [] : diff.absent)];
  const perStatement = rowsPerStatement(options.batchSize, plan.primaryKey.length);
  for (const keys of splitBatches(removals, perStatement)) {
    const statement = buildDelete(schema, plan, keys);
    await tx.unsafe(statement.text, statement.params as never[]);
  }
  const perInsert = rowsPerStatement(options.batchSize, plan.columns.length);
  for (const rows of splitBatches(diff.insert, perInsert)) {
    const statement = buildInsert(schema, plan, rows);
    await tx.unsafe(statement.text, statement.params as never[]);
  }
  if (!canUpdate(plan)) return;
  for (const rows of splitBatches(diff.update, Math.min(options.batchSize, 200))) {
    // One connection: the statements are pipelined and run in order.
    await Promise.all(
      rows.map((row) => {
        const statement = buildUpdate(schema, plan, row);
        return tx.unsafe(statement.text, statement.params as never[]);
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
  sql: Sql,
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
  const { plan } = planned;

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
      await tx.unsafe("SELECT pg_advisory_xact_lock(hashtext($1))", [ADVISORY_LOCK]);
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
