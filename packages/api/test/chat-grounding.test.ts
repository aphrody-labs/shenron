// SPDX-License-Identifier: Apache-2.0
/**
 * Grounding guard of the chat engine: a factual question with no retrieved source is refused
 * without calling any model; with sources, the model runs at low temperature, short budget,
 * under the strict grounding and brevity rules.
 */
import { describe, expect, test } from "bun:test";
import {
  BREVITY_RULE,
  CHAT_MAX_TOKENS,
  CHAT_TEMPERATURE,
  NO_SOURCE_ANSWER,
  STRICT_GROUNDING_RULE,
  createChatEngine,
  mustRefuse,
} from "../src/chat/engine";
import type { LlmBackend, LlmMessage, LlmOptions } from "../src/chat/llm";
import { ChatRequest, type ChatDone, type ChatEvent } from "../src/contract";

const home = () => ({ persona: null, name: "Shenron", emoji: null, source: "none" as const });

function backend() {
  const calls: { messages: LlmMessage[]; options: LlmOptions }[] = [];
  const b: LlmBackend = {
    id: "local",
    model: "m",
    status: async () => ({ available: true, model: "m" }),
    async *stream(messages, options) {
      calls.push({ messages: [...messages], options });
      yield "Vegeta est le prince des Saiyans [1].";
    },
  };
  return { backend: b, calls };
}

function rag(hits: unknown[]) {
  return {
    searchWith: async () => ({ hits, mode: "lexical" as const }),
  } as never;
}

const hit = {
  id: "n1",
  corpus: "vfs",
  kind: "wiki",
  title: "Vegeta",
  url: "https://dragonballfr.com/wiki/vegeta",
  content: "Vegeta, prince des Saiyans.",
  snippet: "Vegeta, prince des Saiyans.",
  score: 1,
};

async function turn(engine: ReturnType<typeof createChatEngine>, message: string) {
  const events: ChatEvent[] = [];
  for await (const event of engine.run(
    {
      request: ChatRequest.parse({ message, tools: false }),
      ownerId: "alice",
      streamId: "s00000001",
    },
    new AbortController().signal,
  ))
    events.push(event);
  return {
    events,
    text: events
      .filter((e) => e.type === "delta")
      .map((e) => (e.data as { text: string }).text)
      .join(""),
    done: events.find((e) => e.type === "done")?.data as ChatDone,
  };
}

describe("chat grounding guard", () => {
  test("mustRefuse: factual question without source only", () => {
    expect(mustRefuse(false, 0)).toBe(true);
    expect(mustRefuse(false, 2)).toBe(false);
    expect(mustRefuse(true, 0)).toBe(false);
  });

  test("empty retrieval: fixed refusal, no model call, no error", async () => {
    const b = backend();
    const engine = createChatEngine({ rag: rag([]), backends: [b.backend], home });
    const { text, done, events } = await turn(engine, "Quelle est la puissance de Goku ?");
    expect(text).toBe(NO_SOURCE_ANSWER);
    expect(b.calls).toHaveLength(0);
    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(done.finishReason).toBe("stop");
    expect(done.backend).toBe("none");
  });

  test("no RAG configured at all: still refused", async () => {
    const b = backend();
    const engine = createChatEngine({ rag: null, backends: [b.backend], home });
    const { text } = await turn(engine, "Qui a tué Freezer ?");
    expect(text).toBe(NO_SOURCE_ANSWER);
    expect(b.calls).toHaveLength(0);
  });

  test("with sources: strict rules, low temperature, short budget, citations kept", async () => {
    const b = backend();
    const engine = createChatEngine({ rag: rag([hit]), backends: [b.backend], home });
    const { done } = await turn(engine, "Qui est Vegeta ?");
    expect(b.calls).toHaveLength(1);
    const call = b.calls[0]!;
    const system = call.messages[0]!.content;
    expect(system).toContain(STRICT_GROUNDING_RULE);
    expect(system).toContain(BREVITY_RULE);
    expect(call.messages.at(-1)!.content).toContain("[1] Vegeta");
    expect(call.options.temperature).toBe(CHAT_TEMPERATURE);
    expect(call.options.maxTokens).toBe(CHAT_MAX_TOKENS);
    expect(done.citations.map((c) => c.n)).toEqual([1]);
  });

  test("small talk is not refused and gets the brevity rule only", async () => {
    const b = backend();
    const engine = createChatEngine({ rag: null, backends: [b.backend], home });
    await turn(engine, "Bonjour");
    expect(b.calls).toHaveLength(1);
    const system = b.calls[0]!.messages[0]!.content;
    expect(system).toContain(BREVITY_RULE);
    expect(system).not.toContain(STRICT_GROUNDING_RULE);
  });
});
