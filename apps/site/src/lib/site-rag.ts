import "server-only";
import { PUBLIC_RAG_CHAT_MAX_OUTPUT_TOKENS } from "@shenron/config/chat-model";
import {
  AiConfigError,
  chatTimeoutMs,
  resolveChatModel,
  resolveDirectChat,
} from "@shenron/pipeline/ai/config";
import {
  ShenronComputeClient,
  shenronComputeFromChat,
  type ShenronRagHit,
  type ChatFn,
} from "@shenron/pipeline/shenron/compute";
import { buildGroundingInstructions, resolvePersona } from "@shenron/pipeline/ai/prompts";
import { createOpenAICompatibleChat, createShenronProvider } from "@shenron/pipeline/ai/provider";
import { generateText } from "ai";
import { judgePublicChatHits, jevSourceKind } from "@shenron/api/chat";
import { siteChatJev } from "./jev";

export function usesShenronRag(): boolean {
  return process.env.RAG_BACKEND === "shenron";
}

function shenronRagClient(): ShenronComputeClient {
  return new ShenronComputeClient();
}

export async function searchShenronRag(
  query: string,
  limit: number,
  filters: { lang?: string; entity?: string; sourceId?: string } = {},
  client = shenronRagClient(),
): Promise<{ q: string; mode: string; results: ShenronRagHit[] }> {
  const { results, mode } = await client.ragSearchWithMode(query, limit, filters);
  return { q: query, mode, results };
}

/**
 * Fournisseur Shenron dont le modèle `chat` passe par la fonction injectée : le serveur
 * de chat direct (Gemma 4 E2B préchargé du vps, `SHENRON_AI_CHAT_BASE_URL`) s'il est
 * déclaré, sinon la façade `shenron-ai-http` (ou un double de test).
 */
function chatProvider(chat: ChatFn, chatModel: string) {
  return createShenronProvider(
    { embed: null, chatModel },
    { compute: shenronComputeFromChat(chat) },
  );
}

export async function chatShenronRag(
  query: string,
  persona: string,
  options: {
    context?: string;
    lang?: string;
    entity?: string;
    sourceId?: string;
    signal?: AbortSignal;
  } = {},
  client = shenronRagClient(),
): Promise<{ answer: string; hits: ShenronRagHit[]; mode: string }> {
  const { results, mode } = await client.ragSearchWithMode(query, 5, {
    lang: options.lang,
    entity: options.entity,
    sourceId: options.sourceId,
  });
  let hits = results;
  const jev = siteChatJev(process.env);
  if (jev) {
    const judged = await judgePublicChatHits(
      query,
      hits,
      (hit, index) => ({
        id: String(index),
        text: hit.content || hit.snippet,
        source_kind: jevSourceKind(hit.kind),
        // The existing remote RAG wire carries no public visibility evidence.
        public: false,
        url: hit.url,
        retrieval_score: hit.score,
      }),
      jev,
      options.signal ?? new AbortController().signal,
    );
    hits = judged.hits;
    console.error(JSON.stringify({ event: "shenron.chat.jev", ...judged.tool }));
  }
  if (hits.length === 0 && !options.context?.trim()) return { answer: "", hits, mode };
  const sources = hits
    .slice(0, 5)
    .map(
      (hit, index) =>
        `[${index + 1}] ${hit.title}\n${(hit.content || hit.snippet).slice(0, 700)}\nSource: ${hit.url}`,
    )
    .join("\n\n");
  const context = options.context?.trim()
    ? `[Page consultée] ${options.context.trim().slice(0, 1500)}\n\n${sources}`
    : sources;
  // Serveur direct déclaré (SHENRON_AI_CHAT_BASE_URL), sinon shenron-ai-http ; modèle :
  // `SHENRON_AI_CHAT_MODEL`, puis les alias hérités (résolveur unique @shenron/pipeline/ai/config).
  const direct = resolveDirectChat(process.env);
  if (!direct.ok) throw new AiConfigError("direct chat server", direct.issues);
  const model = direct.value
    ? createOpenAICompatibleChat({
        baseUrl: direct.value.baseUrl,
        modelId: direct.value.model,
        ...(direct.value.apiKey ? { token: direct.value.apiKey } : {}),
      })
    : chatProvider(
        (messages, id) => client.chat(messages, id),
        resolveChatModel(process.env),
      ).languageModel("chat");
  const pid = resolvePersona(persona);
  const instructions = buildGroundingInstructions(pid, "site-short");
  const { text } = await generateText({
    model,
    maxOutputTokens: PUBLIC_RAG_CHAT_MAX_OUTPUT_TOKENS,
    abortSignal: AbortSignal.any([
      AbortSignal.timeout(chatTimeoutMs(direct.value?.model ?? resolveChatModel(process.env))),
      ...(options.signal ? [options.signal] : []),
    ]),
    instructions,
    messages: [{ role: "user", content: `Sources :\n${context}\n\nQuestion : ${query}` }],
    maxRetries: 0,
  });
  return { answer: text, hits, mode };
}
