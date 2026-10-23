// SPDX-License-Identifier: Apache-2.0
/**
 * Question bank generated from the canonical Dragon Ball lexicon (`data/lexicon/terms.json`, the
 * one ja/fr/en lexicon of Shenron, see docs/architecture/lexicon.md). It asks only what the lexicon
 * states: how a term is written in another language. No fact is added: every prompt, answer and
 * wrong choice is a lexicon form.
 *
 * The builder takes terms structurally (`LexiconTermInput` is a subset of the lexicon's `Term`) so
 * that it also runs on the plugin's offline snapshot or on a test lexicon; the embedded lexicon is
 * wired in `./lexicon`.
 */
import { localizeWith, type DictionaryKey } from "../i18n";
import { seededRng, shuffle } from "../rng";
import type { QuizCategory } from "../protocol";
import { createBank, foldText } from "./bank";
import type { QuizBank, QuizChoice, QuizQuestion } from "./types";

export interface LexiconTermInput {
  readonly id: string;
  readonly kind: string;
  readonly ja: string;
  readonly fr: string;
  /** Empty while no source establishes the official English form. */
  readonly en: string;
  readonly aliases?: {
    readonly ja?: readonly string[];
    readonly fr?: readonly string[];
    readonly en?: readonly string[];
  };
}

export interface LexiconBankOptions {
  /** Seed of the wrong-choice draw: the same seed always builds the same bank. */
  readonly seed?: string;
  /** Term ids never asked nor used as a wrong choice. */
  readonly excludeIds?: ReadonlySet<string>;
}

/** Lexicon placeholders that are not a name (`不明` / "Inconnu" means "unknown"). */
export const DEFAULT_EXCLUDED_TERM_IDS: ReadonlySet<string> = new Set(["inconnu"]);

const CATEGORY_OF_KIND: Readonly<Record<string, QuizCategory>> = {
  character: "characters",
  technique: "techniques",
  transformation: "transformations",
  saga: "sagas",
  arc: "sagas",
  place: "world",
  race: "world",
  item: "world",
  organization: "world",
  event: "world",
};

/** Categories whose terms may serve as wrong choices for a category (techniques and forms mix). */
const DISTRACTOR_CATEGORIES: Readonly<Record<QuizCategory, readonly QuizCategory[]>> = {
  characters: ["characters"],
  techniques: ["techniques", "transformations"],
  transformations: ["transformations", "techniques"],
  sagas: ["sagas"],
  volumes: ["volumes"],
  world: ["world"],
  databooks: ["databooks"],
};

type TemplateId = "name_ja_to_fr" | "name_fr_to_ja" | "name_fr_to_en";

interface Entry {
  readonly term: LexiconTermInput;
  readonly category: QuizCategory;
  /** Folded forms of the term in every language, aliases included. */
  readonly forms: ReadonlySet<string>;
}

interface TemplateDef {
  readonly id: TemplateId;
  readonly prompt: DictionaryKey;
  readonly subject: (term: LexiconTermInput) => string;
  readonly answer: (term: LexiconTermInput) => string;
}

const TEMPLATES: readonly TemplateDef[] = [
  {
    id: "name_ja_to_fr",
    prompt: "prompt.name_ja_to_fr",
    subject: (t) => t.ja,
    answer: (t) => t.fr,
  },
  {
    id: "name_fr_to_ja",
    prompt: "prompt.name_fr_to_ja",
    subject: (t) => t.fr,
    answer: (t) => t.ja,
  },
  {
    id: "name_fr_to_en",
    prompt: "prompt.name_fr_to_en",
    subject: (t) => t.fr,
    answer: (t) => t.en,
  },
];

interface Candidate {
  readonly entry: Entry;
  readonly text: string;
  readonly folded: string;
  readonly length: number;
  readonly script: "han" | "kana" | "latin";
}

function scriptOf(text: string): Candidate["script"] {
  if (/\p{Script=Han}/u.test(text)) return "han";
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return "kana";
  return "latin";
}

function isQuizSafe(term: LexiconTermInput, excluded: ReadonlySet<string>): boolean {
  if (excluded.has(term.id)) return false;
  if (term.ja.trim() === "" || term.fr.trim() === "") return false;
  if (term.ja === term.fr) return false;
  // "Freezer (futur)", "Kabla N°44": variants whose name alone is ambiguous as an answer.
  if (/[()]|N°/.test(term.fr)) return false;
  return term.fr.length <= 80 && term.ja.length <= 80 && term.en.length <= 80;
}

function formsOf(term: LexiconTermInput): Set<string> {
  const forms = new Set<string>();
  for (const text of [
    term.ja,
    term.fr,
    term.en,
    ...(term.aliases?.ja ?? []),
    ...(term.aliases?.fr ?? []),
    ...(term.aliases?.en ?? []),
  ]) {
    const folded = foldText(text);
    if (folded !== "") forms.add(folded);
  }
  return forms;
}

function choiceOf(entry: Entry, text: string): QuizChoice {
  return { id: `lex:${entry.term.id}`, text: { fr: text, en: text, ja: text } };
}

