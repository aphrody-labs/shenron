/**
 * llm.ts — Réponses conversationnelles ancrées sur le RAG, générées par Aphrody.
 *
 * Le RAG fournit les FAITS ; le modèle
 * RÉFORMULE dans la voix du persona, comme une vraie conversation — il ne recopie jamais les chunks.
 *
 * - Personas, règles, garde anti-injection (B17) et génération : `@aphrody/shenron-pipeline/ai`
 *   (`prompts`, `generateGroundedAnswer`) ; ce module ne fournit que les ports.
 * - Mémoire : historique des derniers échanges par session (Redis résilient, B8), injecté dans le prompt.
 * - Chitchat : un simple "bonjour" reçoit une vraie réponse chaleureuse, sans réciter de faits.
 * - Cache sémantique : portée liée au modèle, à `PROMPT_VERSION` et aux preuves (B7).
 * - Jamais de dump d'archives. Repli persona si Aphrody est indisponible.
 */
import type { Database } from "bun:sqlite";
import { AphrodyComputeClient } from "@aphrody/shenron-pipeline/aphrody";
import { PUBLIC_RAG_CHAT_MAX_OUTPUT_TOKENS } from "@aphrody/shenron-config/chat-model";
import { createOpenAICompatibleChat } from "@aphrody/shenron-pipeline/ai/provider";
import { createAphrodyChatModel } from "@aphrody/shenron-pipeline/ai/chat";
import {
  chatTimeoutMs,
  resolveChatModel,
  resolveDirectChat,
} from "@aphrody/shenron-pipeline/ai/config";
import {
  createNativeShenronChatModel,
  SHENRON_NATIVE_MODEL,
} from "@aphrody/shenron-pipeline/ai/native";
import {
  generateGroundedAnswer,
  type GroundedAnswer,
  type GroundedHit,
} from "@aphrody/shenron-pipeline/ai/generate";
import {
  rankHitsForContext,
  resolveAnswerLang,
  stripCitationMarkers,
} from "@aphrody/shenron-pipeline/ai/grounding";
import type {
  ChunkContentPort,
  ConcurrencyPort,
  HistoryPort,
  HistoryTurn,
  SemanticCachePort as GroundedCachePort,
} from "@aphrody/shenron-pipeline/ai/ports";
import {
  isChitchat as sharedIsChitchat,
  PROMPT_VERSION,
  isFallbackAnswer as sharedIsFallbackAnswer,
  PERSONAS,
  resolvePersona,
} from "@aphrody/shenron-pipeline/ai/prompts";
import { createResilientRedis, type ResilientRedis } from "@aphrody/shenron-db/redis";
import type { HomePersona } from "@aphrody/shenron-pipeline/ai/prompts";
import type { RagHit } from "./rag";
import { resolveRedisUrl } from "@aphrody/shenron-config/services";
import { judgePublicChatHits, jevSourceKind, type ChatJevPort } from "@aphrody/shenron-api/chat";
import { botChatJev } from "./jev";

/** Options of one generation; the DM relay adds the user's agent home and bounds. */
export interface LlmOptions {
  jev?: ChatJevPort | null;
  sessionId?: string;
  cache?: SemanticCachePort;
  lang?: string;
  /** Tone, brevity and vibe of the user's agent home. */
  homePersona?: HomePersona | null;
  /** System line of the user's agent home fields (`homeUserNote`). */
  systemNote?: string;
  /** Recalled memories, as data (`memoryBlock`). */
  memories?: string;
  /** Tokens the direct chat server may generate. */
  maxTokens?: number;
  /** Timeout of the direct chat request, in milliseconds. */
  timeoutMs?: number;
  abortSignal?: AbortSignal;
}

type SemanticCachePort = Pick<
  typeof import("./semantic-cache"),
  "getSemanticCache" | "setSemanticCache"
>;

