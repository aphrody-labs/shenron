// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { generateGroundedAnswer, type GroundedHit } from "../../src/ai/generate";
import type {
  ChunkContentPort,
  ConcurrencyPort,
  HistoryPort,
  SemanticCachePort,
} from "../../src/ai/ports";
import { semanticCacheScope } from "../../src/ai/ports";
import { INJECTION_GUARD, PERSONAS, PROMPT_VERSION } from "../../src/ai/prompts";

function result(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: undefined },
    usage: {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    },
    warnings: [],
  };
}

function okModel(text = "Oh oh, Goku est un Saiyan.") {
  return new MockLanguageModelV4({
    modelId: "gemini-web/flash",
    doGenerate: async () => result(text),
  });
}

function failingModel() {
  return new MockLanguageModelV4({
    modelId: "gemini-web/flash",
    doGenerate: async () => {
      throw new Error("backend down");
    },
  });
}

function memoryCache() {
  const store = new Map<string, string>();
  const port: SemanticCachePort = {
    async lookup(scope, q) {
      return store.get(`${scope}|${q}`) ?? null;
    },
    async store(scope, q, a) {
      store.set(`${scope}|${q}`, a);
    },
  };
  return { store, port };
}

const HITS: GroundedHit[] = [
  { id: "1", title: "Son Goku", url: "/wiki/personnages/son-goku" },
  { id: "2", title: "Vegeta", url: "/wiki/personnages/vegeta", content: "Prince   des\nSaiyans." },
];

const chunks: ChunkContentPort = {
  async contentFor(ids) {
    return new Map(ids.includes("1") ? [["1", "Héros de Dragon Ball."]] : []);
  },
};

