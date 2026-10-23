// SPDX-License-Identifier: Apache-2.0
/**
 * Settlement of finished rounds with the bot.
 *
 * When a round pays someone, the room hands an unsigned receipt to the server. This module signs it
 * (`signReceipt`, HMAC under `SHENRON_ACTIVITY_SECRET`) and POSTs it to the bot API
 * (`POST {SHENRON_BOT_API_URL}/api/activity/settle`, lot A3). The bot verifies the receipt against
 * its own policy, applies the daily budget and credits; its answer says what was really paid, and
 * the server relays that to the room.
 *
 * The bot may be down, or may not expose the endpoint yet (404): the receipt then waits in a
 * bounded in-memory queue and is retried with a growing delay. Retrying is safe: every entry of a
 * receipt carries a fixed idempotency key (`activity:<instance>:<round>:<user>`), which the bot
 * refuses to pay twice. Each attempt signs a fresh validity window (a receipt is only valid for
 * `RECEIPT_TTL_MS`), so a bot that comes back an hour later still accepts it. The queue is not
 * persisted: a receipt lost to a restart is a reward not paid, never a reward paid twice.
 *
 * The bot's side is `apps/bot/src/api/activity.ts` and `packages/api/src/contract/activity.ts`:
 * `POST /api/activity/settle` with the body `{ receipt, signature }` and `Authorization: Bearer
 * SHENRON_ACTIVITY_TOKEN`; it answers `{ ok: true, roundId, replayed, entries: [{ userId, status,
 * requested, granted, reason, xp, ... }] }`, where `granted` is what was really credited. Only
 * `userId`, `granted` and `reason` matter here; the rest is the bot's business.
 */
import {
  RECEIPT_TTL_MS,
  signReceipt,
  type SettlementReceipt,
} from "@aphrody/shenron-activity/quiz";
import {
  RewardReasonSchema,
  RoundIdSchema,
  UserIdSchema,
  type Settled,
} from "@aphrody/shenron-activity/protocol";
import { z } from "zod";
import { silentLogger, type Logger } from "../log";

export interface SettlerOptions {
  /** `null` disables settlement: receipts are logged and dropped. */
  readonly secret: string | null;
  readonly botApiUrl: string;
  readonly botApiToken?: string | null;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  /** Called with what the bot reported as paid. */
  readonly onSettled: (instanceId: string, settled: Settled) => void;
  readonly log?: Logger;
  /** Receipts kept waiting at most (the oldest is dropped beyond it). */
  readonly maxQueue?: number;
  /** A receipt older than this is given up (a room lives at most two hours). */
  readonly maxAgeMs?: number;
  /** Delay before attempt number `attempt` (1 = first retry). */
  readonly backoffMs?: (attempt: number) => number;
  readonly requestTimeoutMs?: number;
}

interface Entry {
  readonly receipt: SettlementReceipt;
  readonly queuedAt: number;
  attempts: number;
  nextAttemptAt: number;
}

export const SETTLE_PATH = "/api/activity/settle";
export const DEFAULT_MAX_QUEUE = 100;
export const DEFAULT_MAX_AGE_MS = 2 * 60 * 60_000;

export function defaultBackoff(attempt: number): number {
  return Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, attempt - 1));
}

/** The part of the bot's `ActivitySettleResponse` the Activity relays to the room. */
const AnswerSchema = z.object({
  roundId: RoundIdSchema,
  entries: z.array(
    z.object({
      userId: UserIdSchema,
      granted: z.number().int().nonnegative(),
      reason: RewardReasonSchema,
    }),
  ),
});

/**
 * HTTP statuses worth another try: the endpoint is not there yet (404), the bot is busy or down
 * (408, 425, 429, 5xx), or the services are not configured in step (401 token, 403 signature, 503):
 * an operator fixes those without the Activity's help. 400, 410 and 422 say the receipt itself is
 * wrong or too old, and nothing will change that.
 */
