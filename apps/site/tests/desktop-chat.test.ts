// SPDX-License-Identifier: Apache-2.0
// Desktop chat transport: SSE stream of POST /api/v1/chat and the persisted conversations, on a
// fake same-origin host; the desktop dictionary carries every label of the chat surface.
import { describe, expect, test } from "bun:test";
import en from "../messages/en.json";
import fr from "../messages/fr.json";
import ja from "../messages/ja.json";
import type { ChatStreamEvent } from "@shenron/ui/chat/model";
import { createDesktopChatTransport } from "../src/app/desktop/desktop-chat-transport";

const NOW = "2026-10-05T10:00:00.000Z";
const conversation = (id: string, updatedAt: string, deletedAt: string | null = null) => ({
  id,
  surface: "desktop",
  title: id,
  persona: null,
  createdAt: NOW,
  updatedAt,
  deletedAt,
  memoryOptIn: false,
  ragOptIn: true,
  metadata: {},
});
const message = (id: string, role: string, createdAt: string) => ({
  id,
  conversationId: "c_00000001",
  role,
  content: id,
  citations: [],
  model: null,
  createdAt,
  updatedAt: createdAt,
  deletedAt: null,
});

function sse(events: Array<[string, unknown]>): string {
  return events
    .map(([e, d], i) => `id: ${i + 1}\nevent: ${e}\ndata: ${JSON.stringify(d)}\n\n`)
    .join("");
}

function fakeHost(seen: Request[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    seen.push(request);
    const path = new URL(request.url).pathname;
    if (path === "/api/v1/conversations") {
      return Response.json({
        conversations: [
          conversation("c_00000001", "2026-10-05T09:00:00.000Z"),
          conversation("c_00000002", "2026-10-05T11:00:00.000Z"),
          conversation("c_00000003", NOW, NOW),
        ],
      });
    }
    if (path === "/api/v1/conversations/c_00000001") {
      return Response.json({
        conversation: conversation("c_00000001", NOW),
        messages: [
          message("m_00000002", "assistant", "2026-10-05T10:00:02.000Z"),
          message("m_00000001", "user", "2026-10-05T10:00:01.000Z"),
          message("m_00000003", "tool", "2026-10-05T10:00:03.000Z"),
        ],
      });
    }
    if (path === "/api/v1/chat") {
      const body = sse([
        [
          "meta",
          {
            streamId: "s_12345678",
            conversationId: "c_00000009",
            messageId: "m_00000009",
            replyId: "r_00000009",
            persona: "shenron",
            retrieval: { mode: "hybrid", hits: 1 },
          },
        ],
        ["delta", { text: "Bonjour" }],
        [
          "done",
          {
            replyId: "r_00000009",
            conversationId: "c_00000009",
            backend: "local",
            model: "shenron-db",
            fallbacks: [],
            citations: [],
            usage: { promptTokens: 1, completionTokens: 1, ms: 5, firstTokenMs: 2 },
            finishReason: "stop",
            stored: true,
          },
        ],
      ]);
      return new Response(body, {
        headers: { "content-type": "text/event-stream", "x-stream-id": "s_12345678" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

describe("createDesktopChatTransport", () => {
  test("lists live conversations, newest first", async () => {
    const seen: Request[] = [];
    const t = createDesktopChatTransport({
      baseUrl: "http://127.0.0.1:4777",
      lang: "ja",
      fetch: fakeHost(seen),
    });
    expect((await t.listConversations())?.map((c) => c.id)).toEqual(["c_00000002", "c_00000001"]);
  });

  test("loads the user and assistant turns in order", async () => {
    const t = createDesktopChatTransport({
      baseUrl: "http://127.0.0.1:4777",
      lang: "fr",
      fetch: fakeHost([]),
    });
    const messages = await t.loadConversation("c_00000001");
    expect(messages?.map((m) => [m.id, m.role])).toEqual([
      ["m_00000001", "user"],
      ["m_00000002", "assistant"],
    ]);
  });

  test("streams a desktop chat turn with the reader's language", async () => {
    const seen: Request[] = [];
    const t = createDesktopChatTransport({
      baseUrl: "http://127.0.0.1:4777",
      lang: "en",
      fetch: fakeHost(seen),
    });
    const events: ChatStreamEvent[] = [];
    const outcome = await t.send(
      { message: "Hello", history: [] },
      (e) => events.push(e),
      new AbortController().signal,
    );
    expect(outcome).toEqual({ ok: true });
    expect(events.map((e) => e.type)).toEqual(["meta", "delta", "done"]);
    const post = seen.find((r) => r.method === "POST")!;
    expect(post.headers.get("accept-language")).toBe("en");
    expect(await post.json()).toMatchObject({ message: "Hello", surface: "desktop", stream: true });
  });

  test("a host without the chat group is reported unavailable", async () => {
    const t = createDesktopChatTransport({
      baseUrl: "http://127.0.0.1:4777",
      lang: "fr",
      fetch: (async () => new Response("", { status: 404 })) as unknown as typeof fetch,
    });
    expect(
      await t.send({ message: "x", history: [] }, () => {}, new AbortController().signal),
    ).toEqual({
      ok: false,
      kind: "unavailable",
    });
    expect(await t.listConversations()).toBeNull();
  });
});

const keys = (o: unknown, prefix = ""): string[] =>
  Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
  );

test("the desktop dictionary is complete in the three languages", () => {
  const reference = keys(fr.desktop).toSorted();
  expect(reference).toContain("chat.unavailableTitle");
  expect(keys(en.desktop).toSorted()).toEqual(reference);
  expect(keys(ja.desktop).toSorted()).toEqual(reference);
});
