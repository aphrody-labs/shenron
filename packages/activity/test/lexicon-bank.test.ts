// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import { LEXICON_DATA } from "@aphrody/shenron-lexicon/data";
import {
  buildLexiconBank,
  DEFAULT_EXCLUDED_TERM_IDS,
  foldText,
  validateQuestion,
  type LexiconTermInput,
} from "../src";
import { lexiconQuizBank } from "../src/quiz/lexicon";

const bank = lexiconQuizBank();
const termById = new Map(LEXICON_DATA.terms.map((term) => [term.id, term]));
const LOCALES = ["fr", "en", "ja"] as const;

describe("the embedded lexicon bank", () => {
  test("serves the lexicon-backed categories and none of the externally fed ones", () => {
    expect(bank.size).toBeGreaterThan(1000);
    expect(bank.availableCategories()).toEqual([
      "characters",
      "techniques",
      "transformations",
      "sagas",
      "world",
    ]);
    expect(bank.count("volumes")).toBe(0);
    expect(bank.count("databooks")).toBe(0);
  });

  test("is built once and shared", () => {
    expect(lexiconQuizBank()).toBe(bank);
  });

  test("every question is well formed: four distinct choices per language, a valid source", () => {
    for (const question of bank.all()) {
      expect(validateQuestion(question)).toEqual([]);
      expect(question.distractors).toHaveLength(3);
    }
  });

  test("asks only what the lexicon states: the answer is the term's own form", () => {
    for (const question of bank.all()) {
      expect(question.source.type).toBe("lexicon");
      const term = termById.get((question.source as { id: string }).id);
      expect(term).toBeDefined();
      const template = question.id.split(":")[1];
      const expected =
        template === "name_ja_to_fr"
          ? term!.fr
          : template === "name_fr_to_ja"
            ? term!.ja
            : term!.en;
      expect(question.answer.text.fr).toBe(expected.trim());
      // The prompt shows the subject's other form and nothing that is not in the lexicon.
      const subject = template === "name_ja_to_fr" ? term!.ja : term!.fr;
      for (const locale of LOCALES) expect(question.prompt[locale]).toContain(subject.trim());
      expect(question.subjectKey).toBe(`lex:${term!.id}`);
    }
  });

  test("every wrong choice is a form of another lexicon term, never the answer's own", () => {
    for (const question of bank.all()) {
      const term = termById.get((question.source as { id: string }).id)!;
      const template = question.id.split(":")[1] as string;
      const field =
        template === "name_ja_to_fr" ? "fr" : template === "name_fr_to_ja" ? "ja" : "en";
      for (const wrong of question.distractors) {
        expect(wrong.id.startsWith("lex:")).toBe(true);
        const other = termById.get(wrong.id.slice(4));
        expect(other).toBeDefined();
        expect(other!.id).not.toBe(term.id);
        expect(wrong.text.fr).toBe(other![field].trim());
        expect(foldText(wrong.text.fr)).not.toBe(foldText(question.answer.text.fr));
      }
    }
  });

  test("never uses placeholders, ambiguous variants or non-name kinds", () => {
    const seen = new Set<string>();
    for (const question of bank.all()) {
      seen.add((question.source as { id: string }).id);
      for (const choice of [question.answer, ...question.distractors]) seen.add(choice.id.slice(4));
    }
    for (const id of seen) {
      const term = termById.get(id)!;
      expect(DEFAULT_EXCLUDED_TERM_IDS.has(id)).toBe(false);
      expect(["other", "title"]).not.toContain(term.kind);
      expect(term.fr).not.toMatch(/[()]|N°/);
    }
    expect(seen.has("inconnu")).toBe(false);
  });

  test("English questions exist only where an official English form differs from the French one", () => {
    const english = bank.all().filter((q) => q.id.startsWith("lex:name_fr_to_en:"));
    expect(english.length).toBeGreaterThan(10);
    for (const question of english) {
      const term = termById.get((question.source as { id: string }).id)!;
      expect(term.en).not.toBe("");
      expect(foldText(term.en)).not.toBe(foldText(term.fr));
    }
    // Kamehameha is spelled the same in French and English: no question.
    expect(bank.get("lex:name_fr_to_en:kamehameha")).toBeUndefined();
    expect(bank.get("lex:name_fr_to_en:spirit-bomb")?.answer.text.fr).toBe("Spirit Bomb");
  });

  test("wrong choices look like the answer: same script, similar length", () => {
    const isKana = (text: string) =>
      !/\p{Script=Han}/u.test(text) && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
    let kanaAnswers = 0;
    let kanaWrong = 0;
    const gaps: number[] = [];
    for (const question of bank.all()) {
      for (const wrong of question.distractors)
        gaps.push(Math.abs([...wrong.text.fr].length - [...question.answer.text.fr].length));
      if (!question.id.startsWith("lex:name_fr_to_ja:") || !isKana(question.answer.text.ja))
        continue;
      for (const wrong of question.distractors) {
        kanaAnswers += 1;
        if (isKana(wrong.text.ja)) kanaWrong += 1;
      }
    }
    expect(kanaWrong / kanaAnswers).toBeGreaterThan(0.9);
    gaps.sort((a, b) => a - b);
    expect(gaps[Math.floor(gaps.length * 0.9)]).toBeLessThanOrEqual(2);
  });

  test("known questions read as expected", () => {
    const kamehameha = bank.get("lex:name_ja_to_fr:kamehameha");
    expect(kamehameha?.category).toBe("techniques");
    expect(kamehameha?.prompt.fr).toBe("Quel est le nom français de « かめはめ波 » ?");
    expect(kamehameha?.prompt.en).toBe('What is the French name of "かめはめ波"?');
    expect(kamehameha?.answer.text.fr).toBe("Kamehameha");
    expect(bank.get("lex:name_fr_to_ja:saga-cell")?.answer.text.ja).toBe("セル編");
    expect(bank.get("lex:name_ja_to_fr:super-saiyan")?.category).toBe("transformations");
  });
});

