// SPDX-License-Identifier: Apache-2.0
import type { Stage } from "./orchestrator";

const MINUTE = 60_000;

/**
 * Dataset -> canon and RAG -> decision -> wiki and agent home -> plugin. Each stage runs the
 * existing owner of its domain; this table only orders, bounds and retries them.
 */
export const DEFAULT_STAGES: readonly Stage[] = [
  {
    id: "dataset",
    title: "Datasets: inventory, coverage and training hashes",
    needs: [],
    argv: [
      "bun",
      "test",
      "packages/pipeline/test/dragon-ball-dataset-inventory.test.ts",
      "packages/pipeline/test/dragon-ball-source-coverage.test.ts",
      "packages/pipeline/test/dragon-ball-training-dataset.test.ts",
      "packages/pipeline/test/ai/training-hashes.test.ts",
    ],
    timeoutMs: 3 * MINUTE,
    retries: 1,
    inputs: [
      "packages/pipeline/src/dragon-ball-*.ts",
      "packages/pipeline/src/ai/training-*.ts",
      "packages/pipeline/test/dragon-ball-*.ts",
    ],
  },
  {
    id: "canon",
    title: "Canon: judgment policy and evaluation metrics",
    needs: ["dataset"],
    argv: [
      "bun",
      "test",
      "packages/pipeline/test/canon-judgment.test.ts",
      "packages/pipeline/test/canon-eval.test.ts",
    ],
    timeoutMs: 2 * MINUTE,
    retries: 0,
    inputs: ["packages/pipeline/src/ai/canon-*.ts", "packages/pipeline/test/canon-*.ts"],
  },
  {
    id: "rag",
    title: "RAG: grounding, retrieval metrics, passage split",
    needs: ["dataset"],
    argv: [
      "bun",
      "test",
      "packages/pipeline/test/ai/grounding.test.ts",
      "packages/pipeline/test/ai/eval.test.ts",
      "packages/pipeline/test/rag-passage-split.test.ts",
    ],
    timeoutMs: 3 * MINUTE,
    retries: 1,
    inputs: [
      "packages/pipeline/src/ai/{grounding,eval,vector-reader,wire,config}.ts",
      "packages/pipeline/test/ai/*.ts",
    ],
  },
  {
    id: "decision",
    title: "Decision: bun:yolo Jev provider and chat judgments",
    needs: ["canon", "rag"],
    argv: [
      "bun",
      "test",
      "packages/pipeline/test/jev-provider.test.ts",
      "packages/api/test/chat-jev.test.ts",
    ],
    timeoutMs: 2 * MINUTE,
    retries: 0,
    inputs: [
      "packages/pipeline/src/ai/jev-provider.ts",
      "packages/api/src/chat/**/*.ts",
      "packages/api/test/chat-jev.test.ts",
    ],
  },
  {
    id: "wiki",
    title: "Wiki: review-only page candidates",
    needs: ["canon", "decision"],
    argv: ["bun", "test", "scripts/audit/wiki-page-builder.test.ts"],
    timeoutMs: 2 * MINUTE,
    retries: 0,
    inputs: ["scripts/audit/wiki-page-builder*.ts"],
  },
  {
    id: "agent-home",
    title: "Agent home: template drift",
    needs: ["decision"],
    argv: ["bun", "packages/db/scripts/agent-home-template.ts", "--check"],
    timeoutMs: 2 * MINUTE,
    retries: 0,
    inputs: ["packages/db/scripts/agent-home-template.ts"],
  },
  {
    id: "plugin",
    title: "Plugin: generated manifests and sources in sync",
    needs: ["wiki", "agent-home"],
    argv: ["bun", "scripts/plugin/sync.ts", "--check"],
    timeoutMs: 5 * MINUTE,
    retries: 0,
  },
];
