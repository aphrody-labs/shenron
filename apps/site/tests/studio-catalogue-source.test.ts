import { describe, expect, test } from "bun:test";
import {
  studioSourceSelection,
  studioSourceImage,
  studioSourceRecord,
  studioSourceFile,
} from "../src/lib/studio-catalogue-source";
describe("Studio catalogue handoff", () => {
  test("accepts only unambiguous positive catalogue identifiers", () => {
    expect(studioSourceSelection(new URLSearchParams("chapter=4&page=2"))).toEqual({
      kind: "chapter",
      id: 4,
      page: 2,
    });
    for (const query of [
      "chapter=4&databook=2&page=1",
      "chapter=4&chapter=5&page=1",
      "chapter=4&page=0",
      "chapter=https://evil.example&page=1",
      "page=1",
    ])
      expect(studioSourceSelection(new URLSearchParams(query))).toBeNull();
  });
  test("does not turn external URLs, private paths or credentials into import sources", () => {
    for (const url of [
      "https://evil.example/wiki/a.png",
      "/api/private/a.png",
      "https://user:pass@dragonballfr.com/wiki/a.png",
      "/wiki/a.svg",
    ])
      expect(() => studioSourceImage(url, "https://dragonballfr.com")).toThrow();
    expect(studioSourceImage("/assets/wiki/a.jpg", "https://dragonballfr.com")).toBe(
      "https://dragonballfr.com/wiki/a.jpg",
    );
  });
  test("manga ordinal and databook printed number retain separate contracts", () => {
    expect(() =>
      studioSourceRecord(
        { kind: "chapter", id: 1, page: 2 },
        { chapter: { id: 1 }, index: 3, image: "/wiki/a.jpg" },
        "https://dragonballfr.com",
      ),
    ).toThrow();
    const record = studioSourceRecord(
      { kind: "databook", id: 2, page: 42 },
      {
        id: 2,
        pages: [
          { number: 7, image: "/wiki/wrong.jpg" },
          { number: 42, image: "/wiki/right.jpg" },
        ],
      },
      "https://dragonballfr.com",
    );
    expect(record.image).toEndWith("/wiki/right.jpg");
  });
  test("rejects non-image responses and oversized downloads", async () => {
    const saved = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response("<html>", { headers: { "content-type": "text/html" } });
    try {
      await expect(
        studioSourceFile("https://dragonballfr.com/wiki/a.jpg", new AbortController().signal),
      ).rejects.toThrow();
      globalThis.fetch = async () =>
        new Response(new Uint8Array([1]), {
          headers: { "content-type": "image/png", "content-length": String(97 * 1024 * 1024) },
        });
      await expect(
        studioSourceFile("https://dragonballfr.com/wiki/a.png", new AbortController().signal),
      ).rejects.toThrow("too large");
    } finally {
      globalThis.fetch = saved;
    }
  });
});
