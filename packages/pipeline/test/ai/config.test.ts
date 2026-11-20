// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AI_ENV,
  AiConfigError,
  aiEnvNames,
  aiServiceHealthUrl,
  assertEmbeddingSpace,
  chatTimeoutMs,
  DEFAULT_AI_TIMEOUTS,
  EmbeddingSpaceMismatchError,
  requireAiHttpToken,
  requireAiHttpUrl,
  requireEmbedBaseUrl,
  requireEmbeddingSpace,
  resolveAiConfig,
  resolveChatModel,
  resolveDirectChat,
  resolveEmbedBaseUrl,
  resolveRerank,
  resolveVisionModel,
  SHENRON_RAG_INDEX,
} from "../../src/ai/config";
import { loopbackBase } from "./helpers";

const TOKEN = "t".repeat(40);
const LOOP = loopbackBase(18789).origin;
const E5_ORIGIN = loopbackBase(18794).origin;
const E5 = `${E5_ORIGIN}/v1`;

function ok(env: Record<string, string>) {
  const r = resolveAiConfig(env);
  if (!r.ok) throw new Error(`unexpected issues: ${JSON.stringify(r.issues)}`);
  return r.config;
}

describe("resolveAiConfig", () => {
  test("empty env: nothing configured, reasons named, no throw", () => {
    const cfg = ok({});
    expect(cfg.compute).toBeNull();
    expect(cfg.embed).toBeNull();
    expect(cfg.e5BaseUrl).toBeNull();
    expect(cfg.rerank).toBeNull();
    expect(cfg.chatModel).toBe("gemini-web/flash");
    expect(cfg.visionModel).toBe("gemini-web/flash");
    expect(cfg.embedSpace).toEqual({ model: SHENRON_RAG_INDEX.model, dimensions: 384 });
    expect(cfg.ragBackend).toBe("local");
    expect(cfg.timeouts).toEqual({ ...DEFAULT_AI_TIMEOUTS });
    const caps = cfg.disabled.map((d) => d.capability).toSorted();
    expect(caps).toEqual(["chat", "compute", "embed", "ocr", "rag"]);
    for (const d of cfg.disabled) expect(d.reason).toContain("SHENRON_AI_HTTP_URL");
  });

  test("canonical compute names: origin form, shenron embed transport", () => {
    const cfg = ok({
      SHENRON_AI_HTTP_URL: `${LOOP}/`,
      SHENRON_AI_HTTP_TOKEN: TOKEN,
      RAG_BACKEND: "shenron",
    });
    expect(cfg.compute?.baseUrl.href).toBe(`${LOOP}/`);
    expect(cfg.compute?.token).toBe(TOKEN);
    expect(cfg.embed).toEqual({ transport: "shenron" });
    expect(cfg.ragBackend).toBe("shenron");
    expect(cfg.disabled).toEqual([]);
  });

  test("legacy compute aliases still work; canonical wins when both are set", () => {
    const legacy = ok({ SHENRON_API_URL: LOOP, SHENRON_API_TOKEN: TOKEN });
    expect(legacy.compute?.baseUrl.origin).toBe(LOOP);
    const other = loopbackBase(18800).origin;
    const both = ok({
      SHENRON_AI_HTTP_URL: other,
      SHENRON_API_URL: LOOP,
      SHENRON_AI_HTTP_TOKEN: TOKEN,
      SHENRON_API_TOKEN: "x".repeat(40),
    });
    expect(both.compute?.baseUrl.origin).toBe(other);
    expect(both.compute?.token).toBe(TOKEN);
  });

  test("non-loopback URL and short token: issues name variables, never values", () => {
    const secret = "short-secret-value";
    const remote = ["http://", "gemini.google.com", ":8789"].join("");
    const r = resolveAiConfig({
      SHENRON_AI_HTTP_URL: remote,
      SHENRON_AI_HTTP_TOKEN: secret,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues.map((i) => i.name).toSorted()).toEqual([
      "SHENRON_AI_HTTP_TOKEN",
      "SHENRON_AI_HTTP_URL",
    ]);
    const serialised = JSON.stringify(r.issues);
    expect(serialised).not.toContain(secret);
    expect(serialised).not.toContain("gemini.google.com");
  });

  test("URL without token is an issue naming the canonical token variable", () => {
    const r = resolveAiConfig({ SHENRON_API_URL: LOOP });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues).toHaveLength(1);
      expect(r.issues[0]).toMatchObject({ name: "SHENRON_AI_HTTP_TOKEN", problem: "missing" });
      expect(r.issues[0]?.hint).toContain("SHENRON_API_TOKEN");
    }
  });

  test("a direct embed URL never selects a transport: Shenron only", () => {
    const cfg = ok({ SHENRON_AI_EMBED_BASE_URL: `${E5}/` });
    expect(cfg.embed).toBeNull();
    expect(cfg.disabled.find((d) => d.capability === "embed")?.reason).toContain(
      "SHENRON_AI_HTTP_URL",
    );
    // An invalid direct URL is ignored, not an issue.
    expect(resolveAiConfig({ SHENRON_AI_EMBED_BASE_URL: E5_ORIGIN }).ok).toBe(true);
    const both = ok({
      SHENRON_AI_HTTP_URL: LOOP,
      SHENRON_AI_HTTP_TOKEN: TOKEN,
      SHENRON_AI_EMBED_BASE_URL: E5,
    });
    expect(both.embed).toEqual({ transport: "shenron" });
    expect(both.e5BaseUrl?.href).toBe(E5);
  });

  test("chat and vision model ids: canonical, aliases in contract order, <= 128 chars", () => {
    expect(ok({ SHENRON_LLM_MODEL: "gemini-web/pro" }).chatModel).toBe("gemini-web/pro");
    expect(ok({ SHENRON_LLM_MODEL: "qwen3" }).chatModel).toBe("qwen3");
    expect(
      ok({ SHENRON_AI_CHAT_MODEL: "gemini-web/flash-lite", SHENRON_LLM_MODEL: "gemini-web/pro" })
        .chatModel,
    ).toBe("gemini-web/flash-lite");
    expect(ok({ SHENRON_LLM_MODEL: "  " }).chatModel).toBe("gemini-web/flash");
    expect(resolveAiConfig({ SHENRON_AI_CHAT_MODEL: "m".repeat(129) }).ok).toBe(false);
    expect(ok({ SHENRON_VISION_MODEL: "qwen3-vl" }).visionModel).toBe("qwen3-vl");
    expect(resolveChatModel({ SHENRON_AI_CHAT_MODEL: "gemini-web/pro" })).toBe("gemini-web/pro");
    expect(resolveVisionModel({})).toBe("gemini-web/flash");
  });

  test("ragBackend only on exact match; EMBED_TIMEOUT_MS", () => {
    expect(ok({ RAG_BACKEND: "Shenron" }).ragBackend).toBe("local");
    expect(ok({ RAG_BACKEND: " shenron" }).ragBackend).toBe("local");
    expect(ok({ EMBED_TIMEOUT_MS: "1500" }).timeouts.embedHot).toBe(1500);
    expect(resolveAiConfig({ EMBED_TIMEOUT_MS: "abc" }).ok).toBe(false);
  });

  test("chat timeout: 125 s for gemini-web/*, 90 s otherwise", () => {
    expect(chatTimeoutMs("gemini-web/flash")).toBe(125_000);
    expect(chatTimeoutMs("qwen3")).toBe(90_000);
    expect(chatTimeoutMs(undefined)).toBe(90_000);
  });
});

