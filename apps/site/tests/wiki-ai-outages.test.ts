import { beforeEach, expect, mock, spyOn, test } from "bun:test";
import { NextRequest } from "next/server";

let readRag: (...args: unknown[]) => Promise<unknown> = async () => null;
let generate: (...args: unknown[]) => Promise<string | null> = async () => "Generated [1]";
let generationCalls = 0;
mock.module("server-only", () => ({}));
mock.module("@/lib/session", () => ({ isCurrentUserAdmin: async () => true }));
mock.module("@/lib/db-universe", () => ({
  dbUniverse: { rag: (...args: unknown[]) => readRag(...args) },
}));
mock.module("@/lib/wiki-ai-generation", () => ({
  generateWikiDraft: (...args: unknown[]) => {
    generationCalls++;
    return generate(...args);
  },
}));

beforeEach(() => {
  generationCalls = 0;
  generate = async () => "Generated [1]";
});

const { POST } = await import("../src/app/api/wiki-ai/route");
const request = (body: unknown = { query: "Goku" }) =>
  new NextRequest("http://localhost:3000/api/wiki-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

test("an unavailable RAG source returns 503 instead of an empty draft", async () => {
  readRag = async () => null;
  const response = await POST(request());

  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Retry-After")).toBe("30");
  expect(await response.json()).toEqual({ error: "rag_unavailable" });
});

test("invalid query and pagination types are rejected before RAG", async () => {
  let reads = 0;
  readRag = async () => {
    reads++;
    return null;
  };
  for (const body of [
    { query: {} },
    { query: "Namek", limit: 1.25 },
    { query: "Namek", limit: 99 },
  ]) {
    expect((await POST(request(body))).status).toBe(400);
  }
  expect(reads).toBe(0);
});

const hits = [
  {
    title: "Manga",
    url: "/wiki/manga",
    snippet: "Namek is described in a documented manga passage.",
    score: 1,
    kind: "manga",
  },
];

test("source search never invokes generation and every draft requires review", async () => {
  readRag = async () => ({ mode: "hybrid", results: hits });
  const response = await POST(request({ query: "Namek" }));
  const body = await response.json();
  expect(body.markdown).toContain("Namek is described");
  expect(body.draftKind).toBe("extracts");
  expect(body.reviewRequired).toBe(true);
  expect(generationCalls).toBe(0);
});

test("explicit drafting passes server retrieved sources and language to generation", async () => {
  readRag = async () => ({ mode: "hybrid", results: hits });
  let supplied: unknown;
  generate = async (input) => {
    supplied = input;
    return "Reviewed generated prose [1]";
  };
  const response = await POST(request({ query: "Namek", action: "draft", lang: "en" }));
  expect(await response.json()).toMatchObject({
    markdown: "Reviewed generated prose [1]",
    draftKind: "generated",
    reviewRequired: true,
  });
  expect(supplied).toMatchObject({ query: "Namek", lang: "en", sources: hits });
  expect(generationCalls).toBe(1);
});

test("empty evidence never calls a model and unsafe sources do not enter a draft", async () => {
  readRag = async () => ({ mode: "hybrid", results: [] });
  expect(await (await POST(request({ query: "Namek", action: "draft" }))).json()).toMatchObject({
    markdown: "",
    draftKind: "extracts",
  });
  readRag = async () => ({ mode: "hybrid", results: [{ ...hits[0], url: "javascript:alert(1)" }] });
  expect(await (await POST(request({ query: "Namek", action: "draft" }))).json()).toMatchObject({
    markdown: "",
  });
  expect(generationCalls).toBe(0);
});

test("failed generation is retryable and does not return a fake generated success", async () => {
  readRag = async () => ({ mode: "hybrid", results: hits });
  generate = async () => {
    throw new Error("private provider detail");
  };
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await POST(request({ query: "Namek", action: "draft" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "generation_unavailable" });
  } finally {
    log.mockRestore();
  }
});

test("excluded Fandom sources are absent from the editor results and generation evidence", async () => {
  readRag = async () => ({
    mode: "hybrid",
    results: [{ ...hits[0], url: "https://dragonball.fandom.com/wiki/Namek" }],
  });
  const response = await POST(request({ query: "Namek", action: "draft" }));
  expect(await response.json()).toMatchObject({ results: [], markdown: "", draftKind: "extracts" });
  expect(generationCalls).toBe(0);
});

test("unexpected RAG failures return a safe retryable response", async () => {
  readRag = async () => {
    throw new Error("private search index detail");
  };
  const log = spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.error).toBe("rag_unavailable");
    expect(JSON.stringify(body)).not.toContain("private search index detail");
  } finally {
    log.mockRestore();
  }
});
