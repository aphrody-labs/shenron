import {
  PgCursorStore,
  runReplicaPass,
  type CursorStore,
  type PassTotals,
  type ReplicaMemo,
  type ReplicaPassReport,
  type SqlClient,
} from "@aphrody/shenron-db/replica";
import { BOT_STATE_REPLICA_NAMES } from "@aphrody/shenron-db/bot-schema";
import { inject, singleton } from "tsyringe";
import { DatabaseService } from "~/db/index";
import { PgService } from "~/db/pg";
import { logger } from "~/lib/logger";
import {
  REPLICA_SYNC_DEFAULT_INTERVAL_MINUTES,
  REPLICA_SYNC_DEFAULT_SOURCE_ID,
  REPLICA_SYNC_ENABLED,
  REPLICA_SYNC_INTERVAL_MINUTES,
  REPLICA_SYNC_JOURNALS,
  REPLICA_SYNC_SOURCE_ID,
  REPLICA_SYNC_SOURCE_ID_PATTERN,
  SettingsService,
} from "./SettingsService";

/** A pass that runs longer than this is abandoned (its connection is not reused until it returns). */
export const REPLICA_PASS_TIMEOUT_MS = 10 * 60_000;
/** PostgreSQL gives up on any single statement of a table transaction after this long. */
export const REPLICA_STATEMENT_TIMEOUT_MS = 60_000;
/** The same warning or error is logged again after this long if it persists. */
const LOG_REPEAT_MS = 6 * 3_600_000;
/** A missing cursor table is looked for again after this long (Infra may have created it). */
const CURSOR_RETRY_MS = 3_600_000;

export type ReplicaSyncTrigger = "startup" | "cron" | "manual";

export type ReplicaPassOutcome =
  | "ok"
  | "partial"
  | "blocked"
  | "error"
  | "skipped-disabled"
  | "skipped-unconfigured"
  | "skipped-running";

export interface ReplicaSyncConfig {
  enabled: boolean;
  intervalMinutes: number;
  journals: boolean;
  sourceId: string;
}

/** Read-only view of the last pass for the admin health endpoint. */
export interface ReplicaSyncStatus {
  /** `DATABASE_URL` is set: without it the synchronisation does not exist. */
  configured: boolean;
  enabled: boolean;
  running: boolean;
  intervalMinutes: number;
  sourceId: string;
  passes: number;
  consecutiveFailures: number;
  lastOkAt: number | null;
  lastPass: {
    trigger: ReplicaSyncTrigger;
    outcome: ReplicaPassOutcome;
    startedAt: number;
    durationMs: number;
    totals: PassTotals | null;
    /** Tables that are not in sync, blocked, busy, errored or repaired, with their reason. */
    attention: { table: string; status: string; reason?: string }[];
    journals: Record<
      string,
      { status: string; cursor: number; highWater: number; written: number; complete: boolean }
    > | null;
    /** Journals are off because the cursor table is missing and could not be created. */
    journalsUnavailable?: string;
    error?: string;
  } | null;
  /** State tables whose last mirror the next pass trusts (incremental). */
  memoTables: number;
}

function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}

/**
 * Keeps the PostgreSQL replica of the bot's runtime state (`bot.*`) current: every few minutes the
 * rows that changed in SQLite are written to PostgreSQL, and the append-only journals are copied
 * after a persistent cursor. The engine is `@aphrody/shenron-db/replica`, shared with the manual
 * script (`scripts/ops/sync-bot-runtime-sqlite-to-postgres.ts`); this service owns the settings,
 * the schedule's guard rails, the logging and the status.
 *
 * SQLite stays the source; PostgreSQL is only ever written, and a pass that fails, is blocked by the
 * deletion guard or finds PostgreSQL unreachable leaves the bot untouched.
 */
@singleton()
export class ReplicaSyncService {
  /** The engine; replaced by tests. */
  engine: typeof runReplicaPass = runReplicaPass;
  /** Process environment; replaced by tests. */
  env: Record<string, string | undefined> = process.env;
  /** PostgreSQL schema of the replica; replaced by tests. */
  schema = "bot";
  passTimeoutMs = REPLICA_PASS_TIMEOUT_MS;

  private memo: ReplicaMemo = new Map();
  private running = false;
  private passes = 0;
  private consecutiveFailures = 0;
  private lastOkAt: number | null = null;
  private lastPass: ReplicaSyncStatus["lastPass"] = null;
  private config: ReplicaSyncConfig = {
    enabled: true,
    intervalMinutes: REPLICA_SYNC_DEFAULT_INTERVAL_MINUTES,
    journals: true,
    sourceId: REPLICA_SYNC_DEFAULT_SOURCE_ID,
  };
  private cursors: CursorStore | null = null;
  private cursorsCheckedAt = 0;
  private journalsUnavailable: string | undefined;
  private readonly logged = new Map<string, number>();

