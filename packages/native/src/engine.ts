// SPDX-License-Identifier: Apache-2.0
//
// Bun `bun:ffi` binding for the Shenron native library (crate `shenron-ffi`): the `shenron`
// command surface, Shenron RAG/persona helpers, in process, on the calling thread. Long calls
// belong on `@shenron/native/worker` (promises, cancellation, off the event loop).
//
// Set SHENRON_FFI_LIB to the library path; otherwise it is resolved from `native/` beside this
// package, then (with SHENRON_FFI_DEV=1) from the repository Cargo target directory, the most
// recent of the release and debug builds. A host that
// ships the library elsewhere (shenron-server) opens it first with `shenronLoad(path)`.
//
// The `dlopen` table and the payload types are generated from the Rust crate
// (`src/generated/`, `bun scripts/generate.ts`). Opening checks, in order: the Bun runtime
// (`engines.bun`), the ABI revision (before binding any other symbol), then the target and the
// crate version from `shenron_build_info` (see `compat.ts`).

import { CString, dlopen, suffix, type Pointer } from "bun:ffi";
import { existsSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

import manifest from "../package.json" with { type: "json" };
import { checkAbi, checkBuildInfo } from "./compat";
import { SHENRON_FFI_ABI, SHENRON_FFI_VERSION, SHENRON_STATUS, SYMBOLS } from "./generated/symbols";
import type {
  BuildInfo,
  CapturedResult,
  FfiError,
  JobOutcome,
  LlamaProgress,
  LlamaProvisioned,
  LlamaRouterInfo,
  LocalSearchResponse,
  MemoryEntry,
  RagChunk,
} from "./generated/types";

export type { LlamaProgress, LlamaProvisioned, LlamaRouterInfo };

export { SHENRON_FFI_ABI, SHENRON_FFI_VERSION, SHENRON_STATUS };

/** ABI revision this binding requires (`shenron_abi_version()`). */
export const EXPECTED_SHENRON_ABI_VERSION = SHENRON_FFI_ABI;

/** Bun range of `engines.bun`, aligned on the repository root. */
export const SHENRON_NATIVE_BUN_RANGE: string = manifest.engines.bun;

export type NativeLibrary = ReturnType<typeof dlopen<typeof SYMBOLS>>;
let library: NativeLibrary | undefined;
let libraryPath: string | undefined;
let libraryInfo: BuildInfo | undefined;

const ENCODER = new TextEncoder();

/** File name of the native library on this host (`libshenron_ffi.so`, `shenron_ffi.dll`, …). */
export const SHENRON_FFI_FILE = `${process.platform === "win32" ? "" : "lib"}shenron_ffi.${suffix}`;

/** @internal NUL-terminated UTF-8 marshaling shared by the sub-bindings. */
export function cstr(text: string): Uint8Array {
  if (text.includes("\0")) throw new TypeError("C string values must not contain NUL characters");
  return ENCODER.encode(`${text}\0`);
}

/** Resolve the library for this host; an explicit override must exist. */
export function resolveNativeLibraryPath(): string | undefined {
  const override = process.env.SHENRON_FFI_LIB;
  if (override) {
    if (!existsSync(override))
      throw new Error(`SHENRON_FFI_LIB points to a missing file: ${override}`);
    return resolve(override);
  }
  const file = SHENRON_FFI_FILE;
  const packageRoot = join(import.meta.dir, "..");
  const candidates = [
    join(packageRoot, "native", `${process.platform}-${process.arch}`, file),
    join(packageRoot, "native", file),
  ];
  if (process.env.SHENRON_FFI_DEV === "1") {
    const repoRoot = join(packageRoot, "..", "..");
    const configured = process.env.CARGO_TARGET_DIR;
    const target = configured
      ? isAbsolute(configured)
        ? configured
        : resolve(repoRoot, configured)
      : join(repoRoot, "target");
    // The most recent build wins: a stale release must not shadow a fresh `cargo build`.
    const builds = ["release", "debug"]
      .map((profile) => join(target, profile, file))
      .filter((path) => existsSync(path))
      .toSorted((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    candidates.push(...builds);
  }
  return candidates.find((path) => existsSync(path));
}

/** Refuse a Bun outside `engines.bun`: `bun:ffi` trampolines are compiled by the runtime. */
export function checkBunRuntime(version = Bun.version, range = SHENRON_NATIVE_BUN_RANGE): void {
  const validVersion =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
      version,
    );
  // Minimum-only requirements also admit a newer fork build with a prerelease suffix.
  // General ranges retain their prerelease rules, and a prerelease of the minimum stays older.
  const minimum = /^>=\s*((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(range);
  if (
    !validVersion ||
    !(
      Bun.semver.satisfies(version, range) ||
      (minimum && Bun.semver.order(version, minimum[1]!) >= 0)
    )
  ) {
    throw new Error(`@shenron/native requires Bun ${range}; this process runs Bun ${version}`);
  }
}

/** A `ptr` return: bun-types widen it to `bigint`; pointers come back as numbers. */
type PointerReturn = Pointer | bigint | null;

/** Copy then free an owned string of `lib`; NULL reports the calling thread's last error. */
function takeOwned(lib: NativeLibrary, returned: PointerReturn, operation: string): string {
  const ptr = returned as Pointer | null;
  if (!ptr) throw new Error(lastErrorOf(lib) ?? `${operation} returned a null string`);
  try {
    return new CString(ptr).toString();
  } finally {
    lib.symbols.shenron_string_free(ptr);
  }
}

function lastErrorOf(lib: NativeLibrary): string | null {
  const ptr = lib.symbols.shenron_last_error();
  if (!ptr) return null;
  const text = new CString(ptr).toString();
  return text.length > 0 ? text : null;
}

/**
 * @internal One lazy handle for every @shenron/native subpath. Importing a binding never opens it.
 * `explicitPath` opens that file instead of the default resolution (a host that ships the library
 * beside its executable); once a library is open, every caller shares it whatever the path.
 */
export function loadLib(explicitPath?: string): NativeLibrary {
  if (library) return library;
  checkBunRuntime();
  const path = explicitPath ?? resolveNativeLibraryPath();
  if (!path)
    throw new Error(
      "shenron-ffi native library not found; set SHENRON_FFI_LIB or SHENRON_FFI_DEV=1 for a local build",
    );
  // The ABI first, through the one symbol every revision exports: a table of another revision
  // would fail to bind (or worse, bind with other signatures).
  let abi: number;
  try {
    const probe = dlopen(path, { shenron_abi_version: SYMBOLS.shenron_abi_version });
    try {
      abi = probe.symbols.shenron_abi_version();
    } finally {
      probe.close();
    }
  } catch (error) {
    throw new Error(
      `Unable to load shenron-ffi at ${path} (this process is ${process.platform}-${process.arch}): ${String(error)}`,
      { cause: error },
    );
  }
  checkAbi(abi, EXPECTED_SHENRON_ABI_VERSION, path);
  let loaded: NativeLibrary;
  try {
    loaded = dlopen(path, SYMBOLS);
  } catch (error) {
    throw new Error(`Unable to load shenron-ffi at ${path}: ${String(error)}`, { cause: error });
  }
  try {
    const info = JSON.parse(
      takeOwned(loaded, loaded.symbols.shenron_build_info(), "shenron_build_info"),
    ) as BuildInfo;
    checkBuildInfo(info, path, {
      abi: EXPECTED_SHENRON_ABI_VERSION,
      version: SHENRON_FFI_VERSION,
      platform: process.platform,
      arch: process.arch,
      allowVersionSkew: process.env.SHENRON_FFI_ALLOW_VERSION_SKEW === "1",
    });
    libraryInfo = info;
  } catch (error) {
    loaded.close();
    throw error;
  }
  library = loaded;
  libraryPath = path;
  return loaded;
}

/**
 * Open the native library now and check it (Bun range, ABI, target, version); returns the path
 * of the open library. `path` replaces the default resolution (SHENRON_FFI_LIB, then `native/`
 * beside this package). The process keeps a single library: once one is open, its path is
 * returned whatever `path`.
 */
export function shenronLoad(path?: string): string {
  loadLib(path);
  return libraryPath as string;
}

/** Path of the open library, if any. */
export function shenronLibraryPath(): string | undefined {
  return libraryPath;
}

let holders = 0;

/** @internal A worker pool keeps the main handle (its job ids, cancellation) until it closes. */
export function holdLib(): () => void {
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
  };
}

/**
 * Close the native handle (optional; process exit also frees it). Refused while a worker pool
 * is open: close the pools first (`closeShenronWorkerPool`, `ShenronWorkerPool.close`).
 */
export function close(): void {
  if (holders > 0) throw new Error("close the @shenron/native worker pools before the library");
  library?.close();
  library = undefined;
  libraryPath = undefined;
  libraryInfo = undefined;
}

function readOwnedString(ptr: PointerReturn, operation = "shenron-ffi"): string {
  return takeOwned(loadLib(), ptr, operation);
}

/** Structured result of a captured run (generated `CapturedResult`). */
export type { CapturedResult };

/** @internal */
export function validateCliArgs(args: readonly string[]): void {
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

/**
 * The last error recorded by the native library on the calling thread (here, the main thread),
 * if any. A worker reads its own: see `@shenron/native/worker`.
 */
export function lastError(): string | null {
  return lastErrorOf(loadLib());
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

/** Identity of the open library (version, ABI, target, profile, features, compiler). */
export function shenronBuildInfo(): BuildInfo {
  loadLib();
  return structuredClone(libraryInfo as BuildInfo);
}

/** Original AGE 1000 Xenoverse 3 prototype map with citations and schematic geometry. */
export interface Xenoverse3PrototypeMap {
  schema_version: number;
  title: string;
  era: string;
  status: "original_prototype_schematic";
  coordinate_system: string;
  bounds: [number, number, number];
  zones: Array<{
    id: string;
    name: string;
    kind: string;
    evidence: "announced" | "prototype";
    source: string;
    center: { x: number; y: number; elevation: number };
    radius: number;
    description: string;
  }>;
  landmarks: Array<{
    id: string;
    name: string;
    zone_id: string;
    kind: string;
    evidence: "announced" | "prototype";
    source: string;
    position: { x: number; y: number; elevation: number };
    description: string;
  }>;
  routes: Array<{
    id: string;
    from: string;
    to: string;
    mode: string;
    distance: number;
    evidence: "announced" | "prototype";
    source: string;
    description: string;
  }>;
  caveat: string;
}

/** Read Shenron RE's source-attributed prototype map through native Rust FFI. */
export function shenronReXenoverse3Map(): Xenoverse3PrototypeMap {
  const value: unknown = JSON.parse(
    readOwnedString(loadLib().symbols.shenron_re_xenoverse3_map(), "shenron_re_xenoverse3_map"),
  );
  if (
    typeof value !== "object" ||
    value === null ||
    (value as Xenoverse3PrototypeMap).status !== "original_prototype_schematic" ||
    !Array.isArray((value as Xenoverse3PrototypeMap).zones) ||
    !Array.isArray((value as Xenoverse3PrototypeMap).landmarks) ||
    !Array.isArray((value as Xenoverse3PrototypeMap).routes)
  ) {
    const error = (value as { error?: unknown } | null)?.error;
    throw new Error(
      typeof error === "string" ? error : "Shenron RE returned an invalid Xenoverse 3 map",
    );
  }
  return value as Xenoverse3PrototypeMap;
}

/** Registered native jobs, pending or running (leak checks). */
export function shenronJobCount(): number {
  return loadLib().symbols.shenron_job_count();
}

/** Run a Shenron command with inherited stdio. Arguments exclude `shenron`. */
export function shenronRun(args: string[]): number {
  validateCliArgs(args);
  return loadLib().symbols.shenron_run_json(cstr(JSON.stringify(args)));
}

/** Run a Shenron command and capture stdout and stderr without spawning a process. */
export function shenronRunCaptured(args: string[]): CapturedResult {
  validateCliArgs(args);
  return parseCapturedResult(
    readOwnedString(loadLib().symbols.shenron_run_captured(cstr(JSON.stringify(args)))),
    "Shenron",
  );
}

/** @internal */
export function checkLimit(limit: number, what: string): void {
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError(`${what} limit must be a positive integer`);
}

/** Search Shenron RAG; the returned JSON carries the CLI code, stdout and stderr. */
export function shenronRagSearch(query: string, limit = 10, kind?: string): CapturedResult {
  checkLimit(limit, "RAG");
  const pointer = loadLib().symbols.shenron_rag_search(
    cstr(query),
    limit,
    kind === undefined ? null : cstr(kind),
  );
  return parseCapturedResult(readOwnedString(pointer), "Shenron RAG search");
}

/**
 * Search the offline Shenron corpus in process (embedded canon and guide, the configured corpus
 * and the local RAG store). An empty or absent `kind` searches every kind; a refused request
 * throws with the library's message.
 */
export function shenronLocalSearch(query: string, limit = 8, kind?: string): LocalSearchResponse {
  checkLimit(limit, "local search");
  const queryArg = cstr(query);
  const kindArg = kind ? cstr(kind) : null;
  const text = readOwnedString(
    loadLib().symbols.shenron_local_search(queryArg, limit, kindArg),
    "shenron_local_search",
  );
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("shenron_local_search returned an invalid payload");
  if (!Array.isArray((value as LocalSearchResponse).results)) {
    const refused = value as Partial<CapturedResult>;
    throw new Error(refused.stderr || "shenron_local_search returned an invalid payload");
  }
  return value as LocalSearchResponse;
}

/** Read Shenron RAG statistics; the returned JSON carries code/stdout/stderr. */
export function shenronRagStats(): CapturedResult {
  return parseCapturedResult(
    readOwnedString(loadLib().symbols.shenron_rag_stats()),
    "Shenron RAG stats",
  );
}

/** Chunk Markdown with the Shenron-parity chunker of the Aphrody RAG core. */
export function shenronRagChunk(markdown: string, maxChars = 1400, overlapPct = 0.15): RagChunk[] {
  if (!Number.isInteger(maxChars) || maxChars < 1)
    throw new RangeError("maxChars must be positive");
  if (!Number.isFinite(overlapPct) || overlapPct < 0 || overlapPct > 1)
    throw new RangeError("overlapPct must be between zero and one");
  const result = JSON.parse(
    readOwnedString(loadLib().symbols.shenron_rag_chunk(cstr(markdown), maxChars, overlapPct)),
  ) as unknown;
  if (!Array.isArray(result)) {
    const error = (result as Partial<FfiError> | null)?.error;
    throw new Error(error ?? "Shenron RAG chunker returned an invalid response");
  }
  return result as RagChunk[];
}

/** Read sanitized Shenron authentication status; secret values are never returned. */
export function shenronAuthStatus(): CapturedResult {
  return parseCapturedResult(
    readOwnedString(loadLib().symbols.shenron_auth_status()),
    "Shenron auth status",
  );
}

/** Read the canonical local Shenron persona prompt. */
export function shenronPersonaPrompt(): string {
  const value = loadLib().symbols.shenron_persona_prompt();
  if (value === null) throw new Error("shenron_persona_prompt returned a null pointer");
  return value.toString();
}

/** Ask the Shenron persona; result carries code/stdout/stderr. Blocks: prefer the worker. */
export function shenronPersonaAsk(question: string): CapturedResult {
  return parseCapturedResult(
    readOwnedString(loadLib().symbols.shenron_persona_ask(cstr(question))),
    "Shenron persona",
  );
}

// --- ABI 3: persistent chat memory (Aphrody `aphrody-memory`, SQLite provider) ---

/** A stored memory; `createdAtMs` is always a number here. */
export type ShenronMemory = Omit<MemoryEntry, "createdAtMs"> & { createdAtMs: number };

/** Request of `shenronMemoryAdd`: tags are `[a-z0-9:_-]{1,32}`, metadata string values. */
export interface ShenronMemoryAdd {
  agentId: string;
  content: string;
  tags?: string[];
  metadata?: Record<string, string>;
}

/** Request of `shenronMemorySearch`: `q` is a substring of the content; newest first. */
export interface ShenronMemorySearch {
  agentId: string;
  q?: string;
  tags?: string[];
  limit?: number;
}

/** Raised for a memory call that produced no value (`status`: `SHENRON_STATUS`). */
export class ShenronMemoryError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ShenronMemoryError";
  }
}

function memoryOutcome<T>(pointer: PointerReturn, operation: string): T {
  const outcome = JSON.parse(readOwnedString(pointer, operation)) as JobOutcome<T>;
  if (outcome.status !== SHENRON_STATUS.ok || outcome.value === null)
    throw new ShenronMemoryError(outcome.status, outcome.error ?? `${operation} failed`);
  return outcome.value;
}

const memoryOf = (entry: MemoryEntry): ShenronMemory => ({
  ...entry,
  createdAtMs: entry.createdAtMs ?? 0,
});

/** Store one memory in the SQLite memory at `dbPath` (created on first use, mode 600). */
export function shenronMemoryAdd(dbPath: string, request: ShenronMemoryAdd): ShenronMemory {
  return memoryOf(
    memoryOutcome<MemoryEntry>(
      loadLib().symbols.shenron_memory_add(cstr(dbPath), cstr(JSON.stringify(request))),
      "shenron_memory_add",
    ),
  );
}

/** Memories of one agent, newest first. */
export function shenronMemorySearch(dbPath: string, request: ShenronMemorySearch): ShenronMemory[] {
  return memoryOutcome<MemoryEntry[]>(
    loadLib().symbols.shenron_memory_search(cstr(dbPath), cstr(JSON.stringify(request))),
    "shenron_memory_search",
  ).map(memoryOf);
}

/** Delete memory `id` of `agentId`; `false` when the agent has no such memory. */
export function shenronMemoryDelete(dbPath: string, agentId: string, id: string): boolean {
  return memoryOutcome<boolean>(
    loadLib().symbols.shenron_memory_delete(cstr(dbPath), cstr(agentId), cstr(id)),
    "shenron_memory_delete",
  );
}

/** Delete every memory of `agentId`; returns how many were deleted. */
export function shenronMemoryClear(dbPath: string, agentId: string): number {
  return memoryOutcome<number>(
    loadLib().symbols.shenron_memory_clear(cstr(dbPath), cstr(agentId)),
    "shenron_memory_clear",
  );
}

// --- ABI 4: local chat models (Aphrody `aphrody-llama-server` local chat, in process) ---

/** One model file: catalog id or reference (`hf:`, `https://`, `file:`) with its digest. */
export interface ShenronLlamaArtifact {
  spec: string;
  sha256?: string;
  /** Adapter scale (adapters only, default 1). */
  scale?: number;
}

/** Request of `ShenronWorkerPool.llamaProvision` (`shenron_llama_provision_job`). */
export interface ShenronLlamaProvision {
  modelsDir: string;
  catalog?: string;
  model?: ShenronLlamaArtifact;
  lora?: ShenronLlamaArtifact[];
  force?: boolean;
}

/** Request of `shenronLlamaRouterStart`. */
export interface ShenronLlamaRouterStart {
  /** `router.json` (crates/ai/llama-server/LOCAL-CHAT.md in Aphrody). */
  config: string;
  modelsDir: string;
  stateDir: string;
  llamaBin?: string;
  /** Directories holding `llama/` or `llama-server` (the app's resources). */
  searchDirs?: string[];
  bind?: string;
  /** How the supervisor starts its daemon: `program args… <daemon args>`. */
  daemon: { program: string; args?: string[] };
}

/** Raised for a local chat call that produced no value (`status`: `SHENRON_STATUS`). */
export class ShenronLlamaError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ShenronLlamaError";
  }
}

/** Latest progress of the running provisioning job `job`, or `null`. */
export function shenronLlamaProgress(job: number): LlamaProgress | null {
  return JSON.parse(
    readOwnedString(loadLib().symbols.shenron_llama_progress(job), "shenron_llama_progress"),
  ) as LlamaProgress | null;
}

/** Serve the chat router in this process (replacing a previous one); resolves once it listens. */
export function shenronLlamaRouterStart(request: ShenronLlamaRouterStart): LlamaRouterInfo {
  const outcome = JSON.parse(
    readOwnedString(
      loadLib().symbols.shenron_llama_router_start(cstr(JSON.stringify(request))),
      "shenron_llama_router_start",
    ),
  ) as JobOutcome<LlamaRouterInfo>;
  if (outcome.status !== SHENRON_STATUS.ok || outcome.value === null)
    throw new ShenronLlamaError(
      outcome.status,
      outcome.error ?? "shenron_llama_router_start failed",
    );
  return outcome.value;
}

/** Stop the router of this process and the model server it started; `true` if one served. */
export function shenronLlamaRouterStop(): boolean {
  return loadLib().symbols.shenron_llama_router_stop();
}

/**
 * Run the model supervisor's daemon with `args` until it exits (a process re-executed as the
 * daemon launcher of `shenronLlamaRouterStart`); returns its exit code. Blocks the thread.
 */
export function shenronLlamaDaemon(args: readonly string[]): number {
  return loadLib().symbols.shenron_llama_daemon(cstr(JSON.stringify(args)));
}
