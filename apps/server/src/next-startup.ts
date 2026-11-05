// SPDX-License-Identifier: Apache-2.0
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

export const NEXT_STARTUP_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 1_000;
const SHUTDOWN_GRACE_MS = 3_000;

type Child = Pick<Bun.Subprocess, "exitCode" | "signalCode" | "exited" | "kill">;
type StartupOptions = { timeoutMs?: number; shutdownGraceMs?: number };

/** Join child shutdown, escalating when a process ignores the graceful signal. */
export async function stopStandaloneChild(
  child: Child,
  graceMs = SHUTDOWN_GRACE_MS,
): Promise<void> {
  const terminated = () => child.exitCode !== null || child.signalCode !== null;
  if (terminated()) {
    await child.exited;
    return;
  }
  child.kill("SIGTERM");
  const force = setTimeout(() => {
    if (!terminated()) child.kill("SIGKILL");
  }, graceMs);
  try {
    await child.exited;
  } finally {
    clearTimeout(force);
  }
}

const COMPILED =
  import.meta.path.startsWith("/$bunfs/") || /^[A-Z]:[\\/]~BUN[\\/]/i.test(import.meta.path);

export interface NextRuntime {
  /** The program that runs the Next standalone `server.js`. */
  program: string;
  /** `BUN_BE_BUN=1`: the compiled server executable acts as the Bun command line. */
  beBun: boolean;
}

/**
 * Which Bun runs the Next standalone server. An AOT executable carries no Bun command line, so
 * `BUN_BE_BUN=1` does nothing for it: the build ships a real Bun at `runtime/bun[.exe]` beside
 * the executable (scripts/build/server.ts), or `SHENRON_NEXT_BUN` names one. A bytecode or bundle
 * executable still runs the child as itself with `BUN_BE_BUN=1`; a source run uses its own Bun.
 */
export function resolveNextRuntime(
  options: {
    compiled?: boolean;
    execPath?: string;
    env?: Record<string, string | undefined>;
    exists?: (path: string) => boolean;
    platform?: NodeJS.Platform;
  } = {},
): NextRuntime {
  const compiled = options.compiled ?? COMPILED;
  const execPath = options.execPath ?? process.execPath;
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const override = env.SHENRON_NEXT_BUN?.trim();
  if (override) return { program: override, beBun: false };
  if (!compiled) return { program: execPath, beBun: false };
  const exe = (options.platform ?? process.platform) === "win32" ? "bun.exe" : "bun";
  const shipped = join(dirname(execPath), "runtime", exe);
  if (exists(shipped)) return { program: shipped, beBun: false };
  return { program: execPath, beBun: true };
}

/** Run the standalone UI in Bun, including when the parent is a compiled executable. */
export async function startNextStandalone(
  app: string,
  port: number,
  extraEnv: Record<string, string>,
  options: StartupOptions = {},
): Promise<ReturnType<typeof Bun.spawn>> {
  const runtime = resolveNextRuntime();
  const child = Bun.spawn([runtime.program, join(app, "server.js")], {
    cwd: app,
    env: {
      ...process.env,
      ...extraEnv,
      ...(runtime.beBun ? { BUN_BE_BUN: "1" } : {}),
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  await waitForNextStartup(child, port, options);
  return child;
}

/** Own the child until readiness: every failure aborts probes and joins shutdown. */
export async function waitForNextStartup(
  child: Child,
  port: number,
  options: StartupOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? NEXT_STARTUP_TIMEOUT_MS;
  const deadline = performance.now() + timeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  void child.exited.then(() => controller.abort());
  const terminated = () => child.exitCode !== null || child.signalCode !== null;
  try {
    while (!controller.signal.aborted) {
      if (terminated()) break;
      const remaining = deadline - performance.now();
      if (remaining <= 0) break;
      try {
        const response = await fetch(`http://127.0.0.1:${port}/robots.txt`, {
          redirect: "manual",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(PROBE_TIMEOUT_MS, remaining)))),
          ]),
        });
        // Readiness needs headers only; release the response stream before retrying/returning.
        await response.body?.cancel();
        if (response.status < 500 && !terminated() && !controller.signal.aborted) return;
      } catch {
        // Connection refused, failed startup, or a bounded probe that has not answered yet.
      }
      const delay = Math.min(25, deadline - performance.now());
      if (delay > 0 && !controller.signal.aborted) await Bun.sleep(delay);
    }
    if (child.exitCode !== null)
      throw new Error(`Next standalone server exited with ${child.exitCode}`);
    if (child.signalCode !== null)
      throw new Error(`Next standalone server exited with signal ${child.signalCode}`);
    throw new Error(`Next standalone server did not start within ${timeoutMs / 1_000} s`);
  } catch (error) {
    await stopStandaloneChild(child, options.shutdownGraceMs);
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