describe("generateGroundedAnswer", () => {
  test("grounded prompt: instructions with guard, context in the user message", async () => {
    const model = okModel();
    const out = await generateGroundedAnswer({
      model,
      persona: "whis",
      question: "Qui est Goku ?",
      hits: HITS,
      chunks,
    });
    expect(out).toMatchObject({
      answer: "Oh oh, Goku est un Saiyan.",
      fallback: false,
      cached: false,
      refusal: false,
      promptVersion: PROMPT_VERSION,
    });
    const prompt = model.doGenerateCalls[0]?.prompt ?? [];
    expect(prompt[0]?.role).toBe("system");
    expect(String(prompt[0]?.content)).toContain(INJECTION_GUARD);
    expect(prompt[1]).toMatchObject({
      role: "user",
      content: [
        {
          type: "text",
          text: "Contexte (faits Dragon Ball, à reformuler) :\n<sources>\n[1] Son Goku : Héros de Dragon Ball.\n[2] Vegeta : Prince des Saiyans.\n</sources>\n\nMessage de l'utilisateur : Qui est Goku ?",
        },
      ],
    });
  });

  test("source identity stays in verified citations without consuming model context", async () => {
    const model = okModel("Goku est le héros de Dragon Ball [1].");
    const out = await generateGroundedAnswer({
      model,
      persona: "whis",
      strict: true,
      question: "Qui est Goku ?",
      hits: [{ ...HITS[0]!, sourceId: "internal-index-id" }],
      chunks,
    });
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).not.toContain("internal-index-id");
    expect(out.citations[0]?.sourceId).toBe("internal-index-id");
    expect(out.citations[0]?.url).toBe(HITS[0]!.url);
  });

  test("the fallback is never cached; a success is cached then served", async () => {
    const cache = memoryCache();
    const failed = await generateGroundedAnswer({
      model: failingModel(),
      persona: "beerus",
      question: "Qui est Goku ?",
      hits: HITS,
      chunks,
      cache: cache.port,
    });
    expect(failed).toMatchObject({
      answer: PERSONAS.beerus.fallback,
      fallback: true,
      cached: false,
    });
    expect(cache.store.size).toBe(0);

    const first = await generateGroundedAnswer({
      model: okModel(),
      persona: "beerus",
      question: "Qui est Goku ?",
      hits: HITS,
      chunks,
      cache: cache.port,
    });
    expect(first.cached).toBe(false);
    expect(cache.store.size).toBe(1);
    const replay = okModel("autre");
    const second = await generateGroundedAnswer({
      model: replay,
      persona: "beerus",
      question: "Qui est Goku ?",
      hits: HITS,
      chunks,
      cache: cache.port,
    });
    expect(second).toMatchObject({ answer: "Oh oh, Goku est un Saiyan.", cached: true });
    expect(replay.doGenerateCalls.length).toBe(0);
  });

  test("session turns are never cached and history is used", async () => {
    const cache = memoryCache();
    const appended: unknown[] = [];
    const history: HistoryPort = {
      async load() {
        return [
          { role: "user", content: "avant" },
          { role: "assistant", content: "réponse" },
        ];
      },
      async append(sessionId, turn) {
        appended.push({ sessionId, turn });
      },
    };
    const model = okModel();
    const out = await generateGroundedAnswer({
      model,
      persona: "whis",
      question: "Qui est Goku ?",
      hits: HITS,
      chunks,
      cache: cache.port,
      history,
      sessionId: "salon-1",
    });
    expect(out.cached).toBe(false);
    expect(cache.store.size).toBe(0);
    expect(appended).toEqual([
      { sessionId: "salon-1", turn: { q: "Qui est Goku ?", a: out.answer } },
    ]);
    expect(model.doGenerateCalls[0]?.prompt.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
  });

  test("cache scope changes with PROMPT_VERSION (and model, context)", async () => {
    const a = await semanticCacheScope("gemini-web/flash", "ctx");
    expect(a).toMatch(/^[0-9a-f]{24}$/);
    expect(await semanticCacheScope("gemini-web/flash", "ctx")).toBe(a);
    expect(await semanticCacheScope("gemini-web/flash", "ctx", `${PROMPT_VERSION}-next`)).not.toBe(
      a,
    );
    expect(await semanticCacheScope("gemini-web/pro", "ctx")).not.toBe(a);
    expect(await semanticCacheScope("gemini-web/flash", "ctx2")).not.toBe(a);
  });

  test("a missing chunk content (or a failing port) does not throw", async () => {
    const failing: ChunkContentPort = {
      async contentFor() {
        throw new Error("sqlite gone");
      },
    };
    const errors: string[] = [];
    const out = await generateGroundedAnswer({
      model: okModel(),
      persona: "whis",
      question: "Qui est Goku ?",
      hits: [{ id: "404", title: "Inconnu", url: "/x" }, ...HITS],
      chunks: failing,
      onError: (stage) => errors.push(stage),
    });
    expect(out.fallback).toBe(false);
    expect(errors).toEqual(["chunks"]);
    const empty: ChunkContentPort = { contentFor: async () => new Map() };
    const out2 = await generateGroundedAnswer({
      model: okModel(),
      persona: "whis",
      question: "Qui ?",
      hits: [{ id: "404", title: "Inconnu", url: "/x" }],
      chunks: empty,
    });
    expect(out2.fallback).toBe(false);
  });

  test("busy concurrency -> fallback, never cached", async () => {
    const cache = memoryCache();
    const busy: ConcurrencyPort = { run: async () => "busy" };
    const model = okModel();
    const out = await generateGroundedAnswer({
      model,
      persona: "kaio",
      question: "Qui est Goku ?",
      hits: HITS,
      chunks,
      cache: cache.port,
      concurrency: busy,
    });
    expect(out).toMatchObject({ answer: PERSONAS.kaio.fallback, fallback: true });
    expect(model.doGenerateCalls.length).toBe(0);
    expect(cache.store.size).toBe(0);
  });

  test("chitchat: no context, chitchat rule", async () => {
    const model = okModel("Oh oh, bonjour !");
    await generateGroundedAnswer({
      model,
      persona: "whis",
      question: "Bonjour",
      hits: HITS,
      chunks,
    });
    const prompt = model.doGenerateCalls[0]?.prompt ?? [];
    expect(String(prompt[0]?.content)).toContain("Simple bavardage");
    expect(prompt[1]).toMatchObject({ role: "user", content: [{ type: "text", text: "Bonjour" }] });
  });
});

describe("generateGroundedAnswer — agent home and memories", () => {
  test("home persona and system note precede the injection guard; memories reach the user turn", async () => {
    let prompt: unknown[] = [];
    const model = new MockLanguageModelV4({
      modelId: "gemma4-e2b",
      doGenerate: async (options) => {
        prompt = options.prompt;
        return result("Bonjour !");
      },
    });
    await generateGroundedAnswer({
      model,
      persona: "shenron",
      question: "bonjour",
      hits: [],
      chunks: { contentFor: async () => new Map() },
      homePersona: { tone: "chaleureux" },
      systemNote: 'Agent home of the user: Address the user as "Kakarot".',
      memories: "Souvenirs : - j'adore Piccolo",
    });
    const [system, user] = prompt as { role: string; content: unknown }[];
    const instructions = String(system?.content);
    expect(instructions).toContain("chaleureux");
    expect(instructions).toContain('"Kakarot"');
    expect(instructions.endsWith(INJECTION_GUARD)).toBe(true);
    expect(JSON.stringify(user?.content)).toContain("j'adore Piccolo");
  });
});

test("the explicit sourced-answer budget reaches the SDK provider", async () => {
  const model = okModel();
  await generateGroundedAnswer({
    model,
    persona: "whis",
    question: "Qui est Goku ?",
    hits: HITS,
    chunks,
    maxOutputTokens: 160,
  });
  expect(model.doGenerateCalls[0]!.maxOutputTokens).toBe(160);
});
