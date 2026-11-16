// SPDX-License-Identifier: Apache-2.0
/**
 * Admission of the DM chat: one model for every member, so every request goes through a global
 * queue with bounded concurrency (`SHENRON_DM_CONCURRENCY`, 2), each user has one request in
 * flight and a quota per window, and owners skip the quotas and go first in the queue. Settings
 * and defaults: `@shenron/config/dm-chat`.
 */
import type { DmChatSettings } from "@shenron/config/dm-chat";

export type DmAdmission =
  | { ok: true; ticket: DmTicket }
  | { ok: false; reason: "busy" }
  | { ok: false; reason: "rate"; retryMs: number }
  | { ok: false; reason: "full" };

export interface DmTicket {
  /** Requests ahead of this one plus one when queued; 0 when it runs at once. */
  readonly position: number;
  /** Resolves when the ticket holds a generation slot. */
  readonly ready: Promise<void>;
  /** Frees the slot (or leaves the queue); idempotent. */
  release(): void;
}

interface Waiter {
  owner: boolean;
  grant: () => void;
}

type Limits = Pick<DmChatSettings, "concurrency" | "queueMax" | "userMessages" | "userWindowMs">;

export class DmChatGate {
  private running = 0;
  private readonly queue: Waiter[] = [];
  private readonly inFlight = new Set<string>();
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limits: Limits,
    private readonly now: () => number = Date.now,
  ) {}

  /** Generations running now. */
  get active(): number {
    return this.running;
  }

  /** Requests waiting for a slot. */
  get waiting(): number {
    return this.queue.length;
  }

  /** Admit one message of `userId`; an admitted message counts against the user's quota. */
  admit(userId: string, owner = false): DmAdmission {
    if (!owner) {
      if (this.inFlight.has(userId)) return { ok: false, reason: "busy" };
      const now = this.now();
      const recent = (this.hits.get(userId) ?? []).filter(
        (at) => now - at < this.limits.userWindowMs,
      );
      if (recent.length >= this.limits.userMessages) {
        this.hits.set(userId, recent);
        return { ok: false, reason: "rate", retryMs: recent[0]! + this.limits.userWindowMs - now };
      }
      if (this.running >= this.limits.concurrency && this.queue.length >= this.limits.queueMax)
        return { ok: false, reason: "full" };
      recent.push(now);
      this.hits.set(userId, recent);
      if (this.hits.size > 10_000) this.prune(now);
    }
    this.inFlight.add(userId);
    return { ok: true, ticket: this.ticket(userId, owner) };
  }

  private ticket(userId: string, owner: boolean): DmTicket {
    let state: "queued" | "running" | "done" = "queued";
    let position = 0;
    let grant!: () => void;
    const ready = new Promise<void>((resolve) => {
      grant = () => {
        state = "running";
        this.running++;
        resolve();
      };
    });
    const waiter: Waiter = { owner, grant };
    if (this.running < this.limits.concurrency && this.queue.length === 0) grant();
    else {
      // Owners go after the owners already waiting, before everyone else.
      const at = owner ? this.queue.findIndex((w) => !w.owner) : -1;
      if (at >= 0) this.queue.splice(at, 0, waiter);
      else this.queue.push(waiter);
      position = this.queue.indexOf(waiter) + 1;
    }
    return {
      position,
      ready,
      release: () => {
        if (state === "done") return;
        if (state === "running") this.running--;
        else {
          const index = this.queue.indexOf(waiter);
          if (index >= 0) this.queue.splice(index, 1);
        }
        state = "done";
        this.inFlight.delete(userId);
        this.next();
      },
    };
  }

  private next(): void {
    while (this.running < this.limits.concurrency && this.queue.length > 0)
      this.queue.shift()!.grant();
  }

  private prune(now: number): void {
    for (const [user, times] of this.hits)
      if (times.every((at) => now - at >= this.limits.userWindowMs)) this.hits.delete(user);
  }
}

/** `text` cut to `max` characters at a sentence or word boundary, with an ellipsis. */
export function boundReply(text: string, max: number): string {
  const clean = text.trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const sentence = Math.max(
    cut.lastIndexOf(". "),
    cut.lastIndexOf("! "),
    cut.lastIndexOf("? "),
    cut.lastIndexOf("。"),
    cut.lastIndexOf("\n"),
  );
  if (sentence > max * 0.6) return `${cut.slice(0, sentence + 1).trimEnd()} …`;
  const word = cut.lastIndexOf(" ");
  return `${(word > max * 0.6 ? cut.slice(0, word) : cut).trimEnd()}…`;
}

/** Thrown when a generation exceeds its timeout. */
export class DmTimeoutError extends Error {
  constructor(readonly ms: number) {
    super(`DM generation exceeded ${ms} ms`);
  }
}

/** `run(signal)` bounded to `ms`: the signal aborts and the promise rejects at the deadline. */
export async function withTimeout<T>(
  ms: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DmTimeoutError(ms));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Keeps Discord's "is typing" shown (it lasts about 10 s) until the returned stop is called. */
export function keepTyping(send: () => Promise<unknown>, everyMs = 8000): () => void {
  void send().catch(() => undefined);
  const timer = setInterval(() => void send().catch(() => undefined), everyMs);
  return () => clearInterval(timer);
}
