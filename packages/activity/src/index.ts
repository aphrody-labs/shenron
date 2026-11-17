// SPDX-License-Identifier: Apache-2.0
/**
 * `@aphrody/shenron-activity` — protocol, rooms and Quiz Budokai rules of the Arène Shenron Discord
 * Activity (docs/products/bot-discord-refonte.md §6 G1, §7). Runtime class `pure`: no Discord, no
 * network, no environment; time, randomness and the signing secret are injected.
 *
 *  - `./protocol`     wire messages (zod v4, versioned), limits, error codes
 *  - `./rooms`        per-instance room (lobby, round, results), registry, anti-spam
 *  - `./quiz`         banks, selection, scoring, round, bounded zeni rewards, signed receipts
 *  - `./quiz/lexicon` the bank built from the embedded lexicon
 *  - `./i18n`         fr/en/ja labels
 *  - `./testing`      `ManualClock`
 */
export * from "./protocol";
export { systemClock, type Clock } from "./clock";
export { randomInt, secureRng, seededRng, shuffle, type Rng } from "./rng";
export * from "./rooms";
export * from "./quiz";
export {
  DEFAULT_LOCALE,
  DICTIONARIES,
  interpolate,
  isLocale,
  localize,
  localizeWith,
  placeholders,
  t,
  type DictionaryKey,
  type TemplateParams,
} from "./i18n";
