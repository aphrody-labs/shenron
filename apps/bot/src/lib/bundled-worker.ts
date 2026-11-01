import { isCompiledBinary } from "@aphrody/discord-kit";
import { dirname, win32 } from "node:path";

/**
 * Bun Workers of the bot, source tree and `bun build --compile` binary alike.
 *
 * In a compiled binary a Worker can only load a module embedded as an extra entry point
 * (`scripts/build/bot.ts`), and its path is relative to the root of the embedded tree, not to
 * the source file: `new Worker("./workers/x.ts")` and `new URL("../workers/x.ts", import.meta.url)`
 * both fail there with `ModuleNotFound ... (entry point)`, and only as an asynchronous
 * ErrorEvent. `bot.ts` pins the root to `apps/bot` (`--root .`), so the workers sit under
 * `src/workers/` of the embedded root, which is the directory of the executable itself.
 */

/** Directory of the workers, relative to the embedded root of a compiled binary. */
export const COMPILED_WORKER_DIR = "src/workers";

type Runtime = { compiled?: boolean; main?: string };

/** What to hand to `new Worker()` for `src/workers/<file>`. */
export function bundledWorkerSpecifier(
  file: string,
  { compiled = isCompiledBinary(), main = Bun.main }: Runtime = {},
): string {
  if (compiled) {
    const directory = (main.includes("\\") ? win32.dirname(main) : dirname(main)).replaceAll(
      "\\",
      "/",
    );
    return `${directory}/${COMPILED_WORKER_DIR}/${file}`;
  }
  return new URL(`../workers/${file}`, import.meta.url).href;
}

export function startBundledWorker(file: string, runtime?: Runtime): Worker {
  return new Worker(bundledWorkerSpecifier(file, runtime), { type: "module" });
}

/**
 * Resolves when the worker posts its `{ status: "ready" }` handshake; rejects on a startup
 * error (unresolvable module, throw while evaluating) or when the handshake never comes.
 */
export function whenWorkerReady(worker: Worker, timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const settle = (err?: Error) => {
      clearTimeout(timer);
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      if (err) reject(err);
      else resolve();
    };
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { status?: unknown } | null)?.status === "ready") settle();
    };
    const onError = (event: ErrorEvent) => settle(new Error(event.message || "worker failed"));
    const timer = setTimeout(
      () => settle(new Error(`worker not ready after ${timeoutMs} ms`)),
      timeoutMs,
    );
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
  });
}
