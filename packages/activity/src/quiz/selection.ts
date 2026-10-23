// SPDX-License-Identifier: Apache-2.0
import type { QuizCategory } from "../protocol";
import { randomInt, shuffle, type Rng } from "../rng";
import type { PresentedQuestion, QuizBank, QuizChoice, QuizQuestion } from "./types";

export interface SelectionOptions {
  /** Number of questions wanted; fewer are returned when the bank cannot serve them. */
  readonly count: number;
  /** Categories to draw from (default: every category the bank serves). */
  readonly categories?: readonly QuizCategory[];
  readonly rng: Rng;
  /**
   * Question ids to avoid, typically the union of what the room's members saw during the last 30
   * days (G1 anti-abuse). They are used only when the fresh questions run out.
   */
  readonly avoid?: ReadonlySet<string>;
}

interface Queue {
  readonly category: QuizCategory;
  readonly items: QuizQuestion[];
  cursor: number;
}

function queueOf(category: QuizCategory, questions: readonly QuizQuestion[], rng: Rng): Queue {
  return { category, items: shuffle(questions, rng), cursor: 0 };
}

/** Next question of the queue whose subject is not used yet, or `null`. */
function take(queue: Queue, usedSubjects: ReadonlySet<string>): QuizQuestion | null {
  while (queue.cursor < queue.items.length) {
    const question = queue.items[queue.cursor++] as QuizQuestion;
    if (!usedSubjects.has(question.subjectKey)) return question;
  }
  return null;
}

/**
 * Draws a round's questions: balanced across the requested categories (the category with the fewest
 * picks so far is served next, ties broken at random), never two questions on one subject, fresh
 * questions before ones in `avoid`. Deterministic for a given `rng`.
 */
export function selectQuestions(bank: QuizBank, options: SelectionOptions): QuizQuestion[] {
  const wanted = options.categories ?? bank.availableCategories();
  const categories = [...new Set(wanted)].filter((category) => bank.count(category) > 0);
  const avoid = options.avoid ?? new Set<string>();
  const picked: QuizQuestion[] = [];
  const usedSubjects = new Set<string>();

  for (const pool of ["fresh", "stale"] as const) {
    if (picked.length >= options.count) break;
    const queues = categories.map((category) =>
      queueOf(
        category,
        bank
          .byCategory(category)
          .filter((question) => avoid.has(question.id) === (pool === "stale")),
        options.rng,
      ),
    );
    const picks = new Map<QuizCategory, number>(categories.map((category) => [category, 0]));
    let live = queues.filter((queue) => queue.items.length > 0);
    while (picked.length < options.count && live.length > 0) {
      const fewest = Math.min(...live.map((queue) => picks.get(queue.category) as number));
      const tied = live.filter((queue) => picks.get(queue.category) === fewest);
      const queue = tied[randomInt(options.rng, tied.length)] as Queue;
      const question = take(queue, usedSubjects);
      if (question === null) {
        live = live.filter((candidate) => candidate !== queue);
        continue;
      }
      picked.push(question);
      usedSubjects.add(question.subjectKey);
      picks.set(queue.category, (picks.get(queue.category) as number) + 1);
    }
  }
  return picked;
}

/** Shuffles the four choices of a question and records where the right one landed. */
export function presentQuestion(question: QuizQuestion, rng: Rng): PresentedQuestion {
  const choices = shuffle([question.answer, ...question.distractors], rng) as [
    QuizChoice,
    QuizChoice,
    QuizChoice,
    QuizChoice,
  ];
  return {
    id: question.id,
    category: question.category,
    subjectKey: question.subjectKey,
    prompt: question.prompt,
    choices,
    answerIndex: choices.indexOf(question.answer),
    source: question.source,
  };
}
