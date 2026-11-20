// SPDX-License-Identifier: Apache-2.0
/** Public Jev FFI payloads; no credential or private memory enters these contracts. */
export type JevQuestion =
  | { type: "noul"; instructions?: unknown; criteria?: Record<string, unknown> }
  | { type: "choice"; instructions?: unknown; criteria: Record<string, unknown> }
  | { type: "score"; instructions?: unknown; criteria: unknown[] };
export interface JevRequest {
  state: unknown;
  questions: Record<string, JevQuestion>;
  model?: string;
}
export interface ShenronJevDecideRequest {
  request: JevRequest;
  public: boolean;
  minimum_confidence?: number;
}
export interface JevDecision {
  model: string;
  answers: Record<string, JevAnswer>;
  usage: { input_tokens: number; output_tokens: number } | null;
  served_by: string;
  latency_ms: number;
  failover: { from: string; to: string; reason: string } | null;
  selections?: Record<string, string | null>;
}
/** JSON result primitives validated by Bun's Rust Jev owner before crossing the FFI. */
export type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | {
      type: "score";
      score: number;
      confidence: number;
      probabilities: Record<string, number>;
      legend: Record<string, unknown>;
    };
export interface ShenronJevPassage {
  id: string;
  text: string;
  source_kind: "manga" | "toriyama" | "databook" | "official" | "wiki" | "other";
  public: boolean;
  url?: string | null;
  retrieval_score?: number | null;
}
export interface ShenronJevRerankRequest {
  query: string;
  passages: ShenronJevPassage[];
  limit?: number;
}
export interface ShenronJevRerankResult {
  passages: {
    passage: ShenronJevPassage;
    relevance: number;
    injection: number;
    contradiction: number;
    served_by: string;
  }[];
  decision: JevDecision | null;
  excluded: number;
}
