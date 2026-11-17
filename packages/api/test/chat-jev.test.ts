// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import type { RagHit, RagSearchOptions } from "@aphrody/shenron-db/vfs";
import { createChatEngine, NO_SOURCE_ANSWER } from "../src/chat/engine";
import { createChatJevPort, judgePublicChatHits, type ChatJevRequest } from "../src/chat/jev";
import type { LlmBackend, LlmMessage } from "../src/chat/llm";
import { ChatRequest, type ChatEvent } from "../src/contract/chat";

const home = () => ({ persona: null, name: "Shenron", emoji: null, source: "none" as const });
const hit = (chunkId: number, content: string, corpus = "shenron"): RagHit => ({
  chunkId,
  docId: chunkId,
  title: `Source ${chunkId}`,
  url: `https://dragonballfr.com/sources/${chunkId}`,
  kind: "manga",
  corpus,
  content,
  snippet: content,
  score: 1,
  sourceId: "manga",
  entityId: null,
  lang: "fr",
  heading: null,
  lexicalRank: 1,
  vectorRank: null,
  similarity: null,
});
function backend() {
  const calls: LlmMessage[][] = [];
  const port: LlmBackend = {
    id: "local",
    model: "local-model",
    status: async () => ({ available: true, model: "local-model" }),
    async *stream(messages) {
      calls.push([...messages]);
      yield "Vegeta ne tue pas Cell [1].";
    },
  };
  return { port, calls };
}
function rag(hits: RagHit[], publicHits = hits) {
  const calls: RagSearchOptions[] = [];
  return {
    port: {
      searchWith: async (_query: string, _embed: unknown, options: RagSearchOptions) => {
        calls.push(options);
        return { hits: options.publicOnly ? publicHits : hits, mode: "lexical" as const };
      },
    } as never,
    calls,
  };
}
async function turn(
  engine: ReturnType<typeof createChatEngine>,
  extra: Record<string, unknown> = {},
  signal = new AbortController().signal,
) {
  const events: ChatEvent[] = [];
  for await (const event of engine.run(
    {
      request: ChatRequest.parse({
        message: "Pourquoi Vegeta a-t-il tué Cell ?",
        tools: false,
        ...extra,
      }),
      ownerId: "private-owner",
      streamId: "s12345678",
    },
    signal,
  ))
    events.push(event);
  return events;
}

