// SPDX-License-Identifier: Apache-2.0
/**
 * The unified chat engine: one turn = OCR of the attachments, hybrid retrieval over the VFS
 * (corpus, agent home, opted-in conversations), the `dragonball.*` MCP tools, a grounded
 * prompt (persona doctrine of `@aphrody/shenron-pipeline/ai/prompts` + agent home tone), generation by
 * the first available backend (Gemini web, local llama-server, extractive), numbered
 * citations, storage of both turns in the conversation store and the persistent memory of the
 * owner (relevant memories recalled beside the sources, salient facts of the message written
 * after the answer). Runtime class: `bun`.
 */
import type {
  ConversationStore,
  Message,
  StoredCitation,
} from "@aphrody/shenron-db/conversations/types";
import type { QueryEmbedder, RagHit as VfsHit, VfsRag } from "@aphrody/shenron-db/vfs";
import {
  buildGroundingInstructions,
  INJECTION_GUARD,
  isChitchat,
  resolvePersona,
  withHomePersona,
} from "@aphrody/shenron-pipeline/ai/prompts";
import type {
  ChatEvent,
  ChatRequestParsed,
  ChatToolEvent,
  Citation,
  ChatModelEntry,
  ModelsResponse,
  OcrResponse,
} from "../contract/chat";
import type { MemoryEntry } from "../contract/memory";
import type { MemoryPort } from "../server";
import { type AgentHome, homeUserNote } from "./home";
import { BackendUnavailable, type LlmBackend, type LlmMessage } from "./llm";
import { type McpClient, pickTools, toolItems } from "./mcp";
import type { PluginPort } from "../plugin";
import { extractFacts, memoryBlock, newFacts, rankMemories } from "./memory";

export interface ChatEngineDeps {
  rag: VfsRag | null;
  embed?: QueryEmbedder | null;
  embedderModel?: string;
  /** Only public VFS rows (public server); default false. */
  publicOnly?: boolean;
  backends: readonly LlmBackend[];
  /** Agent home of an owner (`discord:<user_id>`, `local`): persona and the user's fields. */
  home: (ownerId: string) => AgentHome;
  mcp?: McpClient | null;
  ocr?: { recognize(bytes: Uint8Array, mediaType: string): Promise<OcrResponse> } | null;
  store?: ConversationStore | null;
  /** Persistent memory of each owner: recalled into the prompt, salient facts written after. */
  memory?: MemoryPort | null;
  /** Memories recalled into one turn (default 5; 0 writes without recalling). */
  memoryRecall?: number;
  /** `false` keeps the recalled memories from remote backends (`remoteBackends`); default true. */
  memoryRemote?: boolean;
  /**
   * Local models this server manages (`shenron-chat-v2`, `gemma4-e2b` on the `local`
   * backend), with their state; absent: one entry per configured `local` backend.
   */
  catalog?: (() => Promise<ChatModelEntry[]>) | null;
  /** The `shenron` plugin: its index (skills, agents) joins the system prompt of every model. */
  plugin?: PluginPort | null;
  /** Backends that send the prompt off this machine (default `gemini-web`). */
  remoteBackends?: ReadonlySet<string>;
  defaultPersona?: string;
  maxContextChars?: number;
  maxTokens?: number;
  /** Sampling temperature (default `CHAT_TEMPERATURE`). */
  temperature?: number;
  /** `false` lets the model answer a factual question without any source; default true (refuse). */
  refuseWhenEmpty?: boolean;
  log?: (event: Record<string, unknown>) => void;
}

const CITATION_RULE =
  "Appuie chaque fait sur les sources numérotées et cite-les entre crochets, par exemple [1] ou [2][3]. " +
  "N'invente ni fait ni numéro de source ; si les sources ne répondent pas, dis-le.";

/** Backends answering from a remote service: no memory in their prompt with `memoryRemote: false`. */
export const REMOTE_BACKENDS: ReadonlySet<string> = new Set(["gemini-web"]);

/** Backends whose models are listed by their own id (`gemini-web/flash`). */
const REMOTE_MODEL_BACKENDS: ReadonlySet<string> = new Set(["gemini-web"]);

