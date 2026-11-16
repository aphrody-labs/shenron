// SPDX-License-Identifier: Apache-2.0
/**
 * `@shenron/activity/quiz/lexicon` — the question bank built from the canonical lexicon
 * embedded in `@shenron/lexicon/data` (`data/lexicon/terms.json`). Runtime class `pure`.
 *
 * Built on first use and kept: the bank is immutable and shared by every room.
 */
import { LEXICON_DATA } from "@shenron/lexicon/data";
import { buildLexiconBank } from "./lexicon-bank";
import type { QuizBank } from "./types";

let embedded: QuizBank | null = null;

export function lexiconQuizBank(): QuizBank {
  embedded ??= buildLexiconBank(LEXICON_DATA.terms);
  return embedded;
}