  constructor(
    @inject(DatabaseService) private dbs: DatabaseService,
    @inject(PgService) private pg: PgService,
    @inject(SettingsService) private settings: SettingsService,
  ) {}

  /** The site's PostgreSQL is reachable from this process: the only precondition of the sync. */
  isConfigured(): boolean {
    return Boolean(this.env.DATABASE_URL?.trim()) && this.env.NODE_ENV !== "test";
  }

  /** The settings, validated; the last good values when the settings cannot be read. */
  async readConfig(): Promise<ReplicaSyncConfig> {
    const minutes = await this.settings.getInt(
      REPLICA_SYNC_INTERVAL_MINUTES,
      REPLICA_SYNC_DEFAULT_INTERVAL_MINUTES,
    );
    const sourceId = await this.settings.getString(
      REPLICA_SYNC_SOURCE_ID,
      REPLICA_SYNC_DEFAULT_SOURCE_ID,
    );
    this.config = {
      enabled: await this.settings.getBool(REPLICA_SYNC_ENABLED, true),
      intervalMinutes: Math.min(1440, Math.max(1, minutes)),
      journals: await this.settings.getBool(REPLICA_SYNC_JOURNALS, true),
      sourceId: REPLICA_SYNC_SOURCE_ID_PATTERN.test(sourceId)
        ? sourceId
        : REPLICA_SYNC_DEFAULT_SOURCE_ID,
    };
    return this.config;
  }

  /** Cadence of the schedule, in milliseconds. */
  async intervalMs(): Promise<number> {
    return (await this.readConfig()).intervalMinutes * 60_000;
  }

  status(): ReplicaSyncStatus {
    return {
      configured: this.isConfigured(),
      enabled: this.config.enabled,
      running: this.running,
      intervalMinutes: this.config.intervalMinutes,
      sourceId: this.config.sourceId,
      passes: this.passes,
      consecutiveFailures: this.consecutiveFailures,
      lastOkAt: this.lastOkAt,
      lastPass: this.lastPass,
      memoTables: this.memo.size,
    };
  }

  /**
   * One pass. Never throws: a failure is logged, kept in {@link status} and counted. Two passes never
   * overlap (a second call while one runs returns at once; PostgreSQL's advisory lock covers the
   * manual script and a second bot process).
   */
  async runPass(trigger: ReplicaSyncTrigger = "cron"): Promise<ReplicaSyncStatus["lastPass"]> {
    const startedAt = Date.now();
    const skip = (outcome: ReplicaPassOutcome) => {
      if (outcome !== "skipped-running") {
        this.lastPass = {
          trigger,
          outcome,
          startedAt,
          durationMs: 0,
          totals: null,
          attention: [],
          journals: null,
        };
      }
      return this.lastPass;
    };
    if (this.running) return skip("skipped-running");
    this.running = true;
    try {
      const config = await this.readConfig();
      if (!config.enabled) return skip("skipped-disabled");
      const handle = this.isConfigured() ? this.pg.get() : null;
      if (!handle) return skip("skipped-unconfigured");
      const sql: SqlClient = handle.sql;

      const cursors = config.journals ? await this.cursorStore(sql, config.sourceId) : undefined;
      const work = this.engine({
        sqlite: this.dbs.sqlite,
        sql,
        sourceId: config.sourceId,
        schema: this.schema,
        memo: this.memo,
        cursors,
        stateTables: BOT_STATE_REPLICA_NAMES,
        statementTimeoutMs: REPLICA_STATEMENT_TIMEOUT_MS,
      });
      let report: ReplicaPassReport;
      try {
        report = await withTimeout(work, this.passTimeoutMs, "replica pass");
      } catch (error) {
        // The abandoned pass may still be writing into the old memo: start over with a new one.
        this.memo = new Map();
        throw error;
      }
      return this.record(trigger, report);
    } catch (error) {
      this.passes++;
      this.consecutiveFailures++;
      const message = error instanceof Error ? error.message : String(error);
      this.lastPass = {
        trigger,
        outcome: "error",
        startedAt,
        durationMs: Date.now() - startedAt,
        totals: null,
        attention: [],
        journals: null,
        error: message,
      };
      this.logOnce(
        "pass-failed",
        "warn",
        { err: message },
        "[replica] pass failed, PostgreSQL left as is",
      );
      return this.lastPass;
    } finally {
      this.running = false;
    }
  }

