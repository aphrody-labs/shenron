// SPDX-License-Identifier: Apache-2.0
/**
 * `@aphrody/shenron-pipeline/shenron/compute` — legacy facade over `@aphrody/shenron-pipeline/ai/shenron`
 * (docs/architecture/STACK.md §6.3, D16).
 *
 * `ShenronComputeClient` keeps its historical contract: constructor options
 * (`baseUrl`, `token`, `fetcher`), method signatures, thrown errors and
 * their messages, and `ocr` still asking for the `gemini-web` engine. Without
 * options, the address and token come from the single resolver
 * `@aphrody/shenron-pipeline/ai/config` (`SHENRON_AI_HTTP_URL` / `SHENRON_AI_HTTP_TOKEN`, then
 * their legacy aliases); there is no address default, a missing one throws an
 * error naming the variables. Every request is delegated to
 * {@link createShenronCompute}; `fetch` is resolved at call time unless a
 * `fetcher` is given.
 *
 * Registered behaviour change B18: `embed()` collapses whitespace, sends at
 * most 16 texts per request and rejects any vector that is not 384-dimensional.
 */
import { JsonTransportError, requestJson } from "@aphrody/shenron-kit/http";
import {
  type AiFailure,
  type AiResult,
  type ShenronCompute,
  createShenronCompute,
} from "@aphrody/shenron-pipeline/ai/shenron";
import {
  AiConfigError,
  chatTimeoutMs,
  type DirectChatEndpoint,
  requireAiHttpToken,
  requireAiHttpUrl,
  resolveDirectChat,
} from "@aphrody/shenron-pipeline/ai/config";

/** Private Shenron workload boundary served by the Shenron AI process. */
export interface ShenronComputeOptions {
  baseUrl?: string;
  token?: string;
  fetcher?: typeof fetch;
}

// One wire contract, including the historical facade's differently named document types.
import type { ShenronChatWireMessage } from "../ai/chat";
import type {
  ShenronIngestDoc,
  ShenronRagDocument as StoredDocument,
  ShenronRagHit,
  ShenronRagMode,
  ShenronRagStats,
} from "../ai/wire";
export type ShenronChatMessage = ShenronChatWireMessage;
export type ShenronRagDocument = ShenronIngestDoc;
export type ShenronRagStoredDocument = StoredDocument;
export type { ShenronRagHit, ShenronRagMode, ShenronRagStats } from "../ai/wire";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);
const SOURCE_ID_RE = /^shenron:(?:\d+|pg:[a-z0-9_]{1,64}:[0-9a-f]{24}:\d+)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Turns a failure into the error the historical client threw. `invalid` is
 * the per-method message used for a response that breaks the contract.
 */
function failureError(failure: AiFailure, invalid: string): Error {
  switch (failure.kind) {
    case "http":
      return new Error(`Shenron compute HTTP ${failure.status} on ${failure.path}`);
    case "invalid_response":
      return new Error(invalid);
    case "timeout": {
      const error = new Error(`Shenron compute ${failure.detail}`);
      error.name = "TimeoutError";
      return error;
    }
    default:
      return new Error(`Shenron compute ${failure.detail}`);
  }
}

function unwrap<T>(result: AiResult<T>, invalid: string): T {
  if (!result.ok) throw failureError(result, invalid);
  return result.value;
}

export class ShenronComputeClient {
  /** Typed client every call is delegated to (`@aphrody/shenron-pipeline/ai/shenron`). */
  readonly compute: ShenronCompute;

  constructor(options: ShenronComputeOptions = {}) {
    const baseUrl =
      options.baseUrl === undefined ? requireAiHttpUrl(process.env) : new URL(options.baseUrl);
    if (
      baseUrl.protocol !== "http:" ||
      !LOOPBACK_HOSTS.has(baseUrl.hostname) ||
      baseUrl.username ||
      baseUrl.password
    ) {
      throw new Error("Shenron compute URL must use loopback HTTP");
    }
    const token = options.token ?? requireAiHttpToken(process.env);
    if (!token.trim()) throw new Error("Shenron compute token is not configured");
    this.compute = createShenronCompute(
      { baseUrl, token },
      options.fetcher ? { fetch: options.fetcher } : {},
    );
  }

  async health(): Promise<{ rag: boolean; llm: boolean; ocr: boolean }> {
    return unwrap(await this.compute.health(), "Shenron compute is unavailable");
  }

  async chat(
    messages: ShenronChatMessage[],
    model?: string,
  ): Promise<{ answer: string; model: string }> {
    return unwrap(
      await this.compute.chat({ messages, ...(model ? { model } : {}) }),
      "Shenron returned an empty LLM answer",
    );
  }

  async ocr(
    imageBase64: string,
    language?: string,
  ): Promise<{ text: string; language: string; textless: boolean; suspect: boolean }> {
    const result = unwrap(
      await this.compute.ocr({
        imageBase64,
        engine: "gemini-web",
        ...(language ? { language } : {}),
      }),
      "Shenron returned an invalid OCR result",
    );
    return {
      text: result.text,
      language: result.language,
      textless: result.textless,
      suspect: result.suspect,
    };
  }

  async ragSearchWithMode(
    query: string,
    limit = 5,
    filters: { lang?: string; kind?: string; sourceId?: string; entity?: string } = {},
  ): Promise<{ results: ShenronRagHit[]; mode: ShenronRagMode }> {
    return unwrap(
      await this.compute.ragSearch({ q: query, limit, ...filters }),
      "Shenron returned an invalid RAG hit",
    );
  }

