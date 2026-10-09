// SPDX-License-Identifier: Apache-2.0
import { afterEach, expect, test } from "bun:test";
import { generateText, streamText } from "ai";
import { resolveAiConfig, resolveDirectChat } from "../../src/ai/config";
import { createShenronProvider } from "../../src/ai/provider";
import { createOpenAiChat } from "../../src/aphrody/compute";

const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true);
});
const key = "test-upstream-credential";
const model = "gemma4-e2b-bnb-4bit";

function upstream(handler: (request: Request) => Promise<Response>) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
  servers.push(server);
  return {
    APHRODY_AI_CHAT_BASE_URL: `http://127.0.0.1:${server.port}/v1`,
    APHRODY_AI_CHAT_MODEL: model,
    APHRODY_AI_CHAT_API_KEY: key,
  };
}

test("site/bot direct adapter sends only its configured upstream credential over native HTTP", async () => {
  const env = upstream(async (request) => {
    expect(new URL(request.url).pathname).toBe("/v1/chat/completions");
    expect(request.headers.get("authorization")).toBe(`Bearer ${key}`);
    const input = (await request.json()) as { model: string; stream: boolean };
    expect(input).toMatchObject({ model, stream: false });
    return Response.json({ model, choices: [{ message: { role: "assistant", content: "龍" } }] });
  });
  const endpoint = resolveDirectChat(env);
  if (!endpoint.ok || !endpoint.value) throw new Error("direct chat not configured");
  const chat = createOpenAiChat(endpoint.value);
  expect(await chat([{ role: "user", content: "龍" }])).toEqual({ answer: "龍", model });
});

test("SDK provider generates and streams vLLM-compatible replies through the configured native transport", async () => {
  const env = upstream(async (request) => {
    expect(request.headers.get("authorization")).toBe(`Bearer ${key}`);
    const input = (await request.json()) as { model: string; stream?: boolean };
    expect(input.model).toBe(model);
    if (!input.stream)
      return Response.json({
        id: "chat-one",
        object: "chat.completion",
        created: 1,
        model,
        choices: [
          { index: 0, message: { role: "assistant", content: "龍" }, finish_reason: "stop" },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    const chunks = [
      {
        id: "chat-stream",
        model,
        choices: [{ index: 0, delta: { role: "assistant", content: "龍" }, finish_reason: null }],
      },
      { id: "chat-stream", model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    ];
    return new Response(
      chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n",
      {
        headers: { "content-type": "text/event-stream" },
      },
    );
  });
  const cfg = resolveAiConfig(env);
  if (!cfg.ok) throw new Error("AI configuration invalid");
  const provider = createShenronProvider(cfg.config, { compute: null });
  expect(
    (await generateText({ model: provider.languageModel("chat"), prompt: "龍", maxRetries: 0 }))
      .text,
  ).toBe("龍");
  const result = streamText({ model: provider.languageModel("chat"), prompt: "龍", maxRetries: 0 });
  let text = "";
  for await (const part of result.textStream) text += part;
  expect(text).toBe("龍");
});