describe("embed base URL forms", () => {
  const base = (env: Record<string, string>) => {
    const r = resolveEmbedBaseUrl(env);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.value?.href ?? null;
  };

  test("base form must end with /v1", () => {
    expect(base({ SHENRON_AI_EMBED_BASE_URL: E5 })).toBe(E5);
    expect(base({ SHENRON_EMBED_BASE_URL: `${E5}/` })).toBe(E5);
    const bad = resolveEmbedBaseUrl({ SHENRON_AI_EMBED_BASE_URL: E5_ORIGIN });
    expect(bad.ok).toBe(false);
    if (!bad.ok)
      expect(bad.issues[0]).toMatchObject({
        name: "SHENRON_AI_EMBED_BASE_URL",
        problem: "invalid",
      });
  });

  test("EMBED_URL is an origin: /v1 is appended", () => {
    expect(base({ EMBED_URL: E5_ORIGIN })).toBe(E5);
    expect(base({ EMBED_URL: `${E5_ORIGIN}/` })).toBe(E5);
  });

  test("SHENRON_RAG_EMBED_ENDPOINT is an endpoint: the operation path is removed", () => {
    expect(base({ SHENRON_RAG_EMBED_ENDPOINT: `${E5}/embeddings` })).toBe(E5);
    expect(resolveEmbedBaseUrl({ SHENRON_RAG_EMBED_ENDPOINT: E5 }).ok).toBe(false);
  });

  test("contract order: canonical, then SHENRON_EMBED_BASE_URL, EMBED_URL, SHENRON_RAG_EMBED_ENDPOINT", () => {
    const other = `${loopbackBase(18900).origin}/v1`;
    expect(base({ EMBED_URL: E5_ORIGIN, SHENRON_EMBED_BASE_URL: other })).toBe(other);
    expect(base({ SHENRON_AI_EMBED_BASE_URL: other, EMBED_URL: E5_ORIGIN })).toBe(other);
  });

  test("no default: missing is an error naming the variables", () => {
    expect(base({})).toBeNull();
    expect(() => requireEmbedBaseUrl({})).toThrow(AiConfigError);
    expect(() => requireEmbedBaseUrl({})).toThrow(/SHENRON_AI_EMBED_BASE_URL.*EMBED_URL/);
    expect(aiServiceHealthUrl(new URL(E5)).href).toBe(`${E5_ORIGIN}/health`);
  });
});

