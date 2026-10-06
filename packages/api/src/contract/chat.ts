// SPDX-License-Identifier: Apache-2.0
/**
 * Unified chat contract: one request shape for the site, the desktop and the bot; one event
 * stream (SSE over `POST /api/v1/chat`, the same events over the `/api/v1/chat/ws` WebSocket)
 * with sources cited by number. Runtime class: `pure`.
 */
import { z } from "zod";

export const ChatSurface = z.enum(["site", "desktop", "bot"]).meta({ id: "ChatSurface" });
export type ChatSurface = z.infer<typeof ChatSurface>;

/** LLM backends in fallback order; `auto` = configured order (Gemini Web, then local). */
export const ChatBackendId = z
  .enum(["auto", "gemini-web", "local", "extractive"])
  .meta({ id: "ChatBackendId" });
export type ChatBackendId = z.infer<typeof ChatBackendId>;

export const ChatAttachment = z
  .object({
    /** `image/png`, `image/jpeg`, `image/webp`: the server OCRs it and cites the text. */
    mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    /** Base64 payload (≤ 8 MiB decoded). */
    data: z.string().max(11_200_000),
    name: z.string().max(200).optional(),
  })
  .meta({ id: "ChatAttachment" });
export type ChatAttachment = z.infer<typeof ChatAttachment>;

export const ChatTurn = z
  .object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(16_000) })
  .meta({ id: "ChatTurn" });
export type ChatTurn = z.infer<typeof ChatTurn>;

export const ChatRequest = z
  .object({
    message: z.string().trim().min(1).max(4_000),
    /** Stable conversation id; the server stores both turns when a conversation store is wired. */
    conversationId: z
      .string()
      .regex(/^[A-Za-z0-9_:-]{8,64}$/)
      .optional(),
    /** Client id of the user message (idempotent re-send); generated when absent. */
    messageId: z
      .string()
      .regex(/^[A-Za-z0-9_:-]{8,64}$/)
      .optional(),
    surface: ChatSurface.default("site"),
    /** Previous turns when the client keeps the history itself (otherwise read from the store). */
    history: z.array(ChatTurn).max(20).optional(),
    persona: z.string().max(32).optional(),
    backend: ChatBackendId.default("auto"),
    /** Retrieval: number of passages (default 6) and kinds filter. */
    topK: z.number().int().min(0).max(12).default(6),
    kinds: z.array(z.string().max(64)).max(16).optional(),
    /** Ask the dragonball.* MCP tools too (default true when the server has them). */
    tools: z.boolean().default(true),
    attachments: z.array(ChatAttachment).max(4).optional(),
    /** `false` → one JSON `ChatResponse` instead of an event stream. */
    stream: z.boolean().default(true),
    /**
     * Owner preferences recorded on the conversation. `memoryOptIn: false` also keeps this turn
     * out of the persistent memory (no recall, no writing); absent or true uses it when the
     * server has one.
     */
    memoryOptIn: z.boolean().optional(),
    ragOptIn: z.boolean().optional(),
  })
  .meta({ id: "ChatRequest" });
export type ChatRequest = z.input<typeof ChatRequest>;
export type ChatRequestParsed = z.output<typeof ChatRequest>;

export const Citation = z
  .object({
    /** Number used in the answer (`[n]`). */
    n: z.number().int().min(1),
    title: z.string(),
    url: z.string().nullable(),
    kind: z.string(),
    /** `vfs` (RAG of the VFS), `home` (agent home), `mcp:<tool>`, `ocr`, `asset`. */
    source: z.string(),
    snippet: z.string().optional(),
    score: z.number().optional(),
  })
  .meta({ id: "Citation" });
export type Citation = z.infer<typeof Citation>;

export const ChatUsage = z
  .object({
    promptTokens: z.number().int().nullable(),
    completionTokens: z.number().int().nullable(),
    ms: z.number(),
    firstTokenMs: z.number().nullable(),
  })
  .meta({ id: "ChatUsage" });
export type ChatUsage = z.infer<typeof ChatUsage>;

