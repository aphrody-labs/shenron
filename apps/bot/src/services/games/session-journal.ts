/**
 * Journal of the mini-game sessions in progress, in a small SQLite file next
 * to `bot.db` (`game-sessions.sqlite`, private and ignored by Git).
 *
 * The games live in memory: a restart (deploy, crash) used to drop them on the
 * floor. The boards stayed on screen as if playable, and the stakes escrowed
 * at the start of a duel were simply lost — both players paid, nobody was ever
 * refunded. Each session is now written here while it runs; a process that
 * stops beating leaves its sessions behind, and the next one refunds the
 * stakes and closes the boards (`GameSessionsService`).
 *
 * Ownership is by boot id + heartbeat, not by pid: during a rolling deploy two
 * processes may share the data directory, and the newcomer must not refund a
 * game the old process is still about to settle. SQLite transactions keep the
 * two writers consistent.
 */
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface JournalEntry {
  id: string;
  game: string;
  players: string[];
  /** Stake escrowed per player (0 when nothing is held). */
  stake: number;
  channelId?: string;
  messageId?: string;
  startedAt: number;
  bootId: string;
}

interface EntryRow {
  id: string;
  boot_id: string;
  game: string;
  players: string;
  stake: number;
  channel_id: string | null;
  message_id: string | null;
  started_at: number;
}

export const HEARTBEAT_MS = 30_000;
/** A boot that has not beaten for this long is considered dead. */
export const STALE_AFTER_MS = 3 * HEARTBEAT_MS;

export function journalPathFor(databasePath: string | undefined): string | null {
  if (!databasePath || databasePath === ":memory:") return null;
  return join(dirname(resolve(databasePath)), "game-sessions.sqlite");
}

function toEntry(row: EntryRow): JournalEntry {
  let players: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.players);
    if (Array.isArray(parsed)) players = parsed.filter((p): p is string => typeof p === "string");
  } catch {
    /* unreadable row: no player to refund */
  }
  return {
    id: row.id,
    bootId: row.boot_id,
    game: row.game,
    players,
    stake: Math.max(0, Math.trunc(row.stake)),
    channelId: row.channel_id ?? undefined,
    messageId: row.message_id ?? undefined,
    startedAt: row.started_at,
  };
}

export class GameSessionJournal {
  readonly bootId = crypto.randomUUID();
  private db: Database | null = null;
  private failed = false;

  constructor(private readonly path: string | null) {}

  private connect(): Database | null {
    if (this.db || this.failed || !this.path) return this.db;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const db = new Database(this.path, { create: true });
      db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 2000;");
      db.exec(`
        CREATE TABLE IF NOT EXISTS boots (
          boot_id TEXT PRIMARY KEY,
          heartbeat_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT NOT NULL,
          boot_id TEXT NOT NULL,
          game TEXT NOT NULL,
          players TEXT NOT NULL,
          stake INTEGER NOT NULL DEFAULT 0,
          channel_id TEXT,
          message_id TEXT,
          started_at INTEGER NOT NULL,
          PRIMARY KEY (id, boot_id)
        );
      `);
      this.db = db;
    } catch {
      // Best effort: a journal failure never blocks a game.
      this.failed = true;
    }
    return this.db;
  }

  private run(fn: (db: Database) => void): void {
    const db = this.connect();
    if (!db) return;
    try {
      fn(db);
    } catch {
      /* best effort */
    }
  }

  heartbeat(now = Date.now()): void {
    this.run((db) => {
      db.query(
        "INSERT INTO boots (boot_id, heartbeat_at) VALUES (?1, ?2) ON CONFLICT(boot_id) DO UPDATE SET heartbeat_at = ?2",
      ).run(this.bootId, now);
    });
  }

  open(entry: Omit<JournalEntry, "bootId" | "startedAt">, now = Date.now()): void {
    this.run((db) => {
      db.transaction(() => {
        db.query(
          "INSERT INTO boots (boot_id, heartbeat_at) VALUES (?1, ?2) ON CONFLICT(boot_id) DO UPDATE SET heartbeat_at = ?2",
        ).run(this.bootId, now);
        db.query(
          `INSERT OR REPLACE INTO sessions
             (id, boot_id, game, players, stake, channel_id, message_id, started_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
        ).run(
          entry.id,
          this.bootId,
          entry.game,
          JSON.stringify(entry.players),
          Math.max(0, Math.trunc(entry.stake)),
          entry.channelId ?? null,
          entry.messageId ?? null,
          now,
        );
      })();
    });
  }

  update(id: string, patch: Partial<Pick<JournalEntry, "channelId" | "messageId">>): void {
    this.run((db) => {
      db.query(
        `UPDATE sessions
            SET channel_id = coalesce(?3, channel_id), message_id = coalesce(?4, message_id)
          WHERE id = ?1 AND boot_id = ?2`,
      ).run(id, this.bootId, patch.channelId ?? null, patch.messageId ?? null);
    });
  }

  close(id: string): void {
    this.run((db) => {
      db.query("DELETE FROM sessions WHERE id = ?1 AND boot_id = ?2").run(id, this.bootId);
    });
  }

  /**
   * Removes and returns the sessions of dead boots (stale heartbeat, or no
   * heartbeat at all). Sessions of live boots — ours included — stay.
   */
  takeOrphans(now = Date.now()): JournalEntry[] {
    let orphans: JournalEntry[] = [];
    this.run((db) => {
      db.transaction(() => {
        const cutoff = now - STALE_AFTER_MS;
        const rows = db
          .query(
            `SELECT s.* FROM sessions s
               LEFT JOIN boots b ON b.boot_id = s.boot_id
              WHERE s.boot_id <> ?1 AND coalesce(b.heartbeat_at, 0) < ?2`,
          )
          .all(this.bootId, cutoff) as EntryRow[];
        const remove = db.query("DELETE FROM sessions WHERE id = ?1 AND boot_id = ?2");
        for (const row of rows) remove.run(row.id, row.boot_id);
        db.query(
          `DELETE FROM boots
            WHERE boot_id <> ?1 AND heartbeat_at < ?2
              AND boot_id NOT IN (SELECT boot_id FROM sessions)`,
        ).run(this.bootId, cutoff);
        orphans = rows.map(toEntry);
      })();
    });
    return orphans;
  }

  entries(): JournalEntry[] {
    const db = this.connect();
    if (!db) return [];
    try {
      return (db.query("SELECT * FROM sessions").all() as EntryRow[]).map(toEntry);
    } catch {
      return [];
    }
  }
}
