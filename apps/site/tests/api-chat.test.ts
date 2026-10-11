// SPDX-License-Identifier: Apache-2.0
import { describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

// Mock server-only before importing server code
mock.module("server-only", () => ({}));

// Route unit tests use a deterministic limiter; shared-rate-limit.test.ts exercises Redis failures.
mock.module("@/lib/memory-rate-limit", () => ({
  createMemoryRateLimiter: () => ({
    consume: async () => ({ limited: false, retryAfter: 1, remaining: 19, backend: "redis" }),
  }),
}));

// Mock site-rag before importing the route
mock.module("@/lib/site-rag", () => ({
  usesAphrodyRag: () => true,
  chatAphrodyRag: async (query: string, persona: string) => ({
    answer: `Réponse de ${persona} pour: ${query}`,
    hits: [
      {
        title: "Son Goku",
        url: "https://dragonballfr.com/wiki/personnages/son-goku",
        snippet: "Le héros légendaire.",
      },
    ],
    mode: "hybrid",
  }),
}));

const { GET, POST } = await import("../src/app/api/chat/route");

describe("API route /api/chat", () => {
  test("GET /api/chat?q=... returns grounded response", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat?q=Qui+est+Goku&persona=shenron");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.answer).toContain("Réponse de shenron");
    expect(data.hits).toHaveLength(1);
    expect(data.mode).toBe("hybrid");
  });

  test("GET /api/chat rejects missing q", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  test("POST /api/chat with { prompt } returns assistant message", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Raconte une histoire", persona: "whis" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.answer).toContain("Réponse de whis");
    expect(data.role).toBe("assistant");
    expect(data.content).toBe(data.answer);
  });

  test("POST /api/chat with { messages } returns assistant response for last user turn", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "user", content: "Bonjour" },
          { role: "assistant", content: "Salutations" },
          { role: "user", content: "Qui est Beerus ?" },
        ],
        persona: "beerus",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.answer).toContain("Qui est Beerus ?");
    expect(data.role).toBe("assistant");
  });

  test("POST /api/chat rejects empty query", async () => {
    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: "whis" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
