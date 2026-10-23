// SPDX-License-Identifier: Apache-2.0
/**
 * Noise meter: how many public messages the bot posts, per channel and per type.
 *
 * It is the success criterion of the redesign (`docs/products/bot-discord-refonte.md` §1): the
 * public messages the bot posts outside editorial content (news, TikTok, giveaways, games in
 * progress) must drop at least five-fold, measured before and after by the same counter.
 *
 * Design:
 *  - a listener on `messageCreate` (`events/NoiseMeter.ts`) feeds `record()` for the bot's own
 *    guild messages only; an ephemeral reply never reaches the gateway, which is the point;
 *  - counts live in memory, in hourly buckets keyed by `channel|kind`, bounded (a bucket keeps at
 *    most `maxKeysPerBucket` keys, the rest is folded into `*|<kind>`; buckets older than the
 *    retention are dropped), so a message never costs a database write;
 *  - a flush every minute writes the buckets to a small JSON file next to the database when
 *    something changed, and `load()` restores them at boot: the "before" figures survive the
 *    deployments that ship the redesign;
 *  - `snapshot()` is the read-only view exposed by the admin API (`/api/health/noise`).
 */
import { dirname, join } from "node:path";

/** What the bot message is. Editorial kinds are excluded from the noise figure. */
export const NOISE_KINDS = [
  "command",
  "game",
  "giveaway",
  "news",
  "level",
  "achievement",
  "welcome",
  "farewell",
  "zeni",
  "share",
  "other",
] as const;
export type NoiseKind = (typeof NOISE_KINDS)[number];

/** News, TikTok, giveaways and games in progress: wanted content, not noise. */
export const EDITORIAL_KINDS: ReadonlySet<NoiseKind> = new Set(["news", "giveaway", "game"]);

export const isEditorial = (kind: string): boolean => EDITORIAL_KINDS.has(kind as NoiseKind);

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const OVERFLOW_CHANNEL = "*";
const SNAPSHOT_CHANNELS = 25;

export interface NoiseStore {
  load(): Promise<unknown | null>;
  save(data: unknown): Promise<void>;
}

export interface NoiseMeterOptions {
  now?: () => number;
  bucketMs?: number;
  /** How long buckets are kept (default 14 days). */
  retentionMs?: number;
  maxKeysPerBucket?: number;
  store?: NoiseStore;
}

interface PersistedMeter {
  version: 1;
  bucketMs: number;
  /** `bucket start (ms) → "channel|kind" → count`. */
  buckets: Record<string, Record<string, number>>;
}

export interface NoiseSnapshot {
  generatedAt: string;
  windowMs: number;
  /** Start of the oldest bucket still held, `null` when nothing was counted. */
  since: string | null;
  totals: { all: number; noise: number; editorial: number };
  byKind: Record<string, { count: number; editorial: boolean }>;
  /** Busiest channels first (at most 25). */
  channels: Array<{
    channelId: string;
    all: number;
    noise: number;
    kinds: Record<string, number>;
  }>;
  /** One entry per UTC day over the whole retention, oldest first. */
  daily: Array<{ day: string; noise: number; editorial: number }>;
}

type Bucket = Map<string, number>;

export class NoiseMeter {
  private buckets = new Map<number, Bucket>();
  private hints = new Map<string, { kind: NoiseKind; until: number }>();
  private dirty = false;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly now: () => number;
  private readonly bucketMs: number;
  private readonly retentionMs: number;
  private readonly maxKeys: number;
  private store: NoiseStore | undefined;

  constructor(options: NoiseMeterOptions = {}) {
    this.now = options.now ?? Date.now;
    this.bucketMs = options.bucketMs ?? HOUR_MS;
    this.retentionMs = options.retentionMs ?? 14 * DAY_MS;
    this.maxKeys = options.maxKeysPerBucket ?? 256;
    this.store = options.store;
  }

  /** Counts one public bot message. */
  record(event: { channelId: string; kind: NoiseKind | string }): void {
    const at = this.now();
    const start = Math.floor(at / this.bucketMs) * this.bucketMs;
    let bucket = this.buckets.get(start);
    if (!bucket) {
      bucket = new Map();
      this.buckets.set(start, bucket);
      this.prune(at);
    }
    let key = `${event.channelId}|${event.kind}`;
    if (!bucket.has(key) && bucket.size >= this.maxKeys) key = `${OVERFLOW_CHANNEL}|${event.kind}`;
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
    this.dirty = true;
  }

