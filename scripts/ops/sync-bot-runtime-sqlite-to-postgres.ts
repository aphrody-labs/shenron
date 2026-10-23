#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
/**
 * Copy the bot's runtime records from its private SQLite into the existing PostgreSQL schema `bot`.
 *
 * Two kinds of tables, both read from one consistent SQLite snapshot:
 *  - journals (`action_logs`, `rag_eval_history`): append-only, copied under stable negative
 *    identifiers derived from the source, never deleted, guarded by a checkpoint;
 *  - state tables (users, inventory, economy_flags, ...: `BOT_STATE_REPLICA_TABLES` of
 *    `@aphrody/shenron-db/bot-schema`): mirrored by primary key, so PostgreSQL ends up equal to
 *    SQLite (insert, update, delete), one transaction per table, bounded batches, read back.
 *
 * Without `--apply` nothing is written: the run prints the gap per table (`--dry-run` says so
 * explicitly). Usage and flags: see `usage()` and docs/operations/sync-bot-runtime.md.
 */
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
import { BOT_STATE_REPLICA_NAMES } from "@aphrody/shenron-db/bot-schema";
import {
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
  emptyReport,
  mirrorTable,
  type Row as StateRow,
  type SqliteColumn,
  type TableReport,
} from "./sync-bot-runtime-state";

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

export interface Options {
  path: string;
  sourceId: string;
  checkpointPath?: string;
  apply: boolean;
  prepare: boolean;
  /** Explicit read-only run (also what a run without `--apply` does). */
  dryRun: boolean;
  /** Tables to copy, journals and state mixed; null means all of them. */
  tables: string[] | null;
  schema: string;
  batchSize: number;
  keepAbsent: boolean;
  allowMassDelete: boolean;
}

export const usage = () =>
  [
    "Usage: bun sync-bot-runtime-sqlite-to-postgres.ts --sqlite <private bot.db> --source-id <stable-id>",
    "         [--dry-run | --prepare-checkpoint | --apply] [--checkpoint <private.json>]",
    "         [--tables state|journals|users,inventory,...] [--batch-size 500] [--no-delete] [--allow-mass-delete]",
    "       Without --apply nothing is written. --apply and --prepare-checkpoint need --checkpoint.",
  ].join("\n");

/** Every table name the script can copy, journals first. */
export const KNOWN_TABLES: readonly string[] = [...TABLES, ...BOT_STATE_REPLICA_NAMES];

