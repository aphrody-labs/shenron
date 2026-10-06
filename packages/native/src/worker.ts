// SPDX-License-Identifier: Apache-2.0
/**
 * Promise API of the long shenron-ffi calls, off the event loop: a bounded pool of Bun workers,
 * each with its own `dlopen` handle, runs the blocking `shenron_*_job` exports while the main
 * thread stays free.
 *
 * Rules (see README):
 * - The main thread opens and checks the library first (Bun range, ABI, target, version); the
 *   workers open the same file with the same generated table.
 * - Every call registers a job on the main thread (`shenron_job_new`) and runs it on one worker
 *   (`*_job`, which consumes the id). `AbortSignal` → `shenron_cancel` from the main thread at
 *   once: the promise rejects with the signal's reason without waiting, the native call returns
 *   status 125 promptly and frees its worker. The main thread then releases the id
 *   (`shenron_job_release`, a no-op once consumed), so no path leaves a registered job.
 * - `shenron_last_error` is thread-local: a worker reads it itself, right after the failing
 *   call, and sends it with the result. Owned strings are copied and freed on the worker.
 * - No `JSCallback`: results come back as worker messages.
 * - `close()` cancels everything in flight, asks each worker to close its handle and exit, and
 *   terminates a worker that does not exit within a grace delay.
 *
 * Runtime class: bun.
 */
import {
  checkLimit,
  holdLib,
  loadLib,
  shenronLibraryPath,
  shenronLlamaProgress,
  validateCliArgs,
  type NativeLibrary,
  type ShenronLlamaProvision,
} from "./engine";
import { SHENRON_STATUS, SYMBOLS } from "./generated/symbols";
import type {
  CapturedResult,
  JobOutcome,
  LlamaProgress,
  LlamaProvisioned,
  LocalSearchResponse,
  RagSearchResponse,
  RagStats,
} from "./generated/types";
// Bun's `text` loader gives the file's source, embedded by `bun build --compile` too; TypeScript
// only sees the module's string default export.
import workerThreadSource from "./worker-thread" with { type: "text" };
import type { JobCall, JobOperation, WorkerRequest, WorkerResponse } from "./worker-protocol";

export type { CapturedResult, LocalSearchResponse, RagSearchResponse, RagStats };

/** Workers of a pool when `size` is not given. */
export const DEFAULT_POOL_SIZE = 2;
/** Calls waiting for a free worker beyond which a pool refuses new ones. */
export const DEFAULT_MAX_QUEUE = 1024;
/** Time a closing worker gets to close its handle and exit before it is terminated. */
const CLOSE_GRACE_MS = 2000;

export interface ShenronWorkerPoolOptions {
  /** Library to open (default: the `@shenron/native` resolution, see `shenronLoad`). */
  path?: string;
  /** Number of workers, 1–64 (default 2). */
  size?: number;
  /** Queued calls beyond which new calls are refused (default 1024). */
  maxQueue?: number;
}

export interface NativeCallOptions {
  /** Cancels the call: queued, it never runs; running, the library stops it (`shenron_cancel`). */
  signal?: AbortSignal;
}

export interface SearchCallOptions extends NativeCallOptions {
  /** Positive integer (default 8 for the local corpus, 10 for the serving RAG). */
  limit?: number;
  /** Document kind filter; empty or absent searches every kind. */
  kind?: string;
}