export function retryable(status: number): boolean {
  return (
    status === 401 ||
    status === 403 ||
    status === 404 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

export class Settler {
  readonly #options: SettlerOptions;
  readonly #queue: Entry[] = [];
  readonly #log: Logger;
  readonly #now: () => number;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #inflight: Promise<void> | null = null;
  #stopped = false;
  #settledCount = 0;
  #droppedCount = 0;
  #lastWarnAt = 0;

  constructor(options: SettlerOptions) {
    this.#options = options;
    this.#log = options.log ?? silentLogger;
    this.#now = options.now ?? Date.now;
  }

  /** Whether receipts can be signed at all. */
  get enabled(): boolean {
    return this.#options.secret !== null;
  }

  /** Receipts waiting for the bot. */
  get pending(): number {
    return this.#queue.length;
  }

  get stats(): { pending: number; settled: number; dropped: number } {
    return {
      pending: this.#queue.length,
      settled: this.#settledCount,
      dropped: this.#droppedCount,
    };
  }

  /** Queues a finished round's receipt and tries to settle it right away. */
  enqueue(receipt: SettlementReceipt): void {
    if (this.#stopped) return;
    if (this.#options.secret === null) {
      this.#drop(receipt, "settlement is not configured (SHENRON_ACTIVITY_SECRET)");
      return;
    }
    const maxQueue = this.#options.maxQueue ?? DEFAULT_MAX_QUEUE;
    while (this.#queue.length >= maxQueue) {
      const oldest = this.#queue.shift();
      if (oldest) this.#drop(oldest.receipt, "settlement queue is full");
    }
    const now = this.#now();
    this.#queue.push({ receipt, queuedAt: now, attempts: 0, nextAttemptAt: now });
    void this.run();
  }

  /**
   * Attempts every receipt that is due, then arms the timer for the next retry. Concurrent calls
   * share one run: awaiting it means the receipts due at that moment have been tried.
   */
  run(): Promise<void> {
    this.#inflight ??= this.#drain().finally(() => {
      this.#inflight = null;
      this.#arm();
    });
    return this.#inflight;
  }

  async #drain(): Promise<void> {
    if (this.#stopped) return;
    const maxAge = this.#options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    const handled = new Set<Entry>();
    for (;;) {
      const now = this.#now();
      const due = this.#queue.filter((entry) => !handled.has(entry) && entry.nextAttemptAt <= now);
      if (due.length === 0) break;
      for (const entry of due) {
        handled.add(entry);
        if (this.#now() - entry.queuedAt > maxAge) {
          this.#remove(entry);
          this.#drop(entry.receipt, "receipt is too old to settle");
        } else {
          await this.#attempt(entry);
        }
      }
    }
    // Receipts that are not due yet but have outlived their usefulness go too.
    const now = this.#now();
    for (const entry of this.#queue.filter((candidate) => now - candidate.queuedAt > maxAge)) {
      this.#remove(entry);
      this.#drop(entry.receipt, "receipt is too old to settle");
    }
  }

  stop(): void {
    this.#stopped = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
  }

  #arm(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    if (this.#stopped || this.#queue.length === 0) return;
    const next = Math.min(...this.#queue.map((entry) => entry.nextAttemptAt));
    const delay = Math.max(50, next - this.#now());
    this.#timer = setTimeout(() => void this.run(), Math.min(delay, 2 ** 31 - 1));
    // A pending retry must not keep the process alive on its own.
    (this.#timer as { unref?: () => void }).unref?.();
  }

  #remove(entry: Entry): void {
    const index = this.#queue.indexOf(entry);
    if (index >= 0) this.#queue.splice(index, 1);
  }

  #drop(receipt: SettlementReceipt, reason: string): void {
    this.#droppedCount += 1;
    this.#log.warn("settlement receipt dropped", {
      reason,
      instanceId: receipt.instanceId,
      roundId: receipt.roundId,
    });
  }

  #later(entry: Entry, reason: string, status?: number): void {
    entry.attempts += 1;
    const backoff = this.#options.backoffMs ?? defaultBackoff;
    entry.nextAttemptAt = this.#now() + backoff(entry.attempts);
    const now = this.#now();
    // One warning a minute at most: a bot that is down must not flood the journal.
    if (now - this.#lastWarnAt >= 60_000) {
      this.#lastWarnAt = now;
      this.#log.warn("settlement postponed", {
        reason,
        status,
        attempts: entry.attempts,
        pending: this.#queue.length,
        roundId: entry.receipt.roundId,
      });
    }
  }

  async #attempt(entry: Entry): Promise<void> {
    const secret = this.#options.secret;
    if (secret === null) return;
    const now = this.#now();
    // Same entries and idempotency keys, a fresh validity window.
    const fresh: SettlementReceipt = {
      ...entry.receipt,
      issuedAt: now,
      expiresAt: now + RECEIPT_TTL_MS,
    };
    let body: string;
    try {
      body = JSON.stringify(await signReceipt(fresh, secret));
    } catch (error) {
      this.#remove(entry);
      this.#drop(entry.receipt, `receipt could not be signed: ${(error as Error).message}`);
      return;
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.#options.botApiToken) headers.Authorization = `Bearer ${this.#options.botApiToken}`;

    let response: Response;
    try {
      response = await (this.#options.fetch ?? fetch)(`${this.#options.botApiUrl}${SETTLE_PATH}`, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(this.#options.requestTimeoutMs ?? 10_000),
      });
    } catch {
      this.#later(entry, "bot API unreachable");
      return;
    }

    if (response.ok) {
      this.#remove(entry);
      this.#settledCount += 1;
      const answer = AnswerSchema.safeParse(await response.json().catch(() => null));
      if (!answer.success) {
        this.#log.warn("settlement accepted without a usable answer", {
          roundId: entry.receipt.roundId,
        });
        return;
      }
      const settled: Settled = {
        roundId: answer.data.roundId,
        rewards: answer.data.entries.map((line) => ({
          userId: line.userId,
          zeni: line.granted,
          reason: line.reason,
        })),
      };
      if (settled.roundId === entry.receipt.roundId)
        this.#options.onSettled(entry.receipt.instanceId, settled);
      return;
    }
    await response.body?.cancel().catch(() => {});
    if (retryable(response.status)) {
      this.#later(entry, "bot API not ready", response.status);
      return;
    }
    // 400, 409, 410, 422: the bot understood and refused this receipt. Retrying the same one
    // would be refused the same way.
    this.#remove(entry);
    this.#drop(entry.receipt, `bot API refused the receipt (HTTP ${response.status})`);
  }
}
