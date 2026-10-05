// SPDX-License-Identifier: Apache-2.0
/**
 * `@shenron/lexicon/data` — the canonical lexicon embedded in the bundle
 * (`terms.generated.ts`, generated from `data/lexicon/terms.json` by
 * `bun scripts/data/lexicon.ts build`). Runtime class `pure`.
 */
import { Lexicon } from "./lexicon";
import { LEXICON_DATA } from "./terms.generated";

export { LEXICON_DATA };

let embedded: Lexicon | null = null;

/** The embedded lexicon (built once, on first use). */
export function lexicon(): Lexicon {
  embedded ??= new Lexicon(LEXICON_DATA);
  return embedded;
}
