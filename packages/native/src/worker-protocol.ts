// SPDX-License-Identifier: Apache-2.0
/**
 * Messages between `@aphrody/shenron-native/worker` (main thread) and its worker threads
 * (`worker-thread.ts`). Types only: the worker imports this module with `import type`.
 *
 * Runtime class: pure.
 */
import type { SHENRON_STATUS, SYMBOLS } from "./generated/symbols";
import type { JobOutcome } from "./generated/types";

/** One long call, run by a worker through its `shenron_*_job` export. */
export type JobCall =
  | { op: "run_captured"; args: [argsJson: string] }
  | { op: "rag_search"; args: [query: string, limit: number, kind: string | null] }
  | { op: "rag_stats"; args: [] }
  | { op: "local_search"; args: [query: string, limit: number, kind: string | null] }
  | { op: "persona_ask"; args: [question: string] }
  | { op: "sleep"; args: [ms: number] }
  | { op: "llama_provision"; args: [requestJson: string] };

export type JobOperation = JobCall["op"];

/**
 * First message: open `path` (already checked by the main thread) with the generated table;
 * `status` carries the generated status codes (the worker imports no runtime value).
 */
export interface OpenRequest {
  type: "open";
  path: string;
  symbols: typeof SYMBOLS;
  status: typeof SHENRON_STATUS;
}

/** Run `call` as job `job` (registered by the main thread, consumed by the native call). */
export type CallRequest = { type: "call"; id: number; job: number } & JobCall;

/** Close the worker's handle and exit the worker. */
export interface CloseRequest {
  type: "close";
}

export type WorkerRequest = OpenRequest | CallRequest | CloseRequest;

/**
 * Answer to a `CallRequest`. `outcome` is the job envelope; `null` with `lastError` when the
 * native call returned NULL (`lastError` read on the worker thread, right after the call).
 */
export interface ResultResponse {
  type: "result";
  id: number;
  outcome: JobOutcome<unknown> | null;
  lastError: string | null;
  /** Time spent in the native call, in milliseconds. */
  nativeMs: number;
}

export type WorkerResponse = ResultResponse;