/** A job that ran and produced no value: `status` is a `SHENRON_STATUS` code. */
export class ShenronJobError extends Error {
  override readonly name = "ShenronJobError";
  constructor(
    readonly operation: JobOperation,
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface Task {
  id: number;
  call: JobCall;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
  job?: number;
  /** Called with the native job id once the call is handed to a worker. */
  onStart?: (job: number) => void;
  settled: boolean;
}

/** Bun workers have `ref`/`unref`; the DOM `Worker` type the repository loads does not. */
type BunWorker = Worker & Pick<Bun.Worker, "ref" | "unref">;

interface Slot {
  worker: BunWorker;
  task: Task | null;
  exited: Promise<void>;
}

const WORKER_SOURCE: string = workerThreadSource;

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

function checkText(value: string, what: string): void {
  if (typeof value !== "string" || value.includes("\0"))
    throw new TypeError(`${what} must be a string without NUL characters`);
}

/** A bounded pool of workers running the long shenron-ffi calls. */
export class ShenronWorkerPool {
  /** Path of the library the workers open. */
  readonly path: string;
  readonly size: number;
  readonly maxQueue: number;
  readonly #lib: NativeLibrary;
  readonly #unhold: () => void;
  readonly #url: string;
  readonly #slots: Slot[] = [];
  readonly #queue: Task[] = [];
  #nextId = 1;
  #closing: Promise<void> | undefined;

  /** Opens and checks the library on the calling thread; throws when it is unusable. */
  constructor(options: ShenronWorkerPoolOptions = {}) {
    const size = options.size ?? DEFAULT_POOL_SIZE;
    if (!Number.isInteger(size) || size < 1 || size > 64)
      throw new RangeError("pool size must be an integer between 1 and 64");
    const maxQueue = options.maxQueue ?? DEFAULT_MAX_QUEUE;
    if (!Number.isInteger(maxQueue) || maxQueue < 0)
      throw new RangeError("maxQueue must be a non-negative integer");
    this.#lib = loadLib(options.path);
    this.#unhold = holdLib();
    this.path = shenronLibraryPath() as string;
    this.size = size;
    this.maxQueue = maxQueue;
    this.#url = URL.createObjectURL(
      new File([WORKER_SOURCE], "shenron-native-worker.ts", { type: "text/typescript" }),
    );
  }

  /** True once `close()` was called. */
  get closed(): boolean {
    return this.#closing !== undefined;
  }

  /** Workers started, workers running a call, calls waiting. */
  get stats(): { workers: number; busy: number; queued: number } {
    return {
      workers: this.#slots.length,
      busy: this.#slots.filter((slot) => slot.task !== null).length,
      queued: this.#queue.length,
    };
  }

  /** `shenron <args…>` with captured stdio (no `shenron` prefix). */
  runCaptured(args: readonly string[], options: NativeCallOptions = {}): Promise<CapturedResult> {
    return this.#call(() => {
      validateCliArgs(args);
      return { op: "run_captured", args: [JSON.stringify(args)] };
    }, options.signal);
  }

  /** Search the serving RAG (bot or Aphrody backend), normalised by the library. */
  ragSearch(query: string, options: SearchCallOptions = {}): Promise<RagSearchResponse> {
    return this.#call(() => {
      const limit = options.limit ?? 10;
      checkLimit(limit, "RAG");
      checkText(query, "query");
      if (options.kind !== undefined) checkText(options.kind, "kind");
      return { op: "rag_search", args: [query, limit, options.kind || null] };
    }, options.signal);
  }

  /** Statistics of the serving RAG, normalised over both backends. */
  ragStats(options: NativeCallOptions = {}): Promise<RagStats> {
    return this.#call(() => ({ op: "rag_stats", args: [] }), options.signal);
  }

  /** Search the offline corpus (embedded canon and guide, configured corpus, local store). */
  localSearch(query: string, options: SearchCallOptions = {}): Promise<LocalSearchResponse> {
    return this.#call(() => {
      const limit = options.limit ?? 8;
      checkLimit(limit, "local search");
      checkText(query, "query");
      if (options.kind !== undefined) checkText(options.kind, "kind");
      return { op: "local_search", args: [query, limit, options.kind || null] };
    }, options.signal);
  }

  /** Ask the persona (`shenron persona ask`, captured). */
  personaAsk(question: string, options: NativeCallOptions = {}): Promise<CapturedResult> {
    return this.#call(() => {
      checkText(question, "question");
      return { op: "persona_ask", args: [question] };
    }, options.signal);
  }

  /** Diagnostic: hold a worker `ms` milliseconds in the library (no I/O); resolves with `ms`. */
  sleep(ms: number, options: NativeCallOptions = {}): Promise<number> {
    return this.#call(() => {
      if (!Number.isInteger(ms) || ms < 0 || ms > 0xffff_ffff)
        throw new RangeError("ms must be an integer between 0 and 2^32 - 1");
      return { op: "sleep", args: [ms] };
    }, options.signal);
  }

  /**
   * Make the chat model files of `request` present (Aphrody local chat provisioning: catalog,
   * resumed and digest-checked transfers). `onProgress` receives the latest progress every
   * `progressMs` (default 500) while the transfer runs; aborting stops it (resumable).
   */
  llamaProvision(
    request: ShenronLlamaProvision,
    options: NativeCallOptions & {
      onProgress?: (progress: LlamaProgress) => void;
      progressMs?: number;
    } = {},
  ): Promise<LlamaProvisioned> {
    let timer: ReturnType<typeof setInterval> | undefined;
    const onStart = options.onProgress
      ? (job: number) => {
          timer = setInterval(() => {
            const progress = shenronLlamaProgress(job);
            if (progress) options.onProgress?.(progress);
          }, options.progressMs ?? 500);
        }
      : undefined;
    return this.#call<LlamaProvisioned>(
      () => {
        checkText(request.modelsDir, "modelsDir");
        return { op: "llama_provision", args: [JSON.stringify(request)] };
      },
      options.signal,
      onStart,
    ).finally(() => clearInterval(timer));
  }

  /**
   * Cancel every queued and running call (their promises reject with an `AbortError`), close
   * each worker's handle and stop the workers. Idempotent.
   */
  close(): Promise<void> {
    if (this.#closing) return this.#closing;
    const reason = abortError("@shenron/native worker pool closed");
    for (const task of this.#queue.splice(0)) this.#settle(task, () => task.reject(reason));
    for (const slot of this.#slots) {
      const task = slot.task;
      if (!task) continue;
      if (task.job !== undefined) this.#lib.symbols.shenron_cancel(task.job);
      this.#settle(task, () => task.reject(reason));
    }
    this.#closing = Promise.all(this.#slots.map((slot) => this.#stop(slot))).then(() => {
      URL.revokeObjectURL(this.#url);
      this.#unhold();
      return undefined;
    });
    return this.#closing;
  }

  #call<T>(
    build: () => JobCall,
    signal: AbortSignal | undefined,
    onStart?: (job: number) => void,
  ): Promise<T> {
    if (this.#closing) return Promise.reject(abortError("@shenron/native worker pool closed"));
    let call: JobCall;
    try {
      call = build();
    } catch (error) {
      return Promise.reject(error);
    }
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.#queue.length >= this.maxQueue && !this.#hasCapacity())
      return Promise.reject(
        new Error(`@shenron/native worker pool saturated (${this.maxQueue} calls queued)`),
      );
    const { promise, resolve, reject } = Promise.withResolvers<T>();
    const task: Task = {
      id: this.#nextId++,
      call,
      resolve: resolve as (value: unknown) => void,
      reject,
      settled: false,
      ...(onStart ? { onStart } : {}),
    };
    if (signal) {
      task.signal = signal;
      task.onAbort = () => this.#abort(task, signal.reason);
      signal.addEventListener("abort", task.onAbort, { once: true });
    }
    this.#queue.push(task);
    this.#pump();
    return promise;
  }

  #settle(task: Task, settle: () => void): void {
    if (task.settled) return;
    task.settled = true;
    if (task.onAbort) task.signal?.removeEventListener("abort", task.onAbort);
    settle();
  }

  #abort(task: Task, reason: unknown): void {
    const queued = this.#queue.indexOf(task);
    if (queued >= 0) this.#queue.splice(queued, 1);
    // Running: the native call sees the flag and returns; its worker frees itself then.
    else if (task.job !== undefined) this.#lib.symbols.shenron_cancel(task.job);
    this.#settle(task, () => task.reject(reason));
  }

  #pump(): void {
    while (this.#queue.length > 0) {
      const slot = this.#idleSlot(true);
      if (!slot) return;
      const task = this.#queue.shift() as Task;
      // Ids stay below 2^53: `u64_fast` returns a number.
      const job = Number(this.#lib.symbols.shenron_job_new());
      if (!job) {
        this.#settle(task, () => task.reject(new Error("shenron_job_new failed")));
        continue;
      }
      task.job = job;
      task.onStart?.(job);
      slot.task = task;
      slot.worker.ref();
      const request: WorkerRequest = { type: "call", id: task.id, job, ...task.call };
      slot.worker.postMessage(request);
    }
  }

  /** A worker is idle or another may start. */
  #hasCapacity(): boolean {
    return this.#slots.length < this.size || this.#slots.some((slot) => slot.task === null);
  }

  #idleSlot(spawn: boolean): Slot | undefined {
    const idle = this.#slots.find((slot) => slot.task === null);
    if (idle || !spawn || this.#slots.length >= this.size) return idle;
    return this.#spawn();
  }

  #spawn(): Slot {
    const worker = new Worker(this.#url) as BunWorker;
    worker.unref();
    const { promise: exited, resolve: onExit } = Promise.withResolvers<void>();
    const slot: Slot = { worker, task: null, exited };
    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) =>
      this.#finish(slot, event.data),
    );
    worker.addEventListener("error", (event: ErrorEvent) => this.#crash(slot, event));
    worker.addEventListener("close", () => {
      onExit();
      this.#forget(slot);
    });
    const open: WorkerRequest = {
      type: "open",
      path: this.path,
      symbols: SYMBOLS,
      status: SHENRON_STATUS,
    };
    worker.postMessage(open);
    this.#slots.push(slot);
    return slot;
  }

  #release(task: Task): void {
    // A no-op once the native call consumed the id; frees it when the call never ran.
    if (task.job !== undefined) this.#lib.symbols.shenron_job_release(task.job);
  }

  #finish(slot: Slot, response: WorkerResponse): void {
    const task = slot.task;
    if (!task || task.id !== response.id) return;
    slot.task = null;
    slot.worker.unref();
    this.#release(task);
    this.#settle(task, () => {
      const outcome = response.outcome as JobOutcome<unknown> | null;
      if (!outcome) {
        task.reject(
          new ShenronJobError(
            task.call.op,
            SHENRON_STATUS.software,
            response.lastError ?? `${task.call.op} returned a null string`,
          ),
        );
      } else if (outcome.status === SHENRON_STATUS.ok) {
        task.resolve(outcome.value);
      } else if (outcome.status === SHENRON_STATUS.cancelled) {
        task.reject(abortError(outcome.error ?? `${task.call.op} cancelled`));
      } else {
        task.reject(
          new ShenronJobError(
            task.call.op,
            outcome.status,
            outcome.error ?? `${task.call.op} failed with status ${outcome.status}`,
          ),
        );
      }
    });
    if (!this.#closing) this.#pump();
  }

  #crash(slot: Slot, event: ErrorEvent): void {
    const task = slot.task;
    slot.task = null;
    if (task) {
      if (task.job !== undefined) this.#lib.symbols.shenron_cancel(task.job);
      this.#release(task);
      this.#settle(task, () =>
        task.reject(new Error(`@shenron/native worker failed: ${event.message}`)),
      );
    }
    slot.worker.terminate();
    this.#forget(slot);
    if (!this.#closing) this.#pump();
  }

  #forget(slot: Slot): void {
    const index = this.#slots.indexOf(slot);
    if (index >= 0) this.#slots.splice(index, 1);
  }

  #stop(slot: Slot): Promise<void> {
    const timer = setTimeout(() => slot.worker.terminate(), CLOSE_GRACE_MS);
    slot.worker.postMessage({ type: "close" } satisfies WorkerRequest);
    return slot.exited.finally(() => clearTimeout(timer));
  }
}

let shared: ShenronWorkerPool | undefined;

/**
 * The process-wide pool, created on first use (`options` apply then only). Throws when the
 * library cannot be opened or is refused (see `shenronLoad`).
 */
export function shenronWorkerPool(options?: ShenronWorkerPoolOptions): ShenronWorkerPool {
  if (!shared || shared.closed) shared = new ShenronWorkerPool(options);
  return shared;
}

/** Close the process-wide pool, if any (`ShenronWorkerPool.close`). */
export async function closeShenronWorkerPool(): Promise<void> {
  const pool = shared;
  shared = undefined;
  await pool?.close();
}
