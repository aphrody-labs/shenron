// SPDX-License-Identifier: Apache-2.0
/** Product commands execute inside the canonical Aphrody FFI library. */
import { resolve } from "node:path";

export const DEFAULT_APHRODY_CLI_TIMEOUT_MS = 30_000;

export interface NativeCommandOutput {
  code: number;
  stdout: string;
  stderr: string;
}
export type NativeCommandExecutor = (
  args: readonly string[],
  controls: { timeoutMs: number; signal?: AbortSignal },
) => Promise<NativeCommandOutput>;

export interface AphrodyCommandOptions {
  /** Former binary override. Select the verified library with APHRODY_FFI_LIB. */
  bin?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  json?: boolean;
  /** FFI never changes the process-wide working directory. Use absolute inputs. */
  cwd?: string;
  /** An injected in-process owner for tests or another supported host. */
  nativeExecutor?: NativeCommandExecutor;
}
export type AphrodyCliOptions = AphrodyCommandOptions;
interface CliOutput {
  stdout: string;
  stderr: string;
  durationMs: number;
}
export type CliResult<T = unknown> =
  | { kind: "not_found"; bin: string; message: string }
  | ({ kind: "exit"; ok: true; code: 0; data: T | undefined } & CliOutput)
  | ({ kind: "exit"; ok: false; code: number; data?: undefined } & CliOutput)
  | ({ kind: "timeout"; timeoutMs: number } & CliOutput)
  | ({ kind: "invalid_json"; code: number; error: string } & CliOutput);
export interface AphrodyDoctorResult {
  verdict?: string;
  agentWorkspace?: { path: string; charCount: number };
  [key: string]: unknown;
}
export interface AphrodyGitInspectResult {
  head?: string;
  [key: string]: unknown;
}

const nativeExecutor: NativeCommandExecutor = async (args, controls) => {
  // Server exports remain importable by Next. Only execution loads the Bun ABI.
  const native = await import("@shenron/native/web/pipeline");
  if (args[0] === "web" && ["dragon-ball", "crawl-index"].includes(args[1] ?? "")) {
    const result = await native.webPipeline(args.slice(1), controls);
    return { code: 0, stdout: JSON.stringify(result), stderr: "" };
  }
  return native.commandPipeline(args, controls);
};

/** No binary lookup or process fallback. Native failures retain diagnostics. */
export async function runAphrodyCommand<T = unknown>(
  args: readonly string[],
  options: AphrodyCommandOptions = {},
): Promise<CliResult<T>> {
  options.signal?.throwIfAborted();
  const timeoutMs = options.timeoutMs ?? DEFAULT_APHRODY_CLI_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 0xffff_ffff)
    throw new RangeError("timeoutMs must be a positive uint32 millisecond value");
  if (!args.length || args.some((arg) => typeof arg !== "string" || arg.includes("\0")))
    throw new TypeError("Native arguments require nonempty strings without NUL");
  if (options.bin)
    return {
      kind: "not_found",
      bin: options.bin,
      message: "Binary overrides are retired; select a verified APHRODY_FFI_LIB artifact",
    };
  if (options.cwd && resolve(options.cwd) !== process.cwd())
    throw new Error(
      "Native calls require explicit input paths instead of changing the working directory",
    );
  const started = performance.now();
  let captured: NativeCommandOutput;
  try {
    captured = await (options.nativeExecutor ?? nativeExecutor)(args, {
      timeoutMs,
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (
      /library not found|missing file|Unable to load aphrody-ffi|Cannot find (?:package|module)/i.test(
        message,
      )
    )
      return { kind: "not_found", bin: "aphrody_ffi", message };
    const output = {
      stdout: "",
      stderr: message,
      durationMs: Math.round(performance.now() - started),
    };
    if (error instanceof Error && error.cause === "native-deadline")
      return { kind: "timeout", timeoutMs, ...output };
    return { kind: "exit", ok: false, code: 1, ...output };
  }
  const output = {
    stdout: captured.stdout,
    stderr: captured.stderr,
    durationMs: Math.round(performance.now() - started),
  };
  if (captured.code !== 0) return { kind: "exit", ok: false, code: captured.code, ...output };
  if (!options.json) return { kind: "exit", ok: true, code: 0, data: undefined, ...output };
  try {
    return { kind: "exit", ok: true, code: 0, data: JSON.parse(output.stdout) as T, ...output };
  } catch (error) {
    return { kind: "invalid_json", code: 0, error: String(error), ...output };
  }
}

export const runAphrodyCli = runAphrodyCommand;
export function aphrodyDoctor(
  options: Omit<AphrodyCommandOptions, "json"> = {},
): Promise<CliResult<AphrodyDoctorResult>> {
  return runAphrodyCommand(["doctor", "--json"], { ...options, json: true });
}
export function aphrodyGitInspect(
  repoPath = process.cwd(),
  options: Omit<AphrodyCommandOptions, "json"> = {},
): Promise<CliResult<AphrodyGitInspectResult>> {
  return runAphrodyCommand(["git", "inspect", repoPath], { ...options, json: true });
}
