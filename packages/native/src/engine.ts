// SPDX-License-Identifier: Apache-2.0
//
// Bun `bun:ffi` binding for the Shenron native library (crate `shenron-ffi`): the `shenron`
// command surface, Shenron RAG/persona helpers and the Koharu manga pipeline, in process.
//
// Set SHENRON_FFI_LIB to the library path; otherwise it is resolved from `native/` beside this
// package, then (with SHENRON_FFI_DEV=1) from the repository Cargo target directory.

import { CString, dlopen, FFIType, suffix, type Pointer } from "bun:ffi";
import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export const EXPECTED_SHENRON_ABI_VERSION = 1;
export const EXPECTED_MANGA_ABI_VERSION = 1;

const SYMBOLS = {
  shenron_abi_version: { args: [], returns: FFIType.u32 },
  shenron_version: { args: [], returns: FFIType.cstring },
  shenron_last_error: { args: [], returns: FFIType.ptr },
  shenron_string_free: { args: [FFIType.ptr], returns: FFIType.void },
  shenron_run_json: { args: [FFIType.cstring], returns: FFIType.i32 },
  shenron_run: { args: [FFIType.i32, FFIType.ptr], returns: FFIType.i32 },
  shenron_run_captured: { args: [FFIType.cstring], returns: FFIType.ptr },
  shenron_rag_search: { args: [FFIType.cstring, FFIType.i32, FFIType.cstring], returns: FFIType.ptr },
  shenron_rag_stats: { args: [], returns: FFIType.ptr },
  shenron_rag_chunk: { args: [FFIType.cstring, FFIType.i32, FFIType.f32], returns: FFIType.ptr },
  shenron_auth_status: { args: [], returns: FFIType.ptr },
  shenron_persona_prompt: { args: [], returns: FFIType.cstring },
  shenron_persona_ask: { args: [FFIType.cstring], returns: FFIType.ptr },
  manga_abi_version: { args: [], returns: FFIType.u32 },
  manga_detect_bubbles: { args: [FFIType.ptr, "usize"], returns: FFIType.ptr },
  manga_typeset_fit: {
    args: [FFIType.cstring, FFIType.f32, FFIType.f32, FFIType.f32, FFIType.f32, FFIType.i32],
    returns: FFIType.ptr,
  },
  manga_pipeline_run: { args: [FFIType.ptr, "usize", FFIType.cstring], returns: FFIType.ptr },
  manga_scanlate_cdn: { args: [FFIType.cstring, FFIType.cstring], returns: FFIType.ptr },
  manga_scanlate_databook: { args: [FFIType.u64, FFIType.u32, FFIType.cstring], returns: FFIType.ptr },
  manga_scanlate_chapter: { args: [FFIType.u64, FFIType.u32, FFIType.cstring], returns: FFIType.ptr },
  manga_string_free: { args: [FFIType.ptr], returns: FFIType.void },
} as const;

type NativeLibrary = ReturnType<typeof dlopen<typeof SYMBOLS>>;
let library: NativeLibrary | undefined;

const ENCODER = new TextEncoder();

/** @internal NUL-terminated UTF-8 marshaling shared by the sub-bindings. */
export function cstr(text: string): Uint8Array {
  if (text.includes("\0")) throw new TypeError("C string values must not contain NUL characters");
  return ENCODER.encode(`${text}\0`);
}

/** Resolve the library for this host; an explicit override must exist. */
export function resolveNativeLibraryPath(): string | undefined {
  const override = process.env.SHENRON_FFI_LIB;
  if (override) {
    if (!existsSync(override)) throw new Error(`SHENRON_FFI_LIB points to a missing file: ${override}`);
    return resolve(override);
  }
  const file = `${process.platform === "win32" ? "" : "lib"}shenron_ffi.${suffix}`;
  const packageRoot = join(import.meta.dir, "..");
  const candidates = [join(packageRoot, "native", `${process.platform}-${process.arch}`, file), join(packageRoot, "native", file)];
  if (process.env.SHENRON_FFI_DEV === "1") {
    const repoRoot = join(packageRoot, "..", "..");
    const configured = process.env.CARGO_TARGET_DIR;
    const target = configured ? (isAbsolute(configured) ? configured : resolve(repoRoot, configured)) : join(repoRoot, "target");
    for (const profile of ["release", "debug"]) candidates.push(join(target, profile, file));
  }
  return candidates.find(existsSync);
}

/** @internal One lazy handle for every @shenron/native subpath. Importing a binding never opens it. */
export function loadLib(): NativeLibrary {
  if (library) return library;
  const path = resolveNativeLibraryPath();
  if (!path)
    throw new Error("shenron-ffi native library not found; set SHENRON_FFI_LIB or SHENRON_FFI_DEV=1 for a local build");
  let loaded: NativeLibrary;
  try {
    loaded = dlopen(path, SYMBOLS);
  } catch (error) {
    throw new Error(`Unable to load shenron-ffi at ${path}: ${String(error)}`, { cause: error });
  }
  for (const [name, actual, expected] of [
    ["Shenron", loaded.symbols.shenron_abi_version(), EXPECTED_SHENRON_ABI_VERSION],
    ["Manga", loaded.symbols.manga_abi_version(), EXPECTED_MANGA_ABI_VERSION],
  ] as const) {
    if (actual !== expected) {
      loaded.close();
      throw new Error(`${name} ABI mismatch at ${path}: expected ${expected}, found ${actual}`);
    }
  }
  library = loaded;
  return loaded;
}