export const ChatMeta = z
  .object({
    streamId: z.string(),
    conversationId: z.string(),
    messageId: z.string(),
    replyId: z.string(),
    persona: z.string(),
    retrieval: z.object({
      mode: z.enum(["hybrid", "lexical", "none"]),
      hits: z.number().int(),
      embedError: z.string().optional(),
    }),
  })
  .meta({ id: "ChatMeta" });
export type ChatMeta = z.infer<typeof ChatMeta>;

export const ChatToolEvent = z
  .object({
    name: z.string(),
    ok: z.boolean(),
    ms: z.number(),
    hits: z.number().int().optional(),
    error: z.string().optional(),
  })
  .meta({ id: "ChatToolEvent" });
export type ChatToolEvent = z.infer<typeof ChatToolEvent>;

export const ChatDone = z
  .object({
    replyId: z.string(),
    conversationId: z.string(),
    backend: z.string(),
    model: z.string().nullable(),
    /** Backends tried before the one that answered, with their errors. */
    fallbacks: z.array(z.object({ backend: z.string(), error: z.string() })),
    citations: z.array(Citation),
    usage: ChatUsage,
    finishReason: z.enum(["stop", "length", "aborted", "error"]),
    stored: z.boolean(),
    /**
     * Persistent memory of the turn, when the server has one: memories given to the model that
     * answered (none for a remote backend with SHENRON_MEMORY_REMOTE=off) and facts stored.
     */
    memory: z
      .object({ recalled: z.number().int().min(0), stored: z.number().int().min(0) })
      .optional(),
  })
  .meta({ id: "ChatDone" });
export type ChatDone = z.infer<typeof ChatDone>;

export const ChatErrorEvent = z
  .object({ code: z.string(), message: z.string(), retryable: z.boolean() })
  .meta({ id: "ChatErrorEvent" });
export type ChatErrorEvent = z.infer<typeof ChatErrorEvent>;

/** Events of a chat stream (`event:` name and JSON `data:` of each SSE frame). */
export type ChatEvent =
  | { type: "meta"; data: ChatMeta }
  | { type: "sources"; data: { citations: Citation[] } }
  | { type: "tool"; data: ChatToolEvent }
  | { type: "backend"; data: { backend: string; model: string | null } }
  | { type: "delta"; data: { text: string } }
  | { type: "done"; data: ChatDone }
  | { type: "error"; data: ChatErrorEvent };

export const CHAT_EVENT_TYPES = [
  "meta",
  "sources",
  "tool",
  "backend",
  "delta",
  "done",
  "error",
] as const;

/** Non-streaming answer (`stream: false`). */
export const ChatResponse = z
  .object({
    meta: ChatMeta,
    answer: z.string(),
    done: ChatDone,
    tools: z.array(ChatToolEvent),
  })
  .meta({ id: "ChatResponse" });
export type ChatResponse = z.infer<typeof ChatResponse>;

export const ChatBackendStatus = z
  .object({
    id: z.string(),
    available: z.boolean(),
    model: z.string().nullable(),
    detail: z.string().optional(),
  })
  .meta({ id: "ChatBackendStatus" });

export const ModelsResponse = z
  .object({
    order: z.array(z.string()),
    backends: z.array(ChatBackendStatus),
    embedder: z.object({
      available: z.boolean(),
      model: z.string(),
      detail: z.string().optional(),
    }),
  })
  .meta({ id: "ModelsResponse" });
export type ModelsResponse = z.infer<typeof ModelsResponse>;

export const OcrRequest = z
  // No `lang`: PP-OCRv5 (`aphrody ocr ppocr`) reads Japanese and Latin scripts on every page.
  .object({ attachment: ChatAttachment })
  .meta({ id: "OcrRequest" });
export type OcrRequest = z.infer<typeof OcrRequest>;

export const OcrResponse = z
  .object({
    engine: z.string(),
    text: z.string(),
    regions: z.number().int(),
    ms: z.number(),
  })
  .meta({ id: "OcrResponse" });
export type OcrResponse = z.infer<typeof OcrResponse>;
