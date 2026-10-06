// SPDX-License-Identifier: Apache-2.0
/**
 * State model of the chat surface: transport-agnostic types (structural mirrors of the
 * `@shenron/api/contract` chat events, so a contract `ChatEvent` is assignable to
 * {@link ChatStreamEvent}) and a pure reducer driven by the stream events.
 *
 * Runtime class: `pure` (no DOM, no React, no node:/bun:).
 */

export interface ChatCitation {
  n: number;
  title: string;
  url: string | null;
  kind: string;
  source: string;
  snippet?: string;
}

export interface ChatConversationSummary {
  id: string;
  title: string | null;
  updatedAt: string;
}

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: ChatCitation[];
  model?: string | null;
  /** Still streaming. */
  pending?: boolean;
  finishReason?: "stop" | "length" | "aborted" | "error";
}

/** Events of one generation (the subset of the contract stream the surface renders). */
export type ChatStreamEvent =
  | {
      type: "meta";
      data: { streamId: string; conversationId: string; messageId: string; replyId: string };
    }
  | { type: "sources"; data: { citations: ChatCitation[] } }
  | { type: "tool"; data: { name: string; ok: boolean } }
  | { type: "backend"; data: { backend: string; model: string | null } }
  | { type: "delta"; data: { text: string } }
  | {
      type: "done";
      data: {
        replyId: string;
        conversationId: string;
        backend: string;
        model: string | null;
        citations: ChatCitation[];
        finishReason: "stop" | "length" | "aborted" | "error";
      };
    }
  | { type: "error"; data: { code: string; message: string; retryable: boolean } };

export type ChatFailureKind = "unavailable" | "http" | "error" | "aborted" | "unreachable";

export type ChatSendOutcome = { ok: true } | { ok: false; kind: ChatFailureKind; detail?: string };

export interface ChatSendInput {
  message: string;
  /** Absent for a new conversation: the server assigns one (`meta.conversationId`). */
  conversationId?: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}

/** What the surface needs from the host API; every method resolves, never throws. */
export interface ChatTransport {
  listConversations(): Promise<ChatConversationSummary[] | null>;
  loadConversation(id: string): Promise<ChatMessageView[] | null>;
  send(
    input: ChatSendInput,
    onEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal,
  ): Promise<ChatSendOutcome>;
  /** Stops the generation server-side (the stream id comes from `meta`). */
  cancel?(streamId: string): Promise<void>;
}

/** Availability of an API group, as reported by the local health. */
export interface ChatGroupStatus {
  available: boolean;
  reason?: string;
}

export interface ChatState {
  conversations: ChatConversationSummary[];
  activeId: string | null;
  messages: ChatMessageView[];
  status: "idle" | "loading" | "streaming";
  streamId: string | null;
  backend: { backend: string; model: string | null } | null;
  error: { kind: ChatFailureKind; detail?: string } | null;
}

export const initialChatState: ChatState = {
  conversations: [],
  activeId: null,
  messages: [],
  status: "idle",
  streamId: null,
  backend: null,
  error: null,
};

export type ChatAction =
  | { type: "conversations"; conversations: ChatConversationSummary[] }
  | { type: "open"; id: string }
  | { type: "opened"; id: string; messages: ChatMessageView[] }
  | { type: "new" }
  | { type: "send"; userId: string; replyId: string; message: string }
  | { type: "event"; event: ChatStreamEvent }
  | { type: "finish"; outcome: ChatSendOutcome }
  | { type: "dismiss" };

/** Title of a conversation started by `message` (first line, 80 characters). */
export function conversationTitle(message: string): string {
  const line = message.trim().split(/\r?\n/, 1)[0] ?? "";
  return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

/** The history sent with a new turn: settled turns only, the last 20. */
export function historyOf(
  messages: readonly ChatMessageView[],
): Array<{ role: "user" | "assistant"; content: string }> {
  return messages
    .filter((m) => !m.pending && m.content.trim().length > 0)
    .slice(-20)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 16_000) }));
}

