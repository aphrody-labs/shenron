// SPDX-License-Identifier: Apache-2.0
import { startBundledWorker } from "./bundled-worker";
import type { VectorGeneration } from "@aphrody/shenron-pipeline/ai/vector-sidecar";
/** CPU-bound native build runs off the serving thread; all SQL stays on its existing pool. */
export async function buildWithVectorWorker(
  directory: string,
  manifestSha256: string,
  generation: () => Promise<VectorGeneration>,
  signal: AbortSignal,
) {
  signal = AbortSignal.any([signal, AbortSignal.timeout(30 * 60 * 1000)]);
  signal.throwIfAborted();
  const worker = startBundledWorker("vector-builder.ts");
  let result: unknown,
    failure = false,
    requests = 0;
  const pending = new Set<Promise<unknown>>();
  let acknowledged = false;
  const stopped = new Promise<void>((resolve, reject) => {
    worker.addEventListener("error", () => reject(Error("Native vector worker failed")), {
      once: true,
    });
    worker.addEventListener(
      "close",
      () => {
        if (!acknowledged) reject(Error("Native vector worker stopped without receipt"));
      },
      { once: true },
    );
    worker.addEventListener("message", (event) => {
      const m = event.data;
      if (m?.kind === "generation") {
        if (!Number.isInteger(m.id) || m.id < 1 || m.id > 4 || ++requests > 4) {
          failure = true;
          // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker postMessage has no targetOrigin
          worker.postMessage({ kind: "abort" });
          return;
        }
        const query = generation().then(
          // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker postMessage has no targetOrigin
          (value) => worker.postMessage({ kind: "generation-result", id: m.id, generation: value }),
          // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker postMessage has no targetOrigin
          () => worker.postMessage({ kind: "generation-result", id: m.id, failed: true }),
        );
        pending.add(query);
        void query.finally(() => pending.delete(query));
      } else if (m?.kind === "done") result = m.receipt;
      else if (m?.kind === "failed") failure = true;
      else if (m?.kind === "stopped") {
        acknowledged = true;
        resolve();
      }
    });
  });
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker postMessage has no targetOrigin
  const abort = () => worker.postMessage({ kind: "abort" });
  signal.addEventListener("abort", abort, { once: true });
  try {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker postMessage has no targetOrigin
    worker.postMessage({ kind: "build", directory, manifestSha256 });
    await stopped;
    signal.throwIfAborted();
    if (failure || !result) throw Error("Native vector build not qualified");
    return result;
  } finally {
    signal.removeEventListener("abort", abort);
    worker.terminate();
    await Promise.allSettled(pending);
  }
}