/**
 * The plugin index for the system prompt: what the `shenron` plugin offers (skills, agents),
 * so every model answers as Shenron with the same references. Rebuilt when its SHA-256 changes.
 */
export function pluginBlock(bundle: {
  name: string;
  version: string;
  entries: readonly { kind: string; name: string; description: string }[];
}): string {
  if (bundle.entries.length === 0) return "";
  const lines = bundle.entries.map(
    (e) => `- ${e.kind === "agent" ? "agent" : "skill"} ${e.name} : ${e.description.slice(0, 240)}`,
  );
  return [
    `Plugin ${bundle.name} ${bundle.version} (dragonballfr.com) : tu disposes de ces compétences et références Dragon Ball ; applique leur doctrine (sources canoniques, citations, aucune invention).`,
    ...lines,
  ].join("\n");
}

/** Newest memories of the owner a turn scans for recall and duplicates. */
const MEMORY_SCAN = 200;

const uid = (prefix: string) => `${prefix}-${Bun.randomUUIDv7()}`;

function citationOf(hit: VfsHit, n: number): Citation {
  return {
    n,
    title: hit.title,
    url: hit.url,
    kind: hit.kind,
    source:
      hit.corpus === "home" ? "home" : hit.corpus === "conversations" ? "conversations" : "vfs",
    snippet: hit.snippet,
    score: Math.round(hit.score * 10_000) / 10_000,
  };
}

/** Sources block of the user prompt (`[n] title — url` then the passage). */
export function sourcesBlock(
  items: { n: number; title: string; url: string | null; text: string }[],
  maxChars: number,
): string {
  let out = "";
  for (const item of items) {
    const block = `[${item.n}] ${item.title}${item.url ? ` — ${item.url}` : ""}\n${item.text.trim()}\n\n`;
    if (out && out.length + block.length > maxChars) break;
    out += block.length > maxChars ? `${block.slice(0, maxChars)}\n\n` : block;
  }
  return out.trim();
}

/** Dragon Ball facts come only from the numbered sources; never from model memory. */
export const STRICT_GROUNDING_RULE =
  "Tout fait sur Dragon Ball (personnage, technique, transformation, lieu, date, chiffre, citation) doit venir des sources numérotées fournies, jamais de ta mémoire. Si les sources ne contiennent pas la réponse, réponds seulement que tu ne sais pas. Le manga et Akira Toriyama priment ; Fandom n'est pas une source.";

/** Short, plain answers by default. */
export const BREVITY_RULE =
  "Réponds en trois phrases au plus, sauf demande explicite de détail. Pas de formule d'introduction ni de conclusion, pas d'émoji, pas de ton promotionnel.";

/** Fixed answer when retrieval found nothing for a factual question (no model call). */
export const NO_SOURCE_ANSWER =
  "Je ne sais pas : aucune source de la base Shenron ne répond à cette question.";

/** True when a factual question must be refused: no source at all reached the prompt. */
export function mustRefuse(chitchat: boolean, sourceCount: number): boolean {
  return !chitchat && sourceCount === 0;
}

/** Sampling defaults: low temperature against invention, short answers. */
export const CHAT_MAX_TOKENS = 400;
export const CHAT_TEMPERATURE = 0.1;

export function systemPrompt(
  persona: string,
  surface: ChatRequestParsed["surface"],
  home: AgentHome,
  chitchat: boolean,
): string {
  const id = resolvePersona(persona);
  const base =
    surface === "bot"
      ? buildGroundingInstructions(id, undefined, { chitchat })
      : buildGroundingInstructions(id, "site-short");
  const body = base.endsWith(INJECTION_GUARD)
    ? base.slice(0, -INJECTION_GUARD.length).trimEnd()
    : base;
  const rules = chitchat ? BREVITY_RULE : `${STRICT_GROUNDING_RULE}\n${BREVITY_RULE}`;
  const withRule = `${body}\n${rules}\n${CITATION_RULE} ${INJECTION_GUARD}`;
  const withPersona = home.persona ? withHomePersona(withRule, home.persona) : withRule;
  const user = homeUserNote(home.user ?? null);
  if (!user) return withPersona;
  const core = withPersona.endsWith(INJECTION_GUARD)
    ? withPersona.slice(0, -INJECTION_GUARD.length).trimEnd()
    : withPersona;
  return `${core}\n${user}\n${INJECTION_GUARD}`;
}

