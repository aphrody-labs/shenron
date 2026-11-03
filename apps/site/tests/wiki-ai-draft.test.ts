// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import {
  buildWikiExtractDraft,
  wikiDraftSourcesMarkdown,
  wikiSourceUrl,
} from "../src/lib/wiki-ai-draft";

test("retrieved sources cannot introduce unsafe schemes or credential-bearing links", () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,x",
    "//evil.example/x",
    "/\\evil.example",
    "https://secret:token@example.com",
    "file:///secret",
    "https://dragonball.fandom.com/wiki/Namek",
    "https://fandom.com/wiki/Namek",
    "https://dragonball.wikia.com/wiki/Namek",
  ]) {
    expect(wikiSourceUrl(value), value).toBeNull();
  }
  expect(wikiSourceUrl("/wiki/races/namek")).toBe("/wiki/races/namek");
  expect(wikiSourceUrl("https://example.com/a(b)")).toBe("https://example.com/a(b)");
  expect(wikiDraftSourcesMarkdown([{ title: "[Namek](bad)", url: "javascript:x" }])).toBe("");
});

test("extraction keeps distinct passages sharing an opening and omits an empty draft", () => {
  const source = {
    title: "Primary [source]",
    url: "https://example.com/scan",
    snippet: "A documented fact from the manga that is long enough to be useful.",
    kind: "manga",
    score: 1,
  };
  const other = { ...source, snippet: `${source.snippet} A different conclusion.` };
  const markdown = buildWikiExtractDraft([source, source, other]);
  expect(markdown.match(/A documented fact/g)?.length).toBe(2);
  expect(markdown).toContain("[Primary source](<https://example.com/scan>)");
  expect(buildWikiExtractDraft([{ ...source, snippet: "" }])).toBe("");
});
