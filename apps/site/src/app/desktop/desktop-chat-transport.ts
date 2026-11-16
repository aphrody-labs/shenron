// SPDX-License-Identifier: Apache-2.0
/**
 * Chat transport of the desktop home: the `@shenron/ui/chat` surface talks to the host API of
 * `shenron-server` on the same origin (`POST /api/v1/chat` SSE, `/api/v1/conversations`).
 * Runtime class: `pure` (fetch injectable, no DOM global).
 */
import { cancelChat, createShenronApiClient, streamChat } from "@shenron/api/client";
import { endpoints } from "@shenron/api/contract";
import type { ChatMessageView, ChatTransport } from "@shenron/ui/chat/model";
import type { ChatModelView, MemoryTransport, ModelsTransport } from "@shenron/ui/chat";

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
    async listModels() {
      const result = await client.call(endpoints.models, {});
      if (!result.ok) return null;
      return {
        models: result.value.models
          .filter((m) => m.available)
          .map((m) => ({ id: m.id, label: m.label, backend: m.backend, remote: m.remote })),
        defaultModel: result.value.defaultModel,
      };
    },

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
          ...(input.model ? { model: input.model } : {}),
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

/** Persistent memory routes of the host (`/api/v1/memory`), for the memory panel. */
export function createDesktopMemoryTransport(
  options: Omit<DesktopChatTransportOptions, "lang">,
): MemoryTransport {
  const client = createShenronApiClient({
    baseUrl: options.baseUrl,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  return {
    async list(query) {
      const result = await client.call(endpoints.memoryList, {
        query: { ...(query.q ? { q: query.q } : {}), limit: 200 },
      });
      if (!result.ok) return null;
      return {
        memories: result.value.memories.map((m) => ({
          id: m.id,
          content: m.content,
          tags: m.tags,
          createdAt: m.createdAt,
        })),
        total: result.value.total,
      };
    },
    async remove(id) {
      const result = await client.call(endpoints.memoryDelete, { params: { id } });
      return result.ok;
    },
    async clear() {
      const result = await client.call(endpoints.memoryClear, {});
      return result.ok ? result.value.deleted : null;
    },
  };
}

/**
 * Chat models of the host: the list of `GET /api/v1/models`, the install and import routes
 * each entry names (`installUrl`, `importUrl`, local server only).
 */
export function createDesktopModelsTransport(
  options: Omit<DesktopChatTransportOptions, "lang">,
): ModelsTransport {
  const fetcher = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const client = createShenronApiClient({
    baseUrl: options.baseUrl,
    fetch: fetcher as typeof fetch,
  });
  const post = async (path: string, body?: unknown): Promise<Response | null> => {
    try {
      return await fetcher(new URL(path, options.baseUrl), {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
    } catch {
      return null;
    }
  };
  return {
    async list() {
      const result = await client.call(endpoints.models, {});
      if (!result.ok) return null;
      return result.value.models.map((m): ChatModelView =>
        Object.assign(
          {
            id: m.id,
            label: m.label,
            backend: m.backend,
            available: m.available,
            default: m.default,
            remote: m.remote,
            state: m.state,
          },
          m.progress ? { progress: m.progress } : {},
          m.installUrl ? { installUrl: m.installUrl } : {},
          m.importUrl ? { importUrl: m.importUrl } : {},
          m.detail ? { detail: m.detail } : {},
        ),
      );
    },
    async install(model) {
      if (!model.installUrl) return false;
      const response = await post(model.installUrl);
      return response !== null && response.ok;
    },
    async importAdapter(model, path) {
      if (!model.importUrl) return "no import route";
      const response = await post(model.importUrl, { path });
      if (!response) return "unreachable";
      if (response.ok) return null;
      const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
      return typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
    },
  };
}
