/**
 * Pool of render workers: the cards are drawn and encoded off the main thread, on as many
 * cores as the host can spare, so the Discord gateway never waits for the canvas.
 *
 *   size       `min(cores - 1, render.workers)`; automatic (`cores - 1`) without a setting;
 *              0 turns the pool off and every card is drawn in line
 *   growth     workers start on demand (a quiet bot keeps one) and the idle ones above the
 *              first stop after `idleMs`
 *   queue      bounded: a full queue rejects at once (`RenderQueueFullError`) rather than
 *              growing without limit
 *   deadline   a card that takes more than `timeoutMs` rejects (`RenderTimeoutError`) and its
 *              worker is replaced
 *   fallback   a worker that dies mid-card does not lose it: the card is drawn in line, and a
 *              pool whose workers cannot start renders in line until `reset()`
 *
 * Compiled binaries embed the worker (`scripts/build/bot.ts`, `src/lib/bundled-worker.ts`).
 */
import { logger } from "~/lib/logger";
import { startBundledWorker } from "~/lib/bundled-worker";
import { renderInline, type CardInputs, type CardKind } from "./dispatch";
import type { PoolRenderOptions, RenderJob, RenderReply } from "./pool-protocol";
import { getPaletteOverrides } from "./theme";
import type { ImageSource, RenderOptions, RenderedCard } from "./types";

export class RenderQueueFullError extends Error {
  constructor(limit: number) {
    super(`render queue full (${limit} cards waiting)`);
    this.name = "RenderQueueFullError";
  }
}

export class RenderTimeoutError extends Error {
  constructor(kind: string, timeoutMs: number) {
    super(`${kind} card not rendered within ${timeoutMs} ms`);
    this.name = "RenderTimeoutError";
  }
}

export interface RenderPoolOptions {
  /** Most workers alive at once (default: `workerCount()`). */
  size?: number;
  /** Cards allowed to wait for a worker (default: 16 per worker, at least 32). */
  queueLimit?: number;
  /** Deadline of one card, from the moment a worker takes it (default 20 s). */
  timeoutMs?: number;
  /** Idle time after which a worker above the first one stops (default 60 s). */
  idleMs?: number;
  /** How long a new worker may take to say it is ready (default 15 s). */
  readyTimeoutMs?: number;
  /** Starts a worker (default: the bundled `render.ts`). */
  spawn?: () => Worker;
  /** Draw in line when a worker dies or cannot start (default true). */
  inlineFallback?: boolean;
}

export interface RenderPoolStats {
  size: number;
  workers: number;
  busy: number;
  queued: number;
  completed: number;
  failed: number;
  timedOut: number;
  /** Cards drawn in line because no worker could take them. */
  inlined: number;
  /** Workers started after the first ones (a death, a timeout, an idle stop). */
  restarts: number;
  /** The pool gave up on its workers and renders in line. */
  broken: boolean;
}

/** Per-call extras: pictures already held, and the image source of the in-line path. */
export interface RenderExtras {
  /** Encoded avatars by URL, handed to the worker so it does not download them. */
  inlineImages?: Record<string, Uint8Array>;
  /** Image source for a card drawn in line (never sent to a worker). */
  images?: ImageSource;
}

interface Slot {
  worker: Worker;
  ready: boolean;
  job: Job | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  deadline: ReturnType<typeof setTimeout> | null;
  dead: boolean;
}

interface Job {
  id: number;
  kind: CardKind;
  input: unknown;
  options: PoolRenderOptions;
  extras: RenderExtras;
  resolve: (card: RenderedCard) => void;
  reject: (error: Error) => void;
}

/** Cores the pool may use: all but one (the gateway thread keeps its own). */
export function workerCount(setting?: number | null, cores = navigator.hardwareConcurrency || 1) {
  const automatic = Math.max(1, cores - 1);
  if (setting === null || setting === undefined || !Number.isFinite(setting)) return automatic;
  return Math.max(0, Math.min(automatic, Math.floor(setting)));
}

const STARTUP_FAILURES_BEFORE_BROKEN = 3;