describe("buildLexiconBank", () => {
  const term = (
    id: string,
    kind: string,
    ja: string,
    fr: string,
    en = "",
    aliases?: LexiconTermInput["aliases"],
  ): LexiconTermInput => ({ id, kind, ja, fr, en, ...(aliases ? { aliases } : {}) });

  const pool = (): LexiconTermInput[] => [
    term("a", "character", "アルファ", "Alpha"),
    term("b", "character", "ブラボー", "Bravo"),
    term("c", "character", "チャーリー", "Charlie"),
    term("d", "character", "デルタ", "Delta"),
    term("e", "character", "エコー", "Echo"),
    term("f", "character", "フォックス", "Foxtrot"),
  ];

  test("is deterministic for a seed and varies with it", () => {
    const first = buildLexiconBank(pool(), { seed: "s1" });
    const again = buildLexiconBank(pool(), { seed: "s1" });
    expect(again.all()).toEqual(first.all());
    const other = buildLexiconBank(pool(), { seed: "s2" });
    expect(other.all().map((q) => q.id)).toEqual(first.all().map((q) => q.id));
    expect(JSON.stringify(other.all())).not.toBe(JSON.stringify(first.all()));
  });

  test("too few terms to offer four choices: no question at all", () => {
    expect(buildLexiconBank(pool().slice(0, 3)).size).toBe(0);
    expect(buildLexiconBank(pool().slice(0, 4)).size).toBeGreaterThan(0);
  });

  test("an alias of the answer is never offered as a wrong choice, in either direction", () => {
    const terms = [
      term("t1", "character", "ティーワン", "Alpha", "", { fr: ["Beta"] }),
      term("t2", "character", "ティーツー", "Beta"),
      ...pool().slice(1),
    ];
    let withT2 = 0;
    for (let seed = 0; seed < 40; seed++) {
      const built = buildLexiconBank(terms, { seed: `alias-${seed}` });
      // In the French-answer question, whenever one of the two is the answer, the other (known by
      // the same French spelling) is not among the choices...
      for (const question of built.all()) {
        if (!question.id.startsWith("lex:name_ja_to_fr:")) continue;
        if (question.answer.id !== "lex:t1" && question.answer.id !== "lex:t2") continue;
        const other = question.answer.id === "lex:t1" ? "lex:t2" : "lex:t1";
        expect(question.distractors.map((d) => d.id)).not.toContain(other);
      }
      // ...while each of them stays a normal wrong choice for the other terms.
      if (built.get("lex:name_ja_to_fr:b")?.distractors.some((d) => d.id === "lex:t2")) withT2 += 1;
    }
    expect(withT2).toBeGreaterThan(0);
  });

  test("a term whose forms collapse to the same text cannot make two identical choices", () => {
    const terms = [
      term("x1", "character", "エックス", "Café"),
      term("x2", "character", "エックスツー", "cafe"),
      ...pool(),
    ];
    for (const question of buildLexiconBank(terms).all()) {
      const folded = [question.answer, ...question.distractors].map((c) => foldText(c.text.fr));
      expect(new Set(folded).size).toBe(4);
    }
  });

  test("skips names that are not usable: blanks, identical forms, variants, placeholders, other kinds", () => {
    const terms = [
      term("blank-ja", "character", "", "Nothing"),
      term("blank-fr", "character", "ナシ", "  "),
      term("same", "character", "Same", "Same"),
      term("variant", "character", "ミライ", "Alpha (futur)"),
      term("numbered", "character", "ナンバー", "Kabla N°44"),
      term("inconnu", "place", "不明", "Inconnu"),
      term("word", "other", "オッス", "Salut"),
      term("movie", "title", "タイトル", "Un film"),
      term("alien", "unheard-of-kind", "ナニ", "Quoi"),
      ...pool(),
    ];
    const built = buildLexiconBank(terms);
    const ids = new Set<string>();
    for (const question of built.all()) {
      ids.add((question.source as { id: string }).id);
      for (const choice of question.distractors) ids.add(choice.id.slice(4));
    }
    for (const bad of [
      "blank-ja",
      "blank-fr",
      "same",
      "variant",
      "numbered",
      "inconnu",
      "word",
      "movie",
      "alien",
    ])
      expect(ids.has(bad)).toBe(false);
    for (const good of ["a", "b", "c", "d", "e", "f"]) expect(ids.has(good)).toBe(true);
  });

  test("excludeIds replaces the default exclusion list", () => {
    const places = [
      term("p1", "place", "バショイチ", "Lieu un"),
      term("p2", "place", "バショニ", "Lieu deux"),
      term("p3", "place", "バショサン", "Lieu trois"),
      term("p4", "place", "バショヨン", "Lieu quatre"),
    ];
    const placeholder = [term("inconnu", "place", "不明", "Inconnu"), ...places, ...pool()];
    expect(buildLexiconBank(placeholder).get("lex:name_ja_to_fr:inconnu")).toBeUndefined();
    expect(
      buildLexiconBank(placeholder, { excludeIds: new Set() }).get("lex:name_ja_to_fr:inconnu"),
    ).toBeDefined();
    expect(
      buildLexiconBank(placeholder, { excludeIds: new Set(["a"]) }).get("lex:name_ja_to_fr:a"),
    ).toBeUndefined();
  });

  test("categories follow the kind; techniques and transformations lend each other wrong choices", () => {
    const terms = [
      term("k1", "technique", "ワザイチ", "Technique un"),
      term("k2", "technique", "ワザニ", "Technique deux"),
      term("f1", "transformation", "ヘンシンイチ", "Forme un"),
      term("f2", "transformation", "ヘンシンニ", "Forme deux"),
      term("s1", "saga", "ヘンイチ", "Saga un"),
      term("p1", "place", "バショイチ", "Lieu un"),
    ];
    const built = buildLexiconBank(terms);
    expect(built.get("lex:name_ja_to_fr:k1")?.category).toBe("techniques");
    expect(built.get("lex:name_ja_to_fr:f1")?.category).toBe("transformations");
    // Four technique-like terms are enough for a transformation question; the lone saga is not.
    expect(built.get("lex:name_ja_to_fr:f1")).toBeDefined();
    expect(built.get("lex:name_ja_to_fr:s1")).toBeUndefined();
    expect(built.get("lex:name_ja_to_fr:p1")).toBeUndefined();
  });

  test("English questions borrow wrong choices from other categories when their own is too small", () => {
    const terms = [
      term("e1", "technique", "ワザ", "Tec fr", "Tec en"),
      term("e2", "character", "ヒト", "Perso fr", "Person en"),
      term("e3", "character", "ヒトニ", "Perso deux", "Person two"),
      term("e4", "place", "バショ", "Lieu fr", "Place en"),
    ];
    const built = buildLexiconBank(terms);
    const question = built.get("lex:name_fr_to_en:e1");
    expect(question).toBeDefined();
    expect(question?.distractors.map((d) => d.text.fr).toSorted()).toEqual([
      "Person en",
      "Person two",
      "Place en",
    ]);
  });
});
