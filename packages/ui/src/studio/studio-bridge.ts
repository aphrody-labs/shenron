// SPDX-License-Identifier: Apache-2.0
// Studio bridge: typed calls to the Studio commands that shenron-desktop registers
// (crates/shenron-studio/src/studio.rs, logic owned by shenron-cli::shenron_cmd) and the
// `studio://train` event. The Koharu editor speaks @shenron/koharu/protocol instead.
import { invoke } from "@aphrody/api/core";
import { listen } from "@aphrody/api/event";
import { isTauri } from "./tauri-bridge";

const DESKTOP_ONLY = "Cette vue fonctionne dans l’application de bureau Shenron.";

/** Structured Shenron reports (JSON values) of the Studio commands. */
async function studio<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!isTauri()) throw new Error(DESKTOP_ONLY);
  // Result<()> commands (admin window and training start) serialize successful acknowledgement as null.
  return invoke<T>(command, args);
}

export interface ShenronProbe {
  reachable?: boolean;
  configured?: boolean;
  status?: number;
  [key: string]: unknown;
}

export interface ShenronHealth {
  status: "operational" | "degraded";
  site: ShenronProbe;
  bot: ShenronProbe;
  aphrody_ai_http: ShenronProbe;
  serving_rag: {
    reachable: boolean;
    ready: boolean;
    chunks?: number;
    vectors?: number;
    reason?: string;
  };
  agent_home: { valid: boolean; files?: number; revision?: string; error?: string };
  rag_backend: string;
}

export interface ShenronRagStats {
  chunks: number;
  vectors: number;
  sources?: Array<{ kind: string; sourceId: string; count: number }>;
}

export interface ShenronRagHit {
  kind?: string;
  title?: string;
  url?: string;
  snippet?: string;
}

export interface ShenronTraining {
  python_project: string | null;
  gpu_count: number;
  candidate_root: string;
  rag_promotion: string;
}

export const shenron = {
  health: () => studio<ShenronHealth>("studio_shenron_health"),
  ragStats: () => studio<ShenronRagStats>("studio_shenron_rag_stats"),
  ragSearch: (query: string, limit = 10, kind?: string) =>
    studio<{ mode?: string; results: ShenronRagHit[] }>("studio_shenron_rag_search", {
      query,
      limit,
      kind: kind ?? null,
    }),
  training: () => studio<ShenronTraining>("studio_shenron_training"),
};

export interface NativeAiStatus {
  chat: { ready: boolean; model?: string; port?: number };
  embed: { ready: boolean; model?: string; port?: number };
  rerank: { ready: boolean; model?: string; port?: number };
}

export const nativeAi = {
  status: () => studio<NativeAiStatus>("studio_native_ai_status"),
  /** Open the full Shenron admin dashboard in its native window (local-AI bridge injected). */
  openAdmin: (url?: string) => studio<null>("studio_open_shenron_admin", { url: url ?? null }),
};

export type TrainKind = "embed" | "rerank";

export type TrainEvent =
  | { state: "started"; kind: TrainKind; steps: number; baseModel: string }
  | { state: "finished"; kind: TrainKind; output: string }
  | { state: "failed"; kind: TrainKind; error: string };

export const training = {
  /** Acknowledgement only; completion/failure comes from the native studio://train event. */
  start: (kind: TrainKind, steps: number, allowCpu: boolean, baseModel?: string) =>
    studio<null>("studio_shenron_train_start", {
      kind,
      steps,
      allowCpu,
      baseModel: baseModel ?? null,
    }),
  async onEvent(handler: (event: TrainEvent) => void): Promise<() => void> {
    if (!isTauri()) throw new Error(DESKTOP_ONLY);
    return listen<TrainEvent>("studio://train", (event) => handler(event.payload));
  },
};

export interface CorpusHit {
  rowid: string;
  kind: string;
  title: string;
  url: string;
  snippet: string;
  score: number;
  lang: string;
  originSourceId: string;
  entity?: string;
}

/** Offline Shenron corpus (shenron_rag::dragonball::LocalCorpus) through the Studio commands. */
export const corpus = {
  info: () => studio<{ documents: number }>("studio_corpus_info"),
  search: (query: string, options: { limit?: number; kind?: string; lang?: string } = {}) =>
    studio<{ results?: CorpusHit[]; hits?: CorpusHit[]; [key: string]: unknown }>(
      "studio_corpus_search",
      {
        query,
        limit: options.limit ?? 20,
        kind: options.kind ?? null,
        lang: options.lang ?? null,
      },
    ),
  ask: (question: string) => studio<Record<string, unknown>>("studio_corpus_ask", { question }),
};