export class RenderPool {
  private readonly size: number;
  private readonly queueLimit: number;
  private readonly timeoutMs: number;
  private readonly idleMs: number;
  private readonly readyTimeoutMs: number;
  private readonly spawn: () => Worker;
  private readonly inlineFallback: boolean;
  private readonly slots = new Set<Slot>();
  private readonly queue: Job[] = [];
  private nextId = 1;
  private closed = false;
  private startupFailures = 0;
  private started = 0;
  private counters = { completed: 0, failed: 0, timedOut: 0, inlined: 0, restarts: 0 };
  private broken = false;

  constructor(options: RenderPoolOptions = {}) {
    this.size = Math.max(1, options.size ?? workerCount());
    this.queueLimit = options.queueLimit ?? Math.max(32, this.size * 16);
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.idleMs = options.idleMs ?? 60_000;
    this.readyTimeoutMs = options.readyTimeoutMs ?? 15_000;
    this.spawn = options.spawn ?? (() => startBundledWorker("render.ts"));
    this.inlineFallback = options.inlineFallback ?? true;
  }

  /** Draws a card on a worker; resolves with the same `RenderedCard` as the in-line renderer. */
  render<K extends CardKind>(
    kind: K,
    input: CardInputs[K],
    options: RenderOptions = {},
    extras: RenderExtras = {},
  ): Promise<RenderedCard> {
    if (this.closed) return Promise.reject(new Error("render pool closed"));
    if (this.broken) return this.drawInline(kind, input, options, extras.images ?? options.images);
    if (this.queue.length >= this.queueLimit) {
      this.counters.failed++;
      return Promise.reject(new RenderQueueFullError(this.queueLimit));
    }
    const { images: _images, ...serializable } = options;
    return new Promise<RenderedCard>((resolve, reject) => {
      this.queue.push({
        id: this.nextId++,
        kind,
        input,
        options: serializable,
        extras: { ...extras, images: extras.images ?? options.images },
        resolve,
        reject,
      });
      this.pump();
    });
  }

  /** Starts `count` workers now, so the first cards do not wait for them (boot). */
  warm(count = 1): void {
    if (this.closed || this.broken) return;
    for (let i = this.slots.size; i < Math.min(count, this.size); i++) this.startWorker();
  }

  stats(): RenderPoolStats {
    let busy = 0;
    for (const slot of this.slots) if (slot.job) busy++;
    return {
      size: this.size,
      workers: this.slots.size,
      busy,
      queued: this.queue.length,
      ...this.counters,
      broken: this.broken,
    };
  }

  /** Lets the pool start workers again after it gave up on them. */
  reset(): void {
    this.broken = false;
    this.startupFailures = 0;
  }

