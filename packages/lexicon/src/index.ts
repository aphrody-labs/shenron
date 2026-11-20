// SPDX-License-Identifier: Apache-2.0
/**
 * `@aphrody/shenron-lexicon` — the one Dragon Ball translation lexicon (ja/fr/en) of Shenron: format,
 * search, localisation and term protection around a translation engine. Runtime class `pure`.
 *
 * The data ships separately (`@aphrody/shenron-lexicon/data`) so the engine can run on another copy
 * of `data/lexicon/terms.json` (the plugin's offline snapshot, a test lexicon).
 */
export * from "./types";
export { codePoints, fold, foldChar } from "./fold";
export {
  DEFAULT_TOKEN_PREFIX,
  DEFAULT_TOKEN_WIDTH,
  findOccurrences,
  findTokens,
  maskText,
  restoreTokens,
  tokenOf,
  wordEdges,
  type Masked,
  type MaskedToken,
  type MaskEntry,
  type MaskOptions,
  type Occurrence,
  type Restored,
  type TokenOptions,
} from "./mask";
export {
  Lexicon,
  LexiconError,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  validateLexicon,
  type Coverage,
  type Label,
  type MatchField,
  type SearchHit,
  type SearchOptions,
} from "./lexicon";
