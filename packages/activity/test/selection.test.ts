// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from "bun:test";
import {
  createBank,
  presentQuestion,
  QuizBankError,
  seededRng,
  selectQuestions,
  secureRng,
  shuffle,
  validateQuestion,
  type QuizQuestion,
} from "../src";
import { makeBank } from "./helpers";

const bank = makeBank(30);

describe("selectQuestions", () => {
  test("returns the number asked, without repeating a question or a subject", () => {
    const picked = selectQuestions(bank, { count: 10, rng: seededRng("a") });
    expect(picked).toHaveLength(10);
    expect(new Set(picked.map((q) => q.id)).size).toBe(10);
    expect(new Set(picked.map((q) => q.subjectKey)).size).toBe(10);
  });

  test("is deterministic for a seed and differs between seeds", () => {
    const ids = (seed: string) =>
      selectQuestions(bank, { count: 8, rng: seededRng(seed) }).map((q) => q.id);
    expect(ids("same")).toEqual(ids("same"));
    expect(ids("one")).not.toEqual(ids("two"));
  });

  test("balances the requested categories", () => {
    for (let seed = 0; seed < 20; seed++) {
      const picked = selectQuestions(bank, { count: 9, rng: seededRng(`b${seed}`) });
      const counts = new Map<string, number>();
      for (const q of picked) counts.set(q.category, (counts.get(q.category) ?? 0) + 1);
      expect([...counts.values()].toSorted()).toEqual([3, 3, 3]);
    }
    const two = selectQuestions(bank, {
      count: 6,
      categories: ["characters", "sagas"],
      rng: seededRng("two"),
    });
    expect(two.every((q) => q.category === "characters" || q.category === "sagas")).toBe(true);
    expect(two.filter((q) => q.category === "characters")).toHaveLength(3);
  });

  test("a category the bank does not serve is ignored; an empty choice yields nothing", () => {
    const only = selectQuestions(bank, {
      count: 5,
      categories: ["databooks", "sagas"],
      rng: seededRng("c"),
    });
    expect(only.every((q) => q.category === "sagas")).toBe(true);
    expect(
      selectQuestions(bank, { count: 5, categories: ["databooks"], rng: seededRng("c") }),
    ).toEqual([]);
    expect(selectQuestions(bank, { count: 0, rng: seededRng("c") })).toEqual([]);
  });

  test("returns fewer when the bank cannot serve more", () => {
    const picked = selectQuestions(makeBank(4), { count: 10, rng: seededRng("d") });
    expect(picked).toHaveLength(4);
  });

  test("never asks two questions about one subject", () => {
    const source = makeBank(6).all();
    const twins = createBank(
      source.flatMap((q, i): QuizQuestion[] => [
        { ...q, subjectKey: `subject-${i % 3}` },
        { ...q, id: `${q.id}-bis`, subjectKey: `subject-${i % 3}` },
      ]),
    );
    const picked = selectQuestions(twins, { count: 10, rng: seededRng("e") });
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((q) => q.subjectKey)).size).toBe(3);
  });

  test("avoids recently seen questions while fresh ones remain", () => {
    const seen = new Set(
      bank
        .all()
        .slice(0, 20)
        .map((q) => q.id),
    );
    for (let seed = 0; seed < 20; seed++) {
      const picked = selectQuestions(bank, { count: 10, avoid: seen, rng: seededRng(`f${seed}`) });
      expect(picked.some((q) => seen.has(q.id))).toBe(false);
    }
  });

  test("falls back to seen questions, fresh ones first, when the fresh run out", () => {
    const seen = new Set(
      bank
        .all()
        .slice(0, 25)
        .map((q) => q.id),
    );
    const picked = selectQuestions(bank, { count: 8, avoid: seen, rng: seededRng("g") });
    expect(picked).toHaveLength(8);
    const fresh = picked.filter((q) => !seen.has(q.id));
    expect(fresh).toHaveLength(5);
    expect(picked.slice(0, 5).every((q) => !seen.has(q.id))).toBe(true);
  });
});

describe("presentQuestion", () => {
  const question = bank.get("test:q3")!;

  test("shuffles the four choices and says where the right one is", () => {
    const positions = new Set<number>();
    for (let seed = 0; seed < 60; seed++) {
      const presented = presentQuestion(question, seededRng(`p${seed}`));
      expect(presented.choices).toHaveLength(4);
      expect(presented.choices[presented.answerIndex]).toBe(question.answer);
      expect(new Set(presented.choices.map((c) => c.id)).size).toBe(4);
      positions.add(presented.answerIndex);
    }
    expect([...positions].toSorted()).toEqual([0, 1, 2, 3]);
  });

  test("keeps the question's identity and source", () => {
    const presented = presentQuestion(question, seededRng("x"));
    expect(presented.id).toBe(question.id);
    expect(presented.source).toBe(question.source);
    expect(presented.prompt).toBe(question.prompt);
  });
});

describe("randomness", () => {
  test("seededRng gives values in [0, 1) and repeats for a seed", () => {
    const a = seededRng("seed");
    const b = seededRng("seed");
    for (let i = 0; i < 1000; i++) {
      const value = a();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(b()).toBe(value);
    }
    expect(seededRng(1)()).toBe(seededRng("1")());
    expect(seededRng("a")()).not.toBe(seededRng("b")());
  });

  test("shuffle returns a permutation and leaves its input alone", () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, seededRng("s"));
    expect(out.toSorted()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("secureRng stays in [0, 1)", () => {
    const rng = secureRng();
    for (let i = 0; i < 500; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("question validation", () => {
  const good = makeBank(1).all()[0]!;

  test("a duplicated choice, an indistinguishable choice or a bad source is refused", () => {
    const text = (value: string) => ({ fr: value, en: value, ja: value });
    expect(validateQuestion(good)).toEqual([]);
    const sameId = {
      ...good,
      distractors: [good.distractors[0], good.distractors[0], good.distractors[2]],
    } as QuizQuestion;
    expect(validateQuestion(sameId).join()).toContain("duplicate choice ids");
    const lookalike = {
      ...good,
      distractors: [{ id: "x", text: text("RIGHT 0!") }, good.distractors[1], good.distractors[2]],
    } as QuizQuestion;
    expect(validateQuestion(lookalike).join()).toContain("indistinguishable");
    const badSource = {
      ...good,
      source: { type: "page", kind: "wiki", url: "http://x.y/z" },
    } as unknown as QuizQuestion;
    expect(validateQuestion(badSource).join()).toContain("invalid source");
    expect(() => createBank([good, good])).toThrow(QuizBankError);
    expect(() => createBank([sameId])).toThrow(QuizBankError);
  });
});