  async ragSearch(
    query: string,
    limit = 5,
    filters: { lang?: string; kind?: string; sourceId?: string; entity?: string } = {},
  ): Promise<ShenronRagHit[]> {
    return (await this.ragSearchWithMode(query, limit, filters)).results;
  }

  async embed(texts: string[], kind: "query" | "passage" = "query"): Promise<number[][]> {
    if (!texts.length || texts.some((text) => !text.trim())) {
      throw new Error("Shenron embedding input is empty");
    }
    return unwrap(
      await this.compute.embed({ texts, kind }),
      "Shenron returned invalid embedding vectors",
    ).vectors;
  }

  async ragStats(): Promise<ShenronRagStats> {
    return unwrap(await this.compute.ragStats(), "Shenron returned invalid RAG stats");
  }

  async ragDocument(sourceId: string): Promise<ShenronRagStoredDocument | null> {
    if (!SOURCE_ID_RE.test(sourceId) || sourceId.length > 255) {
      throw new Error("Invalid Shenron RAG source ID");
    }
    return unwrap(
      await this.compute.ragDocument(sourceId),
      "Shenron returned invalid RAG document",
    );
  }

  async ragIngest(
    ragDocument: ShenronRagDocument,
  ): Promise<{ indexed: boolean; sourceId: string; vectorIndexed: boolean }> {
    return unwrap(
      await this.compute.ragIngest(ragDocument),
      "Shenron did not confirm RAG ingestion",
    );
  }

  async ragSyncFinish(
    originSourceId: string,
    syncGeneration: string,
    expectedCount: number,
  ): Promise<{ retired: number }> {
    if (
      !originSourceId.trim() ||
      !UUID_RE.test(syncGeneration) ||
      !Number.isSafeInteger(expectedCount) ||
      expectedCount < 1
    ) {
      throw new Error("Invalid Shenron RAG sync completion request");
    }
    return unwrap(
      await this.compute.ragSyncFinish({ originSourceId, syncGeneration, expectedCount }),
      "Shenron returned invalid RAG sync result",
    );
  }
}

export type ChatFn = (
  messages: ShenronChatMessage[],
  model?: string,
) => Promise<{ answer: string; model: string }>;

/**
 * {@link ShenronCompute} whose `chat` is served by a legacy-shaped chat
 * function (an {@link ShenronComputeClient} or a test double); every other
 * capability answers `not_configured`. Lets AI SDK adapters
 * (`createShenronChatModel`) run over an injected legacy client. Errors thrown
 * by `chat` propagate unchanged.
 */
const unavailable = async (): Promise<AiFailure> => ({
  ok: false,
  kind: "not_configured",
  detail: "only chat is available on this client",
});

export function shenronComputeFromChat(chat: ChatFn): ShenronCompute {
  return {
    async chat(i) {
      const messages = i.messages.map((m) => ({ role: m.role, content: m.content }));
      const value = await chat(messages, i.model);
      return { ok: true, value };
    },
    health: unavailable,
    embed: unavailable,
    ragSearch: unavailable,
    ragDocument: unavailable,
    ragStats: unavailable,
    ragIngest: unavailable,
    ragSyncFinish: unavailable,
    ocr: unavailable,
    visionStructured: unavailable,
  };
}

/**
 * Legacy-shaped chat function over a direct OpenAI-compatible server
 * (`POST <base>/chat/completions`, non-streaming): the preloaded Gemma 4 E2B
 * `llama-server` of the vps. The endpoint model id is used unless the caller names
 * one. Errors carry the same messages as {@link ShenronComputeClient.chat}.
 */
export function createOpenAiChat(
  endpoint: Pick<DirectChatEndpoint, "baseUrl" | "model" | "apiKey">,
  options: { fetcher?: typeof fetch; timeoutMs?: number; maxTokens?: number } = {},
): ChatFn {
  const url = new URL(`${endpoint.baseUrl.href.replace(/\/+$/, "")}/chat/completions`);
  return async (messages, model) => {
    const id = model?.trim() || endpoint.model;
    // One deadline over the request and the body read; redirects are refused.
    const { response, value } = await requestJson(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(endpoint.apiKey ? { authorization: `Bearer ${endpoint.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: id,
          messages,
          stream: false,
          // Bounded generation: on a CPU-only server the answer length is the latency.
          ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        }),
      },
      { timeoutMs: options.timeoutMs ?? chatTimeoutMs(id), fetch: options.fetcher },
    ).catch((error: unknown) => {
      // A body that is not JSON reads as an empty answer, as before.
      if (error instanceof JsonTransportError && error.stage === "json")
        return { response: { ok: true, status: 200 }, value: null };
      throw error;
    });
    if (!response.ok) throw new Error(`Shenron compute HTTP ${response.status} on ${url.pathname}`);
    const body = value as {
      model?: unknown;
      choices?: { message?: { content?: unknown } }[];
    } | null;
    const answer = body?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      throw new Error("Shenron returned an empty LLM answer");
    }
    return { answer: answer.trim(), model: typeof body?.model === "string" ? body.model : id };
  };
}

/**
 * Direct chat function from the environment (`SHENRON_AI_CHAT_BASE_URL` or an alias),
 * or `null` when none is set. A malformed value throws an {@link AiConfigError}.
 */
export function directChatFromEnv(
  env: Record<string, string | undefined>,
  options: { fetcher?: typeof fetch } = {},
): ChatFn | null {
  const resolved = resolveDirectChat(env);
  if (!resolved.ok) throw new AiConfigError("direct chat server", resolved.issues);
  return resolved.value ? createOpenAiChat(resolved.value, options) : null;
}
