// SPDX-License-Identifier: Apache-2.0
/** Row comparison by primary key between the SQLite rows and the PostgreSQL rows of one table. */
import type { Row, TablePlan } from "./types";
import { canonicalValue, type Side } from "./values";

const SAMPLE_SIZE = 5;

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

const keyTypes = new WeakMap<TablePlan, string[]>();

/** PostgreSQL types of the primary key columns, in key order (cached per plan: hot loop). */
function keyColumnTypes(plan: TablePlan): string[] {
  let types = keyTypes.get(plan);
  if (!types) {
    types = plan.primaryKey.map(
      (name) => plan.columns.find((column) => column.name === name)!.type,
    );
    keyTypes.set(plan, types);
  }
  return types;
}

/** The primary key of a row as one comparable string (canonical values, JSON array). */
export function keyString(row: Row, plan: TablePlan, side: Side): string {
  const types = keyColumnTypes(plan);
  return JSON.stringify(
    plan.primaryKey.map((name, position) => canonicalValue(row[name], types[position]!, side)),
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
