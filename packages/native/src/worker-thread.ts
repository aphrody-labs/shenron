// SPDX-License-Identifier: Apache-2.0
/**
 * Body of a `@shenron/native/worker` thread. It opens its own `dlopen` handle on the library the
 * main thread already checked, then runs the blocking `shenron_*_job` exports one at a time.
 *
 * It runs from a `blob:` URL (`worker.ts` embeds this file as text), so it imports nothing at
 * run time but `bun:ffi`: the symbol table arrives in the `open` message, types are erased.
 *
 * Thread rules: every native call of this worker runs on this thread; `shenron_last_error` is
 * read here, right after the call that returned NULL; each owned string is copied, then freed
 * here with `shenron_string_free`. Cancellation never comes through this thread: the main thread
 * calls `shenron_cancel` while this one is blocked in the native call.
 */
import { CString, dlopen, type Pointer } from "bun:ffi";

import type { SHENRON_STATUS, SYMBOLS } from "./generated/symbols";
import type { CallRequest, ResultResponse, WorkerRequest } from "./worker-protocol";

type Library = ReturnType<typeof dlopen<typeof SYMBOLS>>;

let library: Library | undefined;
let openError: string | undefined;
let status: typeof SHENRON_STATUS | undefined;
const encoder = new TextEncoder();

const cstr = (text: string): Uint8Array => encoder.encode(`${text}\0`);
const optional = (text: string | null): Uint8Array | null => (text === null ? null : cstr(text));

/** bun-types widen a `ptr` return to `bigint`; pointers come back as numbers. */
function invoke(lib: Library, request: CallRequest): Pointer | bigint | null {
  const native = lib.symbols;
  const job = request.job;
  switch (request.op) {
    case "run_captured":
      return native.shenron_run_captured_job(job, cstr(request.args[0]));
    case "rag_search": {
      const [query, limit, kind] = request.args;
      return native.shenron_rag_search_job(job, cstr(query), limit, optional(kind));
    }
    case "rag_stats":
      return native.shenron_rag_stats_job(job);
    case "local_search": {
      const [query, limit, kind] = request.args;
      return native.shenron_local_search_job(job, cstr(query), limit, optional(kind));
    }
    case "persona_ask":
      return native.shenron_persona_ask_job(job, cstr(request.args[0]));
    case "sleep":
      return native.shenron_sleep_job(job, request.args[0]);
  }
  throw new Error(`unknown job operation ${String((request as { op: unknown }).op)}`);
}

function run(request: CallRequest): ResultResponse {
  const started = performance.now();
  const answer = (outcome: ResultResponse["outcome"], lastError: string | null) => ({
    type: "result" as const,
    id: request.id,
    outcome,
    lastError,
    nativeMs: performance.now() - started,
  });
  if (!library) {
    // The job was registered by the main thread, which releases it with this answer.
    const software = status?.software ?? 70;
    return answer({ status: software, value: null, error: openError ?? "worker not opened" }, null);
  }
  let pointer: Pointer | null;
  try {
    pointer = invoke(library, request) as Pointer | null;
  } catch (error) {
    return answer({ status: status?.usage ?? 64, value: null, error: String(error) }, null);
  }
  if (!pointer) {
    const last = library.symbols.shenron_last_error();
    return answer(null, last ? new CString(last).toString() : null);
  }
  let text: string;
  try {
    text = new CString(pointer).toString();
  } finally {
    library.symbols.shenron_string_free(pointer);
  }
  return answer(JSON.parse(text) as ResultResponse["outcome"], null);
}

addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  switch (request.type) {
    case "open":
      status = request.status;
      try {
        library = dlopen(request.path, request.symbols);
      } catch (error) {
        openError = `Unable to load shenron-ffi at ${request.path} in a worker: ${String(error)}`;
      }
      return;
    case "call":
      postMessage(run(request));
      return;
    case "close":
      library?.close();
      library = undefined;
      process.exit(0);
  }
});

/** TypeScript's view of this module; `worker.ts` imports its source text instead. */
export default "@shenron/native/worker-thread";