  /** Stops every worker; waiting cards reject. */
  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.queue.splice(0)) job.reject(new Error("render pool closed"));
    for (const slot of Array.from(this.slots)) {
      if (slot.job) slot.job.reject(new Error("render pool closed"));
      slot.job = null;
      this.removeSlot(slot);
    }
  }

  // ─── Scheduling ──────────────────────────────────────────────────────────────

  private pump(): void {
    while (this.queue.length > 0) {
      let idle: Slot | undefined;
      for (const slot of this.slots) {
        if (slot.ready && !slot.job && !slot.dead) {
          idle = slot;
          break;
        }
      }
      if (!idle) {
        const starting = [...this.slots].filter((slot) => !slot.ready && !slot.dead).length;
        // one new worker per card still waiting beyond those already starting
        if (this.slots.size < this.size && starting < this.queue.length) this.startWorker();
        return;
      }
      this.assign(idle, this.queue.shift()!);
    }
  }

  private assign(slot: Slot, job: Job): void {
    if (slot.idleTimer) clearTimeout(slot.idleTimer);
    slot.idleTimer = null;
    slot.job = job;
    slot.deadline = setTimeout(() => this.expire(slot), this.timeoutMs);
    const message: RenderJob = {
      type: "render",
      id: job.id,
      kind: job.kind,
      input: job.input,
      options: job.options,
      palette: getPaletteOverrides(),
      inlineImages: job.extras.inlineImages,
    };
    try {
      slot.worker.postMessage(message, []);
    } catch (error) {
      this.lose(slot, error instanceof Error ? error : new Error(String(error)));
    }
  }

  private startWorker(): void {
    let worker: Worker;
    try {
      worker = this.spawn();
    } catch (error) {
      this.startFailed(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    const slot: Slot = {
      worker,
      ready: false,
      job: null,
      idleTimer: null,
      deadline: null,
      dead: false,
    };
    this.slots.add(slot);
    if (this.started++ >= this.size) this.counters.restarts++;
    const readyTimer = setTimeout(() => {
      const error = new Error(`render worker not ready after ${this.readyTimeoutMs} ms`);
      if (!slot.ready) this.startFailed(error);
      this.lose(slot, error);
    }, this.readyTimeoutMs);
    worker.onmessage = (event: MessageEvent) => {
      const data = event.data as RenderReply | { status?: string } | null;
      if (!data) return;
      if ("status" in data && data.status === "ready") {
        clearTimeout(readyTimer);
        slot.ready = true;
        this.startupFailures = 0;
        this.armIdle(slot);
        this.pump();
      } else if ("type" in data && data.type === "result") {
        this.settle(slot, data);
      }
    };
    worker.addEventListener("error", (event: ErrorEvent) => {
      clearTimeout(readyTimer);
      const error = new Error(event.message || "render worker failed");
      if (!slot.ready) this.startFailed(error);
      this.lose(slot, error);
    });
    worker.addEventListener("close", () => {
      clearTimeout(readyTimer);
      this.lose(slot, new Error("render worker closed"));
    });
  }

  private startFailed(error: Error): void {
    logger.warn({ err: error }, "render worker could not start");
    if (++this.startupFailures >= STARTUP_FAILURES_BEFORE_BROKEN) {
      this.broken = true;
      logger.error("render workers keep failing to start: cards are drawn in line");
      this.flushInline();
    }
  }

  private settle(slot: Slot, reply: RenderReply): void {
    const job = slot.job;
    if (!job || job.id !== reply.id) return;
    if (slot.deadline) clearTimeout(slot.deadline);
    slot.deadline = null;
    slot.job = null;
    if (reply.ok) {
      const { data, ...meta } = reply.card;
      this.counters.completed++;
      job.resolve({ ...meta, buffer: Buffer.from(data.buffer, data.byteOffset, data.length) });
    } else {
      this.counters.failed++;
      job.reject(new Error(reply.error));
    }
    this.armIdle(slot);
    this.pump();
  }

  /** The deadline of a card passed: the worker may be stuck, replace it. */
  private expire(slot: Slot): void {
    const job = slot.job;
    if (!job) return;
    this.counters.timedOut++;
    this.counters.failed++;
    slot.job = null;
    job.reject(new RenderTimeoutError(job.kind, this.timeoutMs));
    this.removeSlot(slot);
    this.pump();
  }

  /** A worker died: its card is drawn in line instead of being lost. */
  private lose(slot: Slot, error: Error): void {
    if (slot.dead) return;
    const job = slot.job;
    slot.job = null;
    this.removeSlot(slot);
    if (job) {
      logger.warn({ err: error, kind: job.kind }, "render worker died, drawing the card in line");
      if (this.inlineFallback) {
        this.drawInline(job.kind, job.input as never, job.options, job.extras.images).then(
          job.resolve,
          job.reject,
        );
      } else {
        this.counters.failed++;
        job.reject(error);
      }
    }
    if (!this.closed) this.pump();
  }

  private armIdle(slot: Slot): void {
    if (slot.idleTimer) clearTimeout(slot.idleTimer);
    slot.idleTimer = setTimeout(() => {
      // the first worker stays: the next card does not pay a start
      if (!slot.job && this.slots.size > 1) this.removeSlot(slot);
      else this.armIdle(slot);
    }, this.idleMs);
    slot.idleTimer.unref?.();
  }

  private removeSlot(slot: Slot): void {
    slot.dead = true;
    if (slot.idleTimer) clearTimeout(slot.idleTimer);
    if (slot.deadline) clearTimeout(slot.deadline);
    this.slots.delete(slot);
    try {
      slot.worker.terminate();
    } catch {
      // already gone
    }
  }

  // ─── In-line path ────────────────────────────────────────────────────────────

  private drawInline<K extends CardKind>(
    kind: K,
    input: CardInputs[K],
    options: RenderOptions | PoolRenderOptions,
    images: ImageSource | undefined,
  ): Promise<RenderedCard> {
    this.counters.inlined++;
    return renderInline(kind, input, { ...options, images });
  }

  /** The pool is broken: nothing will take the waiting cards, draw them here. */
  private flushInline(): void {
    for (const job of this.queue.splice(0)) {
      this.drawInline(job.kind, job.input as never, job.options, job.extras.images).then(
        job.resolve,
        job.reject,
      );
    }
  }
}

// ─── Process-wide pool ─────────────────────────────────────────────────────────

let shared: RenderPool | null = null;
let configured: number | null | undefined;

/** Where the pool is used: not under `bun test` (cards are drawn in line), nor when switched off. */
export function poolEnabled(): boolean {
  if (process.env.SHENRON_RENDER_POOL === "0" || process.env.SHENRON_RENDER_POOL === "off")
    return false;
  if (process.env.SHENRON_RENDER_POOL === "1") return workerSetting() !== 0;
  return process.env.NODE_ENV !== "test" && workerSetting() !== 0;
}

/** `render.workers`: the configured size, `SHENRON_RENDER_WORKERS`, or `null` for automatic. */
function workerSetting(): number | null {
  if (configured !== undefined && configured !== null) return configured;
  const fromEnv = process.env.SHENRON_RENDER_WORKERS;
  if (fromEnv !== undefined && fromEnv !== "") {
    const parsed = Number.parseInt(fromEnv, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Applies the `render.workers` setting (`null`: automatic; 0: no pool, cards drawn in line).
 * A changed size replaces the shared pool; cards already queued on the old one finish there.
 */
export function configureRenderPool(workers: number | null): void {
  if (configured === workers) return;
  configured = workers;
  const old = shared;
  shared = null;
  if (old) setTimeout(() => void old.close(), 30_000).unref?.();
}

/** The process-wide pool, `null` when disabled. */
export function getRenderPool(): RenderPool | null {
  if (!poolEnabled()) return null;
  shared ??= new RenderPool({ size: workerCount(workerSetting()) });
  return shared;
}

/**
 * Draws a card: on a worker when the pool is on, in this thread otherwise (tests, `render.workers`
 * at 0). `images` is the image source of the in-line path; the workers use their own.
 */
export function renderCardOnPool<K extends CardKind>(
  kind: K,
  input: CardInputs[K],
  options: RenderOptions = {},
  extras: RenderExtras = {},
): Promise<RenderedCard> {
  const pool = getRenderPool();
  if (!pool)
    return renderInline(kind, input, { ...options, images: extras.images ?? options.images });
  return pool.render(kind, input, options, extras);
}

/** Key of the bot setting that sizes the pool (`guild_settings`, edited from /config). */
export const RENDER_WORKERS_KEY = "render.workers";

let lastSettingSync = 0;

/**
 * Reads `render.workers` through `read` (at most once a minute) and applies it: empty is
 * automatic, 0 turns the pool off, N caps it at N workers. Never throws; a read that fails
 * keeps the size in force.
 */
export async function syncRenderWorkers(
  read: () => Promise<string | undefined>,
  now: number = Date.now(),
): Promise<void> {
  if (process.env.NODE_ENV === "test" && process.env.SHENRON_RENDER_POOL !== "1") return;
  if (now - lastSettingSync < 60_000) return;
  lastSettingSync = now;
  try {
    const raw = (await read())?.trim();
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    configureRenderPool(Number.isFinite(parsed) && parsed >= 0 ? parsed : null);
  } catch (error) {
    logger.debug({ err: error }, "render.workers not read");
  }
}

/** Starts the first worker ahead of the first card. */
export function warmRenderPool(): void {
  getRenderPool()?.warm(1);
}

/** Stops the shared pool (shutdown, tests). */
export async function closeRenderPool(): Promise<void> {
  const old = shared;
  shared = null;
  await old?.close();
}
