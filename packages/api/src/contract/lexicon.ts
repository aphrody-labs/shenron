// SPDX-License-Identifier: Apache-2.0
/**
 * Trilingual lexicon (`@aphrody/shenron-lexicon`, `data/lexicon/terms.json`): list, search and the
 * localised resolution of one term. Runtime class: `pure`.
 */
import { KINDS, LANGS, SEARCH_MAX_LIMIT } from "@aphrody/shenron-lexicon";
import { z } from "zod";

export const LexiconLang = z.enum(LANGS).meta({ id: "LexiconLang" });
export type LexiconLang = z.infer<typeof LexiconLang>;

export const LexiconKind = z.enum(KINDS).meta({ id: "LexiconKind" });

const AliasList = z.array(z.string());

export const LexiconTerm = z
  .object({
    id: z.string(),
    kind: LexiconKind,
    /** Form in the requested language; French when the English form is not established. */
    label: z.string(),
    labelLang: LexiconLang,
    fallback: z.boolean(),
    ja: z.string(),
    fr: z.string(),
    /** `null` while no source establishes the English form. */
    en: z.string().nullable(),
    romaji: z.string().nullable(),
    aliases: z.object({ ja: AliasList, fr: AliasList, en: AliasList }),
    /** Search rank (with `q` only). */
    score: z.number().int().optional(),
  })
  .meta({ id: "LexiconTerm" });
export type LexiconTerm = z.infer<typeof LexiconTerm>;

/** `lang` (else `Accept-Language`, else French), `kind`, `q` (any language) and the page. */
export const LexiconListQuery = z
  .object({
    lang: LexiconLang.optional(),
    kind: LexiconKind.optional(),
    q: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(SEARCH_MAX_LIMIT).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .meta({ id: "LexiconListQuery" });

export const LexiconListResponse = z
  .object({
    lang: LexiconLang,
    version: z.number().int(),
    items: z.array(LexiconTerm),
    total: z.number().int().min(0),
    limit: z.number().int(),
    offset: z.number().int(),
  })
  .meta({ id: "LexiconListResponse" });
export type LexiconListResponse = z.infer<typeof LexiconListResponse>;

/** `{idOrForm}`: a term id (`frieza`) or any of its forms (`Freezer`, `フリーザ`, `Freeza`). */
export const LexiconTermParams = z.object({ idOrForm: z.string().min(1).max(200) });

export const LexiconTermQuery = z
  .object({ lang: LexiconLang.optional() })
  .meta({ id: "LexiconTermQuery" });
