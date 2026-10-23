// SPDX-License-Identifier: Apache-2.0
/**
 * One periodic pass over the bot's SQLite: every state table through the incremental mirror, then
 * the journals after their cursors. The caller (the bot's service) owns scheduling, settings and
 * logging; this owns the order of work and the arithmetic of the report.
 *
 * SQLite is read table by table, each read one synchronous statement (a consistent table), with the
 * event loop yielded in between so a pass never freezes the bot. PostgreSQL has no foreign keys
 * between the replica tables, and the next pass settles any difference two tables saw.
 */
import type { Database } from "bun:sqlite";
import type { CursorStore } from "./cursor";
import { syncStateTable, type ReplicaMemo } from "./incremental";
import {
  syncJournalsIncremental,
  type JournalPassReport,
  type JournalPassOptions,
} from "./journals";
import { DEFAULT_BATCH_SIZE, emptyReport, type TableReport } from "./mirror";
import { readStateTable, type JournalTable } from "./snapshot";
import type { SqlClient } from "./types";

export interface ReplicaPassOptions {
  sqlite: Database;
  sql: SqlClient;
  /** Stable identity of the SQLite file the journals are keyed on (`stablePostgresId`). */
  sourceId: string;
  /** What the previous passes left; owned by the caller, mutated by the pass. */
  memo: ReplicaMemo;
  /** Where the journals stand; without it the journals are not copied. */
  cursors?: CursorStore;
  schema?: string;
  /** State tables to mirror, parents before children. */
  stateTables: readonly string[];
  journalTables?: readonly JournalTable[];
  batchSize?: number;
  /** Rows copied per journal per pass. */
  journalMaxRows?: number;
  allowMassDelete?: boolean;
  fullVerifyMs?: number;
  /** PostgreSQL `statement_timeout` of every table transaction. */
  statementTimeoutMs?: number;
  now?: () => number;
  /** Called after each table, for progress and tests. */
  onTable?: (table: string, report: TableReport) => void;
}

export interface PassTotals {
  tables: number;
  inSync: number;
  applied: number;
  skipped: number;
  busy: number;
  full: number;
  incremental: number;
  insert: number;
  update: number;
  delete: number;
  blocked: string[];
  errors: string[];
  drift: string[];
  journalRead: number;
  journalWritten: number;
  journalPending: boolean;
}

export interface ReplicaPassReport {
  startedAt: number;
  durationMs: number;
  /** No table or journal ended in error or blocked. */
  ok: boolean;
  state: Record<string, TableReport>;
  journals: Partial<Record<JournalTable, JournalPassReport>> | null;
  totals: PassTotals;
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

/** `table: reason`, without repeating the table when the reason already starts with it. */
const attributed = (table: string, reason: string) =>
  reason.startsWith(`${table}:`) ? reason : `${table}: ${reason}`;

/** The counters of a finished pass. */
export function summarizePass(
  state: Record<string, TableReport>,
  journals: Partial<Record<JournalTable, JournalPassReport>> | null,
): PassTotals {
  const totals: PassTotals = {
    tables: 0,
    inSync: 0,
    applied: 0,
    skipped: 0,
    busy: 0,
    full: 0,
    incremental: 0,
    insert: 0,
    update: 0,
    delete: 0,
    blocked: [],
    errors: [],
    drift: [],
    journalRead: 0,
    journalWritten: 0,
    journalPending: false,
  };
  for (const [table, report] of Object.entries(state)) {
    totals.tables++;
    totals.insert += report.insert;
    totals.update += report.update;
    totals.delete += report.delete;
    if (report.mode === "full") totals.full++;
    if (report.mode === "incremental") totals.incremental++;
    if (report.drift) totals.drift.push(`${table}: ${report.drift}`);
    switch (report.status) {
      case "in-sync":
        totals.inSync++;
        break;
      case "applied":
        totals.applied++;
        break;
      case "skipped":
        totals.skipped++;
        break;
      case "busy":
        totals.busy++;
        break;
      case "blocked":
        totals.blocked.push(attributed(table, report.reason ?? "blocked"));
        break;
      case "error":
        totals.errors.push(attributed(table, report.reason ?? "error"));
        break;
      case "drift":
        break;
    }
  }
  for (const [table, report] of Object.entries(journals ?? {})) {
    totals.journalRead += report.read;
    totals.journalWritten += report.written;
    if (!report.complete) totals.journalPending = true;
    if (report.status === "blocked")
      totals.blocked.push(attributed(table, report.reason ?? "blocked"));
    if (report.status === "error") totals.errors.push(attributed(table, report.reason ?? "error"));
  }
  return totals;
}

/** Runs one pass; never throws for a table or journal failure, those are in the report. */
export async function runReplicaPass(options: ReplicaPassOptions): Promise<ReplicaPassReport> {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const schema = options.schema ?? "bot";
  const state: Record<string, TableReport> = {};
  for (const table of options.stateTables) {
    let snapshot;
    try {
      snapshot = readStateTable(options.sqlite, table);
    } catch (error) {
      state[table] = {
        ...emptyReport(0),
        status: "error",
        reason: `SQLite read failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      continue;
    }
    if (!snapshot) {
      options.memo.delete(table);
      state[table] = { ...emptyReport(0), reason: "table does not exist in SQLite" };
    } else {
      try {
        state[table] = await syncStateTable(options.sql, table, snapshot.columns, snapshot.rows, {
          memo: options.memo,
          schema,
          apply: true,
          keepAbsent: false,
          allowMassDelete: options.allowMassDelete ?? false,
          batchSize: options.batchSize ?? DEFAULT_BATCH_SIZE,
          lock: "try",
          statementTimeoutMs: options.statementTimeoutMs,
          fullVerifyMs: options.fullVerifyMs,
          now: options.now,
        });
      } catch (error) {
        options.memo.delete(table);
        state[table] = {
          ...emptyReport(snapshot.rows.length),
          status: "error",
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    }
    options.onTable?.(table, state[table]!);
    await yieldToEventLoop();
  }

  let journals: Partial<Record<JournalTable, JournalPassReport>> | null = null;
  if (options.cursors) {
    const journalOptions: JournalPassOptions = {
      schema,
      sourceId: options.sourceId,
      batchSize: options.batchSize,
      maxRows: options.journalMaxRows,
      tables: options.journalTables,
    };
    try {
      journals = await syncJournalsIncremental(
        options.sql,
        options.sqlite,
        options.cursors,
        journalOptions,
      );
    } catch (error) {
      journals = {
        action_logs: {
          status: "error",
          reason: error instanceof Error ? error.message : String(error),
          cursorBefore: 0,
          cursorAfter: 0,
          highWater: 0,
          read: 0,
          existing: 0,
          written: 0,
          complete: false,
        },
      };
    }
  }

  const totals = summarizePass(state, journals);
  return {
    startedAt,
    durationMs: now() - startedAt,
    ok: totals.blocked.length === 0 && totals.errors.length === 0,
    state,
    journals,
    totals,
  };
}
