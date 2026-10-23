// SPDX-License-Identifier: Apache-2.0
import {
  LocalizedTextSchema,
  QUIZ_CATEGORIES,
  QuizSourceSchema,
  type QuizCategory,
} from "../protocol";
import type { QuizBank, QuizChoice, QuizQuestion } from "./types";

export class QuizBankError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuizBankError";
  }
}

/**
 * Comparison form of a displayed text: compatibility-normalised, lower-cased, Latin accents and
 * punctuation removed. Two choices whose folded forms are equal would look identical to a player.
 * Kana voicing marks are kept: "ガ" and "カ" are different letters.
 */
export function foldText(text: string): string {
  let stripped = "";
  for (const char of text.normalize("NFKD")) {
    if (!isLatinMark(char.codePointAt(0) as number)) stripped += char;
  }
  return stripped
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

/** The Combining Diacritical Marks block: accents of Latin letters (kana voicing marks are elsewhere). */
function isLatinMark(codePoint: number): boolean {
  return codePoint >= 0x300 && codePoint <= 0x36f;
}

function distinctChoices(question: QuizQuestion): QuizChoice[] {
  return [question.answer, ...question.distractors];
}

/** Checks one question: well-formed texts and source, four choices that cannot be confused. */
export function validateQuestion(question: QuizQuestion): string[] {
  const issues: string[] = [];
  const at = `question ${question.id}`;
  if (!/^[a-z0-9_:.-]{3,120}$/i.test(question.id)) issues.push(`${at}: malformed id`);
  if (!QUIZ_CATEGORIES.includes(question.category)) issues.push(`${at}: unknown category`);
  if (!LocalizedTextSchema.safeParse(question.prompt).success) issues.push(`${at}: invalid prompt`);
  if (!QuizSourceSchema.safeParse(question.source).success) issues.push(`${at}: invalid source`);
  if (question.distractors.length !== 3) issues.push(`${at}: needs exactly three distractors`);
  const choices = distinctChoices(question);
  for (const choice of choices) {
    if (!LocalizedTextSchema.safeParse(choice.text).success)
      issues.push(`${at}: invalid choice text (${choice.id})`);
  }
  if (new Set(choices.map((choice) => choice.id)).size !== choices.length)
    issues.push(`${at}: duplicate choice ids`);
  for (const locale of ["fr", "en", "ja"] as const) {
    const folded = choices.map((choice) => foldText(choice.text[locale]));
    if (new Set(folded).size !== folded.length)
      issues.push(`${at}: indistinguishable ${locale} choices`);
  }
  return issues;
}

/** Builds a bank from questions, refusing duplicates and malformed entries. */
export function createBank(questions: readonly QuizQuestion[]): QuizBank {
  const byId = new Map<string, QuizQuestion>();
  const byCategory = new Map<QuizCategory, QuizQuestion[]>();
  const issues: string[] = [];
  for (const question of questions) {
    if (byId.has(question.id)) {
      issues.push(`question ${question.id}: duplicate id`);
      continue;
    }
    issues.push(...validateQuestion(question));
    byId.set(question.id, question);
    const list = byCategory.get(question.category) ?? [];
    list.push(question);
    byCategory.set(question.category, list);
  }
  if (issues.length > 0)
    throw new QuizBankError(
      `invalid quiz bank (${issues.length} issues): ${issues.slice(0, 5).join("; ")}`,
    );
  const all = [...byId.values()];
  const available = QUIZ_CATEGORIES.filter(
    (category) => (byCategory.get(category)?.length ?? 0) > 0,
  );
  return {
    size: all.length,
    all: () => all,
    get: (id) => byId.get(id),
    byCategory: (category) => byCategory.get(category) ?? [],
    availableCategories: () => available,
    count: (category) => byCategory.get(category)?.length ?? 0,
  };
}

/** Union of several banks; a question id present in two banks is an error. */
export function mergeBanks(...banks: readonly QuizBank[]): QuizBank {
  return createBank(banks.flatMap((bank) => bank.all()));
}
