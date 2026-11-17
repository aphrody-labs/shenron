// SPDX-License-Identifier: Apache-2.0
import {
  buildVectorSidecar,
  type VectorGeneration,
} from "@aphrody/shenron-pipeline/ai/vector-sidecar";
declare const self: Worker;
const controller = new AbortController();
let started = false,
  id = 0;
const queries = new Map<
  number,
  { resolve: (value: VectorGeneration) => void; reject: (error: Error) => void }
>();
self.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.kind === "abort") {
    controller.abort();
    for (const query of queries.values()) query.reject(Error("Vector build stopping"));
    queries.clear();
    return;
  }
  if (message?.kind === "generation-result") {
    const query = queries.get(message.id);
    if (!query) return;
    queries.delete(message.id);
    if (message.failed) query.reject(Error("Owner generation unavailable"));
    else query.resolve(message.generation);
    return;
  }
  if (message?.kind !== "build" || started) return;
  started = true;
  const source = {
    generation: () =>
      new Promise<VectorGeneration>((resolve, reject) => {
        controller.signal.throwIfAborted();
        const request = ++id;
        if (request > 4) {
          reject(Error("Generation RPC bound exceeded"));
          return;
        }
        queries.set(request, { resolve, reject });
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker postMessage has no targetOrigin
        self.postMessage({ kind: "generation", id: request });
      }),
  };
  void buildVectorSidecar(
    source,
    message.directory,
    message.manifestSha256,
    undefined,
    controller.signal,
  )
    .then(
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker postMessage has no targetOrigin
      (receipt) => self.postMessage({ kind: "done", receipt }),
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker postMessage has no targetOrigin
      () => self.postMessage({ kind: "failed" }),
    )
    .finally(() => {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- worker postMessage has no targetOrigin
      self.postMessage({ kind: "stopped" });
      process.exit(0);
    });
});
