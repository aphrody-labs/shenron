// SPDX-License-Identifier: Apache-2.0
// Generated from crates/shenron-ffi by `bun packages/native/scripts/generate.ts`; do not edit.
//
// The `dlopen` table of the shenron-ffi C ABI, from `abi::SYMBOLS`: every signature is
// checked against its Rust export at compile time. Kinds: `cstr` borrowed input string;
// `owned_str` returned string, freed once with `shenron_string_free`; `static_str` never
// freed; `thread_str` valid until the next call on the same thread, never freed.

import { FFIType } from "bun:ffi";

/** ABI revision of this table: `shenron_abi_version()` of a compatible library. */
export const SHENRON_FFI_ABI = 2;

/** Version of the shenron-ffi crate the table was generated from (the workspace version). */
export const SHENRON_FFI_VERSION = "1.1.0";

/** `status` of a `JobOutcome`; `usage` and `software` are also boundary exit codes. */
export const SHENRON_STATUS = {
  ok: 0,
  failed: 1,
  usage: 64,
  software: 70,
  cancelled: 125,
} as const;

/** Every export of the library, in declaration order. */
export const SYMBOLS = {
  /**
   * ABI revision of the library (`ABI_VERSION`).
   *
   * `shenron_abi_version() -> u32`, since ABI 1.
   */
  shenron_abi_version: { args: [], returns: FFIType.u32 },
  /**
   * Crate version, static string.
   *
   * `shenron_version() -> static_str`, since ABI 1.
   */
  shenron_version: { args: [], returns: FFIType.cstring },
  /**
   * Last error recorded on the calling thread, or NULL; valid until that thread's next call.
   * Read it on the thread that made the failing call.
   *
   * `shenron_last_error() -> thread_str`, since ABI 1.
   */
  shenron_last_error: { args: [], returns: FFIType.ptr },
  /**
   * Free a string returned by any export, exactly once (NULL is ignored).
   *
   * `shenron_string_free(ptr: owned_str) -> void`, since ABI 1.
   */
  shenron_string_free: { args: [FFIType.ptr], returns: FFIType.void },
  /**
   * Run `shenron <argv…>` with inherited stdio; returns the exit code. Blocks the caller.
   *
   * `shenron_run(argc: i32, argv: argv) -> i32`, since ABI 1.
   */
  shenron_run: { args: [FFIType.i32, FFIType.ptr], returns: FFIType.i32 },
  /**
   * Run `shenron` from a JSON array of arguments with inherited stdio. Blocks the caller.
   *
   * `shenron_run_json(args_json: cstr) -> i32`, since ABI 1.
   */
  shenron_run_json: { args: [FFIType.cstring], returns: FFIType.i32 },
  /**
   * Run `shenron` with captured stdio: owned `CapturedResult` JSON. Blocks the caller and
   * redirects the process-wide stdout/stderr while the command runs.
   *
   * `shenron_run_captured(args_json: cstr) -> owned_str`, since ABI 1.
   */
  shenron_run_captured: { args: [FFIType.cstring], returns: FFIType.ptr },
  /**
   * Serving RAG search: owned `CapturedResult` JSON whose stdout is the backend answer.
   *
   * `shenron_rag_search(query: cstr, limit: i32, kind: cstr) -> owned_str`, since ABI 1.
   */
  shenron_rag_search: { args: [FFIType.cstring, FFIType.i32, FFIType.cstring], returns: FFIType.ptr },
  /**
   * Local corpus search: owned `LocalSearchResponse` JSON (a usage error is a
   * `CapturedResult` with code 64).
   *
   * `shenron_local_search(query: cstr, limit: i32, kind: cstr) -> owned_str`, since ABI 1.
   */
  shenron_local_search: { args: [FFIType.cstring, FFIType.i32, FFIType.cstring], returns: FFIType.ptr },
  /**
   * Serving RAG statistics: owned `CapturedResult` JSON whose stdout is the backend answer.
   *
   * `shenron_rag_stats() -> owned_str`, since ABI 1.
   */
  shenron_rag_stats: { args: [], returns: FFIType.ptr },
  /**
   * Chunk Markdown: owned JSON array of `RagChunk`, or `FfiError`.
   *
   * `shenron_rag_chunk(markdown: cstr, max_chars: i32, overlap_pct: f32) -> owned_str`, since ABI 1.
   */
  shenron_rag_chunk: { args: [FFIType.cstring, FFIType.i32, FFIType.f32], returns: FFIType.ptr },
  /**
   * Local admin credential presence: owned `CapturedResult` JSON whose stdout is `AuthStatus`.
   *
   * `shenron_auth_status() -> owned_str`, since ABI 1.
   */
  shenron_auth_status: { args: [], returns: FFIType.ptr },
  /**
   * Persona prompt, static string.
   *
   * `shenron_persona_prompt() -> static_str`, since ABI 1.
   */
  shenron_persona_prompt: { args: [], returns: FFIType.cstring },
  /**
   * Ask the persona: owned `CapturedResult` JSON. Blocks the caller and redirects the
   * process-wide stdout/stderr while the command runs.
   *
   * `shenron_persona_ask(question: cstr) -> owned_str`, since ABI 1.
   */
  shenron_persona_ask: { args: [FFIType.cstring], returns: FFIType.ptr },
  /**
   * Library identity: owned `BuildInfo` JSON.
   *
   * `shenron_build_info() -> owned_str`, since ABI 2.
   */
  shenron_build_info: { args: [], returns: FFIType.ptr },
  /**
   * Register a cancellable job and return its id (never 0). Pass it to one `*_job` export,
   * which consumes it, or to `shenron_job_release`. Any thread.
   *
   * `shenron_job_new() -> u64`, since ABI 2.
   */
  shenron_job_new: { args: [], returns: FFIType.u64_fast },
  /**
   * Cancel a registered job (pending or running) from any thread; true if it was registered.
   * The `*_job` call returns status 125 promptly.
   *
   * `shenron_cancel(job: u64) -> bool`, since ABI 2.
   */
  shenron_cancel: { args: [FFIType.u64], returns: FFIType.bool },
  /**
   * Cancel and forget a job that will never be passed to a `*_job` export; true if it was
   * registered.
   *
   * `shenron_job_release(job: u64) -> bool`, since ABI 2.
   */
  shenron_job_release: { args: [FFIType.u64], returns: FFIType.bool },
  /**
   * Number of registered jobs (pending or running), for leak checks.
   *
   * `shenron_job_count() -> u32`, since ABI 2.
   */
  shenron_job_count: { args: [], returns: FFIType.u32 },
  /**
   * `shenron_run_captured` as a job: owned `JobOutcome<CapturedResult>` JSON.
   *
   * `shenron_run_captured_job(job: u64, args_json: cstr) -> owned_str`, since ABI 2.
   */
  shenron_run_captured_job: { args: [FFIType.u64, FFIType.cstring], returns: FFIType.ptr },
  /**
   * Serving RAG search as a job: owned `JobOutcome<RagSearchResponse>` JSON.
   *
   * `shenron_rag_search_job(job: u64, query: cstr, limit: i32, kind: cstr) -> owned_str`, since ABI 2.
   */
  shenron_rag_search_job: { args: [FFIType.u64, FFIType.cstring, FFIType.i32, FFIType.cstring], returns: FFIType.ptr },
  /**
   * Serving RAG statistics as a job: owned `JobOutcome<RagStats>` JSON.
   *
   * `shenron_rag_stats_job(job: u64) -> owned_str`, since ABI 2.
   */
  shenron_rag_stats_job: { args: [FFIType.u64], returns: FFIType.ptr },
  /**
   * Local corpus search as a job: owned `JobOutcome<LocalSearchResponse>` JSON.
   *
   * `shenron_local_search_job(job: u64, query: cstr, limit: i32, kind: cstr) -> owned_str`, since ABI 2.
   */
  shenron_local_search_job: { args: [FFIType.u64, FFIType.cstring, FFIType.i32, FFIType.cstring], returns: FFIType.ptr },
  /**
   * Ask the persona as a job: owned `JobOutcome<CapturedResult>` JSON.
   *
   * `shenron_persona_ask_job(job: u64, question: cstr) -> owned_str`, since ABI 2.
   */
  shenron_persona_ask_job: { args: [FFIType.u64, FFIType.cstring], returns: FFIType.ptr },
  /**
   * Diagnostic: hold a job for `ms` milliseconds without I/O: owned `JobOutcome<number>` JSON.
   *
   * `shenron_sleep_job(job: u64, ms: u32) -> owned_str`, since ABI 2.
   */
  shenron_sleep_job: { args: [FFIType.u64, FFIType.u32], returns: FFIType.ptr },
} as const;