/** Close the native handle (optional; process exit also frees it). */
export function close(): void {
  library?.close();
  library = undefined;
}

function readOwnedString(ptr: bigint | Pointer | null): string {
  if (!ptr) throw new Error(lastError() ?? "shenron-ffi returned a null string");
  try {
    return new CString(ptr as Pointer).toString();
  } finally {
    loadLib().symbols.shenron_string_free(ptr as Pointer);
  }
}

/** Structured result of a captured run. */
export interface CapturedResult {
  code: number;
  stdout: string;
  stderr: string;
}

function validateCliArgs(args: string[]): void {
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string" || arg.includes("\0"))) {
    throw new TypeError("CLI arguments must be strings without NUL characters");
  }
}

function parseCapturedResult(text: string, operation: string): CapturedResult {
  const value: unknown = JSON.parse(text);
  if (
    typeof value !== "object" ||
    value === null ||
    !Number.isInteger((value as CapturedResult).code) ||
    typeof (value as CapturedResult).stdout !== "string" ||
    typeof (value as CapturedResult).stderr !== "string"
  ) {
    throw new Error(`${operation} returned an invalid captured-result payload`);
  }
  return value as CapturedResult;
}

/** The last error recorded on this thread by the native library, if any. */
export function lastError(): string | null {
  const ptr = loadLib().symbols.shenron_last_error();
  if (!ptr) return null;
  const text = new CString(ptr).toString();
  return text.length > 0 ? text : null;
}

/** Runtime ABI revision of the Shenron command and service exports. */
export function shenronAbiVersion(): number {
  return loadLib().symbols.shenron_abi_version();
}

/** Shenron CLI version. */
export function shenronVersion(): string {
  const value = loadLib().symbols.shenron_version();
  if (value === null) throw new Error("shenron-ffi returned a null version");
  return value.toString();
}

/** Run a Shenron command with inherited stdio. Arguments exclude `shenron`. */
export function shenronRun(args: string[]): number {
  validateCliArgs(args);
  return loadLib().symbols.shenron_run_json(cstr(JSON.stringify(args)));
}

/** Run a Shenron command and capture stdout and stderr without spawning a process. */
export function shenronRunCaptured(args: string[]): CapturedResult {
  validateCliArgs(args);
  return parseCapturedResult(readOwnedString(loadLib().symbols.shenron_run_captured(cstr(JSON.stringify(args)))), "Shenron");
}

/** Search Shenron RAG; the returned JSON carries the CLI code, stdout and stderr. */
export function shenronRagSearch(query: string, limit = 10, kind?: string): CapturedResult {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("RAG limit must be a positive integer");
  const pointer = loadLib().symbols.shenron_rag_search(cstr(query), limit, kind === undefined ? null : cstr(kind));
  return parseCapturedResult(readOwnedString(pointer), "Shenron RAG search");
}

/** Read Shenron RAG statistics; the returned JSON carries code/stdout/stderr. */
export function shenronRagStats(): CapturedResult {
  return parseCapturedResult(readOwnedString(loadLib().symbols.shenron_rag_stats()), "Shenron RAG stats");
}

/** Chunk Markdown with the Shenron-parity chunker of the Aphrody RAG core. */
export function shenronRagChunk(
  markdown: string,
  maxChars = 1400,
  overlapPct = 0.15,
): Array<{ content: string; section: string }> {
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new RangeError("maxChars must be positive");
  if (!Number.isFinite(overlapPct) || overlapPct < 0 || overlapPct > 1)
    throw new RangeError("overlapPct must be between zero and one");
  const result = JSON.parse(readOwnedString(loadLib().symbols.shenron_rag_chunk(cstr(markdown), maxChars, overlapPct))) as unknown;
  if (!Array.isArray(result)) throw new Error("Shenron RAG chunker returned an invalid response");
  return result as Array<{ content: string; section: string }>;
}

/** Read sanitized Shenron authentication status; secret values are never returned. */
export function shenronAuthStatus(): CapturedResult {
  return parseCapturedResult(readOwnedString(loadLib().symbols.shenron_auth_status()), "Shenron auth status");
}

/** Read the canonical local Shenron persona prompt. */
export function shenronPersonaPrompt(): string {
  const value = loadLib().symbols.shenron_persona_prompt();
  if (value === null) throw new Error("shenron_persona_prompt returned a null pointer");
  return value.toString();
}

/** Ask the Shenron persona; result carries code/stdout/stderr. */
export function shenronPersonaAsk(question: string): CapturedResult {
  return parseCapturedResult(readOwnedString(loadLib().symbols.shenron_persona_ask(cstr(question))), "Shenron persona");
}
