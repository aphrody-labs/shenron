#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { resolve } from "node:path";
import { requireLiveRag } from "../src/testing/live-rag";

const { stats } = await requireLiveRag();
console.log(`Real Shenron RAG: ${stats.chunks} passages, ${stats.vectors} current E5 vectors`);
const root = resolve(import.meta.dir, "../../..");
const tests = [
  "packages/pipeline/src/testing/live-rag.test.ts",
  "packages/pipeline/test/aphrody/compute-live.test.ts",
  "packages/pipeline/test/ai/wire-live.test.ts",
  "packages/pipeline/test/aphrody/a2a-rag-live.test.ts",
  "packages/pipeline/test/workflows-rag-live.test.ts",
  "packages/pipeline/test/bridge-rag-live.test.ts",
  "packages/pipeline/test/storage-rag-live.test.ts",
  "packages/api/test/rag-live.test.ts",
  "apps/bot/tests/rag-aphrody.test.ts",
  "apps/bot/tests/rag-filter.test.ts",
  "apps/bot/tests/rag-eval.test.ts",
  "apps/bot/tests/rag-ai-env.test.ts",
  "apps/bot/tests/rag-import-graph.test.ts",
  "apps/bot/tests/training-rag-live.test.ts",
  "apps/bot/tests/semantic-cache-live.test.ts",
  "apps/bot/tests/llm-rag-live.test.ts",
  "apps/site/tests/site-rag-aphrody.test.ts",
  "apps/site/tests/readiness-rag-live.test.ts",
  "apps/site/tests/admin-ia-rag-live.test.ts",
  "apps/site/tests/manga-api.test.ts",
  "apps/site/tests/manga-integration.test.ts",
  "apps/site/tests/databook-features.test.ts",
  "apps/site/tests/rag-refonte-sources.test.ts",
  "packages/pipeline/scripts/_rag-aphrody-sync.test.ts",
  "packages/pipeline/scripts/_rag-corpus-sources.test.ts",
];
// Isolation prevents unrelated protocol-failure tests from replacing live transports.
for (const test of tests) {
  const child = Bun.spawn([process.execPath, "test", "--timeout", "120000", resolve(root, test)], {
    cwd: resolve(root, test, "../.."),
    stdout: "inherit",
    stderr: "inherit",
    env: process.env,
  });
  if ((await child.exited) !== 0) process.exit(1);
}