  /** The persistent journal cursors, or undefined while their table is missing. */
  private async cursorStore(sql: SqlClient, sourceId: string): Promise<CursorStore | undefined> {
    if (this.cursors) return this.cursors;
    if (Date.now() - this.cursorsCheckedAt < CURSOR_RETRY_MS && this.journalsUnavailable) {
      return undefined;
    }
    this.cursorsCheckedAt = Date.now();
    const store = new PgCursorStore(sql, this.schema);
    if (await store.ensure()) {
      this.cursors = store;
      this.journalsUnavailable = undefined;
      return store;
    }
    this.journalsUnavailable =
      "bot.sqlite_sync_cursor is missing and this role cannot create it (apps/site/src/db/bot-sqlite-sync-cursor.sql)";
    this.logOnce(
      "cursor-missing",
      "warn",
      { sourceId },
      `[replica] journals not copied: ${this.journalsUnavailable}`,
    );
    return undefined;
  }

  private record(trigger: ReplicaSyncTrigger, report: ReplicaPassReport) {
    this.passes++;
    const { totals } = report;
    const failed = totals.errors.length > 0;
    const blocked = totals.blocked.length > 0;
    if (report.ok) {
      this.consecutiveFailures = 0;
      this.lastOkAt = report.startedAt + report.durationMs;
    } else {
      this.consecutiveFailures++;
    }
    const attention: NonNullable<ReplicaSyncStatus["lastPass"]>["attention"] = [];
    for (const [table, state] of Object.entries(report.state)) {
      if (state.status === "in-sync" || (state.status === "applied" && !state.drift)) continue;
      attention.push({ table, status: state.status, reason: state.reason ?? state.drift });
    }
    const journals: NonNullable<ReplicaSyncStatus["lastPass"]>["journals"] = report.journals
      ? Object.fromEntries(
          Object.entries(report.journals).map(([table, journal]) => [
            table,
            {
              status: journal.status,
              cursor: journal.cursorAfter,
              highWater: journal.highWater,
              written: journal.written,
              complete: journal.complete,
            },
          ]),
        )
      : null;
    const outcome: ReplicaPassOutcome = blocked
      ? "blocked"
      : failed
        ? "error"
        : totals.busy > 0 || totals.skipped > 0
          ? "partial"
          : "ok";
    this.lastPass = {
      trigger,
      outcome,
      startedAt: report.startedAt,
      durationMs: report.durationMs,
      totals,
      attention,
      journals,
      ...(this.journalsUnavailable ? { journalsUnavailable: this.journalsUnavailable } : {}),
    };
    this.log(trigger, report, outcome);
    return this.lastPass;
  }

  private log(trigger: ReplicaSyncTrigger, report: ReplicaPassReport, outcome: ReplicaPassOutcome) {
    const { totals } = report;
    logger.info(
      {
        outcome,
        trigger,
        ms: report.durationMs,
        tables: totals.tables,
        inSync: totals.inSync,
        applied: totals.applied,
        full: totals.full,
        insert: totals.insert,
        update: totals.update,
        delete: totals.delete,
        busy: totals.busy,
        journalRead: totals.journalRead,
        journalWritten: totals.journalWritten,
        journalPending: totals.journalPending || undefined,
      },
      "[replica] pass",
    );
    if (totals.blocked.length > 0) {
      this.logOnce(
        `blocked:${totals.blocked.join("|")}`,
        "error",
        { blocked: totals.blocked },
        "[replica] mass deletion blocked, PostgreSQL left untouched (review, then allow it with the script)",
      );
    }
    if (totals.errors.length > 0) {
      this.logOnce(
        `errors:${totals.errors.join("|")}`,
        "warn",
        { errors: totals.errors },
        "[replica] tables not synchronised",
      );
    }
    if (totals.drift.length > 0) {
      this.logOnce(
        `drift:${totals.drift.join("|")}`,
        "warn",
        { drift: totals.drift },
        "[replica] PostgreSQL had drifted from the previous pass and was repaired",
      );
    }
    for (const [table, state] of Object.entries(report.state)) {
      const columns = [...state.sqliteOnlyColumns, ...state.unsupportedColumns];
      if (columns.length === 0) continue;
      this.logOnce(
        `schema:${table}:${columns.join(",")}`,
        "warn",
        { table, columns },
        "[replica] columns not replicated (Infra migration needed or unsupported type)",
      );
    }
  }

  /** Logs `key` at most once per {@link LOG_REPEAT_MS} so a standing fault does not fill the journal. */
  private logOnce(
    key: string,
    level: "warn" | "error",
    fields: Record<string, unknown>,
    message: string,
  ) {
    const last = this.logged.get(key);
    if (last !== undefined && Date.now() - last < LOG_REPEAT_MS) return;
    this.logged.set(key, Date.now());
    if (this.logged.size > 200) this.logged.delete(this.logged.keys().next().value!);
    logger[level](fields, message);
  }
}