/** `--tables state` and `--tables journals` stand for the whole group. */
const TABLE_GROUPS: Record<string, readonly string[]> = {
  state: BOT_STATE_REPLICA_NAMES,
  journals: TABLES,
};

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const position = argv.indexOf(flag);
  if (position < 0) return undefined;
  const value = argv[position + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

/** Parses and validates the command line; throws a usage error on any invalid combination. */
export function parseOptions(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  platform: string,
): Options {
  const path = flagValue(argv, "--sqlite");
  if (!path) throw new Error(usage());
  const sourceId = flagValue(argv, "--source-id");
  if (!sourceId || !/^[a-z0-9][a-z0-9-]{5,80}$/.test(sourceId))
    throw new Error("A stable --source-id is required");
  const checkpointPath = flagValue(argv, "--checkpoint");
  const apply = argv.includes("--apply");
  const prepare = argv.includes("--prepare-checkpoint");
  const dryRun = argv.includes("--dry-run");
  if (apply && prepare) throw new Error("--apply and --prepare-checkpoint are mutually exclusive");
  if (dryRun && (apply || prepare))
    throw new Error("--dry-run writes nothing: it excludes --apply and --prepare-checkpoint");
  if ((apply || prepare) && !checkpointPath) throw new Error("A private --checkpoint is required");
  if (apply && platform !== "linux") throw new Error("Production apply requires Linux DBFR");
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL is required from the protected store");

  const tablesFlag = flagValue(argv, "--tables");
  if (argv.includes("--tables") && tablesFlag === undefined)
    throw new Error("--tables needs a comma-separated list");
  const tables =
    tablesFlag === undefined
      ? null
      : [
          ...new Set(
            tablesFlag
              .split(",")
              .map((name) => name.trim())
              .filter(Boolean)
              .flatMap((name) => TABLE_GROUPS[name] ?? [name]),
          ),
        ];
  if (tables) {
    const unknown = tables.filter((name) => !KNOWN_TABLES.includes(name));
    if (unknown.length > 0 || tables.length === 0)
      throw new Error(
        `Unknown --tables ${unknown.join(", ") || "(empty)"}; known: ${KNOWN_TABLES.join(", ")}`,
      );
  }

  const schema = flagValue(argv, "--schema") ?? "bot";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("--schema must be a plain identifier");
  const batchValue = flagValue(argv, "--batch-size");
  const batchSize = batchValue === undefined ? DEFAULT_BATCH_SIZE : Number(batchValue);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE)
    throw new Error(`--batch-size must be an integer between 1 and ${MAX_BATCH_SIZE}`);

  return {
    path: resolve(path),
    sourceId,
    checkpointPath: checkpointPath ? resolve(checkpointPath) : undefined,
    apply,
    prepare,
    dryRun,
    tables,
    schema,
    batchSize,
    keepAbsent: argv.includes("--no-delete"),
    allowMassDelete: argv.includes("--allow-mass-delete"),
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

type JournalReport = Record<
  Table,
  {
    source: number;
    existing: number;
    missing: number;
    written: number;
    fingerprintMatch?: boolean;
  }
>;

/** The append-only journals: unchanged logic, one row at a time, refusing any divergent row. */
async function syncJournals(
  sql: postgres.Sql,
  options: Options,
  tables: readonly Table[],
  snapshots: ReadonlyMap<Table, Row[]>,
): Promise<JournalReport> {
  const { apply, schema } = options;
  const report: JournalReport = {
    action_logs: { source: 0, existing: 0, missing: 0, written: 0 },
    rag_eval_history: { source: 0, existing: 0, missing: 0, written: 0 },
  };
  const sourceDigests = new Map(tables.map((table) => [table, createHash("sha256")]));
  const targetDigests = new Map(tables.map((table) => [table, createHash("sha256")]));
  const target = sql(schema);
  for (const table of tables) {
    const rows = snapshots.get(table) ?? [];
    report[table].source = rows.length;
    for (const row of rows) {
      const id = stablePostgresId(table, row, options.sourceId);
      sourceDigests.get(table)!.update(fingerprintRow(table, row, id));
      const found =
        table === "action_logs"
          ? await sql`SELECT * FROM ${target}.action_logs WHERE id = ${id}`
          : await sql`SELECT * FROM ${target}.rag_eval_history WHERE id = ${id}`;
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
        await sql`INSERT INTO ${target}.action_logs
          (id,user_id,moderator_id,action,reason,meta,created_at)
          VALUES (${id},${row.user_id},${row.moderator_id},${row.action},${row.reason},${row.meta},${row.created_at})
          ON CONFLICT (id) DO NOTHING`;
      } else {
        await sql`INSERT INTO ${target}.rag_eval_history
          (id,recall_1,recall_3,recall_5,recall_10,mrr,ndcg,duration_ms,cases_count,sidecar_online,misses_count,misses_json,created_at)
          VALUES (${id},${row.recall_1},${row.recall_3},${row.recall_5},${row.recall_10},${row.mrr},${row.ndcg},${row.duration_ms},${row.cases_count},${row.sidecar_online},${row.misses_count},${row.misses_json},${row.created_at})
          ON CONFLICT (id) DO NOTHING`;
      }
      const verified =
        table === "action_logs"
          ? await sql`SELECT * FROM ${target}.action_logs WHERE id = ${id}`
          : await sql`SELECT * FROM ${target}.rag_eval_history WHERE id = ${id}`;
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
  return report;
}

interface StateSnapshot {
  columns: SqliteColumn[];
  rows: StateRow[];
}

/** One line per table for the operator; the JSON on stdout stays the machine-readable record. */
export function formatStateReport(reports: Record<string, TableReport>): string {
  const lines = ["table                   status    sqlite  pg      +insert ~update -delete  note"];
  for (const [table, report] of Object.entries(reports)) {
    const notes = [
      report.reason,
      report.duplicates ? `${report.duplicates} duplicated key(s)` : undefined,
      report.sqliteOnlyColumns.length
        ? `not in PostgreSQL: ${report.sqliteOnlyColumns.join(",")}`
        : undefined,
      Object.keys(report.changedColumns).length
        ? `changed: ${Object.entries(report.changedColumns)
            .map(([column, count]) => `${column}(${count})`)
            .join(",")}`
        : undefined,
    ].filter(Boolean);
    lines.push(
      [
        table.padEnd(23),
        report.status.padEnd(9),
        String(report.source).padEnd(7),
        String(report.target).padEnd(7),
        String(report.insert).padEnd(7),
        String(report.update).padEnd(7),
        String(report.delete).padEnd(8),
        notes.join("; "),
      ].join(" "),
    );
  }
  return lines.join("\n");
}

async function main() {
  const options = parseOptions(process.argv.slice(2), process.env, process.platform);
  const { path, sourceId, checkpointPath, apply, prepare } = options;
  const selected = (name: string) => options.tables === null || options.tables.includes(name);
  const journalTables = TABLES.filter(selected);
  const stateTables = BOT_STATE_REPLICA_NAMES.filter(selected);

  const expected = expectedCheckpoint(path, sourceId);
  const checkpoint = apply ? readCheckpoint(checkpointPath!, expected) : expected;
  const sqlite = new Database(path, { readonly: true, create: false });
  const snapshots = new Map<Table, Row[]>();
  const stateSnapshots = new Map<string, StateSnapshot>();
  try {
    sqlite.exec("BEGIN");
    for (const table of journalTables) {
      const columns = COLUMNS[table].join(", ");
      snapshots.set(
        table,
        sqlite.query<Row, []>(`SELECT ${columns} FROM ${table} ORDER BY id`).all(),
      );
    }
    for (const table of stateTables) {
      const columns = sqlite
        .query<SqliteColumn, [string]>("SELECT name, pk FROM pragma_table_info(?)")
        .all(table);
      if (columns.length === 0) continue;
      const names = columns.map((column) => `"${column.name}"`).join(", ");
      stateSnapshots.set(table, {
        columns,
        rows: sqlite.query<StateRow, []>(`SELECT ${names} FROM "${table}"`).all(),
      });
    }
    sqlite.exec("COMMIT");
  } finally {
    sqlite.close();
  }

  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const errors: string[] = [];
  let journals: JournalReport | undefined;
  const state: Record<string, TableReport> = {};
  try {
    if (journalTables.length > 0) {
      try {
        journals = await syncJournals(sql, options, journalTables, snapshots);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    for (const table of stateTables) {
      const snapshot = stateSnapshots.get(table);
      if (!snapshot) {
        state[table] = { ...emptyReport(0), reason: "table does not exist in SQLite" };
        continue;
      }
      state[table] = await mirrorTable(sql, table, snapshot.columns, snapshot.rows, {
        schema: options.schema,
        apply,
        keepAbsent: options.keepAbsent,
        allowMassDelete: options.allowMassDelete,
        batchSize: options.batchSize,
      });
    }

    const failed = Object.entries(state).filter(
      ([, report]) => report.status === "error" || report.status === "blocked",
    );
    for (const [table, report] of failed) errors.push(`${table}: ${report.reason}`);
    if (errors.length === 0) {
      if (prepare) saveCheckpoint(checkpointPath!, expected, true);
      if (apply) {
        for (const table of journalTables)
          checkpoint.lastSeen[table] =
            snapshots.get(table)?.at(-1)?.id ?? checkpoint.lastSeen[table];
        saveCheckpoint(checkpointPath!, checkpoint, false);
      }
    }
    if (Object.keys(state).length > 0) console.error(formatStateReport(state));
    for (const message of errors) console.error(`error: ${message}`);
    console.log(
      JSON.stringify({
        ok: errors.length === 0,
        apply,
        dryRun: !apply && !prepare,
        source: sourceId,
        schema: options.schema,
        ...(journals ? { tables: journals } : {}),
        state,
        ...(errors.length > 0 ? { errors } : {}),
      }),
    );
    if (errors.length > 0) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

if (import.meta.main) await main();
