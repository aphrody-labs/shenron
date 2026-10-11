import "server-only";
import {
  AiConfigError,
  resolveChatModel,
  resolveDirectChat,
} from "@aphrody/shenron-pipeline/ai/config";
import {
  AphrodyComputeClient,
  aphrodyComputeFromChat,
  type AphrodyRagHit,
  type ChatFn,
  createOpenAiChat,
} from "@aphrody/shenron-pipeline/aphrody/compute";
import { buildGroundingInstructions, resolvePersona } from "@aphrody/shenron-pipeline/ai/prompts";
import { createShenronProvider } from "@aphrody/shenron-pipeline/ai/provider";
import { generateText } from "ai";

export function usesAphrodyRag(): boolean {
  return process.env.RAG_BACKEND === "aphrody";
}

function aphrodyRagClient(): AphrodyComputeClient {
  return new AphrodyComputeClient();
}

export async function searchAphrodyRag(
  query: string,
  limit: number,
  filters: { lang?: string; entity?: string; sourceId?: string } = {},
  client = aphrodyRagClient(),
): Promise<{ q: string; mode: string; results: AphrodyRagHit[] }> {
  const { results, mode } = await client.ragSearchWithMode(query, limit, filters);
  return { q: query, mode, results };
}

/**
 * Fournisseur Shenron dont le modèle `chat` passe par la fonction injectée : le serveur
 * de chat direct (Gemma 4 E2B préchargé du vps, `APHRODY_AI_CHAT_BASE_URL`) s'il est
 * déclaré, sinon la façade `aphrody-ai-http` (ou un double de test).
 */
function chatProvider(chat: ChatFn, chatModel: string) {
  return createShenronProvider(
    { embed: null, chatModel },
    { compute: aphrodyComputeFromChat(chat) },
  );
}

/** Chat function and model id: the direct server when declared, else the facade. */
function chatRoute(client: Pick<AphrodyComputeClient, "chat">): { chat: ChatFn; model: string } {
  const direct = resolveDirectChat(process.env);
  if (!direct.ok) throw new AiConfigError("direct chat server", direct.issues);
  if (direct.value) return { chat: createOpenAiChat(direct.value), model: direct.value.model };
  return {
    chat: (messages, model) => client.chat(messages, model),
    model: resolveChatModel(process.env),
  };
}

export async function chatAphrodyRag(
  query: string,
  persona: string,
  options: { context?: string; lang?: string; entity?: string; sourceId?: string } = {},
  client = aphrodyRagClient(),
): Promise<{ answer: string; hits: AphrodyRagHit[]; mode: string }> {
  const { results: hits, mode } = await client.ragSearchWithMode(query, 5, {
    lang: options.lang,
    entity: options.entity,
    sourceId: options.sourceId,
  });
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
  // Serveur direct déclaré (APHRODY_AI_CHAT_BASE_URL), sinon aphrody-ai-http ; modèle :
  // `APHRODY_AI_CHAT_MODEL`, puis les alias hérités (résolveur unique @aphrody/shenron-pipeline/ai/config).
  const route = chatRoute(client);
  const pid = resolvePersona(persona);
  const instructions = buildGroundingInstructions(pid, "site-short");
  const { text } = await generateText({
    model: chatProvider(route.chat, route.model).languageModel("chat"),
    instructions,
    messages: [{ role: "user", content: `Sources :\n${context}\n\nQuestion : ${query}` }],
    maxRetries: 0,
  });
  return { answer: text, hits, mode };
}