/** Wrong choices for `subject`, close in length and script to the right answer. */
function pickDistractors(
  subject: Entry,
  answer: Candidate,
  pool: readonly Candidate[],
  seed: string,
): Candidate[] | null {
  // Index of the first candidate at least as long as the answer, then expand both ways by length.
  let low = 0;
  let high = pool.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((pool[mid] as Candidate).length < answer.length) low = mid + 1;
    else high = mid;
  }
  const nearest: Candidate[] = [];
  const seen = new Set<string>([answer.folded]);
  let left = low - 1;
  let right = low;
  const usable = (candidate: Candidate): boolean =>
    candidate.entry.term.id !== subject.term.id &&
    !seen.has(candidate.folded) &&
    // Never offer a spelling the subject itself is known by (an alias of the answer, say)...
    !subject.forms.has(candidate.folded) &&
    // ...nor a term that is known by the right answer's spelling.
    !candidate.entry.forms.has(answer.folded);
  while (nearest.length < 18 && (left >= 0 || right < pool.length)) {
    const leftGap = left >= 0 ? answer.length - (pool[left] as Candidate).length : Infinity;
    const rightGap =
      right < pool.length ? (pool[right] as Candidate).length - answer.length : Infinity;
    const candidate =
      leftGap <= rightGap ? (pool[left--] as Candidate) : (pool[right++] as Candidate);
    if (!usable(candidate)) continue;
    seen.add(candidate.folded);
    nearest.push(candidate);
  }
  if (nearest.length < 3) return null;
  const ranked = nearest
    .map((candidate, order) => ({
      candidate,
      order,
      mismatch: candidate.script === answer.script ? 0 : 1,
      gap: Math.abs(candidate.length - answer.length),
    }))
    .toSorted((a, b) => a.mismatch - b.mismatch || a.gap - b.gap || a.order - b.order)
    .slice(0, 9)
    .map((item) => item.candidate);
  return shuffle(ranked, seededRng(seed)).slice(0, 3);
}

/**
 * Builds the lexicon bank: for each usable term, "ja to fr" and "fr to ja" questions, and "fr to en"
 * when an official English form that differs from the French one is established.
 *
 * Question ids are `lex:<template>:<term id>`, stable across builds and seeds.
 */
export function buildLexiconBank(
  terms: readonly LexiconTermInput[],
  options: LexiconBankOptions = {},
): QuizBank {
  const seed = options.seed ?? "lexicon-bank-v1";
  const excluded = options.excludeIds ?? DEFAULT_EXCLUDED_TERM_IDS;
  const entries: Entry[] = [];
  for (const term of terms) {
    const category = CATEGORY_OF_KIND[term.kind];
    if (category === undefined || !isQuizSafe(term, excluded)) continue;
    entries.push({ term, category, forms: formsOf(term) });
  }

  const questions: QuizQuestion[] = [];
  for (const template of TEMPLATES) {
    const candidates: Candidate[] = [];
    for (const entry of entries) {
      const text = template.answer(entry.term).trim();
      const subject = template.subject(entry.term).trim();
      if (text === "" || subject === "") continue;
      const folded = foldText(text);
      // "Kamehameha" in French and in English is not a question.
      if (folded === "" || folded === foldText(subject)) continue;
      candidates.push({
        entry,
        text,
        folded,
        length: [...text].length,
        script: scriptOf(text),
      });
    }
    const sorted = candidates.toSorted(
      (a, b) => a.length - b.length || a.entry.term.id.localeCompare(b.entry.term.id),
    );
    const pools = new Map<QuizCategory, Candidate[]>();
    const poolFor = (category: QuizCategory): Candidate[] => {
      let pool = pools.get(category);
      if (!pool) {
        const accepted = new Set(DISTRACTOR_CATEGORIES[category]);
        pool = sorted.filter((candidate) => accepted.has(candidate.entry.category));
        pools.set(category, pool);
      }
      return pool;
    };

    for (const answer of sorted) {
      const id = `lex:${template.id}:${answer.entry.term.id}`;
      let wrong = pickDistractors(
        answer.entry,
        answer,
        poolFor(answer.entry.category),
        `${seed}|${id}`,
      );
      // Too few same-category terms (official English names are rare): borrow from any category.
      if (wrong === null && template.id === "name_fr_to_en") {
        wrong = pickDistractors(answer.entry, answer, sorted, `${seed}|${id}`);
      }
      if (wrong === null) continue;
      const subjectText = template.subject(answer.entry.term).trim();
      const [first, second, third] = wrong;
      questions.push({
        id,
        category: answer.entry.category,
        subjectKey: `lex:${answer.entry.term.id}`,
        prompt: localizeWith(template.prompt, () => ({ subject: subjectText })),
        answer: choiceOf(answer.entry, answer.text),
        distractors: [
          choiceOf((first as Candidate).entry, (first as Candidate).text),
          choiceOf((second as Candidate).entry, (second as Candidate).text),
          choiceOf((third as Candidate).entry, (third as Candidate).text),
        ],
        source: { type: "lexicon", id: answer.entry.term.id },
      });
    }
  }
  return createBank(questions);
}
