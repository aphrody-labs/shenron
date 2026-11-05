// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "bun:test";
import { AphrodyComputeClient, createOpenAiChat, directChatFromEnv } from "./compute";

// B18 (docs/architecture/STACK.md §2.2): the embed path now checks 384-dimensional vectors.
const E5_VECTOR = Array.from({ length: 384 }, (_, i) => i / 384);
// No address default any more (the resolver has none): every client gets an explicit loopback base.
const TEST_BASE = "http://127.0.0.1:8789";

describe("AphrodyComputeClient", () => {
  it("rejects an unconfigured or nonloopback compute boundary", () => {
    expect(() => new AphrodyComputeClient({ token: "", baseUrl: "http://127.0.0.1:8789" })).toThrow(
      "token",
    );
    expect(
      () => new AphrodyComputeClient({ token: "fixture", baseUrl: "https://aphrody.com" }),
    ).toThrow("loopback");
  });

  it("sends authenticated chat and validates the answer", async () => {
    let path = "";
    let authorization = "";
    let payload: unknown;
    const client = new AphrodyComputeClient({
      baseUrl: TEST_BASE,
      token: "fixture",
      fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
        path = new URL(String(input)).pathname;
        authorization = new Headers(init?.headers).get("authorization") ?? "";
        payload = JSON.parse(String(init?.body));
        return Response.json({ answer: "réponse sourcée", model: "fixture-model" });
      }) as unknown as typeof fetch,
    });
    expect(await client.chat([{ role: "user", content: "Namek ?" }])).toEqual({
      answer: "réponse sourcée",
      model: "fixture-model",
    });
    expect(path).toBe("/api/v1/shenron/llm/chat");
    expect(authorization).toBe("Bearer fixture");
    expect(payload).toEqual({ messages: [{ role: "user", content: "Namek ?" }] });
  });

  it("selects Gemini Web for text OCR while keeping page geometry explicit", async () => {
    let payload: Record<string, unknown> | undefined;
    const client = new AphrodyComputeClient({
      baseUrl: TEST_BASE,
      token: "fixture",
      fetcher: (async (_input, init) => {
        payload = JSON.parse(String(init?.body));
        return Response.json({
          text: "悟空",
          language: "ja",
          textless: false,
          suspect: false,
          model: "gemini-web/flash",
        });
      }) as typeof fetch,
    });
    expect((await client.ocr("fixture-base64", "ja")).text).toBe("悟空");
    expect(payload).toEqual({
      image_base64: "fixture-base64",
      engine: "gemini-web",
      language: "ja",
    });
  });

  it("rejects invalid embedding dimensions and nonfinite values", async () => {
    const client = new AphrodyComputeClient({
      baseUrl: TEST_BASE,
      token: "fixture",
      fetcher: (async () => Response.json({ vectors: [[1, null]] })) as unknown as typeof fetch,
    });
    await expect(client.embed(["Goku"])).rejects.toThrow("invalid embedding vectors");
  });

  it("uses passage kind for source embeddings", async () => {
    const client = new AphrodyComputeClient({
      baseUrl: TEST_BASE,
      token: "fixture",
      fetcher: (async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toEqual({ texts: ["source"], kind: "passage" });
        return Response.json({ vectors: [E5_VECTOR] });
      }) as unknown as typeof fetch,
    });
    expect(await client.embed(["source"], "passage")).toEqual([E5_VECTOR]);
  });
});

describe("createOpenAiChat", () => {
  it("posts an OpenAI chat completion to the direct server", async () => {
    let url = "";
    let payload: { model?: string; stream?: boolean } = {};
    const chat = createOpenAiChat(
      { baseUrl: new URL("http://127.0.0.1:8798/v1"), model: "gemma4-e2b" },
      {
        fetcher: (async (input: RequestInfo | URL, init?: RequestInit) => {
          url = String(input);
          payload = JSON.parse(String(init?.body));
          return Response.json({
            model: "gemma4-e2b",
            choices: [{ message: { role: "assistant", content: " Kamehameha " } }],
          });
        }) as unknown as typeof fetch,
      },
    );
    expect(await chat([{ role: "user", content: "Goku ?" }])).toEqual({
      answer: "Kamehameha",
      model: "gemma4-e2b",
    });
    expect(url).toBe("http://127.0.0.1:8798/v1/chat/completions");
    expect(payload.model).toBe("gemma4-e2b");
    expect(payload.stream).toBe(false);
  });

  it("rejects an HTTP error and an empty answer", async () => {
    const base = { baseUrl: new URL("http://127.0.0.1:8798/v1"), model: "gemma4-e2b" };
    const failing = createOpenAiChat(base, {
      fetcher: (async () => new Response("down", { status: 503 })) as unknown as typeof fetch,
    });
    await expect(failing([{ role: "user", content: "?" }])).rejects.toThrow("HTTP 503");
    const empty = createOpenAiChat(base, {
      fetcher: (async () =>
        Response.json({ choices: [{ message: { content: "" } }] })) as unknown as typeof fetch,
    });
    await expect(empty([{ role: "user", content: "?" }])).rejects.toThrow("empty LLM answer");
  });

  it("is built from the environment only when a base URL is declared", () => {
    expect(directChatFromEnv({})).toBeNull();
    expect(
      directChatFromEnv({ APHRODY_AI_CHAT_BASE_URL: "http://127.0.0.1:8798/v1" }),
    ).toBeFunction();
    expect(() =>
      directChatFromEnv({ APHRODY_AI_CHAT_BASE_URL: "https://example.com/v1" }),
    ).toThrow();
  });
});