const MAX_CONCURRENCY = Number(process.env.LLM_MAX_CONCURRENCY ?? 3);
const HISTORY_TURNS = Number(process.env.LLM_HISTORY_TURNS ?? 6); // messages gardés (3 échanges)
const HISTORY_TTL_SECONDS = 60 * 60 * 6; // 6 h
const CONTEXT_CHARS_PER_HIT = Number(process.env.LLM_CONTEXT_CHARS_PER_HIT ?? 700);
const CONTEXT_CHARS_TOTAL = Number(process.env.LLM_CONTEXT_CHARS_TOTAL ?? 3200);

/** Normalise un identifiant de persona (défaut : whis). */
export function persona(id: string): string {
  return resolvePersona(id);
}

/** True when `answer` is a persona fallback, i.e. the LLM backend produced nothing. */
export function isFallbackAnswer(answer: string): boolean {
  return sharedIsFallbackAnswer(answer);
}

/** Bavardage (salutations / smalltalk) : pas de RAG, juste de la conversation. */
export function isChitchat(q: string): boolean {
  return sharedIsChitchat(q);
}

// ── Garde de concurrence ──
let active = 0;
const waiters: Array<() => void> = [];
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENCY) await new Promise<void>((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

/** Le créneau attend toujours : jamais `"busy"`. */
const concurrencyPort: ConcurrencyPort = { run: (fn) => withSlot(fn) };

// ── Mémoire conversationnelle (Redis résilient, par session) ──
let historyRedis: ResilientRedis | undefined;
function historyStore(): ResilientRedis {
  historyRedis ??= createResilientRedis({
    // Même résolution que le client `redis` par défaut de Bun.
    url: resolveRedisUrl(process.env),
    name: "llm-history",
  });
  return historyRedis;
}

function historyKey(sessionId: string): string {
  return `dbz:chat:hist:${sessionId}`;
}

/** Historique Redis `dbz:chat:hist:<session>` (liste JSON de tours, TTL 6 h). */
function createRedisHistoryPort(
  store: Pick<ResilientRedis, "send"> = { send: (c, a) => historyStore().send(c, a) },
): HistoryPort {
  return {
    async load(sessionId, turns) {
      const raw = await store.send("LRANGE", [historyKey(sessionId), String(-turns), "-1"]);
      if (!Array.isArray(raw)) return [];
      const out: HistoryTurn[] = [];
      for (const item of raw) {
        try {
          const turn = JSON.parse(String(item)) as HistoryTurn;
          if (turn?.content) out.push({ role: turn.role, content: turn.content });
        } catch {
          // tour corrompu ignoré
        }
      }
      return out;
    },
    async append(sessionId, { q, a }) {
      const key = historyKey(sessionId);
      await store.send("RPUSH", [
        key,
        JSON.stringify({ role: "user", content: q }),
        JSON.stringify({ role: "assistant", content: a }),
      ]);
      await store.send("LTRIM", [key, String(-HISTORY_TURNS * 2), "-1"]);
      await store.send("EXPIRE", [key, String(HISTORY_TTL_SECONDS)]);
    },
  };
}

/** Texte complet des chunks `rag_chunks` (SQLite) par rowid ; vide en mode Aphrody. */
function createSqliteChunkPort(db: Database): ChunkContentPort {
  return {
    async contentFor(hitIds) {
      const out = new Map<string, string>();
      if (process.env.RAG_BACKEND === "aphrody") return out;
      const rowids = hitIds.map(Number).filter((r) => Number.isInteger(r) && r >= 0);
      if (rowids.length === 0) return out;
      const ph = rowids.map(() => "?").join(",");
      const rows = db
        .query(`SELECT rowid, content FROM rag_chunks WHERE rowid IN (${ph})`)
        .all(...rowids) as { rowid: number; content: string }[];
      for (const r of rows) out.set(String(r.rowid), r.content);
      return out;
    },
  };
}

/** Adapte le cache sémantique Redis (question, persona, portée) au port de génération. */
function semanticCachePort(cache: SemanticCachePort, pid: string): GroundedCachePort {
  // La portée de `generateGroundedAnswer` est `<persona>:<empreinte>` ; le cache
  // range déjà par persona, il ne garde que l'empreinte.
  const evidence = (scope: string) =>
    scope.startsWith(`${pid}:`) ? scope.slice(pid.length + 1) : scope;
  return {
    async lookup(scope, question) {
      const hit = await cache.getSemanticCache(question, pid, evidence(scope));
      if (hit?.answer) {
        console.log(`[LLM] Cache sémantique touché pour "${question}" -> persona ${pid}`);
        return hit.answer;
      }
      return null;
    },
    async store(scope, question, answer) {
      await cache.setSemanticCache(question, answer, pid, evidence(scope));
    },
  };
}

/** Cache sémantique chargé à la demande (le module n'est importé qu'en cas d'usage). */
const lazySemanticCache: SemanticCachePort = {
  getSemanticCache: async (...args) => (await import("./semantic-cache")).getSemanticCache(...args),
  setSemanticCache: async (...args) => (await import("./semantic-cache")).setSemanticCache(...args),
};

/** `APHRODY_AI_CHAT_MODEL`, puis les alias hérités (résolveur unique @aphrody/shenron-pipeline/ai/config). */
function aphrodyModel(): string {
  return resolveChatModel(process.env);
}

/** Hits dans l'ordre vu par le modèle : les fiches « document collecté » passent après le canon. */
export function rankRagHits<T extends RagHit>(hits: readonly T[]): T[] {
  const byId = new Map(hits.map((h, i) => [`${i}`, h]));
  const ranked = rankHitsForContext(
    hits.map((h, i) => ({
      id: `${i}`,
      title: h.title,
      url: h.url,
      ...(h.content ? { content: h.content } : {}),
      snippet: h.snippet,
      ...(h.sourceId ? { sourceId: h.sourceId } : {}),
      kind: h.kind,
    })),
  );
  return ranked.map((h) => byId.get(h.id)!);
}

/**
 * Génère une réponse conversationnelle. `hits` = faits RAG (peuvent être vides pour du bavardage).
 * `opts.sessionId` active la mémoire (historique par salon/utilisateur). Les marqueurs de
 * citation `[n]` sont retirés : un client qui veut les sources appelle {@link generateLlmGrounded}.
 */
export async function generateLlmAnswer(
  db: Database,
  query: string,
  hits: RagHit[],
  personaId = "shenron",
  opts: LlmOptions = {},
): Promise<string> {
  const result = await generateLlmGrounded(db, query, hits, personaId, opts);
  return stripCitationMarkers(result.answer);
}

/** Réponse ancrée complète : texte cité `[n]`, sources citées (toutes issues de `hits`), refus. */
export async function generateLlmGrounded(
  db: Database,
  query: string,
  hits: RagHit[],
  personaId = "shenron",
  opts: LlmOptions = {},
): Promise<GroundedAnswer> {
  const pid = resolvePersona(personaId);
  const jev = opts.jev === undefined ? botChatJev(process.env) : opts.jev;
  if (jev && !isChitchat(query)) {
    const judged = await judgePublicChatHits(
      query,
      hits,
      (hit, index) => ({
        id: String(index),
        text: hit.content || hit.snippet,
        source_kind: jevSourceKind(hit.kind),
        // Legacy rag_chunks have no visibility proof: keep their passages local.
        public: false,
        url: hit.url,
        retrieval_score: hit.score,
      }),
      jev,
      opts.abortSignal ?? new AbortController().signal,
    );
    hits = judged.hits;
    console.error(JSON.stringify({ event: "shenron.chat.jev", ...judged.tool }));
  }
  // Gemma réside dans le processus Bun et utilise le SOUL dbfr. Le transport HTTP
  // reste sélectionnable explicitement pour les installations distantes.
  let model: Parameters<typeof generateGroundedAnswer>[0]["model"] | null = null;
  try {
    const backend = process.env.APHRODY_SHENRON_INFERENCE ?? "native";
    if (backend === "native") {
      model = createNativeShenronChatModel({
        model: process.env.APHRODY_NATIVE_CHAT_MODEL || SHENRON_NATIVE_MODEL,
        ...(process.env.APHRODY_NATIVE_LORA ? { lora: process.env.APHRODY_NATIVE_LORA } : {}),
      });
    } else if (backend === "http") {
      // Serveur de chat direct (Gemma 4 E2B préchargé du vps) quand APHRODY_AI_CHAT_BASE_URL
      // est déclaré, sinon aphrody-ai-http.
      const direct = resolveDirectChat(process.env);
      if (!direct.ok)
        throw new Error(direct.issues.map((i) => `${i.name} ${i.problem}`).join("; "));
      model = direct.value
        ? createOpenAICompatibleChat({
            baseUrl: direct.value.baseUrl,
            modelId: direct.value.model,
            ...(direct.value.apiKey ? { token: direct.value.apiKey } : {}),
          })
        : createAphrodyChatModel(new AphrodyComputeClient().compute, {
            modelId: aphrodyModel(),
          });
    } else {
      throw new Error("APHRODY_SHENRON_INFERENCE must be native or http");
    }
  } catch (err) {
    console.error(
      "[LLM] Échec génération Aphrody:",
      err instanceof Error ? err.message : String(err),
    );
  }
  const groundedHits: GroundedHit[] = hits.map((h) => ({
    id: String(h.rowid),
    title: h.title,
    url: h.url,
    ...(h.content ? { content: h.content } : {}),
    snippet: h.snippet,
    ...(h.sourceId ? { sourceId: h.sourceId } : {}),
    kind: h.kind,
  }));
  if (!model) {
    // Aphrody non configuré : même repli persona (et même mémoire) qu'une génération en échec.
    const fallback = PERSONAS[pid].fallback;
    if (opts.sessionId) {
      await createRedisHistoryPort()
        .append(opts.sessionId, { q: query, a: fallback })
        .catch(() => undefined);
    }
    return {
      answer: fallback,
      fallback: true,
      cached: false,
      promptVersion: PROMPT_VERSION,
      citations: [],
      refusal: false,
      lang: resolveAnswerLang(query, opts.lang),
      uncovered: [],
    };
  }
  const result = await generateGroundedAnswer({
    model,
    maxOutputTokens: opts.maxTokens ?? PUBLIC_RAG_CHAT_MAX_OUTPUT_TOKENS,
    persona: pid,
    strict: true,
    question: query,
    hits: groundedHits,
    chunks: createSqliteChunkPort(db),
    history: createRedisHistoryPort(),
    // Native Agent Home is reloaded on every turn. Do not serve a cached answer
    // from an earlier SOUL or adapter; the HTTP owner's existing cache is unchanged.
    ...(process.env.APHRODY_SHENRON_INFERENCE === "http"
      ? { cache: semanticCachePort(opts.cache ?? lazySemanticCache, pid) }
      : {}),
    concurrency: concurrencyPort,
    ...(opts.sessionId ? { sessionId: opts.sessionId } : {}),
    contextLimits: { perHit: CONTEXT_CHARS_PER_HIT, total: CONTEXT_CHARS_TOTAL },
    historyTurns: HISTORY_TURNS,
    ...(opts.lang ? { lang: opts.lang } : {}),
    ...(opts.homePersona ? { homePersona: opts.homePersona } : {}),
    ...(opts.systemNote ? { systemNote: opts.systemNote } : {}),
    ...(opts.memories ? { memories: opts.memories } : {}),
    abortSignal: opts.abortSignal
      ? AbortSignal.any([
          opts.abortSignal,
          AbortSignal.timeout(opts.timeoutMs ?? chatTimeoutMs(aphrodyModel())),
        ])
      : AbortSignal.timeout(opts.timeoutMs ?? chatTimeoutMs(aphrodyModel())),
    onError: (stage, err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (stage === "generate") console.error("[LLM] Échec génération Aphrody:", message);
      else if (stage === "cache") console.error("[LLM] Erreur du cache sémantique:", message);
      // chunks / history : best-effort, comme avant.
    },
  });
  return result;
}
