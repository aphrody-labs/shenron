// SPDX-License-Identifier: Apache-2.0
/** SQL text generation for the replica writes: bound parameters, typed placeholders, bounded batches. */
import type { PlannedColumn, Row, TablePlan } from "./types";
import { keyString } from "./diff";
import { JSON_TYPES, TEXT_TYPES, toPgParam } from "./values";

/** Hard ceiling of bind parameters per statement is 65535; stay well below it. */
const MAX_PARAMETERS = 60_000;

export interface Statement {
  text: string;
  params: unknown[];
}

/** Identifiers come from `information_schema` and the SQLite catalogue, but are still checked. */
export function quoteIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return `"${name}"`;
}

export const qualified = (schema: string, table: string) =>
  `${quoteIdent(schema)}.${quoteIdent(table)}`;

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

/** `suffix` is appended after the VALUES list (journals use `ON CONFLICT (id) DO NOTHING`). */
export function buildInsert(
  schema: string,
  plan: TablePlan,
  rows: readonly Row[],
  suffix = "",
): Statement {
  const params: unknown[] = [];
  const tuples = rows.map((row) => {
    const cells = plan.columns.map((column) => bindParameter(params, plan, column, row));
    return `(${cells.join(", ")})`;
  });
  const names = plan.columns.map((column) => quoteIdent(column.name)).join(", ");
  const overriding = plan.identityAlways ? " OVERRIDING SYSTEM VALUE" : "";
  return {
    text: `INSERT INTO ${qualified(schema, plan.table)} (${names})${overriding} VALUES ${tuples.join(", ")}${suffix}`,
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

export function buildUpdate(schema: string, plan: TablePlan, row: Row): Statement {
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

/** `("a", "b") IN (($1::text, $2::int8), ...)` over key tuples, and the parameters it binds. */
function keyPredicate(plan: TablePlan, keys: readonly (readonly unknown[])[]): Statement {
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
  return { text: `${left} IN (${tuples.join(", ")})`, params };
}

export function buildDelete(
  schema: string,
  plan: TablePlan,
  keys: readonly (readonly unknown[])[],
): Statement {
  const { text, params } = keyPredicate(plan, keys);
  return { text: `DELETE FROM ${qualified(schema, plan.table)} WHERE ${text}`, params };
}

/** The copied columns of the rows whose primary key is in `keys`. */
export function buildSelectByKeys(
  schema: string,
  plan: TablePlan,
  keys: readonly (readonly unknown[])[],
): Statement {
  const { text, params } = keyPredicate(plan, keys);
  const names = plan.columns.map((column) => quoteIdent(column.name)).join(", ");
  return {
    text: `SELECT ${names} FROM ${qualified(schema, plan.table)} WHERE ${text}`,
    params,
  };
}
