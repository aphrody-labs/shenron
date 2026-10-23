// SPDX-License-Identifier: Apache-2.0
import type { LocalizedText, QuizCategory, QuizSource } from "../protocol";

/** One selectable answer. `id` names the entity (term, race, planet...) and keeps choices distinct. */
export interface QuizChoice {
  readonly id: string;
  readonly text: LocalizedText;
}

/**
 * A question of the bank. The answer is stored apart from its three wrong choices so that the
 * position of the correct answer is drawn when the question is presented, not when it is built.
 */
export interface QuizQuestion {
  /** Stable (`lex:name_ja_to_fr:kamehameha`): the per-member history of seen questions keys on it. */
  readonly id: string;
  readonly category: QuizCategory;
  /** What the question is about; two questions on one subject never share a round. */
  readonly subjectKey: string;
  readonly prompt: LocalizedText;
  readonly answer: QuizChoice;
  readonly distractors: readonly [QuizChoice, QuizChoice, QuizChoice];
  readonly source: QuizSource;
}

/** A question as asked in a round: four shuffled choices and the index of the correct one. */
export interface PresentedQuestion {
  readonly id: string;
  readonly category: QuizCategory;
  readonly subjectKey: string;
  readonly prompt: LocalizedText;
  readonly choices: readonly [QuizChoice, QuizChoice, QuizChoice, QuizChoice];
  readonly answerIndex: number;
  readonly source: QuizSource;
}

export interface QuizBank {
  readonly size: number;
  all(): readonly QuizQuestion[];
  get(id: string): QuizQuestion | undefined;
  byCategory(category: QuizCategory): readonly QuizQuestion[];
  /** Categories that have at least one question, in the canonical order. */
  availableCategories(): readonly QuizCategory[];
  count(category: QuizCategory): number;
}
