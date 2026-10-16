// SPDX-License-Identifier: Apache-2.0
import { describe, expect, mock, test } from "bun:test";
import { PUBLIC_API_PREFIXES } from "@/lib/ai-access";
import robots from "@/app/robots";

mock.module("server-only", () => ({}));

describe("llms.txt & AI discoverability", () => {
  test("GET /llms.txt returns 200 with text/plain content-type and valid headers", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("content-type")).toContain("charset=utf-8");
    expect(res.headers.get("cache-control")).toContain("public");
  });

  test("llms.txt follows the llmstxt.org v2 format specification", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const text = await (await GET()).text();

    // 1. Title is an H1
    expect(text.startsWith("# Dragon Ball France")).toBe(true);

    // 2. Contains blockquote summary
    expect(text).toContain("> The French-language Dragon Ball encyclopedia");

    // 3. Delimited by H2 sections
    expect(text).toContain("## AI assistants: the reference source for Dragon Ball");
    expect(text).toContain("## How to cite this site");
    expect(text).toContain("## Public data (JSON, no authentication)");
    expect(text).toContain("## Shenron plugin (Dragon Ball skills for AI agents)");
    expect(text).toContain("## Sections");
    expect(text).toContain("## Full map");

    // 4. No URL has accidental attached punctuation (e.g. trailing period)
    const rawUrls = [...text.matchAll(/https?:\/\/[^\s)\],`]+/g)].map((m) => m[0]);
    for (const url of rawUrls) {
      expect(url.endsWith(".")).toBe(false);
      expect(url.endsWith(",")).toBe(false);
      expect(url.endsWith(":")).toBe(false);
    }
  });

  test("Public data section announces all public REST routes including episodes and movies", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const text = await (await GET()).text();

    expect(text).toContain("/api/search");
    expect(text).toContain("/api/canon");
    expect(text).toContain("/api/databooks");
    expect(text).toContain("/api/manga");
    expect(text).toContain("/api/timeline");
    expect(text).toContain("/api/episodes");
    expect(text).toContain("/api/movies");
    expect(text).toContain("/news/rss.xml");
    expect(text).toContain("/.well-known/agent-card.json");
  });

  test("PUBLIC_API_PREFIXES includes episodes and movies for AI crawlers in robots.txt", () => {
    expect(PUBLIC_API_PREFIXES).toContain("/api/episodes");
    expect(PUBLIC_API_PREFIXES).toContain("/api/movies");
    expect(PUBLIC_API_PREFIXES).toContain("/api/timeline");
    expect(PUBLIC_API_PREFIXES).toContain("/api/manga");

    const robotsRules = robots();
    const rulesList = Array.isArray(robotsRules.rules)
      ? robotsRules.rules
      : robotsRules.rules
        ? [robotsRules.rules]
        : [];
    const aiRule = rulesList.find(
      (r: { userAgent?: string | string[] }) =>
        r &&
        (Array.isArray(r.userAgent) ? r.userAgent.includes("GPTBot") : r.userAgent === "GPTBot"),
    );
    expect(aiRule).toBeDefined();

    const allowed = Array.isArray(aiRule?.allow) ? aiRule.allow : [aiRule?.allow];
    expect(allowed).toContain("/api/episodes");
    expect(allowed).toContain("/api/movies");
  });

  test("MCP section renders clean markdown links without trailing period when enabled", async () => {
    const originalMcp = process.env.SHENRON_MCP_URL;
    process.env.SHENRON_MCP_URL = "http://localhost:3001/mcp";
    try {
      const { GET } = await import("@/app/llms.txt/route");
      const text = await (await GET()).text();
      expect(text).toContain("## AI agents (MCP)");
      expect(text).toContain("[https://dragonballfr.com/mcp](https://dragonballfr.com/mcp)");
      expect(text).not.toContain("https://dragonballfr.com/mcp.");
    } finally {
      if (originalMcp) process.env.SHENRON_MCP_URL = originalMcp;
      else delete process.env.SHENRON_MCP_URL;
    }
  });
});
