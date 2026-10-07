// SPDX-License-Identifier: Apache-2.0
/** Compatibility BXC calls are consumed by the native Aphrody Web owner. */
import { runAphrodyCommand, type AphrodyCommandOptions } from "../aphrody/native-commands";

export class BxcExecutionError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly stderr: string,
    public readonly command: string[],
  ) {
    super(message);
    this.name = "BxcExecutionError";
  }
}

export class BxcTimeoutError extends Error {
  constructor(
    message: string,
    public readonly command: string[],
  ) {
    super(message);
    this.name = "BxcTimeoutError";
  }
}

/** Legacy metadata accessor; no executable is resolved or started. */
export function resolveBxcPath(): string {
  return process.env.APHRODY_FFI_LIB ?? "aphrody_ffi";
}
/** Reviewable command description, not a process entry point. */
export function resolveBxcCommand(): string[] {
  return ["aphrody", "web"];
}
export interface ExecBxcOptions extends Omit<AphrodyCommandOptions, "json"> {
  bxcPath?: string;
  retries?: number;
  retryDelayMs?: number;
}

export async function execBxc(args: string[], options: ExecBxcOptions = {}): Promise<string> {
  if (options.bxcPath) throw new Error("BXC binaries are retired; select APHRODY_FFI_LIB");
  const nativeArgs = args[0] === "--version" ? args : ["web", ...args];
  const result = await runAphrodyCommand(nativeArgs, options);
  if (result.kind === "not_found") throw new Error(result.message);
  if (result.kind === "timeout") throw new BxcTimeoutError(result.stderr, nativeArgs);
  if (result.kind !== "exit" || !result.ok)
    throw new BxcExecutionError(
      result.stderr || result.stdout,
      result.code,
      result.stderr,
      nativeArgs,
    );
  return result.stdout.trim();
}

export async function execBxcJson<T>(args: string[], options: ExecBxcOptions = {}): Promise<T> {
  const finalArgs = args.includes("--json") ? args : [...args, "--json"];
  const raw = await execBxc(finalArgs, options);
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(
      `Failed to parse bxc JSON output: ${err instanceof Error ? err.message : String(err)}\nRaw output: ${raw.slice(0, 500)}`,
      { cause: err },
    );
  }
}
