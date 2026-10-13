#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/** Copy append-only bot runtime records into existing private PostgreSQL tables. */
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import postgres from "postgres";

const MAX_ID = 0x3fffffffffffffffn;
const TABLES = ["action_logs", "rag_eval_history"] as const;
type Table = (typeof TABLES)[number];
type Row = Record<string, string | number | null> & { id: number; created_at: number };

const COLUMNS: Record<Table, readonly string[]> = {
  action_logs: ["id", "user_id", "moderator_id", "action", "reason", "meta", "created_at"],
  rag_eval_history: [
    "id",
    "recall_1",
    "recall_3",
    "recall_5",
    "recall_10",
    "mrr",
    "ndcg",
    "duration_ms",
    "cases_count",
    "sidecar_online",
    "misses_count",
    "misses_json",
    "created_at",
  ],
};

/** Negative IDs cannot collide with the positive IDs of the historical import. */
export function stablePostgresId(table: Table, row: Row, source: string): string {
  if (!Number.isSafeInteger(row.id) || row.id < 1)
    throw new Error(`${table}: invalid SQLite row ID`);
  const payload = JSON.stringify([source, table, row.id]);
  const digest = createHash("sha256").update(payload).digest();
  return (-((digest.readBigUInt64BE(0) & MAX_ID) + 1n)).toString();
}

export function sameRecord(table: Table, source: Row, target: Record<string, unknown>): boolean {
  return COLUMNS[table].every((column) => {
    if (column === "id") return true;
    const left = source[column];
    const right = target[column];
    return left === null ? right === null : String(left) === String(right);
  });
}

function fingerprintRow(table: Table, row: Record<string, unknown>, id: string): string {
  return JSON.stringify([
    id,
    ...COLUMNS[table]
      .filter((column) => column !== "id")
      .map((column) => (row[column] === null ? null : String(row[column]))),
  ]);
}

type Checkpoint = {
  sourceId: string;
  path: string;
  device: number;
  inode: number;
  lastSeen: Record<Table, number>;
};

function args(): {
  path: string;
  sourceId: string;
  checkpointPath?: string;
  apply: boolean;
  prepare: boolean;
} {
  const position = process.argv.indexOf("--sqlite");
  const path = position < 0 ? undefined : process.argv[position + 1];
  const sourcePosition = process.argv.indexOf("--source-id");
  const sourceId = sourcePosition < 0 ? undefined : process.argv[sourcePosition + 1];
  const checkpointPosition = process.argv.indexOf("--checkpoint");
  const checkpointPath = checkpointPosition < 0 ? undefined : process.argv[checkpointPosition + 1];
  if (!path || path.startsWith("--"))
    throw new Error(
      "Usage: bun sync-bot-runtime-sqlite-to-postgres.ts --sqlite <private bot.db> --source-id <stable-id> [--checkpoint <private.json> --prepare-checkpoint|--apply]",
    );
  if (!sourceId || !/^[a-z0-9][a-z0-9-]{5,80}$/.test(sourceId))
    throw new Error("A stable --source-id is required");
  const apply = process.argv.includes("--apply");
  const prepare = process.argv.includes("--prepare-checkpoint");
  if (apply && prepare) throw new Error("--apply and --prepare-checkpoint are mutually exclusive");
  if ((apply || prepare) && !checkpointPath) throw new Error("A private --checkpoint is required");
  if (apply && process.platform !== "linux")
    throw new Error("Production apply requires Linux DBFR");
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required from the protected store");
  return {
    path: resolve(path),
    sourceId,
    checkpointPath: checkpointPath ? resolve(checkpointPath) : undefined,
    apply,
    prepare,
  };
}

function expectedCheckpoint(path: string, sourceId: string): Checkpoint {
  const file = statSync(path);
  return {
    sourceId,
    path,
    device: file.dev,
    inode: file.ino,
    lastSeen: { action_logs: 0, rag_eval_history: 0 },
  };
}

function readCheckpoint(path: string, expected: Checkpoint): Checkpoint {
  const file = statSync(path);
  if (process.platform === "linux" && (file.mode & 0o077) !== 0)
    throw new Error("Checkpoint permissions must be 600");
  const saved = JSON.parse(readFileSync(path, "utf8")) as Checkpoint;
  if (
    saved.sourceId !== expected.sourceId ||
    saved.path !== expected.path ||
    saved.device !== expected.device ||
    saved.inode !== expected.inode
  )
    throw new Error(
      "Checkpoint source identity changed; use a new source ID after database replacement",
    );
  return saved;
}

