// SPDX-License-Identifier: Apache-2.0
/** Public retrieval judgments through the native Jev owner; this module has no transport. */
export type JevSourceKind = "manga" | "toriyama" | "databook" | "official" | "wiki" | "other";
/** Three judgments per passage fit the native owner's maximum of 64 typed questions. */
export const JEV_MAX_PASSAGES = 21;

export interface ChatJevPassage {
  id: string;
  text: string;
  source_kind: JevSourceKind;
  public: boolean;
  url?: string | null;
  retrieval_score?: number | null;
}

export interface ChatJevRequest {
  query: string;
  passages: ChatJevPassage[];
  limit?: number;
}

export interface ChatJevResult {
  passages: { passage: ChatJevPassage }[];
}

export interface ChatJevPort {
  rerank(request: ChatJevRequest, signal: AbortSignal): Promise<ChatJevResult>;
}

export class ChatJevUnavailable extends Error {
  override readonly name = "ChatJevUnavailable";
  constructor() {
    super("Jev source judgment unavailable");
  }
}

/** Source priority remains deterministic in the native owner, never a canon verdict. */
export function jevSourceKind(kind: string): JevSourceKind {
  if (kind === "author" || kind === "canon" || kind === "toriyama") return "toriyama";
  if (kind.startsWith("manga")) return "manga";
  if (kind.startsWith("databook")) return "databook";
  if (kind === "official" || kind === "news") return "official";
  if (kind === "wiki" || kind.startsWith("db_") || kind === "character") return "wiki";
  return "other";
}

export function isPublicJevPassage(passage: ChatJevPassage): boolean {
  if (passage.public !== true || !passage.text.trim()) return false;
  if (!passage.url) return true;
  try {
    const url = new URL(passage.url);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.hostname !== "fandom.com" &&
      !url.hostname.endsWith(".fandom.com")
    );
  } catch {
    return false;
  }
}

function isFandom(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "fandom.com" || host.endsWith(".fandom.com");
  } catch {
    return false;
  }
}

/** Do not permit a native failure to expose its credentials, paths or provider response body. */
export function createChatJevPort(
  native: (request: ChatJevRequest, options: { signal: AbortSignal }) => Promise<ChatJevResult>,
): ChatJevPort {
  return {
    async rerank(request, signal) {
      signal.throwIfAborted();
      const passages = request.passages.filter(isPublicJevPassage).slice(0, JEV_MAX_PASSAGES);
      if (passages.length === 0) return { passages: [] };
      try {
        const result = await native(
          {
            ...request,
            passages,
            limit: Math.min(request.limit ?? passages.length, passages.length),
          },
          { signal },
        );
        signal.throwIfAborted();
        const admitted = new Map(passages.map((passage) => [passage.id, passage]));
        const seen = new Set<string>();
        return {
          passages: result.passages.flatMap(({ passage }) => {
            const original = admitted.get(passage.id);
            if (!original || seen.has(passage.id)) return [];
            seen.add(passage.id);
            return [{ passage: original }];
          }),
        };
      } catch {
        signal.throwIfAborted();
        throw new ChatJevUnavailable();
      }
    },
  };
}

/** Non-public candidates remain local and retain their original text and evidence identities. */
export async function judgePublicChatHits<T>(
  query: string,
  hits: readonly T[],
  passageOf: (hit: T, index: number) => ChatJevPassage,
  port: ChatJevPort,
  signal: AbortSignal,
): Promise<{
  hits: T[];
  tool: { name: string; ok: boolean; ms: number; hits: number; error?: string };
}> {
  signal.throwIfAborted();
  const started = performance.now();
  const candidates = hits
    .map((hit, index) => ({ hit, passage: passageOf(hit, index) }))
    .filter(({ passage }) => !isFandom(passage.url));
  const eligible = candidates.filter(({ passage }) => isPublicJevPassage(passage));
  const local = candidates
    .filter(({ passage }) => !isPublicJevPassage(passage))
    .map(({ hit }) => hit);
  if (eligible.length === 0)
    return {
      hits: candidates.map(({ hit }) => hit),
      tool: { name: "jev:skipped-private", ok: true, ms: 0, hits: 0 },
    };
  const indexed = new Map(eligible.map(({ hit, passage }) => [passage.id, hit]));
  try {
    const result = await port.rerank(
      { query, passages: eligible.map(({ passage }) => passage), limit: eligible.length },
      signal,
    );
    signal.throwIfAborted();
    const accepted = result.passages.flatMap(({ passage }) => indexed.get(passage.id) ?? []);
    return {
      hits: [...accepted, ...local],
      tool: {
        name: "jev:rerank",
        ok: true,
        ms: Math.round(performance.now() - started),
        hits: accepted.length,
      },
    };
  } catch {
    signal.throwIfAborted();
    return {
      hits: local,
      tool: {
        name: "jev:rerank",
        ok: false,
        ms: Math.round(performance.now() - started),
        hits: 0,
        error: "Jev source judgment unavailable",
      },
    };
  }
}