  /**
   * Tells the meter that the next message the bot posts in `channelId` within `ttlMs` is of
   * `kind` (a sender that knows what it posts says so, instead of the listener guessing from the
   * channel). Used by `shareButton()`; the level and news senders can do the same.
   */
  hint(channelId: string, kind: NoiseKind, ttlMs = 10_000): void {
    this.hints.set(channelId, { kind, until: this.now() + ttlMs });
    if (this.hints.size > 512) {
      const at = this.now();
      for (const [id, hint] of this.hints) if (hint.until < at) this.hints.delete(id);
    }
  }

  /** The kind announced by `hint()` for this channel (consumed), if still valid. */
  takeHint(channelId: string): NoiseKind | undefined {
    const hint = this.hints.get(channelId);
    if (!hint) return undefined;
    this.hints.delete(channelId);
    return hint.until >= this.now() ? hint.kind : undefined;
  }

  private prune(at: number): void {
    const oldest = at - this.retentionMs;
    for (const start of this.buckets.keys()) if (start < oldest) this.buckets.delete(start);
  }

  /** Counts over the last `windowMs` (default 24 h) plus the daily trend over the retention. */
  snapshot({ windowMs = DAY_MS }: { windowMs?: number } = {}): NoiseSnapshot {
    const at = this.now();
    const from = at - windowMs;
    const byKind: NoiseSnapshot["byKind"] = {};
    const channels = new Map<
      string,
      { all: number; noise: number; kinds: Record<string, number> }
    >();
    const daily = new Map<string, { noise: number; editorial: number }>();
    const totals = { all: 0, noise: 0, editorial: 0 };
    let oldest: number | null = null;

    for (const [start, bucket] of [...this.buckets].toSorted((a, b) => a[0] - b[0])) {
      oldest ??= start;
      const day = new Date(start).toISOString().slice(0, 10);
      const dayEntry = daily.get(day) ?? { noise: 0, editorial: 0 };
      daily.set(day, dayEntry);
      const inWindow = start + this.bucketMs > from;
      for (const [key, count] of bucket) {
        const split = key.lastIndexOf("|");
        const channelId = key.slice(0, split);
        const kind = key.slice(split + 1);
        const editorial = isEditorial(kind);
        dayEntry[editorial ? "editorial" : "noise"] += count;
        if (!inWindow) continue;
        totals.all += count;
        totals[editorial ? "editorial" : "noise"] += count;
        byKind[kind] = { count: (byKind[kind]?.count ?? 0) + count, editorial };
        const entry = channels.get(channelId) ?? { all: 0, noise: 0, kinds: {} };
        entry.all += count;
        if (!editorial) entry.noise += count;
        entry.kinds[kind] = (entry.kinds[kind] ?? 0) + count;
        channels.set(channelId, entry);
      }
    }
    const busiest: NoiseSnapshot["channels"] = [];
    for (const [channelId, entry] of channels) busiest.push({ channelId, ...entry });
    busiest.sort((a, b) => b.all - a.all);
    busiest.length = Math.min(busiest.length, SNAPSHOT_CHANNELS);
    const trend: NoiseSnapshot["daily"] = [];
    for (const [day, counts] of daily) trend.push({ day, ...counts });
    return {
      generatedAt: new Date(at).toISOString(),
      windowMs,
      since: oldest === null ? null : new Date(oldest).toISOString(),
      totals,
      byKind,
      channels: busiest,
      daily: trend,
    };
  }

  /** Forgets every count and hint (tests, or a deliberate reset of the baseline). */
  clear(): void {
    this.buckets.clear();
    this.hints.clear();
    this.dirty = true;
  }

  /** Attaches the persistence port (the listener does it once, with the database directory). */
  attach(store: NoiseStore): void {
    this.store = store;
  }

