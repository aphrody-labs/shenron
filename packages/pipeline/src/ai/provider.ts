// SPDX-License-Identifier: Apache-2.0
/**
 * `@shenron/pipeline/ai/provider` — the Shenron AI SDK provider (docs/architecture/STACK.md §3.4).
 *
 * Runtime class: `pure`. Language models: `chat` (configured model),
 * `chat-flash-lite`, `chat-pro`; embedding models: `e5-query`, `e5-passage`.
 * A disabled capability is simply absent (the provider then throws
 * `NoSuchModelError` for it).
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { EmbeddingModelV4, LanguageModelV4 } from "@ai-sdk/provider";
import { customProvider } from "ai";
import type { AphrodyCompute } from "./aphrody";
import { createAphrodyChatModel } from "./chat";
import type { AiConfig } from "./config";
import { selectEmbeddingModel } from "./embeddings";

export type ShenronLanguageModelId = "chat" | "chat-flash-lite" | "chat-pro";
export type ShenronEmbeddingModelId = "e5-query" | "e5-passage";

export function createShenronProvider(
  cfg: Pick<AiConfig, "chatModel" | "embed" | "directChat">,
  deps: { compute: AphrodyCompute | null; fetch?: typeof fetch },
) {
  const languageModels: Partial<Record<ShenronLanguageModelId, LanguageModelV4>> = {};
  if (deps.compute) {
    if (!cfg.directChat)
      languageModels.chat = createAphrodyChatModel(deps.compute, { modelId: cfg.chatModel });
    languageModels["chat-flash-lite"] = createAphrodyChatModel(deps.compute, {
      modelId: "gemini-web/flash-lite",
    });
    languageModels["chat-pro"] = createAphrodyChatModel(deps.compute, {
      modelId: "gemini-web/pro",
    });
  }
  if (cfg.directChat) {
    languageModels.chat = createOpenAICompatibleChat({
      baseUrl: cfg.directChat.baseUrl,
      modelId: cfg.directChat.model,
      ...(cfg.directChat.apiKey ? { token: cfg.directChat.apiKey } : {}),
      ...(deps.fetch ? { fetch: deps.fetch } : {}),
    });
  }
  const embeddingModels: Partial<Record<ShenronEmbeddingModelId, EmbeddingModelV4>> = {};
  const query = selectEmbeddingModel(cfg, "query", deps);
  const passage = selectEmbeddingModel(cfg, "passage", deps);
  if (query) embeddingModels["e5-query"] = query;
  if (passage) embeddingModels["e5-passage"] = passage;
  return customProvider({
    languageModels: languageModels as Record<string, LanguageModelV4>,
    embeddingModels: embeddingModels as Record<string, EmbeddingModelV4>,
  });
}

export type ShenronProvider = ReturnType<typeof createShenronProvider>;

/**
 * Native AI SDK transport for explicitly configured vLLM/llama-server endpoints.
 * Inference stays on the capability owner; this adapter preserves streaming and tools.
 */
export function createOpenAICompatibleChat(o: {
  baseUrl: URL;
  token?: string;
  modelId: string;
  fetch?: typeof fetch;
}): LanguageModelV4 {
  const provider = createOpenAICompatible({
    name: "aphrody-openai",
    baseURL: o.baseUrl.href.replace(/\/+$/, ""),
    ...(o.token ? { apiKey: o.token } : {}),
    ...(o.fetch ? { fetch: o.fetch } : {}),
  });
  return provider.chatModel(o.modelId);
}
