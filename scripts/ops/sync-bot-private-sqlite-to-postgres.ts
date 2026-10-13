#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Reconcile selected private bot rows with provenance and conflict refusal. */
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";
import postgres from "postgres";

type Table = "dm_contacts" | "dm_messages" | "jails";
type Row = Record<string, string | number | null>;
const TABLES: Table[] = ["dm_contacts", "dm_messages", "jails"];
const COLUMNS: Record<Table, string[]> = {
  dm_contacts: [
    "user_id",
    "username",
    "display_name",
    "allowed",
    "note",
    "first_seen_at",
    "last_seen_at",
  ],
  dm_messages: [
    "id",
    "user_id",
    "direction",
    "content",
    "persona",
    "message_id",
    "read_at",
    "created_at",
  ],
  jails: [
    "id",
    "user_id",
    "moderator_id",
    "reason",
    "expires_at",
    "released_at",
    "previous_roles",
    "created_at",
  ],
};
const IMMUTABLE: Record<Table, string[]> = {
  dm_contacts: ["user_id", "first_seen_at"],
  dm_messages: ["user_id", "direction", "content", "persona", "message_id", "created_at"],
  jails: ["user_id", "moderator_id", "reason", "expires_at", "previous_roles", "created_at"],
};
const KEY: Record<Table, string> = { dm_contacts: "user_id", dm_messages: "id", jails: "id" };
const MAX_ID = 0x3fffffffffffffffn;

const normalized = (value: unknown) => (value == null ? null : String(value));
export function rowHash(table: Table, row: Record<string, unknown>): string {
  const fields = COLUMNS[table].filter((column) => column !== "id");
  return createHash("sha256")
    .update(JSON.stringify(fields.map((column) => normalized(row[column]))))
    .digest("hex");
}

export function targetKey(table: Table, sourceId: string, row: Row): string {
  if (table === "dm_contacts") return String(row.user_id);
  const localId = Number(row.id);
  if (!Number.isSafeInteger(localId) || localId < 1) throw new Error(`${table}: invalid source ID`);
  const digest = createHash("sha256")
    .update(JSON.stringify([sourceId, table, localId]))
    .digest();
  return (-((digest.readBigUInt64BE(0) & MAX_ID) + 1n)).toString();
}

export function semanticKey(table: Table, row: Record<string, unknown>): string {
  if (table === "dm_contacts") return String(row.user_id);
  if (table === "dm_messages" && row.message_id != null) return `discord:${String(row.message_id)}`;
  const fields =
    table === "dm_messages"
      ? ["user_id", "direction", "content", "persona", "created_at"]
      : ["user_id", "moderator_id", "created_at"];
  return createHash("sha256")
    .update(JSON.stringify(fields.map((column) => normalized(row[column]))))
    .digest("hex");
}

export function validateMutable(table: Table, source: Row, target: Record<string, unknown>): void {
  for (const column of IMMUTABLE[table])
    if (normalized(source[column]) !== normalized(target[column]))
      throw new Error(`${table}: immutable field changed`);
  const timestamp =
    table === "dm_contacts" ? "last_seen_at" : table === "dm_messages" ? "read_at" : "released_at";
  const before = target[timestamp] == null ? null : Number(target[timestamp]);
  const after = source[timestamp] == null ? null : Number(source[timestamp]);
  if (before != null && (after == null || after < before))
    throw new Error(`${table}: timestamp regressed`);
}

function options() {
  const sqliteIndex = process.argv.indexOf("--sqlite");
  const sourceIndex = process.argv.indexOf("--source-id");
  const sqlitePath = process.argv[sqliteIndex + 1];
  const sourceId = process.argv[sourceIndex + 1];
  const apply = process.argv.includes("--apply");
  if (sqliteIndex < 0 || !sqlitePath || sqlitePath.startsWith("--"))
    throw new Error("--sqlite required");
  if (sourceIndex < 0 || !sourceId || !/^[a-z0-9][a-z0-9-]{5,80}$/.test(sourceId))
    throw new Error("--source-id required");
  if (apply && process.platform !== "linux") throw new Error("Apply requires Linux DBFR");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required from protected store");
  return { sqlitePath: resolve(sqlitePath), sourceId, apply };
}

