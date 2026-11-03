// SPDX-License-Identifier: Apache-2.0
import { beforeEach, expect, mock, test } from "bun:test";
let received: Record<string, unknown> | null = null;
let calls = 0;
let result = {
  answer: "Namek has documented inhabitants. [1]",
  fallback: false,
  refusal: false,
  citations: [{ n: 1, title: "Manga", url: "/wiki/manga" }],
};
mock.module("server-only", () => ({}));
mock.module("@aphrody/shenron-pipeline/ai/config", () => ({
  AiConfigError: class extends Error {},
  resolveDirectChat: () => ({
    ok: true,
    value: { model: "local-model", baseUrl: new URL("http://localhost:9000/v1") },
  }),
  resolveChatModel: () => "fallback-model",
  chatTimeoutMs: () => 5000,
}));
mock.module("@aphrody/shenron-pipeline/ai/provider", () => ({
  createShenronProvider: () => ({ languageModel: () => ({ modelId: "local-model" }) }),
}));
mock.module("@aphrody/shenron-pipeline/aphrody/compute", () => ({
  AphrodyComputeClient: class {
    chat = async () => "";
  },
  aphrodyComputeFromChat: () => null,
}));
mock.module("@aphrody/shenron-pipeline/ai/generate", () => ({
  generateGroundedAnswer: async (input: Record<string, unknown>) => {
    calls++;
    received = input;
    return result;
  },
}));
const { generateWikiDraft } = await import("../src/lib/wiki-ai-generation");
const input = {
  query: "Namek",
  lang: "en" as const,
  signal: new AbortController().signal,
  sources: [
    {
      title: "Manga",
      url: "/wiki/manga",
      snippet: "Documented source passage about Namek.",
      kind: "manga",
      score: 1,
    },
  ],
};
beforeEach(() => {
  calls = 0;
  received = null;
  result = {
    answer: "Namek has documented inhabitants. [1]",
    fallback: false,
    refusal: false,
    citations: [{ n: 1, title: "Manga", url: "/wiki/manga" }],
  };
});

test("grounded generation uses strict citations, explicit language and bounded context", async () => {
  const markdown = await generateWikiDraft(input);
  expect(received).toMatchObject({
    strict: true,
    lang: "en",
    maxOutputTokens: 1800,
    hits: [{ id: "1", content: input.sources[0].snippet }],
  });
  expect(received?.abortSignal).toBeInstanceOf(AbortSignal);
  expect(markdown).toContain("[1] [Manga](</wiki/manga>)");
});
test("no evidence or no verified citation cannot yield generated prose", async () => {
  expect(await generateWikiDraft({ ...input, sources: [] })).toBeNull();
  expect(calls).toBe(0);
  result = { ...result, citations: [], refusal: true };
  expect(await generateWikiDraft(input)).toBeNull();
});
test("model failure propagates as unavailable rather than a successful draft", async () => {
  result = { ...result, fallback: true };
  expect(generateWikiDraft(input)).rejects.toThrow("unavailable");
});
