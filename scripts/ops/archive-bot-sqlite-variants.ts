#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Preserve divergent SQLite configuration rows without changing canonical PostgreSQL tables. */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import postgres from "postgres";

type Table = "economy_index" | "race_level_roles" | "card_themes";
type Row = Record<string, string | number | null>;
const TABLES: Table[] = ["economy_index", "race_level_roles", "card_themes"];
const COLUMNS: Record<Table, string[]> = {
  economy_index: ["day", "supply", "index_value", "enabled", "created_at"],
  race_level_roles: ["race", "level", "role_id"],
  card_themes: [
    "id",
    "name",
    "accent",
    "aura",
    "bg_grad_1",
    "bg_grad_2",
    "bg_grad_3",
    "bg_file",
    "text_shadow",
    "overlay_opacity",
    "tint_strength",
    "gradient_angle",
    "enabled",
    "created_at",
  ],
};
const KEY: Record<Table, string[]> = {
  economy_index: ["day"],
  race_level_roles: ["race", "level"],
  card_themes: ["id"],
};
const normalized = (value: unknown) => (value == null ? null : String(value));

export function rowIdentity(table: Table, row: Record<string, unknown>): string {
  return JSON.stringify(KEY[table].map((column) => normalized(row[column])));
}
export function sameRow(table: Table, source: Row, target: Record<string, unknown>): boolean {
  return COLUMNS[table].every(
    (column) => normalized(source[column]) === normalized(target[column]),
  );
}
export function archivePayload(table: Table, row: Row): string {
  return JSON.stringify(Object.fromEntries(COLUMNS[table].map((column) => [column, row[column]])));
}
export function contentSha256(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function options() {
  const sqliteArg = process.argv.indexOf("--sqlite");
  const sourceArg = process.argv.indexOf("--source-id");
  const checkpointArg = process.argv.indexOf("--checkpoint");
  const path = process.argv[sqliteArg + 1];
  const sourceId = process.argv[sourceArg + 1];
  const checkpointPath = process.argv[checkpointArg + 1];
  const apply = process.argv.includes("--apply");
  if (sqliteArg < 0 || !path || path.startsWith("--")) throw new Error("--sqlite required");
  if (sourceArg < 0 || !sourceId || !/^[a-z0-9][a-z0-9-]{5,80}$/.test(sourceId))
    throw new Error("--source-id required");
  if (checkpointArg < 0 || !checkpointPath || checkpointPath.startsWith("--"))
    throw new Error("--checkpoint required");
  if (apply && process.platform !== "linux") throw new Error("Apply requires Linux DBFR");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required from protected store");
  const sqlitePath = resolve(path);
  const checkpoint = JSON.parse(readFileSync(resolve(checkpointPath), "utf8"));
  const file = statSync(sqlitePath);
  if (process.platform === "linux" && (statSync(resolve(checkpointPath)).mode & 0o077) !== 0)
    throw new Error("Checkpoint permissions must be 600");
  if (
    checkpoint.sourceId !== sourceId ||
    checkpoint.path !== sqlitePath ||
    checkpoint.device !== file.dev ||
    checkpoint.inode !== file.ino
  )
    throw new Error("SQLite source identity does not match protected checkpoint");
  return { sqlitePath, sourceId, device: file.dev, inode: file.ino, apply };
}

async function main() {
  const { sqlitePath, sourceId, device, inode, apply } = options();
  const db = new Database(sqlitePath, { readonly: true, create: false });
  const snapshots = new Map<Table, Row[]>();
  try {
    db.exec("BEGIN");
    for (const table of TABLES)
      snapshots.set(
        table,
        db
          .query<Row, []>(
            `SELECT ${COLUMNS[table].join(", ")} FROM ${table} ORDER BY ${KEY[table].join(", ")}`,
          )
          .all(),
      );
    db.exec("COMMIT");
  } finally {
    db.close();
  }
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const report: Record<
    Table,
    {
      source: number;
      identical: number;
      missingCanonical: number;
      divergentCanonical: number;
      archived: number;
      alreadyArchived: number;
      pending: number;
    }
  > = {
    economy_index: {
      source: 0,
      identical: 0,
      missingCanonical: 0,
      divergentCanonical: 0,
      archived: 0,
      alreadyArchived: 0,
      pending: 0,
    },
    race_level_roles: {
      source: 0,
      identical: 0,
      missingCanonical: 0,
      divergentCanonical: 0,
      archived: 0,
      alreadyArchived: 0,
      pending: 0,
    },
    card_themes: {
      source: 0,
      identical: 0,
      missingCanonical: 0,
      divergentCanonical: 0,
      archived: 0,
      alreadyArchived: 0,
      pending: 0,
    },
  };
  try {
    if (!(await sql`SELECT to_regclass('bot.sqlite_runtime_variants') AS name`)[0]?.name)
      throw new Error("Infra variants staging migration missing");
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext('shenron-sqlite-variants'))`;
      for (const table of TABLES) {
        const rows = snapshots.get(table)!;
        report[table].source = rows.length;
        for (const row of rows) {
          const where = KEY[table]
            .map((column, index) => `${column} = $${index + 1}`)
            .join(" AND ");
          const canonical = await tx.unsafe(
            `SELECT ${COLUMNS[table].join(", ")} FROM bot.${table} WHERE ${where}`,
            KEY[table].map((column) => row[column]),
          );
          if (canonical.length > 1) throw new Error(`${table}: ambiguous canonical key`);
          if (canonical.length && sameRow(table, row, canonical[0])) {
            report[table].identical++;
            continue;
          }
          if (canonical.length) report[table].divergentCanonical++;
          else report[table].missingCanonical++;
          const sourceKey = rowIdentity(table, row);
          const payload = archivePayload(table, row);
          const digest = contentSha256(payload);
          const found = await tx`SELECT payload, source_path, source_device, source_inode
            FROM bot.sqlite_runtime_variants WHERE source_id = ${sourceId} AND table_name = ${table}
            AND source_key = ${sourceKey} AND content_sha256 = ${digest}`;
          if (found.length) {
            if (
              found[0].payload !== payload ||
              found[0].source_path !== sqlitePath ||
              Number(found[0].source_device) !== device ||
              Number(found[0].source_inode) !== inode
            )
              throw new Error(`${table}: archive provenance or hash collision`);
            report[table].alreadyArchived++;
            continue;
          }
          if (!apply) {
            report[table].pending++;
            continue;
          }
          await tx`INSERT INTO bot.sqlite_runtime_variants
            (source_id, source_path, source_device, source_inode, table_name, source_key, content_sha256, payload)
            VALUES (${sourceId}, ${sqlitePath}, ${device}, ${inode}, ${table}, ${sourceKey}, ${digest}, ${payload})
            ON CONFLICT (source_id, table_name, source_key, content_sha256) DO NOTHING`;
          const verified = await tx`SELECT payload, source_path, source_device, source_inode
            FROM bot.sqlite_runtime_variants WHERE source_id = ${sourceId} AND table_name = ${table}
            AND source_key = ${sourceKey} AND content_sha256 = ${digest}`;
          if (
            verified.length !== 1 ||
            verified[0].payload !== payload ||
            contentSha256(verified[0].payload) !== digest ||
            verified[0].source_path !== sqlitePath ||
            Number(verified[0].source_device) !== device ||
            Number(verified[0].source_inode) !== inode
          )
            throw new Error(`${table}: archive readback mismatch`);
          report[table].archived++;
        }
      }
    });
    console.log(JSON.stringify({ ok: true, apply, sourceId, tables: report }));
  } finally {
    await sql.end();
  }
}

if (import.meta.main) await main();
