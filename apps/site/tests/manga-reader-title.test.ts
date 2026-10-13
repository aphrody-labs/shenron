// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "bun:test";
import { readingLabel, readingTitle } from "../src/lib/manga-reader-title";

test("a complete volume stored in a reader record keeps its bibliographic label", () => {
  const reading = { title: "Tome 2", chapter_number: 2 };
  expect(readingLabel(reading)).toBe("Tome 2");
  expect(readingTitle(reading)).toBe("Tome 2");
});

test("real chapters retain their number and descriptive title", () => {
  expect(readingTitle({ title: "Le souhait", chapter_number: 42 })).toBe(
    "Chapitre 42 — Le souhait",
  );
  expect(readingTitle({ title: null, chapter_number: 42 })).toBe("Chapitre 42");
  expect(readingTitle({ title: "Chapter 42", chapter_number: 42 })).toBe("Chapitre 42");
});