function updateReply(
  messages: ChatMessageView[],
  update: (m: ChatMessageView) => ChatMessageView,
): ChatMessageView[] {
  const index = messages.findLastIndex((m) => m.role === "assistant" && m.pending);
  if (index === -1) return messages;
  const next = messages.slice();
  next[index] = update(messages[index]!);
  return next;
}

function upsertConversation(
  list: ChatConversationSummary[],
  id: string,
  title: string | null,
): ChatConversationSummary[] {
  const existing = list.find((c) => c.id === id);
  const entry: ChatConversationSummary = {
    id,
    title: existing?.title ?? title,
    updatedAt: new Date().toISOString(),
  };
  return [entry, ...list.filter((c) => c.id !== id)];
}

function applyEvent(state: ChatState, event: ChatStreamEvent): ChatState {
  switch (event.type) {
    case "meta":
      return {
        ...state,
        activeId: event.data.conversationId,
        streamId: event.data.streamId,
      };
    case "sources":
      return {
        ...state,
        messages: updateReply(state.messages, (m) => ({ ...m, citations: event.data.citations })),
      };
    case "backend":
      return { ...state, backend: event.data };
    case "delta":
      return {
        ...state,
        messages: updateReply(state.messages, (m) => ({
          ...m,
          content: m.content + event.data.text,
        })),
      };
    case "done": {
      const firstUser = state.messages.find((m) => m.role === "user");
      return {
        ...state,
        activeId: event.data.conversationId,
        messages: updateReply(state.messages, (m) => ({
          ...m,
          id: event.data.replyId,
          citations: event.data.citations.length > 0 ? event.data.citations : m.citations,
          model: event.data.model,
          finishReason: event.data.finishReason,
          pending: false,
        })),
        conversations: upsertConversation(
          state.conversations,
          event.data.conversationId,
          firstUser ? conversationTitle(firstUser.content) : null,
        ),
      };
    }
    case "error":
      return {
        ...state,
        error: { kind: "error", detail: event.data.message },
        messages: updateReply(state.messages, (m) => ({
          ...m,
          pending: false,
          finishReason: "error",
        })),
      };
    case "tool":
      return state;
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "conversations":
      return { ...state, conversations: action.conversations };
    case "open":
      return { ...state, activeId: action.id, messages: [], status: "loading", error: null };
    case "opened":
      if (state.activeId !== action.id) return state;
      return { ...state, messages: action.messages, status: "idle" };
    case "new":
      return { ...state, activeId: null, messages: [], status: "idle", error: null };
    case "send":
      return {
        ...state,
        status: "streaming",
        streamId: null,
        error: null,
        messages: [
          ...state.messages,
          { id: action.userId, role: "user", content: action.message, citations: [] },
          { id: action.replyId, role: "assistant", content: "", citations: [], pending: true },
        ],
      };
    case "event":
      return applyEvent(state, action.event);
    case "finish": {
      const failed = action.outcome.ok ? null : action.outcome;
      // A reply that never received a token is dropped; a partial one is kept, marked.
      const messages = state.messages
        .filter(
          (m) =>
            !(
              m.role === "assistant" &&
              m.content.length === 0 &&
              (m.pending || m.finishReason === "error")
            ),
        )
        .map((m) =>
          m.pending
            ? {
                ...m,
                pending: false,
                finishReason: failed?.kind === "aborted" ? "aborted" : "error",
              }
            : m,
        ) as ChatMessageView[];
      return {
        ...state,
        status: "idle",
        streamId: null,
        messages,
        error:
          failed && failed.kind !== "aborted"
            ? (state.error ?? {
                kind: failed.kind,
                ...(failed.detail ? { detail: failed.detail } : {}),
              })
            : state.error,
      };
    }
    case "dismiss":
      return { ...state, error: null };
  }
}