function saveCheckpoint(path: string, data: Checkpoint, create: boolean): void {
  if (process.platform === "linux" && (statSync(dirname(path)).mode & 0o077) !== 0)
    throw new Error("Checkpoint directory permissions must be 700");
  const target = create ? path : `${path}.next`;
  if (!create) {
    try {
      if (!lstatSync(target).isFile()) throw new Error("Checkpoint staging path is not a file");
      chmodSync(target, 0o600);
    } catch (error) {
      if (!(error instanceof Error) || !((error as NodeJS.ErrnoException).code === "ENOENT"))
        throw error;
    }
  }
  const descriptor = openSync(target, create ? "wx" : "w", 0o600);
  try {
    writeFileSync(descriptor, JSON.stringify(data) + "\n");
  } finally {
    closeSync(descriptor);
  }
  if (!create) renameSync(target, path);
}

async function main() {
  const { path, sourceId, checkpointPath, apply, prepare } = args();
  const expected = expectedCheckpoint(path, sourceId);
  const checkpoint = apply ? readCheckpoint(checkpointPath!, expected) : expected;
  const sqlite = new Database(path, { readonly: true, create: false });
  const snapshots = new Map<Table, Row[]>();
  try {
    sqlite.exec("BEGIN");
    for (const table of TABLES) {
      const columns = COLUMNS[table].join(", ");
      snapshots.set(
        table,
        sqlite.query<Row, []>(`SELECT ${columns} FROM ${table} ORDER BY id`).all(),
      );
    }
    sqlite.exec("COMMIT");
  } finally {
    sqlite.close();
  }

  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const report: Record<
    Table,
    {
      source: number;
      existing: number;
      missing: number;
      written: number;
      fingerprintMatch?: boolean;
    }
  > = {
    action_logs: { source: 0, existing: 0, missing: 0, written: 0 },
    rag_eval_history: { source: 0, existing: 0, missing: 0, written: 0 },
  };
  const sourceDigests = new Map(TABLES.map((table) => [table, createHash("sha256")]));
  const targetDigests = new Map(TABLES.map((table) => [table, createHash("sha256")]));
  try {
    for (const table of TABLES) {
      const rows = snapshots.get(table) ?? [];
      report[table].source = rows.length;
      for (const row of rows) {
        const id = stablePostgresId(table, row, sourceId);
        sourceDigests.get(table)!.update(fingerprintRow(table, row, id));
        const found =
          table === "action_logs"
            ? await sql`SELECT * FROM bot.action_logs WHERE id = ${id}`
            : await sql`SELECT * FROM bot.rag_eval_history WHERE id = ${id}`;
        if (found.length) {
          if (!sameRecord(table, row, found[0]))
            throw new Error(`${table}: ID collision or divergent row`);
          targetDigests.get(table)!.update(fingerprintRow(table, found[0], id));
          report[table].existing++;
          continue;
        }
        report[table].missing++;
        if (!apply) continue;
        if (table === "action_logs") {
          await sql`INSERT INTO bot.action_logs
            (id,user_id,moderator_id,action,reason,meta,created_at)
            VALUES (${id},${row.user_id},${row.moderator_id},${row.action},${row.reason},${row.meta},${row.created_at})
            ON CONFLICT (id) DO NOTHING`;
        } else {
          await sql`INSERT INTO bot.rag_eval_history
            (id,recall_1,recall_3,recall_5,recall_10,mrr,ndcg,duration_ms,cases_count,sidecar_online,misses_count,misses_json,created_at)
            VALUES (${id},${row.recall_1},${row.recall_3},${row.recall_5},${row.recall_10},${row.mrr},${row.ndcg},${row.duration_ms},${row.cases_count},${row.sidecar_online},${row.misses_count},${row.misses_json},${row.created_at})
            ON CONFLICT (id) DO NOTHING`;
        }
        const verified =
          table === "action_logs"
            ? await sql`SELECT * FROM bot.action_logs WHERE id = ${id}`
            : await sql`SELECT * FROM bot.rag_eval_history WHERE id = ${id}`;
        if (verified.length !== 1 || !sameRecord(table, row, verified[0]))
          throw new Error(`${table}: PostgreSQL readback mismatch`);
        targetDigests.get(table)!.update(fingerprintRow(table, verified[0], id));
        report[table].written++;
      }
      const sourceFingerprint = sourceDigests.get(table)!.digest("hex");
      const targetFingerprint = targetDigests.get(table)!.digest("hex");
      report[table].fingerprintMatch = sourceFingerprint === targetFingerprint;
      if (
        apply &&
        (report[table].existing + report[table].written !== report[table].source ||
          !report[table].fingerprintMatch)
      )
        throw new Error(`${table}: count or fingerprint mismatch after PostgreSQL readback`);
    }
    if (prepare) saveCheckpoint(checkpointPath!, expected, true);
    if (apply) {
      for (const table of TABLES)
        checkpoint.lastSeen[table] = snapshots.get(table)?.at(-1)?.id ?? checkpoint.lastSeen[table];
      saveCheckpoint(checkpointPath!, checkpoint, false);
    }
    console.log(JSON.stringify({ ok: true, apply, source: sourceId, tables: report }));
  } finally {
    await sql.end();
  }
}

if (import.meta.main) await main();
