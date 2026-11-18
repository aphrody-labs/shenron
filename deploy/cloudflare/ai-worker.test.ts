// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { handleAiWorker, type AiWorkerEnv } from "./ai-worker";

describe("shenron-ai worker", () => {
  const env: AiWorkerEnv = {
    AI: {
      async run(model, input) {
        if (model.includes("e5") || model.includes("bge") || model.includes("embed")) {
          const texts = (input.text as string[]) ?? [];
          return { data: texts.map(() => new Array(384).fill(0.05)) };
        }
        return { choices: [{ message: { content: "Reponse canonique de Shenron." } }] };
      },
    },
    RAG_INDEX: {
      async query(_vector, options) {
        return {
          matches: [
            {
              id: "doc-1",
              score: 0.94,
              metadata: { title: "Namek", source: "databook-1" },
            },
          ].slice(0, options?.topK ?? 5),
        };
      },
      async upsert(vectors) {
        return { mutationId: `mut-${vectors.length}` };
      },
    },
    SHENRON_AI_HTTP_TOKEN: "secret-token",
  };

  test("health and mcp card are public, inference routes require bearer token", async () => {
    const health = await handleAiWorker(new Request("https://ai.dragonballfr.com/health"), env);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({
      status: "ok",
      service: "shenron-ai",
      vectorize: true,
    });

    const card = await handleAiWorker(
      new Request("https://ai.dragonballfr.com/.well-known/mcp.json"),
      env,
    );
    expect(card.status).toBe(200);
    expect((await card.json()) as { transport: { url: string } }).toMatchObject({
      transport: { url: "https://ai.dragonballfr.com/mcp" },
    });

    const denied = await handleAiWorker(
      new Request("https://ai.dragonballfr.com/v1/embeddings", {
        method: "POST",
        body: JSON.stringify({ input: "goku" }),
      }),
      env,
    );
    expect(denied.status).toBe(401);
  });

  test("embeddings, chat completions, rag search and MCP tools run through Workers AI + Vectorize", async () => {
    const headers = {
      Authorization: "Bearer secret-token",
      "Content-Type": "application/json",
    };
    const embed = await handleAiWorker(
      new Request("https://ai.dragonballfr.com/v1/embeddings", {
        method: "POST",
        headers,
        body: JSON.stringify({ input: "Kamehameha" }),
      }),
      env,
    );
    expect(embed.status).toBe(200);
    const embedJson = (await embed.json()) as { data: Array<{ embedding: number[] }> };
    expect(embedJson.data[0]?.embedding).toHaveLength(384);

    const rag = await handleAiWorker(
      new Request("https://ai.dragonballfr.com/api/v1/shenron/rag/search", {
        method: "POST",
        headers,
        body: JSON.stringify({ query: "Namek", limit: 3 }),
      }),
      env,
    );
    expect(rag.status).toBe(200);
    expect(await rag.json()).toMatchObject({
      q: "Namek",
      mode: "hybrid",
      results: [{ id: "doc-1", score: 0.94, title: "Namek" }],
    });

    const wireHealth = await handleAiWorker(
      new Request("https://ai.dragonballfr.com/api/v1/shenron/health"),
      env,
    );
    expect(wireHealth.status).toBe(200);
    expect(await wireHealth.json()).toMatchObject({
      status: "ok",
      capabilities: { rag: true, llm: true, ocr: false },
    });

    const wireChat = await handleAiWorker(
      new Request("https://ai.dragonballfr.com/api/v1/shenron/llm/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: [{ role: "user", content: "Bonjour" }],
          model: "gemini-web/flash",
        }),
      }),
      env,
    );
    expect(wireChat.status).toBe(200);
    expect(await wireChat.json()).toMatchObject({ answer: "Reponse canonique de Shenron." });

    const wireEmbed = await handleAiWorker(
      new Request("https://ai.dragonballfr.com/api/v1/shenron/embed", {
        method: "POST",
        headers,
        body: JSON.stringify({ texts: ["Goku"], kind: "query" }),
      }),
      env,
    );
    expect(wireEmbed.status).toBe(200);
    expect(((await wireEmbed.json()) as { vectors: number[][] }).vectors[0]).toHaveLength(384);

    const wireGetSearch = await handleAiWorker(
      new Request("https://ai.dragonballfr.com/api/v1/shenron/rag/search?q=Namek&limit=2", {
        headers,
      }),
      env,
    );
    expect(wireGetSearch.status).toBe(200);
    expect(await wireGetSearch.json()).toMatchObject({ q: "Namek", mode: "hybrid" });

    const chat = await handleAiWorker(
      new Request("https://ai.dragonballfr.com/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({ messages: [{ role: "user", content: "Bonjour" }] }),
      }),
      env,
    );
    expect(chat.status).toBe(200);
    expect(await chat.json()).toMatchObject({
      choices: [{ message: { content: "Reponse canonique de Shenron." } }],
    });
  });
});
