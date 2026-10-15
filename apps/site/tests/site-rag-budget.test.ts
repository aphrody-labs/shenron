// SPDX-License-Identifier: Apache-2.0
import { expect, mock, test } from "bun:test";
import { PUBLIC_RAG_CHAT_MAX_OUTPUT_TOKENS } from "@aphrody/shenron-config/chat-model";
import { AphrodyComputeClient } from "@aphrody/shenron-pipeline/aphrody/compute";
mock.module("server-only", () => ({}));
const { chatAphrodyRag } = await import("../src/lib/site-rag");

test("the site sends the same bounded generation request after real HTTP retrieval", async () => {
  const savedUrl = process.env.APHRODY_AI_CHAT_BASE_URL;
  const savedModel = process.env.APHRODY_AI_CHAT_MODEL;
  let budget: unknown;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      if (new URL(request.url).pathname === "/api/v1/shenron/rag/search")
        return Response.json({
          mode: "hybrid",
          results: [
            {
              sourceId: "manga",
              title: "Goku",
              url: "https://dragonballfr.com/wiki/manga/1",
              snippet: "Goku est un Saiyan.",
              score: 1,
              kind: "manga",
            },
          ],
        });
      const body = (await request.json()) as { max_tokens?: number };
      budget = body.max_tokens;
      return Response.json({
        id: "bounded",
        object: "chat.completion",
        created: 1,
        model: "fixture",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Goku est un Saiyan [1]." },
            finish_reason: "stop",
          },
        ],
      });
    },
  });
  try {
    process.env.APHRODY_AI_CHAT_BASE_URL = new URL("/v1", server.url).href;
    process.env.APHRODY_AI_CHAT_MODEL = "fixture";
    const client = new AphrodyComputeClient({ baseUrl: server.url.origin, token: "fixture" });
    const result = await chatAphrodyRag("Qui est Goku ?", "whis", {}, client);
    expect(budget).toBe(PUBLIC_RAG_CHAT_MAX_OUTPUT_TOKENS);
    expect(result.answer).toContain("Goku");
    expect(result.hits).toHaveLength(1);
  } finally {
    if (savedUrl === undefined) delete process.env.APHRODY_AI_CHAT_BASE_URL;
    else process.env.APHRODY_AI_CHAT_BASE_URL = savedUrl;
    if (savedModel === undefined) delete process.env.APHRODY_AI_CHAT_MODEL;
    else process.env.APHRODY_AI_CHAT_MODEL = savedModel;
    await server.stop(true);
  }
});
