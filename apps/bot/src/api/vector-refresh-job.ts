// SPDX-License-Identifier: Apache-2.0
import type { SourcePipelineJobRegistry } from "./source-pipeline-job";
export const VECTOR_REFRESH_JOB = "rag-vector-refresh";
export async function registerVectorRefreshJob(
  registry: SourcePipelineJobRegistry,
  enabled: boolean,
  intervalMs: number,
  ports?: { run: () => Promise<unknown>; stop: () => Promise<void> },
) {
  if (!enabled) return { enabled: false, stop: async () => {} };
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 30000 || intervalMs > 86400000)
    throw Error("Explicit vector refresh interval required");
  const owner = ports ?? {
    run: async () => (await import("../lib/bun-rag")).refreshBunRag(),
    stop: async () => (await import("../lib/bun-rag")).closeBunRag(),
  };
  registry.register({
    name: VECTOR_REFRESH_JOB,
    owner: "rag",
    description: "Pinned native vector refresh; generation drift temporarily disables retrieval",
    intervalMs,
    idempotent: true,
    duplicateBehavior: "skip",
    fn: async () => {
      await owner.run();
    },
  });
  return { enabled: true, stop: owner.stop };
}