describe("shenron-ai-http require helpers", () => {
  test("missing URL or token is an error naming canonical and legacy names", () => {
    expect(() => requireAiHttpUrl({})).toThrow(/SHENRON_AI_HTTP_URL.*SHENRON_API_URL/);
    expect(() => requireAiHttpToken({})).toThrow(/SHENRON_AI_HTTP_TOKEN.*SHENRON_API_TOKEN/);
  });

  test("the URL is reduced to its origin; the token never appears in errors", () => {
    expect(requireAiHttpUrl({ SHENRON_AI_HTTP_URL: `${LOOP}/api/v1/shenron` }).href).toBe(
      `${LOOP}/`,
    );
    expect(requireAiHttpToken({ SHENRON_API_TOKEN: TOKEN })).toBe(TOKEN);
    const remote = ["http://", "gemini.google.com", ":1"].join("");
    try {
      requireAiHttpUrl({ SHENRON_AI_HTTP_URL: remote });
      throw new Error("expected a throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AiConfigError);
      expect(String(error)).not.toContain("gemini.google.com");
    }
  });
});

describe("embedding space (never mix spaces)", () => {
  test("defaults to the contract index", () => {
    expect(requireEmbeddingSpace({})).toEqual({
      model: "Xenova/multilingual-e5-small",
      dimensions: 384,
    });
  });

  test("the same model, with or without its hub namespace, is accepted", () => {
    expect(
      requireEmbeddingSpace({
        SHENRON_AI_EMBED_MODEL: "multilingual-e5-small",
        SHENRON_AI_EMBED_DIMENSIONS: "384",
      }).dimensions,
    ).toBe(384);
    expect(requireEmbeddingSpace({ SHENRON_RAG_EMBED_DIM: "384" }).dimensions).toBe(384);
  });

  test("another dimension or another model is a hard error", () => {
    expect(() => requireEmbeddingSpace({ SHENRON_AI_EMBED_DIMENSIONS: "1024" })).toThrow(
      EmbeddingSpaceMismatchError,
    );
    expect(() => requireEmbeddingSpace({ SHENRON_AI_EMBED_MODEL: "qwen3-embedding-0.6b" })).toThrow(
      EmbeddingSpaceMismatchError,
    );
    expect(() =>
      assertEmbeddingSpace(
        { model: SHENRON_RAG_INDEX.model, dimensions: 384 },
        { model: SHENRON_RAG_INDEX.model, dimensions: 768 },
        "rag_meta",
      ),
    ).toThrow(/rag_meta/);
  });

  test("a malformed dimension is a configuration error", () => {
    expect(() => requireEmbeddingSpace({ SHENRON_AI_EMBED_DIMENSIONS: "384.5" })).toThrow(
      AiConfigError,
    );
    expect(resolveAiConfig({ SHENRON_AI_EMBED_DIMENSIONS: "-1" }).ok).toBe(false);
  });
});

describe("rerank dialects", () => {
  const rerank = (env: Record<string, string>) => {
    const r = resolveRerank(env);
    if (!r.ok) throw new Error(JSON.stringify(r.issues));
    return r.value;
  };

  test("optional: absent means disabled", () => {
    expect(rerank({})).toBeNull();
  });

  test("canonical base form posts to /v1/rerank in the llama-server dialect", () => {
    const r = rerank({ SHENRON_AI_RERANK_BASE_URL: E5, SHENRON_AI_RERANK_MODEL: "qwen3-reranker" });
    expect(r?.endpoint.href).toBe(`${E5}/rerank`);
    expect(r?.dialect).toBe("llama-server");
    expect(r?.model).toBe("qwen3-reranker");
  });

  test("RERANK_URL keeps the Shenron sidecar dialect and its exact endpoint", () => {
    const r = rerank({ RERANK_URL: `${E5_ORIGIN}/rerank` });
    expect(r?.endpoint.href).toBe(`${E5_ORIGIN}/rerank`);
    expect(r?.dialect).toBe("shenron-sidecar");
  });

  test("SHENRON_RAG_RERANK_ENDPOINT is a llama-server endpoint", () => {
    const r = rerank({
      SHENRON_RAG_RERANK_ENDPOINT: `${E5}/rerank`,
      SHENRON_RAG_RERANK_MODEL: "m",
    });
    expect(r?.dialect).toBe("llama-server");
    expect(r?.model).toBe("m");
  });
});

describe("shenron-infra contract parity", () => {
  // Infra configuration belongs to the selected Shenron workspace, not a fixed host checkout.
  const contractPath =
    process.env.SHENRON_AI_CONTRACT ||
    (process.env.SHENRON_INFRA_ROOT
      ? join(process.env.SHENRON_INFRA_ROOT, "config", "local-ai.json")
      : join(import.meta.dir, "..", "..", "..", "..", "shenron-infra", "config", "local-ai.json"));
  const present = existsSync(contractPath);

  test.skipIf(!present)(
    "AI_ENV mirrors the canonical names and alias order of local-ai.json",
    () => {
      const contract = JSON.parse(readFileSync(contractPath, "utf8")) as {
        gateways: Record<string, { env: { canonical: string; aliases: string[] }[] }>;
        capabilities: Record<string, { env: { canonical: string; aliases: string[] }[] }>;
        indexes: Record<string, { servedModel: string; dimensions: number }>;
      };
      const entries = [
        ...Object.values(contract.gateways).flatMap((g) => g.env),
        ...Object.values(contract.capabilities).flatMap((c) => c.env),
      ];
      const byCanonical = new Map(entries.map((e) => [e.canonical, e.aliases]));
      for (const setting of Object.values(AI_ENV)) {
        expect(byCanonical.has(setting.canonical)).toBe(true);
        expect(aiEnvNames(setting).slice(1)).toEqual(byCanonical.get(setting.canonical) ?? []);
      }
      const index = contract.indexes["shenron-rag"];
      expect(index?.servedModel).toBe(SHENRON_RAG_INDEX.model);
      expect(index?.dimensions).toBe(SHENRON_RAG_INDEX.dimensions);
    },
  );
});

describe("source hygiene", () => {
  test("no host or port literal in src/", () => {
    const dir = join(import.meta.dir, "..", "..", "src");
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const text = readFileSync(join(dir, file), "utf8");
      if (/127\.0\.0\.1|localhost|\[::1\]|https?:\/\/[a-z0-9.-]+:\d+|:\d{4,5}\b(?!\))/i.test(text))
        offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});

describe("resolveDirectChat", () => {
  test("is off without a chat base URL", () => {
    expect(resolveDirectChat({})).toEqual({ ok: true, value: null });
  });

  test("reads the canonical base and defaults the model to gemma4-e2b", () => {
    const r = resolveDirectChat({ SHENRON_AI_CHAT_BASE_URL: `${LOOP}/v1` });
    expect(r.ok && r.value?.baseUrl.href).toBe(`${LOOP}/v1`);
    expect(r.ok && r.value?.model).toBe("gemma4-e2b");
    expect(r.ok && r.value?.source).toBe("SHENRON_AI_CHAT_BASE_URL");
  });

  test("an origin alias gets /v1 and the configured model wins", () => {
    const r = resolveDirectChat({ SHENRON_LOCAL_MODEL_URL: LOOP, SHENRON_AI_CHAT_MODEL: "m1" });
    expect(r.ok && r.value?.baseUrl.href).toBe(`${LOOP}/v1`);
    expect(r.ok && r.value?.model).toBe("m1");
  });

  test("refuses a public address", () => {
    expect(resolveDirectChat({ SHENRON_AI_CHAT_BASE_URL: "https://google.com/v1" }).ok).toBe(false);
  });

  test("a direct vLLM provider enables chat independently of the compute gateway", () => {
    const cfg = ok({
      SHENRON_AI_CHAT_BASE_URL: `${LOOP}/v1`,
      SHENRON_AI_CHAT_MODEL: "gemma4-e2b-bnb-4bit",
      SHENRON_AI_CHAT_API_KEY: TOKEN,
    });
    expect(cfg.compute).toBeNull();
    expect(cfg.chatModel).toBe("gemma4-e2b-bnb-4bit");
    expect(cfg.directChat?.apiKey).toBe(TOKEN);
    expect(cfg.disabled.some((entry) => entry.capability === "chat")).toBe(false);
    expect(cfg.disabled.some((entry) => entry.capability === "embed")).toBe(true);
  });

  test("canonical upstream credential wins; malformed credentials expose only variable names", () => {
    const resolved = resolveDirectChat({
      SHENRON_AI_CHAT_BASE_URL: `${LOOP}/v1`,
      SHENRON_AI_CHAT_API_KEY: TOKEN,
      SHENRON_OPENAI_API_KEY: "legacy",
    });
    expect(resolved.ok && resolved.value?.apiKey).toBe(TOKEN);
    const bad = resolveDirectChat({
      SHENRON_AI_CHAT_BASE_URL: `${LOOP}/v1`,
      SHENRON_AI_CHAT_API_KEY: "private\nvalue",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.issues[0]?.name).toBe("SHENRON_AI_CHAT_API_KEY");
      expect(JSON.stringify(bad.issues)).not.toContain("private");
    }
  });
});
