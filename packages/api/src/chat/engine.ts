// SPDX-License-Identifier: Apache-2.0
/**
 * The unified chat engine: one turn = OCR of the attachments, hybrid retrieval over the VFS
 * (corpus, agent home, opted-in conversations), the `dragonball.*` MCP tools, a grounded
 * prompt (persona doctrine of `@shenron/pipeline/ai/prompts` + agent home tone), generation by
 * the first available backend (Gemini web, local llama-server, extractive), numbered
 * citations and storage of both turns in the conversation store. Runtime class: `bun`.
 */
import type { ConversationStore, Message, StoredCitation } from "@shenron/db/conversations/types";
import type { QueryEmbedder, RagHit as VfsHit, VfsRag } from "@shenron/db/vfs";
import {
  buildGroundingInstructions,
  INJECTION_GUARD,
  isChitchat,
  resolvePersona,
  withHomePersona,
} from "@shenron/pipeline/ai/prompts";
import type {
  ChatEvent,
  ChatRequestParsed,
  ChatToolEvent,
  Citation,
  ModelsResponse,
  OcrResponse,
} from "../contract/chat";
import type { AgentHome } from "./home";
import { BackendUnavailable, type LlmBackend, type LlmMessage } from "./llm";
import { type McpClient, pickTools, toolItems } from "./mcp";

export interface ChatEngineDeps {
  rag: VfsRag | null;
  embed?: QueryEmbedder | null;
  embedderModel?: string;
  /** Only public VFS rows (public server); default false. */
  publicOnly?: boolean;
  backends: readonly LlmBackend[];
  home: () => AgentHome;
  mcp?: McpClient | null;
  ocr?: { recognize(bytes: Uint8Array, mediaType: string): Promise<OcrResponse> } | null;
  store?: ConversationStore | null;
  defaultPersona?: string;
  maxContextChars?: number;
  maxTokens?: number;
  log?: (event: Record<string, unknown>) => void;
}

const CITATION_RULE =
  "Appuie chaque fait sur les sources numérotées et cite-les entre crochets, par exemple [1] ou [2][3]. " +
  "N'invente ni fait ni numéro de source ; si les sources ne répondent pas, dis-le.";

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
      : buildGroundingInstructions(id, "site-long");
  const body = base.endsWith(INJECTION_GUARD)
    ? base.slice(0, -INJECTION_GUARD.length).trimEnd()
    : base;
  const withRule = `${body}\n${CITATION_RULE} ${INJECTION_GUARD}`;
  return home.persona ? withHomePersona(withRule, home.persona) : withRule;
}

export function createChatEngine(deps: ChatEngineDeps) {
  let cachedHome: AgentHome | null = null;
  const home = () => (cachedHome ??= deps.home());

  async function models(): Promise<ModelsResponse> {
    const backends = await Promise.all(
      deps.backends.map(async (b) => ({ id: b.id, ...(await b.status()) })),
    );
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
    return { order: deps.backends.map((b) => b.id), backends, embedder };
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
    const messages: LlmMessage[] = [
      { role: "system", content: systemPrompt(persona, request.surface, home(), chitchat) },
      ...history.slice(-8),
      {
        role: "user",
        content: sources
          ? `Sources :\n\n${sources}\n\nQuestion : ${request.message}`
          : request.message,
      },
    ];

    // 6. Generation with fallback.
    const fallbacks: { backend: string; error: string }[] = [];
    const order =
      request.backend === "auto"
        ? deps.backends
        : deps.backends.filter((b) => b.id === request.backend);
    let answer = "";
    let used: LlmBackend | null = null;
    let firstTokenMs: number | null = null;
    let finishReason: "stop" | "length" | "aborted" | "error" = "stop";
    for (const backend of order) {
      if (signal.aborted) break;
      try {
        let started_ = false;
        for await (const delta of backend.stream(
          messages,
          { maxTokens: deps.maxTokens ?? 700 },
          signal,
        )) {
          if (!started_) {
            started_ = true;
            used = backend;
            firstTokenMs = Math.round(performance.now() - started);
            yield { type: "backend", data: { backend: backend.id, model: backend.model } };
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
    if (signal.aborted) finishReason = "aborted";
    if (!used && finishReason === "stop") {
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
        .map((c) => ({
          n: c.n,
          title: c.title,
          url: c.url,
          kind: c.kind,
          source: c.source,
          ...(c.snippet ? { snippet: c.snippet.slice(0, 600) } : {}),
        }));
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
        model: used?.model ?? used?.id ?? null,
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

    yield {
      type: "done",
      data: {
        replyId,
        conversationId,
        backend: used?.id ?? "none",
        model: used?.model ?? null,
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
      },
    };
  }

  return { run, models };
}

export type ChatEngine = ReturnType<typeof createChatEngine>;
