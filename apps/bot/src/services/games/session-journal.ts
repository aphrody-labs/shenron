/**
 * Journal of the mini-game sessions in progress, on disk next to `bot.db`.
 *
 * The games live in memory: a restart (deploy, crash) used to drop them on the
 * floor. The boards stayed on screen as if playable, and the stakes escrowed
 * at the start of a duel were simply lost — both players paid, nobody was ever
 * refunded. Each session is now written here while it runs; a process that
 * stops beating leaves its sessions behind, and the next one refunds the
 * stakes and closes the boards (`GameRecoveryService`).
 *
 * Ownership is by boot id + heartbeat, not by pid: during a rolling deploy two
 * processes may share the data directory, and the newcomer must not refund a
 * game the old process is still about to settle.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

interface JournalFile {
  boots: Record<string, number>;
  entries: JournalEntry[];
}

export const HEARTBEAT_MS = 30_000;
/** A boot that has not beaten for this long is considered dead. */
export const STALE_AFTER_MS = 3 * HEARTBEAT_MS;

export function journalPathFor(databasePath: string | undefined): string | null {
  if (!databasePath || databasePath === ":memory:") return null;
  return join(dirname(resolve(databasePath)), "game-sessions.json");
}

export class GameSessionJournal {
  readonly bootId = crypto.randomUUID();

  constructor(private readonly path: string | null) {}

  private read(): JournalFile {
    if (!this.path || !existsSync(this.path)) return { boots: {}, entries: [] };
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8")) as Partial<JournalFile>;
      return {
        boots: raw.boots && typeof raw.boots === "object" ? raw.boots : {},
        entries: Array.isArray(raw.entries) ? raw.entries : [],
      };
    } catch {
      return { boots: {}, entries: [] };
    }
  }

  private write(file: JournalFile): void {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${this.bootId}.tmp`;
    writeFileSync(tmp, JSON.stringify(file));
    renameSync(tmp, this.path);
  }

  private mutate(fn: (file: JournalFile) => void): void {
    if (!this.path) return;
    try {
      const file = this.read();
      fn(file);
      this.write(file);
    } catch {
      /* best effort: a journal failure never blocks a game */
    }
  }

  heartbeat(now = Date.now()): void {
    this.mutate((file) => {
      file.boots[this.bootId] = now;
    });
  }

  open(entry: Omit<JournalEntry, "bootId" | "startedAt">, now = Date.now()): void {
    this.mutate((file) => {
      file.boots[this.bootId] = now;
      file.entries = file.entries.filter((e) => e.id !== entry.id);
      file.entries.push({ ...entry, startedAt: now, bootId: this.bootId });
    });
  }

  update(id: string, patch: Partial<Pick<JournalEntry, "channelId" | "messageId">>): void {
    this.mutate((file) => {
      const entry = file.entries.find((e) => e.id === id && e.bootId === this.bootId);
      if (entry) Object.assign(entry, patch);
    });
  }

  close(id: string): void {
    this.mutate((file) => {
      file.entries = file.entries.filter((e) => !(e.id === id && e.bootId === this.bootId));
    });
  }

  /**
   * Removes and returns the sessions of dead boots (stale heartbeat, or no
   * heartbeat at all). Sessions of live boots — ours included — stay.
   */
  takeOrphans(now = Date.now()): JournalEntry[] {
    let orphans: JournalEntry[] = [];
    this.mutate((file) => {
      const alive = (bootId: string) =>
        bootId === this.bootId || now - (file.boots[bootId] ?? 0) < STALE_AFTER_MS;
      orphans = file.entries.filter((e) => !alive(e.bootId));
      file.entries = file.entries.filter((e) => alive(e.bootId));
      for (const bootId of Object.keys(file.boots)) {
        if (!alive(bootId) && !file.entries.some((e) => e.bootId === bootId)) {
          delete file.boots[bootId];
        }
      }
    });
    return orphans;
  }

  entries(): JournalEntry[] {
    return this.read().entries;
  }
}