  /** Restores the persisted buckets (merged into what is already counted). */
  async load(): Promise<void> {
    if (!this.store) return;
    const raw = (await this.store.load().catch(() => null)) as PersistedMeter | null;
    if (!raw || raw.version !== 1 || raw.bucketMs !== this.bucketMs || !raw.buckets) return;
    for (const [startText, counts] of Object.entries(raw.buckets)) {
      const start = Number(startText);
      if (!Number.isFinite(start) || typeof counts !== "object" || counts === null) continue;
      const bucket = this.buckets.get(start) ?? new Map<string, number>();
      for (const [key, count] of Object.entries(counts)) {
        if (typeof count === "number" && Number.isFinite(count) && count > 0) {
          bucket.set(key, (bucket.get(key) ?? 0) + count);
        }
      }
      this.buckets.set(start, bucket);
    }
    this.prune(this.now());
  }

  /** Writes the buckets when something changed. Returns whether a write happened. */
  async flush(): Promise<boolean> {
    if (!this.store || !this.dirty) return false;
    this.dirty = false;
    this.prune(this.now());
    const data: PersistedMeter = { version: 1, bucketMs: this.bucketMs, buckets: {} };
    for (const [start, bucket] of this.buckets)
      data.buckets[String(start)] = Object.fromEntries(bucket);
    try {
      await this.store.save(data);
      return true;
    } catch (err) {
      this.dirty = true;
      throw err;
    }
  }

  /** Flushes every `everyMs` (default 60 s) without keeping the process alive. */
  startFlushing(everyMs = 60_000, onError: (err: unknown) => void = () => {}): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush().catch(onError), everyMs);
    this.timer.unref?.();
  }

  stopFlushing(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

/** JSON file store: `load()` is `null` for a missing or unreadable file, `save()` overwrites. */
export function jsonFileNoiseStore(path: string): NoiseStore {
  return {
    async load() {
      const file = Bun.file(path);
      if (!(await file.exists())) return null;
      return file.json();
    },
    async save(data) {
      await Bun.write(path, JSON.stringify(data));
    },
  };
}

/** `<directory of the database>/noise-meter.json`. */
export const noiseStorePath = (databasePath: string): string =>
  join(dirname(databasePath), "noise-meter.json");

// ─── classification ──────────────────────────────────────────────────────────────────────────

/** Commands whose public answer is a game in progress or a giveaway: editorial, not noise. */
const GAME_COMMANDS = new Set([
  "pfc",
  "morpion",
  "pendu",
  "bingo",
  "play",
  "jouer",
  "rps",
  "tictactoe",
  "hangman",
  "quiz",
  "raid",
  "hunt",
  "duel",
  "budokai",
  "daily",
  "gravity",
]);

/** The `channel.*` settings that name a channel of a known kind (first match wins on a tie). */
export const CHANNEL_KIND_KEYS: ReadonlyArray<readonly [string, NoiseKind]> = [
  ["channel.level", "level"],
  ["channel.achievement", "achievement"],
  ["channel.welcome", "welcome"],
  ["channel.farewell", "farewell"],
  ["channel.zeni", "zeni"],
  ["channel.giveaway", "giveaway"],
  ["channel.announce", "news"],
];

export interface BotMessageLike {
  channelId: string;
  /** Set when the message is the response of an interaction (a public slash command). */
  interactionMetadata?: unknown;
  interaction?: { commandName?: string } | null;
}

/**
 * The kind of a message the bot posted: a pending `hint()`, else the response of a command (a
 * game or giveaway command is editorial), else the kind of the channel named in the settings
 * (`channelKinds`), else `other`.
 */
export function classifyBotMessage(
  message: BotMessageLike,
  channelKinds: ReadonlyMap<string, NoiseKind>,
  meter: Pick<NoiseMeter, "takeHint"> = botNoiseMeter,
): NoiseKind {
  const hinted = meter.takeHint(message.channelId);
  if (hinted) return hinted;
  if (message.interactionMetadata || message.interaction) {
    const root = (message.interaction?.commandName ?? "").split(" ")[0]?.toLowerCase() ?? "";
    if (root === "giveaway") return "giveaway";
    return GAME_COMMANDS.has(root) ? "game" : "command";
  }
  return channelKinds.get(message.channelId) ?? "other";
}

/** The process-wide meter (fed by `events/NoiseMeter.ts`, read by the admin API). */
export const botNoiseMeter = new NoiseMeter();
