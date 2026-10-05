// SPDX-License-Identifier: Apache-2.0
/**
 * @shenron/pipeline/aphrody/cli — thin wrappers over the `aphrody` binary (runtime class
 * `server`: `node:child_process` through ../process). Every call has a timeout; the outcome is
 * always a classified {@link CliResult}, never a throw and never a fabricated success.
 *
 * Commands with JSON output are wrapped (`doctor --json`, `git inspect`, and
 * the consumer clients for translation and Web); `notify` prints free text.
 */

import { runProcess, which } from "../process";

export const DEFAULT_APHRODY_CLI_TIMEOUT_MS = 30_000;

export interface AphrodyCliOptions {
  /** Binary to run. Defaults to `APHRODY_BIN`, then `aphrody` on PATH. */
  bin?: string;
  /** Kill the process after this many milliseconds (default 30 s). */
  timeoutMs?: number;
  /** Parse stdout as JSON; a parse failure yields `invalid_json`. */
  json?: boolean;
  /** Working directory of the child process. */
  cwd?: string;
}

interface CliOutput {
  stdout: string;
  stderr: string;
  durationMs: number;
}

/** Classified result of one CLI call. */
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

function resolveBin(bin: string | undefined): string | null {
  const wanted = bin ?? (process.env.APHRODY_BIN?.trim() || "aphrody");
  if (wanted.includes("/") || wanted.includes("\\")) {
    return wanted;
  }
  return which(wanted);
}

/** Runs `aphrody <args>` and classifies the outcome. */
export async function runAphrodyCli<T = unknown>(
  args: readonly string[],
  options: AphrodyCliOptions = {},
): Promise<CliResult<T>> {
  const requested = options.bin ?? (process.env.APHRODY_BIN?.trim() || "aphrody");
  const bin = resolveBin(options.bin);
  if (!bin) {
    return { kind: "not_found", bin: requested, message: `${requested} introuvable sur le PATH` };
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_APHRODY_CLI_TIMEOUT_MS;
  const started = performance.now();
  const outcome = await runProcess([bin, ...args], { cwd: options.cwd, timeoutMs });
  if (outcome.kind === "spawn-error") {
    return { kind: "not_found", bin, message: outcome.error.message };
  }
  const output: CliOutput = {
    stdout: outcome.stdout,
    stderr: outcome.stderr,
    durationMs: Math.round(performance.now() - started),
  };
  if (outcome.kind === "timeout") return { kind: "timeout", timeoutMs, ...output };
  const code = outcome.code ?? 1;
  if (code !== 0) return { kind: "exit", ok: false, code, ...output };
  if (!options.json) return { kind: "exit", ok: true, code: 0, data: undefined, ...output };
  try {
    return { kind: "exit", ok: true, code: 0, data: JSON.parse(output.stdout) as T, ...output };
  } catch (error) {
    return {
      kind: "invalid_json",
      code,
      error: error instanceof Error ? error.message : String(error),
      ...output,
    };
  }
}

/** `aphrody doctor --json`. */
export function aphrodyDoctor(
  options: Omit<AphrodyCliOptions, "json"> = {},
): Promise<CliResult<AphrodyDoctorResult>> {
  return runAphrodyCli<AphrodyDoctorResult>(["doctor", "--json"], { ...options, json: true });
}

/** `aphrody git inspect <repo>` (pure-Rust gix inspection). */
export function aphrodyGitInspect(
  repoPath: string = process.cwd(),
  options: Omit<AphrodyCliOptions, "json"> = {},
): Promise<CliResult<AphrodyGitInspectResult>> {
  return runAphrodyCli<AphrodyGitInspectResult>(["git", "inspect", repoPath], {
    ...options,
    json: true,
  });
}
