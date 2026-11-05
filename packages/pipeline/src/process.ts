// SPDX-License-Identifier: Apache-2.0
/**
 * Child processes for the Aphrody CLI wrappers, on `node:child_process` (runtime class
 * `server`): Bun scripts, the bot and the routes of the site's Next server all run them, and
 * no `Bun.*` global reaches a module the site bundles (docs/architecture/STACK.md §4.2).
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, join } from "node:path";

/** `PATH` lookup of an executable (`PATHEXT` on Windows), like `Bun.which`; `null` when absent. */
export function which(command: string): string | null {
  const env = process.env;
  const windows = process.platform === "win32";
  const extensions = windows
    ? ["", ...(env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)]
    : [""];
  for (const dir of (env.PATH ?? env.Path ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const extension of extensions) {
      const candidate = join(dir, command + extension);
      if (isExecutable(candidate, windows)) return candidate;
    }
  }
  return null;
}

function isExecutable(path: string, windows: boolean): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    if (!windows) accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RunProcessOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  /** Kill the process (and its descendants on Windows) after this many milliseconds. */
  timeoutMs: number;
}

export type ProcessOutcome =
  | { kind: "exit"; code: number | null; stdout: string; stderr: string }
  | { kind: "timeout"; stdout: string; stderr: string }
  | { kind: "spawn-error"; error: Error };

/** Runs `argv` with stdin closed and both outputs captured as UTF-8; never rejects. */
export function runProcess(
  argv: readonly string[],
  options: RunProcessOptions,
): Promise<ProcessOutcome> {
  return new Promise((resolve) => {
    const [command, ...args] = argv;
    if (!command) {
      resolve({ kind: "spawn-error", error: new Error("empty command") });
      return;
    }
    let child: ChildProcess;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        // A plain record: hosts (Next) may narrow NodeJS.ProcessEnv with required keys.
        env: options.env as NodeJS.ProcessEnv | undefined,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        kind: "spawn-error",
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return;
    }
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    const text = () => ({
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      killTree(child);
      resolve({ kind: "timeout", ...text() });
    }, options.timeoutMs);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ kind: "spawn-error", error });
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ kind: "exit", code, ...text() });
    });
  });
}

/** Kills the child and, on Windows, its descendants (a `.cmd` shim spawns a grandchild). */
function killTree(child: ChildProcess): void {
  if (process.platform === "win32" && child.pid !== undefined) {
    try {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {
      // taskkill unavailable: fall back to killing the direct child.
    }
  }
  try {
    child.kill("SIGKILL");
  } catch {
    // Already exited.
  }
}
