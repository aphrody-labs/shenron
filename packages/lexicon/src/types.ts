// SPDX-License-Identifier: Apache-2.0
/**
 * Shapes of the canonical Dragon Ball lexicon (`data/lexicon/terms.json`, schema
 * `data/lexicon/terms.schema.json`). The Rust crate `shenron-lexicon` reads the same file.
 */

/** Languages of a term. Japanese is the source of the masking; French and English are targets. */
export const LANGS = ["ja", "fr", "en"] as const;
export type Lang = (typeof LANGS)[number];

/** Kinds of a term. */
export const KINDS = [
  "character",
  "technique",
  "transformation",
  "race",
  "place",
  "item",
  "event",
  "title",
  "saga",
  "arc",
  "organization",
  "other",
] as const;
export type Kind = (typeof KINDS)[number];

/** Other attested spellings, per language. Japanese aliases are masked like the main form. */
export interface Aliases {
  ja?: string[];
  fr?: string[];
  en?: string[];
}

/** Provenance of a field: a repository path or an editorial reference. */
export interface Source {
  lang?: Lang | "romaji";
  ref: string;
}

export interface Term {
  /** Stable English slug (`frieza`, `kaioken`); never reused for another term. */
  id: string;
  kind: Kind;
  /** Japanese form printed in the manga or the official guides. */
  ja: string;
  /** French form of the dragonballfr.com wiki. */
  fr: string;
  /** Official English form; empty while it is not established by a source. */
  en: string;
  /** Hepburn romanisation, when a source gives it. */
  romaji?: string;
  aliases?: Aliases;
  sources?: Source[];
}

export interface LexiconData {
  version: 1;
  terms: Term[];
}

/** Row of the legacy `data/lexique-db-canonique.json` (derived output). */
export interface LegacyEntry {
  ja: string;
  fr: string;
  kind: LegacyKind;
  length: number;
}

export type LegacyKind =
  | "personnage"
  | "technique"
  | "transformation"
  | "planete"
  | "race"
  | "saga"
  | "arc"
  | "autre";

/** Legacy kind of each kind (lossy: item, event, title, organization and other become `autre`). */
export const LEGACY_KIND: Readonly<Record<Kind, LegacyKind>> = {
  character: "personnage",
  technique: "technique",
  transformation: "transformation",
  race: "race",
  place: "planete",
  item: "autre",
  event: "autre",
  title: "autre",
  saga: "saga",
  arc: "arc",
  organization: "autre",
  other: "autre",
};
