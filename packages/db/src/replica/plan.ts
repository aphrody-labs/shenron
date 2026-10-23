// SPDX-License-Identifier: Apache-2.0
/**
 * What to copy for one table. The replica is created outside this repository (Infra migrations),
 * so nothing assumes its exact layout: the PostgreSQL columns are read from `information_schema`
 * at run time and only the columns present on both sides are copied.
 */
import type { PgColumn, PlanResult, PlannedColumn, SqlRunner, SqliteColumn } from "./types";
import { SUPPORTED_TYPES } from "./values";

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

/** Columns of `schema.table`, empty when the table does not exist. */
export async function readPgColumns(
  client: SqlRunner,
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
