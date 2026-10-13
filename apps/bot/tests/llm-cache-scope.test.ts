import { afterEach, beforeEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { generateLlmAnswer } from "../src/lib/llm";
import { AI_ENV } from "@aphrody/shenron-pipeline/ai/config";

// No address default since the AI env contract (aphrody-infra local-ai.json): the
// tests pin the aphrody-ai-http origin through its canonical name.
const environmentNames = [
  "APHRODY_SHENRON_INFERENCE",
  "RAG_BACKEND",
  ...[AI_ENV.httpUrl, AI_ENV.httpToken, AI_ENV.chatBaseUrl, AI_ENV.chatModel].flatMap((setting) =>
    Array.of<string>(setting.canonical).concat(setting.aliases.map((alias) => alias.name)),
  ),
];
const savedEnvironment = Object.fromEntries(environmentNames.map((key) => [key, process.env[key]]));
beforeEach(() => {
  // These fixtures exercise the compute facade, never the workstation's direct chat server.
  for (const key of environmentNames) delete process.env[key];
  process.env.APHRODY_SHENRON_INFERENCE = "http";
  process.env.APHRODY_AI_HTTP_URL = "http://127.0.0.1:8789";
  process.env.APHRODY_AI_HTTP_TOKEN = "fixture-token-".padEnd(32, "x");
  process.env.APHRODY_AI_CHAT_MODEL = "gemini-web/flash";
});
afterEach(() => {
  for (const [key, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const savedFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = savedFetch;
});

test("the same question only reuses a cached answer with the same evidence and model", async () => {
  process.env.RAG_BACKEND = "aphrody";
  const answers = new Map<string, string>();
  const scopes: string[] = [];
  const cache = {
    getSemanticCache: async (query: string, persona: string, scope: string) => {
      scopes.push(scope);
      const answer = answers.get(`${persona}:${scope}:${query}`);
      return answer ? { answer, originalQuery: query, similarity: 1 } : null;
    },
    setSemanticCache: async (query: string, answer: string, persona: string, scope: string) => {
      answers.set(`${persona}:${scope}:${query}`, answer);
    },
  };
  let modelCalls = 0;
  globalThis.fetch = (async () =>
    Response.json({
      answer: `Réponse ${++modelCalls}`,
      model: "fixture",
    })) as unknown as typeof fetch;
  const db = new Database(":memory:");
  const hit = (content: string) => ({
    rowid: 1,
    kind: "planet",
    title: "Namek",
    url: "/wiki/planetes/namek",
    snippet: content,
    content,
    score: 1,
  });
  try {
    const first = await generateLlmAnswer(
      db,
      "Où vivent les Nameks ?",
      [hit("Ils vivent sur Namek.")],
      "whis",
      { cache },
    );
    const changedEvidence = await generateLlmAnswer(
      db,
      "Où vivent les Nameks ?",
      [hit("Ils vivent sur Terre.")],
      "whis",
      { cache },
    );
    const repeat = await generateLlmAnswer(
      db,
      "Où vivent les Nameks ?",
      [hit("Ils vivent sur Namek.")],
      "whis",
      { cache },
    );
    process.env.APHRODY_AI_CHAT_MODEL = "gemini-web/pro";
    const changedModel = await generateLlmAnswer(
      db,
      "Où vivent les Nameks ?",
      [hit("Ils vivent sur Namek.")],
      "whis",
      { cache },
    );
    expect([first, changedEvidence, repeat, changedModel]).toEqual([
      "Réponse 1",
      "Réponse 2",
      "Réponse 1",
      "Réponse 3",
    ]);
    expect(modelCalls).toBe(3);
    expect(scopes[0]).toBe(scopes[2]);
    expect(scopes[0]).not.toBe(scopes[1]);
    expect(scopes[0]).not.toBe(scopes[3]);
  } finally {
    db.close();
  }
});

test("B7: the cache scope binds the model, PROMPT_VERSION and the evidence", async () => {
  const { semanticCacheScope } = await import("@aphrody/shenron-pipeline/ai/ports");
  const { PROMPT_VERSION } = await import("@aphrody/shenron-pipeline/ai/prompts");
  process.env.RAG_BACKEND = "aphrody";
  const scopes: string[] = [];
  const cache = {
    getSemanticCache: async (_query: string, _persona: string, scope: string) => {
      scopes.push(scope);
      return null;
    },
    setSemanticCache: async () => {},
  };
  globalThis.fetch = (async () =>
    Response.json({ answer: "Réponse", model: "fixture" })) as unknown as typeof fetch;
  const db = new Database(":memory:");
  try {
    await generateLlmAnswer(
      db,
      "Où vivent les Nameks ?",
      [
        {
          rowid: 1,
          kind: "planet",
          title: "Namek",
          url: "/wiki/planetes/namek",
          snippet: "Ils vivent sur Namek.",
          content: "Ils vivent sur Namek.",
          score: 1,
        },
      ],
      "whis",
      { cache },
    );
    const context = "[1] Namek : Ils vivent sur Namek.";
    expect(scopes).toEqual([await semanticCacheScope("gemini-web/flash", context, PROMPT_VERSION)]);
    expect(scopes[0]).not.toBe(
      await semanticCacheScope("gemini-web/flash", context, `${PROMPT_VERSION}-next`),
    );
  } finally {
    db.close();
  }
});
