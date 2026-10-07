// SPDX-License-Identifier: Apache-2.0
import { join } from "node:path";

export const NEXT_STARTUP_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 1_000;
const SHUTDOWN_GRACE_MS = 3_000;

type Child = Pick<Bun.Subprocess, "exitCode" | "signalCode" | "exited" | "kill">;
type StartupOptions = { timeoutMs?: number; shutdownGraceMs?: number };

const COMPILED =
  import.meta.path.startsWith("/$bunfs/") || /^[A-Z]:[\\/]~BUN[\\/]/i.test(import.meta.path);

/** Run the standalone UI in Bun, including when the parent is a compiled executable. */
export async function startNextStandalone(
  app: string,
  port: number,
  extraEnv: Record<string, string>,
  options: StartupOptions = {},
): Promise<ReturnType<typeof Bun.spawn>> {
  const child = Bun.spawn([process.execPath, join(app, "server.js")], {
    cwd: app,
    env: {
      ...process.env,
      ...extraEnv,
      ...(COMPILED ? { BUN_BE_BUN: "1" } : {}),
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
    if (!terminated()) {
      child.kill("SIGTERM");
      const force = setTimeout(() => {
        if (!terminated()) child.kill("SIGKILL");
      }, options.shutdownGraceMs ?? SHUTDOWN_GRACE_MS);
      try {
        await child.exited;
      } finally {
        clearTimeout(force);
      }
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
