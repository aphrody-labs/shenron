import { expect, mock, spyOn, test } from "bun:test";
import { NextRequest } from "next/server";

let readRag: (...args: unknown[]) => Promise<unknown> = async () => null;
mock.module("server-only", () => ({}));
mock.module("@/lib/session", () => ({ isCurrentUserAdmin: async () => true }));
mock.module("@/lib/db-universe", () => ({
  dbUniverse: { rag: (...args: unknown[]) => readRag(...args) },
}));

const { POST } = await import("../src/app/api/wiki-ai/route");
const request = () =>
  new NextRequest("http://localhost:3000/api/wiki-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "Goku" }),
  });

test("an unavailable RAG source returns 503 instead of an empty draft", async () => {
  readRag = async () => null;
  const response = await POST(request());

  expect(response.status).toBe(503);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Retry-After")).toBe("30");
  expect(await response.json()).toEqual({ error: "rag_unavailable" });
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
