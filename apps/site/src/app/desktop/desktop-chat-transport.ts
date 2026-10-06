// SPDX-License-Identifier: Apache-2.0
/**
 * Chat transport of the desktop home: the `@shenron/ui/chat` surface talks to the host API of
 * `shenron-server` on the same origin (`POST /api/v1/chat` SSE, `/api/v1/conversations`).
 * Runtime class: `pure` (fetch injectable, no DOM global).
 */
import { cancelChat, createShenronApiClient, streamChat } from "@shenron/api/client";
import { endpoints } from "@shenron/api/contract";
import type { ChatMessageView, ChatTransport } from "@shenron/ui/chat/model";

export interface DesktopChatTransportOptions {
  baseUrl: string;
  /** Reader's language, sent as `Accept-Language`. */
  lang: string;
  fetch?: typeof fetch;
}

export function createDesktopChatTransport(options: DesktopChatTransportOptions): ChatTransport {
  const client = createShenronApiClient({
    baseUrl: options.baseUrl,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const headers = { "Accept-Language": options.lang };
  const streamOptions = {
    baseUrl: options.baseUrl,
    headers,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  };

  return {
    async listConversations() {
      const result = await client.call(endpoints.conversations, {});
      if (!result.ok) return null;
      return result.value.conversations
        .filter((c) => c.deletedAt === null)
        .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }));
    },

    async loadConversation(id) {
      const result = await client.call(endpoints.conversation, { params: { id } });
      if (!result.ok) return null;
      return result.value.messages
        .filter(
          (m): m is typeof m & { role: "user" | "assistant" } =>
            m.deletedAt === null && (m.role === "user" || m.role === "assistant"),
        )
        .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((m): ChatMessageView => ({
          id: m.id,
          role: m.role,
          content: m.content,
          citations: m.citations,
          model: m.model,
        }));
    },

    async send(input, onEvent, signal) {
      const outcome = await streamChat(
        {
          message: input.message,
          surface: "desktop",
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          ...(input.history.length > 0 ? { history: input.history } : {}),
        },
        { ...streamOptions, signal, onEvent },
      );
      if (outcome.ok) return { ok: true };
      switch (outcome.kind) {
        case "unavailable":
          return { ok: false, kind: "unavailable" };
        case "http":
          return { ok: false, kind: "http", detail: outcome.detail };
        case "error":
          return { ok: false, kind: "error", detail: outcome.error.message };
        case "aborted":
          return { ok: false, kind: "aborted" };
        case "unreachable":
          return { ok: false, kind: "unreachable", detail: outcome.detail };
      }
    },

    async cancel(streamId) {
      await cancelChat(streamId, streamOptions);
    },
  };
}