describe("public chat Jev judgments", () => {
  test("native batch remains within the typed-question limit", async () => {
    let count = 0;
    let limit = 0;
    const port = createChatJevPort(async (request) => {
      count = request.passages.length;
      limit = request.limit!;
      return { passages: request.passages.map((passage) => ({ passage })) };
    });
    await port.rerank(
      {
        query: "Cell",
        limit: 32,
        passages: Array.from({ length: 32 }, (_, index) => ({
          id: String(index),
          text: "Public evidence",
          source_kind: "manga" as const,
          public: true,
        })),
      },
      new AbortController().signal,
    );
    expect(count).toBe(21);
    expect(limit).toBe(21);
  });

  test("a refutation remains the numbered cited source after an irrelevant passage is excluded", async () => {
    const irrelevant = hit(1, "Bulma repairs a machine.");
    const refutation = hit(2, "Gohan kills Cell; Vegeta does not.");
    const b = backend();
    const engine = createChatEngine({
      rag: rag([irrelevant, refutation]).port,
      backends: [b.port],
      home,
      jev: createChatJevPort(async (request) => ({
        passages: [{ passage: request.passages[1]! }],
      })),
    });
    const events = await turn(engine);
    expect(events.find((e) => e.type === "sources")?.data).toMatchObject({
      citations: [{ n: 1, title: "Source 2" }],
    });
    expect(events.find((e) => e.type === "done")?.data).toMatchObject({
      citations: [{ n: 1, title: "Source 2" }],
    });
    expect(b.calls[0]!.at(-1)!.content).not.toContain(irrelevant.content);
    expect(b.calls[0]!.at(-1)!.content).toContain(refutation.content);
  });

  test("visibility proof cannot authorize text changed between retrieval reads", async () => {
    let called = false;
    const original = hit(1, "private content before update");
    const publicUpdate = hit(1, "published replacement");
    const b = backend();
    const engine = createChatEngine({
      rag: rag([original], [publicUpdate]).port,
      backends: [b.port],
      home,
      jev: createChatJevPort(async () => {
        called = true;
        return { passages: [] };
      }),
    });
    const events = await turn(engine);
    expect(called).toBe(false);
    expect(events.find((e) => e.type === "tool")?.data).toMatchObject({
      name: "jev:skipped-private",
    });
    expect(b.calls[0]!.at(-1)!.content).toContain(original.content);
  });

  test("native port excludes private and Fandom passages and preserves original evidence", async () => {
    let sent: ChatJevRequest | undefined;
    const port = createChatJevPort(async (request) => {
      sent = request;
      return {
        passages: [
          { passage: { ...request.passages[0]!, text: "fabricated" } },
          { passage: request.passages[0]! },
        ],
      };
    });
    const result = await port.rerank(
      {
        query: "Cell",
        passages: [
          { id: "public", text: "Gohan defeated Cell.", source_kind: "manga", public: true },
          { id: "private", text: "private memory", source_kind: "wiki", public: false },
          {
            id: "fandom",
            text: "unsupported",
            source_kind: "wiki",
            public: true,
            url: "https://dragonball.fandom.com/wiki/Cell",
          },
        ],
      },
      new AbortController().signal,
    );
    expect(sent!.passages.map((p) => p.id)).toEqual(["public"]);
    expect(result.passages.map((p) => p.passage.text)).toEqual(["Gohan defeated Cell."]);
  });

  test("only proven public VFS passages and current question reach Jev, refutations stay cited", async () => {
    const publicHit = hit(1, "Gohan kills Cell; Vegeta does not.");
    const privateHit = hit(2, "private corpus record");
    const homeHit = hit(3, "private home record", "home");
    const conversationHit = hit(4, "private conversation record", "conversations");
    const source = rag(
      [publicHit, privateHit, homeHit, conversationHit],
      [publicHit, homeHit, conversationHit],
    );
    const calls: ChatJevRequest[] = [];
    const b = backend();
    const engine = createChatEngine({
      rag: source.port,
      backends: [b.port],
      home,
      ocr: {
        recognize: async () => ({ text: "private OCR", engine: "fixture", regions: 1, ms: 1 }),
      },
      jev: createChatJevPort(async (request) => {
        calls.push(request);
        return { passages: request.passages.map((passage) => ({ passage })) };
      }),
    });
    const events = await turn(engine, {
      history: [{ role: "user", content: "private history" }],
      attachments: [{ mediaType: "image/png", data: "AA==", name: "private attachment" }],
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.query).toBe("Pourquoi Vegeta a-t-il tué Cell ?");
    expect(calls[0]!.passages.map((p) => p.text)).toEqual([publicHit.content]);
    expect(JSON.stringify(calls)).not.toContain("private");
    expect(source.calls[1]!.publicOnly).toBe(true);
    expect(events.find((e) => e.type === "sources")?.data).toMatchObject({
      citations: expect.arrayContaining([expect.objectContaining({ title: "Source 1" })]),
    });
    expect(b.calls[0]!.at(-1)!.content).toContain(publicHit.content);
  });

  test("configured provider failure sanitizes tool and refuses unjudged public corpus", async () => {
    const b = backend();
    const source = rag([hit(1, "Public evidence")]);
    const engine = createChatEngine({
      rag: source.port,
      backends: [b.port],
      home,
      jev: createChatJevPort(async () => {
        throw new Error("credential-and-provider-body");
      }),
    });
    const events = await turn(engine);
    expect(JSON.stringify(events)).not.toContain("credential-and-provider-body");
    expect(events.find((e) => e.type === "tool")?.data).toMatchObject({
      name: "jev:rerank",
      ok: false,
      error: "Jev source judgment unavailable",
    });
    expect(events.find((e) => e.type === "delta")?.data).toEqual({ text: NO_SOURCE_ANSWER });
    expect(b.calls).toHaveLength(0);
  });

  test("noneligible private passages stay local when public judgment fails", async () => {
    const hits = [
      { id: "public", text: "public", source_kind: "wiki" as const, public: true },
      { id: "private", text: "local", source_kind: "wiki" as const, public: false },
    ];
    const result = await judgePublicChatHits(
      "Question",
      hits,
      (p) => p,
      createChatJevPort(async () => {
        throw new Error("failure");
      }),
      new AbortController().signal,
    );
    expect(result.hits).toEqual([hits[1]!]);
    expect(result.tool.ok).toBe(false);
  });

  test("absence of public evidence skips the native worker instead of transmitting unknown data", async () => {
    let called = false;
    const hits = [{ id: "unknown", text: "legacy", source_kind: "wiki" as const, public: false }];
    const result = await judgePublicChatHits(
      "Question",
      hits,
      (p) => p,
      createChatJevPort(async () => {
        called = true;
        throw new Error();
      }),
      new AbortController().signal,
    );
    expect(called).toBe(false);
    expect(result.hits).toEqual(hits);
    expect(result.tool.name).toBe("jev:skipped-private");
  });

  test("abort reaches native owner and stops generation and storage", async () => {
    const controller = new AbortController();
    const b = backend();
    let received: AbortSignal | undefined;
    const engine = createChatEngine({
      rag: rag([hit(1, "Public")]).port,
      backends: [b.port],
      home,
      jev: createChatJevPort(async (_request, options) => {
        received = options.signal;
        controller.abort();
        options.signal.throwIfAborted();
        return { passages: [] };
      }),
    });
    const events = await turn(engine, {}, controller.signal);
    expect(received).toBe(controller.signal);
    expect(b.calls).toHaveLength(0);
    expect(events.at(-1)?.data).toMatchObject({ finishReason: "aborted", stored: false });
  });
});
