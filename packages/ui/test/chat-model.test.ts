// SPDX-License-Identifier: Apache-2.0
// Reducer of the chat surface: a streamed generation, a failure, a reopened conversation.
import { describe, expect, test } from "bun:test";
import {
  type ChatState,
  chatReducer,
  conversationTitle,
  historyOf,
  initialChatState,
} from "../src/chat/model";

const citation = {
  n: 1,
  title: "Daizenshû 2",
  url: "https://dragonballfr.com/x",
  kind: "databook",
  source: "vfs",
};

function streamed(): ChatState {
  let s = chatReducer(initialChatState, {
    type: "send",
    userId: "u_1",
    replyId: "a_1",
    message: "Qui est Freezer ?",
  });
  s = chatReducer(s, {
    type: "event",
    event: {
      type: "meta",
      data: {
        streamId: "s_12345678",
        conversationId: "c_12345678",
        messageId: "m_1",
        replyId: "r_1",
      },
    },
  });
  s = chatReducer(s, {
    type: "event",
    event: { type: "sources", data: { citations: [citation] } },
  });
  s = chatReducer(s, { type: "event", event: { type: "delta", data: { text: "Un tyran " } } });
  s = chatReducer(s, {
    type: "event",
    event: { type: "delta", data: { text: "galactique [1]." } },
  });
  return s;
}

describe("chatReducer", () => {
  test("a stream fills the pending reply, then done settles it and lists the conversation", () => {
    let s = streamed();
    expect(s.status).toBe("streaming");
    expect(s.activeId).toBe("c_12345678");
    expect(s.streamId).toBe("s_12345678");
    expect(s.messages.at(-1)).toMatchObject({
      pending: true,
      content: "Un tyran galactique [1].",
      citations: [citation],
    });
    s = chatReducer(s, {
      type: "event",
      event: {
        type: "done",
        data: {
          replyId: "r_1",
          conversationId: "c_12345678",
          backend: "local",
          model: "shenron-db-8b",
          citations: [],
          finishReason: "stop",
        },
      },
    });
    s = chatReducer(s, { type: "finish", outcome: { ok: true } });
    expect(s.status).toBe("idle");
    expect(s.error).toBeNull();
    expect(s.messages.at(-1)).toMatchObject({
      id: "r_1",
      pending: false,
      model: "shenron-db-8b",
      citations: [citation],
    });
    expect(s.conversations[0]).toMatchObject({ id: "c_12345678", title: "Qui est Freezer ?" });
  });

  test("the memory recall shows at once, done reports the final counts", () => {
    let s = streamed();
    s = chatReducer(s, {
      type: "event",
      event: { type: "tool", data: { name: "memory:recall", ok: true, hits: 3 } },
    });
    expect(s.messages.at(-1)?.memory).toEqual({ recalled: 3, stored: 0 });
    s = chatReducer(s, {
      type: "event",
      event: { type: "tool", data: { name: "dragonball.search", ok: true, hits: 9 } },
    });
    expect(s.messages.at(-1)?.memory).toEqual({ recalled: 3, stored: 0 });
    s = chatReducer(s, {
      type: "event",
      event: {
        type: "done",
        data: {
          replyId: "r_1",
          conversationId: "c_12345678",
          backend: "local",
          model: null,
          citations: [],
          finishReason: "stop",
          memory: { recalled: 2, stored: 1 },
        },
      },
    });
    expect(s.messages.at(-1)?.memory).toEqual({ recalled: 2, stored: 1 });
  });

  test("a failure before any token drops the empty reply and records the error", () => {
    let s = chatReducer(initialChatState, {
      type: "send",
      userId: "u_1",
      replyId: "a_1",
      message: "Bonjour",
    });
    s = chatReducer(s, {
      type: "finish",
      outcome: { ok: false, kind: "unreachable", detail: "ECONNREFUSED" },
    });
    expect(s.messages.map((m) => m.role)).toEqual(["user"]);
    expect(s.error).toEqual({ kind: "unreachable", detail: "ECONNREFUSED" });
  });

  test("an error event keeps the partial answer, marked", () => {
    let s = streamed();
    s = chatReducer(s, {
      type: "event",
      event: {
        type: "error",
        data: { code: "upstream", message: "model crashed", retryable: true },
      },
    });
    s = chatReducer(s, {
      type: "finish",
      outcome: { ok: false, kind: "error", detail: "model crashed" },
    });
    expect(s.messages.at(-1)).toMatchObject({ pending: false, finishReason: "error" });
    expect(s.error).toEqual({ kind: "error", detail: "model crashed" });
  });

  test("an aborted stream is not an error", () => {
    let s = streamed();
    s = chatReducer(s, { type: "finish", outcome: { ok: false, kind: "aborted" } });
    expect(s.error).toBeNull();
    expect(s.messages.at(-1)?.finishReason).toBe("aborted");
  });

  test("a late load of another conversation is ignored", () => {
    let s = chatReducer(initialChatState, { type: "open", id: "c_aaaaaaaa" });
    s = chatReducer(s, { type: "open", id: "c_bbbbbbbb" });
    s = chatReducer(s, {
      type: "opened",
      id: "c_aaaaaaaa",
      messages: [{ id: "x", role: "user", content: "a", citations: [] }],
    });
    expect(s.status).toBe("loading");
    expect(s.messages).toEqual([]);
  });
});

test("historyOf keeps settled turns only", () => {
  expect(historyOf(streamed().messages)).toEqual([{ role: "user", content: "Qui est Freezer ?" }]);
});

test("conversationTitle keeps the first line, 80 characters", () => {
  expect(conversationTitle("  Goku\nVegeta")).toBe("Goku");
  expect(conversationTitle("x".repeat(100))).toHaveLength(80);
});