const HOME_TTL_MS = 30_000;

export function createChatEngine(deps: ChatEngineDeps) {
  // One read of an owner's agent home per 30 s (its USER.md may be edited meanwhile).
  const homes = new Map<string, { at: number; home: AgentHome }>();
  const home = (ownerId: string): AgentHome => {
    const cached = homes.get(ownerId);
    if (cached && Date.now() - cached.at < HOME_TTL_MS) return cached.home;
    const value = deps.home(ownerId);
    if (homes.size > 1000) homes.clear();
    homes.set(ownerId, { at: Date.now(), home: value });
    return value;
  };

  async function catalog(
    backends: { id: string; available: boolean; model: string | null; detail?: string }[],
  ): Promise<ChatModelEntry[]> {
    const local = backends.find((b) => b.id === "local");
    const managed = deps.catalog ? await deps.catalog().catch(() => []) : null;
    const entries: ChatModelEntry[] = [];
    for (const entry of managed ?? []) entries.push({ ...entry, default: false });
    if (!managed && local) {
      entries.push({
        id: local.model ?? "local",
        label: local.model ?? "local",
        backend: "local",
        available: local.available,
        default: false,
        remote: false,
        state: local.available ? "ready" : "unavailable",
        ...(local.detail ? { detail: local.detail } : {}),
      });
    }
    for (const b of backends.filter((backend) => REMOTE_MODEL_BACKENDS.has(backend.id))) {
      entries.push({
        id: b.model ?? b.id,
        label: b.id === "gemini-web" ? "Gemini (web)" : b.id,
        backend: b.id,
        available: b.available,
        default: false,
        remote: true,
        state: b.available ? "ready" : "unavailable",
        ...(b.detail ? { detail: b.detail } : {}),
      });
    }
    const first = entries.find((e) => e.available && !e.remote) ?? entries.find((e) => e.available);
    if (first) first.default = true;
    return entries.toSorted((a, b) => Number(b.default) - Number(a.default));
  }

  /** Backend and upstream model of `request.model`; `null`: no such model here. */
  function route(model: string): { backend: LlmBackend; model: string | null } | null {
    const remote = deps.backends.find((b) => REMOTE_MODEL_BACKENDS.has(b.id) && b.model === model);
    if (remote) return { backend: remote, model: null };
    const local = deps.backends.find((b) => b.id === "local");
    if (!local) return null;
    return { backend: local, model };
  }

  let pluginCache: { sha256: string; text: string } | null = null;
  async function pluginContext(): Promise<string> {
    if (!deps.plugin) return "";
    try {
      const bundle = await deps.plugin.load();
      if (pluginCache?.sha256 !== bundle.sha256)
        pluginCache = { sha256: bundle.sha256, text: pluginBlock(bundle) };
      return pluginCache.text;
    } catch {
      return "";
    }
  }

  async function models(): Promise<ModelsResponse> {
    const backends = await Promise.all(
      deps.backends.map(async (b) => ({ id: b.id, ...(await b.status()) })),
    );
    const listed = await catalog(backends);
    let embedder: ModelsResponse["embedder"] = {
      available: false,
      model: deps.embedderModel ?? "none",
    };
    if (deps.embed) {
      try {
        await deps.embed("Son Goku");
        embedder = { available: true, model: deps.embedderModel ?? "Xenova/multilingual-e5-small" };
      } catch (error) {
        embedder = {
          available: false,
          model: deps.embedderModel ?? "Xenova/multilingual-e5-small",
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return {
      order: deps.backends.map((b) => b.id),
      backends,
      models: listed,
      defaultModel: listed.find((m) => m.default)?.id ?? null,
      embedder,
    };
  }

  async function* run(
    input: { request: ChatRequestParsed; ownerId: string; streamId: string },
    signal: AbortSignal,
  ): AsyncGenerator<ChatEvent> {
    const started = performance.now();
    const { request, ownerId, streamId } = input;
    const conversationId = request.conversationId ?? uid("conv");
    const messageId = request.messageId ?? uid("msg");
    const replyId = uid("msg");
    const persona = request.persona ?? deps.defaultPersona ?? "shenron";
    const chitchat = isChitchat(request.message);

    // 1. OCR of the attachments.
    const ocrTexts: { name: string; text: string }[] = [];
    const tools: ChatToolEvent[] = [];
    for (const [index, attachment] of (request.attachments ?? []).entries()) {
      if (!deps.ocr) {
        tools.push({ name: "ocr", ok: false, ms: 0, error: "OCR not configured on this server" });
        continue;
      }
      const t0 = performance.now();
      try {
        const bytes = Uint8Array.from(Buffer.from(attachment.data, "base64"));
        const result = await deps.ocr.recognize(bytes, attachment.mediaType);
        ocrTexts.push({ name: attachment.name ?? `image ${index + 1}`, text: result.text });
        tools.push({
          name: `ocr:${result.engine}`,
          ok: true,
          ms: Math.round(performance.now() - t0),
          hits: result.regions,
        });
      } catch (error) {
        tools.push({
          name: "ocr",
          ok: false,
          ms: Math.round(performance.now() - t0),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 2. Retrieval (skipped for small talk).
    const query = [request.message, ...ocrTexts.map((o) => o.text.slice(0, 300))]
      .join("\n")
      .slice(0, 1200);
    let mode: "hybrid" | "lexical" | "none" = "none";
    let hits: VfsHit[] = [];
    let embedError: string | undefined;
    if (deps.rag && request.topK > 0 && !chitchat) {
      const result = await deps.rag.searchWith(query, deps.embed ?? null, {
        limit: request.topK,
        ...(request.kinds?.length ? { kinds: request.kinds } : {}),
        publicOnly: deps.publicOnly === true,
      });
      hits = result.hits;
      mode = result.mode;
      embedError = result.embedError;
    }

    // 3. MCP tools, in parallel, bounded.
    const toolSources: { title: string; url: string | null; snippet: string; tool: string }[] = [];
    if (deps.mcp && request.tools && !chitchat) {
      const picked = pickTools(request.message);
      const results = await Promise.all(
        picked.map(async (tool) => {
          const t0 = performance.now();
          const result = await deps.mcp!.call(tool.name, tool.args, 8_000);
          return { tool, result, ms: Math.round(performance.now() - t0) };
        }),
      );
      for (const { tool, result, ms } of results) {
        const items = result.ok ? toolItems(result.value) : [];
        tools.push({
          name: tool.name,
          ok: result.ok,
          ms,
          hits: items.length,
          ...(result.error ? { error: result.error } : {}),
        });
        for (const item of items.slice(0, 3)) toolSources.push({ ...item, tool: tool.name });
      }
    }

    // 3b. Persistent memory: the owner's memories this message recalls (data, never sources).
    const useMemory = deps.memory != null && request.memoryOptIn !== false;
    let known: MemoryEntry[] = [];
    let recalled: MemoryEntry[] = [];
    if (useMemory) {
      const t0 = performance.now();
      try {
        known = await deps.memory!.list(ownerId, { limit: MEMORY_SCAN });
        recalled = rankMemories(known, request.message, deps.memoryRecall ?? 5);
        tools.push({
          name: "memory:recall",
          ok: true,
          ms: Math.round(performance.now() - t0),
          hits: recalled.length,
        });
      } catch (error) {
        tools.push({
          name: "memory:recall",
          ok: false,
          ms: Math.round(performance.now() - t0),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 4. Numbered citations.
    const citations: Citation[] = [];
    const promptItems: { n: number; title: string; url: string | null; text: string }[] = [];
    for (const ocr of ocrTexts) {
      const n = citations.length + 1;
      citations.push({
        n,
        title: `Texte de ${ocr.name} (OCR)`,
        url: null,
        kind: "ocr",
        source: "ocr",
        snippet: ocr.text.slice(0, 300),
      });
      promptItems.push({ n, title: `Texte de ${ocr.name} (OCR)`, url: null, text: ocr.text });
    }
    for (const hit of hits) {
      const n = citations.length + 1;
      citations.push(citationOf(hit, n));
      promptItems.push({ n, title: hit.title, url: hit.url, text: hit.content });
    }
    const seen = new Set(citations.map((c) => c.url).filter(Boolean));
    for (const item of toolSources) {
      if (item.url && seen.has(item.url)) continue;
      const n = citations.length + 1;
      citations.push({
        n,
        title: item.title,
        url: item.url,
        kind: "tool",
        source: `mcp:${item.tool}`,
        snippet: item.snippet,
      });
      promptItems.push({ n, title: item.title, url: item.url, text: item.snippet });
      if (item.url) seen.add(item.url);
    }

    yield {
      type: "meta",
      data: {
        streamId,
        conversationId,
        messageId,
        replyId,
        persona,
        retrieval: { mode, hits: hits.length, ...(embedError ? { embedError } : {}) },
      },
    };
    for (const tool of tools) yield { type: "tool", data: tool };
    yield { type: "sources", data: { citations } };

    // 5. Prompt: persona and rules, history, sources + question.
    let history = request.history ?? [];
    if (!request.history && deps.store && request.conversationId) {
      const stored = await deps.store.get(ownerId, request.conversationId).catch(() => null);
      history = (stored?.messages ?? [])
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-8)
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 4000) }));
    }
    const sources = sourcesBlock(promptItems, deps.maxContextChars ?? 7000);
    const plugin = await pluginContext();
    const promptFor = (withMemories: boolean): LlmMessage[] => {
      const memories = withMemories ? memoryBlock(recalled) : "";
      const context = [memories, sources ? `Sources :\n\n${sources}` : ""].filter(Boolean);
      return [
        {
          role: "system",
          content: [systemPrompt(persona, request.surface, home(ownerId), chitchat), plugin]
            .filter(Boolean)
            .join("\n\n"),
        },
        ...history.slice(-8),
        {
          role: "user",
          content: context.length
            ? `${context.join("\n\n")}\n\nQuestion : ${request.message}`
            : request.message,
        },
      ];
    };
    const messages = promptFor(true);
    // Every backend reads the memories, unless SHENRON_MEMORY_REMOTE=off keeps them local.
    const remoteMessages = deps.memoryRemote === false ? promptFor(false) : messages;
    const remote = deps.remoteBackends ?? REMOTE_BACKENDS;
    let injected = false;

    // 6. Generation with fallback.
    const fallbacks: { backend: string; error: string }[] = [];
    const routed = request.model ? route(request.model) : null;
    const refuse = deps.refuseWhenEmpty !== false && mustRefuse(chitchat, citations.length);
    const order = refuse
      ? []
      : request.model
        ? routed
          ? [routed.backend]
          : []
        : request.backend === "auto"
          ? deps.backends
          : deps.backends.filter((b) => b.id === request.backend);
    if (request.model && !routed && !refuse)
      fallbacks.push({ backend: request.model, error: "unknown model on this server" });
    let answer = "";
    let used: LlmBackend | null = null;
    let firstTokenMs: number | null = null;
    let finishReason: "stop" | "length" | "aborted" | "error" = "stop";
    if (refuse) {
      answer = NO_SOURCE_ANSWER;
      firstTokenMs = Math.round(performance.now() - started);
      yield { type: "delta", data: { text: answer } };
    }
    for (const backend of order) {
      if (signal.aborted) break;
      try {
        let started_ = false;
        const prompt = remote.has(backend.id) ? remoteMessages : messages;
        for await (const delta of backend.stream(
          prompt,
          {
            maxTokens: deps.maxTokens ?? CHAT_MAX_TOKENS,
            temperature: deps.temperature ?? CHAT_TEMPERATURE,
            ...(routed?.backend === backend && routed.model ? { model: routed.model } : {}),
          },
          signal,
        )) {
          if (!started_) {
            started_ = true;
            used = backend;
            injected = prompt === messages && recalled.length > 0;
            firstTokenMs = Math.round(performance.now() - started);
            yield {
              type: "backend",
              data: {
                backend: backend.id,
                model: routed?.backend === backend && routed.model ? routed.model : backend.model,
              },
            };
          }
          answer += delta;
          yield { type: "delta", data: { text: delta } };
        }
        if (started_) break;
        fallbacks.push({ backend: backend.id, error: "empty answer" });
      } catch (error) {
        if (signal.aborted) break;
        const message = error instanceof Error ? error.message : String(error);
        if (used === backend) {
          // Failure after the first token: keep the partial answer, report it.
          finishReason = "error";
          yield {
            type: "error",
            data: { code: "backend_failed", message: `${backend.id}: ${message}`, retryable: true },
          };
          break;
        }
        fallbacks.push({
          backend: backend.id,
          error:
            error instanceof BackendUnavailable
              ? message
              : `${error instanceof Error ? error.name : "Error"}: ${message}`,
        });
      }
    }
    // The model that answered: the one requested on a shared server, else the backend's.
    const usedModel =
      used && routed?.backend === used && routed.model ? routed.model : (used?.model ?? null);
    if (signal.aborted) finishReason = "aborted";
    if (!used && !refuse && finishReason === "stop") {
      yield {
        type: "error",
        data: {
          code: "no_backend",
          message: `no chat backend answered: ${fallbacks.map((f) => `${f.backend} (${f.error})`).join("; ") || "none configured"}`,
          retryable: true,
        },
      };
      finishReason = "error";
    }

    // 7. Storage of both turns.
    let stored = false;
    if (deps.store && answer) {
      const now = new Date().toISOString();
      const storedCitations: StoredCitation[] = citations
        .filter((c) => new RegExp(`\\[${c.n}\\]`).test(answer))
        .map((c) =>
          Object.assign(
            { n: c.n, title: c.title, url: c.url, kind: c.kind, source: c.source },
            c.snippet ? { snippet: c.snippet.slice(0, 600) } : {},
          ),
        );
      const existing = request.conversationId
        ? await deps.store.get(ownerId, conversationId).catch(() => null)
        : null;
      const conversation = existing?.conversation ?? {
        id: conversationId,
        surface: request.surface,
        title: request.message.slice(0, 120),
        persona,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        memoryOptIn: request.memoryOptIn === true,
        ragOptIn: request.ragOptIn === true,
        metadata: {},
      };
      const user: Message = {
        id: messageId,
        conversationId,
        role: "user",
        content: request.message,
        citations: [],
        model: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      const reply: Message = {
        id: replyId,
        conversationId,
        role: "assistant",
        content: answer,
        citations: storedCitations,
        model: usedModel ?? used?.id ?? null,
        createdAt: new Date(Date.parse(now) + 1).toISOString(),
        updatedAt: new Date(Date.parse(now) + 1).toISOString(),
        deletedAt: null,
      };
      try {
        const result = await deps.store.push(ownerId, {
          conversations: [
            {
              ...conversation,
              updatedAt: reply.updatedAt,
              ...(request.memoryOptIn !== undefined ? { memoryOptIn: request.memoryOptIn } : {}),
              ...(request.ragOptIn !== undefined ? { ragOptIn: request.ragOptIn } : {}),
            },
          ],
          messages: [user, reply],
        });
        stored = result.accepted.includes(replyId);
      } catch (error) {
        deps.log?.({
          event: "chat.store_failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // 8. Salient facts of the message, written once the turn is over (not when cancelled).
    let remembered = 0;
    if (useMemory && !signal.aborted) {
      for (const fact of newFacts(extractFacts(request.message), known)) {
        try {
          await deps.memory!.remember(ownerId, {
            content: fact.content,
            tags: fact.tags,
            metadata: { source: "chat", conversationId, persona },
          });
          remembered += 1;
        } catch (error) {
          deps.log?.({
            event: "chat.memory_failed",
            error: error instanceof Error ? error.message : String(error),
          });
          break;
        }
      }
    }

    yield {
      type: "done",
      data: {
        replyId,
        conversationId,
        backend: used?.id ?? "none",
        model: usedModel,
        fallbacks,
        citations: citations.filter((c) => answer.includes(`[${c.n}]`)),
        usage: {
          promptTokens: null,
          completionTokens: null,
          ms: Math.round(performance.now() - started),
          firstTokenMs,
        },
        finishReason,
        stored,
        ...(useMemory
          ? { memory: { recalled: injected ? recalled.length : 0, stored: remembered } }
          : {}),
      },
    };
  }

  return { run, models };
}

export type ChatEngine = ReturnType<typeof createChatEngine>;
