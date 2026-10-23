import { GuildMemberManager } from "discord.js";
import { logger } from "~/lib/logger";

/**
 * Full member fetches (`guild.members.fetch()`, gateway opcode 8) made safe.
 *
 * Discord allows very few opcode 8 requests per guild: a second one while another is in
 * flight, or right after one, is refused with `GatewayRateLimitError` ("Retry after 28.7
 * seconds"). The bot used to issue several at the same instant (guild mirror, level role
 * reconcile, Redis indexer, both at startup and then in lockstep every 6 h), so one of
 * them always failed.
 *
 * `installMemberFetchGuard()` wraps the bulk form of `GuildMemberManager#fetch` once:
 *   - callers asking for all members at the same time share a single request;
 *   - a recent complete fetch is reused (the gateway keeps the cache current in between);
 *   - a rate limit waits the advertised `retry_after`, then retries once.
 * Single-member and query fetches are untouched (they go through REST or other limits).
 */

/** A complete fetch younger than this is reused: gateway events keep the cache current. */
export const MEMBER_FETCH_FRESH_MS = 30 * 60_000;
/** Margin added to the advertised `retry_after`. */
export const RATE_LIMIT_MARGIN_MS = 750;
/** Longest wait honoured before giving up and surfacing the rate limit. */
export const RATE_LIMIT_MAX_WAIT_MS = 90_000;

type RateLimitLike = { name?: unknown; data?: { opcode?: unknown; retry_after?: unknown } };

/** True for discord.js `GatewayRateLimitError` (matched structurally: several copies may coexist). */
export function isGatewayRateLimit(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as RateLimitLike;
  return e.name === "GatewayRateLimitError" && typeof e.data?.retry_after === "number";
}

/** Milliseconds to wait before retrying a rate limited request (margin included, capped). */
export function rateLimitWaitMs(err: unknown, maxMs = RATE_LIMIT_MAX_WAIT_MS): number {
  const seconds = (err as RateLimitLike).data?.retry_after;
  const advertised = typeof seconds === "number" && Number.isFinite(seconds) ? seconds * 1000 : 0;
  return Math.min(Math.max(advertised, 0) + RATE_LIMIT_MARGIN_MS, maxMs);
}

type Clock = { now(): number; sleep(ms: number): Promise<void> };

const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

type Entry = { inflight: Promise<unknown> | null; lastOkAt: number };

export type RunOptions<T> = {
  /** Result served instead of a request while the last complete fetch is fresh. */
  cached: () => T | null;
  /** Skips the freshness shortcut (a request already in flight is still shared). */
  force?: boolean;
};

/**
 * Serialises bulk member fetches per guild: one request at a time, shared by every
 * concurrent caller, reused while fresh, retried once after a gateway rate limit.
 */
export class MemberFetchCoordinator {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly clock: Clock = systemClock,
    private readonly freshMs = MEMBER_FETCH_FRESH_MS,
    private readonly maxWaitMs = RATE_LIMIT_MAX_WAIT_MS,
  ) {}

  run<T>(guildId: string, fetchAll: () => Promise<T>, options: RunOptions<T>): Promise<T> {
    let entry = this.entries.get(guildId);
    if (!entry) {
      entry = { inflight: null, lastOkAt: 0 };
      this.entries.set(guildId, entry);
    }
    if (entry.inflight) return entry.inflight as Promise<T>;
    if (!options.force && entry.lastOkAt > 0 && this.clock.now() - entry.lastOkAt < this.freshMs) {
      const cached = options.cached();
      if (cached) return Promise.resolve(cached);
    }
    const state = entry;
    const request = this.attempt(guildId, fetchAll)
      .then((members) => {
        state.lastOkAt = this.clock.now();
        return members;
      })
      .finally(() => {
        state.inflight = null;
      });
    state.inflight = request;
    return request;
  }

  private async attempt<T>(guildId: string, fetchAll: () => Promise<T>): Promise<T> {
    try {
      return await fetchAll();
    } catch (err) {
      if (!isGatewayRateLimit(err)) throw err;
      const wait = rateLimitWaitMs(err, this.maxWaitMs);
      logger.warn({ guildId, waitMs: wait }, "[guild-members] gateway rate limit, retrying once");
      await this.clock.sleep(wait);
      return fetchAll();
    }
  }
}

/** The coordinator shared by every bulk fetch of the process. */
export const memberFetches = new MemberFetchCoordinator();

type FetchOptions = { force?: boolean } | undefined;

/** True when `fetch(options)` asks for the whole member list (not one member, not a query). */
export function isBulkMemberFetch(options: unknown): options is FetchOptions {
  if (options === undefined) return true;
  if (typeof options !== "object" || options === null || Array.isArray(options)) return false;
  return Object.keys(options).every((key) => key === "force");
}

type FetchFn = (this: unknown, options?: unknown) => Promise<unknown>;
type ManagerLike = { guild: { id: string; memberCount: number }; cache: { size: number } };

const GUARD = Symbol.for("shenron.memberFetchGuard");

/**
 * Wraps the bulk form of `GuildMemberManager#fetch` (idempotent). `target` is injectable
 * for tests; it defaults to discord.js' manager class.
 */
export function installMemberFetchGuard(
  target: { prototype: { fetch: FetchFn } } = GuildMemberManager as unknown as {
    prototype: { fetch: FetchFn };
  },
  coordinator: MemberFetchCoordinator = memberFetches,
): boolean {
  const proto = target.prototype as { fetch: FetchFn } & { [GUARD]?: true };
  if (proto[GUARD]) return false;
  const original = proto.fetch;
  proto.fetch = function guardedFetch(this: unknown, options?: unknown) {
    if (!isBulkMemberFetch(options)) return original.call(this, options);
    const manager = this as ManagerLike;
    const complete = () =>
      manager.guild.memberCount > 0 && manager.cache.size >= manager.guild.memberCount
        ? (manager.cache as unknown)
        : null;
    return coordinator.run(manager.guild.id, () => original.call(this) as Promise<unknown>, {
      cached: complete as () => unknown,
      force: options?.force === true,
    });
  };
  proto[GUARD] = true;
  return true;
}