async function main() {
  const { sqlitePath, sourceId, apply } = options();
  const db = new Database(sqlitePath, { readonly: true, create: false });
  const snapshots = new Map<Table, Row[]>();
  try {
    db.exec("BEGIN");
    for (const table of TABLES)
      snapshots.set(
        table,
        db
          .query<Row, []>(
            `SELECT ${COLUMNS[table].join(", ")} FROM ${table} ORDER BY ${KEY[table]}`,
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
    { source: number; same: number; insert: number; update: number; pending: number }
  > = {
    dm_contacts: { source: 0, same: 0, insert: 0, update: 0, pending: 0 },
    dm_messages: { source: 0, same: 0, insert: 0, update: 0, pending: 0 },
    jails: { source: 0, same: 0, insert: 0, update: 0, pending: 0 },
  };
  try {
    if (!(await sql`SELECT to_regclass('bot.sqlite_runtime_sources') AS name`)[0]?.name)
      throw new Error("Infra provenance migration missing");
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext('shenron-bot-private-runtime-sync'))`;
      for (const table of TABLES) {
        const rows = snapshots.get(table)!;
        report[table].source = rows.length;
        const targets = await tx.unsafe(`SELECT ${COLUMNS[table].join(", ")} FROM bot.${table}`);
        const byId = new Map(targets.map((row) => [String(row[KEY[table]]), row]));
        const semantic = new Set(targets.map((row) => semanticKey(table, row)));
        const seen = new Set<string>();
        for (const row of rows) {
          const sourceKey = String(row[KEY[table]]);
          const destination = targetKey(table, sourceId, row);
          const identity = semanticKey(table, row);
          if (seen.has(identity)) throw new Error(`${table}: ambiguous source semantic identity`);
          seen.add(identity);
          const links = await tx`SELECT target_key, row_hash FROM bot.sqlite_runtime_sources
            WHERE source_id = ${sourceId} AND table_name = ${table} AND source_key = ${sourceKey}`;
          if (links.length && links[0].target_key !== destination)
            throw new Error(`${table}: provenance target changed`);
          const current = byId.get(destination);
          const wantedHash = rowHash(table, row);
          if (links.length) {
            if (!current || rowHash(table, current) !== links[0].row_hash)
              throw new Error(`${table}: PostgreSQL row changed outside sync`);
            if (wantedHash === links[0].row_hash) {
              report[table].same++;
              continue;
            }
            validateMutable(table, row, current);
            if (!apply) {
              report[table].pending++;
              continue;
            }
            const mutable = COLUMNS[table].filter((column) => column !== KEY[table]);
            const values = mutable.map((column) => row[column]);
            await tx.unsafe(
              `UPDATE bot.${table} SET ${mutable.map((column, index) => `${column} = $${index + 1}`).join(", ")} WHERE ${KEY[table]} = $${values.length + 1}`,
              [...values, destination],
            );
            await tx`UPDATE bot.sqlite_runtime_sources SET row_hash = ${wantedHash}
              WHERE source_id = ${sourceId} AND table_name = ${table} AND source_key = ${sourceKey}`;
            report[table].update++;
          } else {
            if (current || semantic.has(identity))
              throw new Error(`${table}: pre-existing identity requires review`);
            if (!apply) {
              report[table].pending++;
              continue;
            }
            const values = COLUMNS[table].map((column) =>
              column === KEY[table] ? destination : row[column],
            );
            await tx.unsafe(
              `INSERT INTO bot.${table} (${COLUMNS[table].join(", ")}) VALUES (${values.map((_, index) => `$${index + 1}`).join(", ")})`,
              values,
            );
            await tx`INSERT INTO bot.sqlite_runtime_sources (source_id, table_name, source_key, target_key, row_hash)
              VALUES (${sourceId}, ${table}, ${sourceKey}, ${destination}, ${wantedHash})`;
            semantic.add(identity);
            report[table].insert++;
          }
          const readback = await tx.unsafe(
            `SELECT ${COLUMNS[table].join(", ")} FROM bot.${table} WHERE ${KEY[table]} = $1`,
            [destination],
          );
          if (readback.length !== 1 || rowHash(table, readback[0]) !== wantedHash)
            throw new Error(`${table}: PostgreSQL readback mismatch`);
          byId.set(destination, readback[0]);
        }
      }
    });
    console.log(JSON.stringify({ ok: true, apply, sourceId, tables: report }));
  } finally {
    await sql.end();
  }
}

if (import.meta.main) await main();
