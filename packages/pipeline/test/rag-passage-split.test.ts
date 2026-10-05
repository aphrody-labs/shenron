import { describe, expect, test } from "bun:test";
import { MAX_PASSAGE_CHARS, splitPassage } from "../scripts/_rag-corpus-sources";

describe("passages sent to the RAG ingestion", () => {
  test("a short passage is kept whole", () => {
    expect(splitPassage("Kid Buu")).toEqual(["Kid Buu"]);
  });

  test("an endless line is cut under the ingestion limit and loses nothing", () => {
    const long = "ブ".repeat(MAX_PASSAGE_CHARS * 2 + 17);
    const parts = splitPassage(long);
    expect(parts.length).toBe(3);
    expect(parts.every((part) => part.length <= MAX_PASSAGE_CHARS)).toBe(true);
    expect(parts.join("")).toBe(long);
  });

  test("a surrogate pair is never split", () => {
    const long = "😀".repeat(40);
    for (const part of splitPassage(long, 7))
      expect(part).toMatch(/^(?:\p{Extended_Pictographic})+$/u);
    expect(splitPassage(long, 7).join("")).toBe(long);
  });
});
