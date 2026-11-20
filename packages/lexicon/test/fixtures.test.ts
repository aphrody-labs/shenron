// SPDX-License-Identifier: Apache-2.0
/**
 * Golden fixtures shared with the Rust crate (`crates/shenron-lexicon/tests/fixtures.rs`): both
 * implementations read the same files of `data/lexicon/fixtures/`, so they cannot diverge.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  findTokens,
  fold,
  Lexicon,
  maskText,
  restoreTokens,
  validateLexicon,
  wordEdges,
  type Kind,
  type Lang,
  type MaskOptions,
} from "../src";
import { lexicon as embedded } from "../src/data";

const FIXTURES = join(import.meta.dir, "..", "..", "..", "data", "lexicon", "fixtures");
const load = <T>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;

type Pair = [string, string];

interface MaskCase {
  name: string;
  entries: { sources: string[]; target: string }[];
  options?: MaskOptions;
  input: string;
  masked: string;
  tokens: Pair[];
  overflow: number;
  translation?: string;
  restored?: string;
  unresolved?: string[];
  missing?: string[];
}

describe("fold.json", () => {
  const { cases } = load<{ cases: { input: string; output: string }[] }>("fold.json");
  for (const c of cases) {
    test(JSON.stringify(c.input).slice(0, 60), () => expect(fold(c.input)).toBe(c.output));
  }
});

describe("mask.json", () => {
  const { cases } = load<{ cases: MaskCase[] }>("mask.json");
  for (const c of cases) {
    test(c.name, () => {
      const entries = c.entries.map((entry) => ({ ...entry, value: null }));
      const masked = maskText(c.input, entries, c.options ?? {});
      expect(masked.text).toBe(c.masked);
      expect(masked.tokens.map((t) => [t.token, t.target])).toEqual(c.tokens);
      expect(masked.overflow).toBe(c.overflow);
      if (c.translation !== undefined) {
        const restored = restoreTokens(
          c.translation,
          masked.tokens.map((t) => [t.token, t.target] as const),
          c.options ?? {},
        );
        expect(restored.text).toBe(c.restored!);
        expect(restored.unresolved).toEqual(c.unresolved!);
        expect(restored.missing).toEqual(c.missing!);
      }
    });
  }
});

describe("restore.json", () => {
  const { cases } = load<{
    cases: {
      name: string;
      options?: MaskOptions;
      table: Pair[];
      translation: string;
      restored: string;
      unresolved: string[];
      missing: string[];
    }[];
  }>("restore.json");
  for (const c of cases) {
    test(c.name, () => {
      const restored = restoreTokens(c.translation, c.table, c.options ?? {});
      expect(restored).toEqual({ text: c.restored, unresolved: c.unresolved, missing: c.missing });
    });
  }
});

describe("tokens.json", () => {
  const fixture = load<{
    tokens: { text: string; options?: MaskOptions; found: string[] }[];
    edges: { text: string; start: number; end: number; edges: boolean }[];
  }>("tokens.json");
  for (const c of fixture.tokens) {
    test(`findTokens ${c.text}`, () =>
      expect(findTokens(c.text, c.options ?? {})).toEqual(c.found));
  }
  for (const c of fixture.edges) {
    test(`wordEdges ${c.text} ${c.start}..${c.end}`, () =>
      expect(wordEdges([...c.text], c.start, c.end)).toBe(c.edges));
  }
});

interface LexiconFixture {
  lexicon: unknown;
  resolve: { query: string; id: string | null }[];
  labels: { id: string; lang: Lang; text: string; from: Lang; fallback: boolean }[];
  search: {
    query: string;
    kind?: Kind;
    limit?: number;
    hits: [string, number, string, string][];
  }[];
  mask: {
    target: "fr" | "en";
    input: string;
    masked: string;
    tokens: Pair[];
    translation?: string;
    restored?: string;
  }[];
  coverage: unknown;
  invalid: { name: string; doc: unknown }[];
}

function checkLexicon(lexicon: Lexicon, fixture: Partial<LexiconFixture>) {
  for (const c of fixture.resolve ?? []) {
    test(`resolve ${c.query}`, () => expect(lexicon.resolve(c.query)?.id ?? null).toBe(c.id));
  }
  for (const c of fixture.labels ?? []) {
    test(`label ${c.id} ${c.lang}`, () => {
      const label = lexicon.label(lexicon.get(c.id)!, c.lang);
      expect(label).toEqual({ text: c.text, lang: c.from, fallback: c.fallback });
    });
  }
  for (const c of fixture.search ?? []) {
    test(`search ${c.query}${c.kind ? ` kind=${c.kind}` : ""}`, () => {
      const hits = lexicon.search(c.query, {
        ...(c.kind ? { kind: c.kind } : {}),
        ...(c.limit ? { limit: c.limit } : {}),
      });
      expect(hits.map((h) => [h.term.id, h.score, h.field, h.form])).toEqual(c.hits);
    });
  }
  for (const c of fixture.mask ?? []) {
    test(`mask ${c.target} ${c.input}`, () => {
      const masked = lexicon.mask(c.input, c.target);
      expect(masked.text).toBe(c.masked);
      expect(masked.tokens.map((t) => [t.token, t.target])).toEqual(c.tokens);
      if (c.translation !== undefined) {
        const restored = restoreTokens(
          c.translation,
          masked.tokens.map((t) => [t.token, t.target] as const),
        );
        expect(restored.text).toBe(c.restored!);
        expect(restored.unresolved).toEqual([]);
      }
    });
  }
}

describe("lexicon.json", () => {
  const fixture = load<LexiconFixture>("lexicon.json");
  const lexicon = Lexicon.parse(fixture.lexicon);
  checkLexicon(lexicon, fixture);
  test("coverage", () => expect(lexicon.coverage()).toEqual(fixture.coverage as never));
  for (const c of fixture.invalid) {
    test(`rejects: ${c.name}`, () => {
      expect(validateLexicon(c.doc).length).toBeGreaterThan(0);
      expect(() => Lexicon.parse(c.doc)).toThrow();
    });
  }
});

describe("embedded.json", () => {
  const fixture = load<Partial<LexiconFixture> & { minTerms: number }>("embedded.json");
  const lexicon = embedded();
  test("the embedded lexicon is valid and complete", () => {
    expect(lexicon.size).toBeGreaterThanOrEqual(fixture.minTerms);
    expect(validateLexicon({ version: lexicon.version, terms: lexicon.terms })).toEqual([]);
  });
  checkLexicon(lexicon, fixture);
});
