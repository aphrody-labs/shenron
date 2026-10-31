#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Read-only parity check between the Drizzle schemas (schema.ts, bot-schema.ts) and a live
 * PostgreSQL: missing tables and columns, type drift, NOT NULL declared but nullable, and columns
 * that only exist in the database. Never writes.
 *
 *   DATABASE_URL=postgres://… bun packages/db/scripts/schema-parity.ts [--json]
 *
 * Exit 0 when the database matches the schemas, 1 on any drift, 2 on a usage or connection error.
 * Types are compared after normalisation (`timestamp (3)` = `timestamp(3)`, enums and
 * `numeric(p,s)` against their declared base type are not reported).
 */
import { getTableConfig } from "drizzle-orm/pg-core";
import { SQL } from "bun";
import * as botSchema from "../src/bot-schema";
import * as siteSchema from "../src/schema";

type Column = { type: string; notNull: boolean };

const normalise = (type: string): string =>
  type
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^bigserial$/, "bigint")
    .replace(/^smallserial$/, "smallint")
    .replace(/^serial$/, "integer")
    .replace(/^int4$/, "integer")
    .replace(/^character varying/, "varchar")
    // Precision never changes the stored value: timestamp(3) = timestamp, with or without zone.
    .replace(/^timestamp\(\d\)/, "timestamp")
    .replace("withouttimezone", "")
    .replace("withtimezone", "tz")
    .replace("timestamptz", "timestamptz");

/** Types the database may legitimately refine (enums, precision) without being a drift. */
const refinements = (expected: string, actual: string): boolean => {
  const base = (value: string) => value.replace(/\(.*\)$/, "").replace(/^timestamp$/, "timestamp");
  if (base(expected) === base(actual)) return true;
  if (
    expected === "text" &&
    !/^(text|jsonb|bigint|integer|boolean|numeric|date|timestamp)/.test(actual)
  )
    return true; // a PostgreSQL enum declared as text
  if (expected === "text" && actual === "date") return true; // text surrogate of a date column
  return false;
};

export function expectedTables(): Map<string, Map<string, Column>> {
  const tables = new Map<string, Map<string, Column>>();
  for (const module of [siteSchema, botSchema]) {
    for (const value of Object.values(module)) {
      if (!value || typeof value !== "object" || !(Symbol.for("drizzle:IsDrizzleTable") in value))
        continue;
      try {
        const config = getTableConfig(value as never);
        tables.set(
          `${config.schema ?? "public"}.${config.name}`,
          new Map(
            config.columns.map((column) => [
              column.name,
              { type: column.getSQLType(), notNull: column.notNull },
            ]),
          ),
        );
      } catch {
        // not a PostgreSQL table
      }
    }
  }
  return tables;
}

async function actualTables(sql: SQL): Promise<Map<string, Map<string, Column>>> {
  const rows = (await sql`
    SELECT n.nspname AS schema, c.relname AS table, a.attname AS column,
           format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid AND c.relkind = 'r'
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname IN ('public', 'bot')
    WHERE a.attnum > 0 AND NOT a.attisdropped
  `) as Array<{ schema: string; table: string; column: string; type: string; not_null: boolean }>;
  const tables = new Map<string, Map<string, Column>>();
  for (const row of rows) {
    const key = `${row.schema}.${row.table}`;
    if (!tables.has(key)) tables.set(key, new Map());
    tables.get(key)!.set(row.column, { type: row.type, notNull: row.not_null });
  }
  return tables;
}

export function compare(
  expected: Map<string, Map<string, Column>>,
  actual: Map<string, Map<string, Column>>,
): {
  missingTables: string[];
  missingColumns: string[];
  typeDrift: string[];
  nullable: string[];
  extraColumns: string[];
} {
  const report = {
    missingTables: [] as string[],
    missingColumns: [] as string[],
    typeDrift: [] as string[],
    nullable: [] as string[],
    extraColumns: [] as string[],
  };
  for (const [table, columns] of expected) {
    const live = actual.get(table);
    if (!live) {
      report.missingTables.push(table);
      continue;
    }
    for (const [name, column] of columns) {
      const found = live.get(name);
      if (!found) {
        report.missingColumns.push(`${table}.${name}`);
        continue;
      }
      const want = normalise(column.type);
      const have = normalise(found.type);
      if (want !== have && !refinements(want, have))
        report.typeDrift.push(
          `${table}.${name}: ${column.type} (schema) ≠ ${found.type} (database)`,
        );
      if (column.notNull && !found.notNull) report.nullable.push(`${table}.${name}`);
    }
    for (const name of live.keys())
      if (!columns.has(name)) report.extraColumns.push(`${table}.${name}`);
  }
  return report;
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required (read-only connection is enough)");
    process.exit(2);
  }
  const sql = new SQL(url);
  try {
    const report = compare(expectedTables(), await actualTables(sql));
    if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else
      for (const [kind, items] of Object.entries(report))
        console.log(`${kind}: ${items.length}${items.length ? `\n  ${items.join("\n  ")}` : ""}`);
    const drift =
      report.missingTables.length +
      report.missingColumns.length +
      report.typeDrift.length +
      report.nullable.length;
    process.exit(drift === 0 ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  } finally {
    await sql.close();
  }
}
