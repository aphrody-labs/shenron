// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { createAphrodyRagPort } from "../src/editorial-rag";

test("the live adapter uses the declared private transport and preserves editorial filters", async () => {
  const seen: URL[] = [];
  const fetcher = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(String(input));
      seen.push(url);
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-private");
      return Response.json({
        mode: "hybrid",
        results: [
          {
            title: "Home",
            url: "",
            kind: "home",
            sourceId: "agent_home",
            snippet: "instructions",
            score: 1,
          },
          {
            title: "Manga",
            url: "https://dragonballfr.com/wiki/manga/1",
            kind: "manga",
            sourceId: "shenron:pg:manga:abc:0",
            originSourceId: "manga",
            snippet: "Current",
            content: "Current passage",
            lang: "fr",
            score: 0.9,
          },
        ],
      });
    },
    { preconnect: fetch.preconnect },
  ) as typeof fetch;
  const port = createAphrodyRagPort(
    { APHRODY_AI_HTTP_URL: "http://127.0.0.1:8789", APHRODY_AI_HTTP_TOKEN: "fixture-private" },
    fetcher,
  );
  const result = await port.search({ q: "Goku", sourceId: "manga", lang: "fr" });
  expect(seen[0]!.pathname).toBe("/api/v1/shenron/rag/search");
  expect(seen[0]!.searchParams.get("sourceId")).toBe("manga");
  expect(seen[0]!.searchParams.get("lang")).toBe("fr");
  expect(result.hits.map((hit) => hit.title)).toEqual(["Manga"]);
  expect(result.hits[0]!.sourceId).toBe("manga");
  expect(result.hits[0]!.rowid).toBe(-1);
  expect(result.hits[0]!.content).toBe("Current passage");
});
