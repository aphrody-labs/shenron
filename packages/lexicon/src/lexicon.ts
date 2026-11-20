// SPDX-License-Identifier: Apache-2.0
/**
 * The lexicon: validation, lookup by id or by any form, localisation, search and masking per
 * target language. Same rules as `shenron_lexicon::Lexicon` (fixtures
 * `data/lexicon/fixtures/lexicon.json`).
 */
import { codePoints, fold } from "./fold";
import { maskText, type MaskEntry, type Masked, type MaskOptions } from "./mask";
import {
  KINDS,
  LANGS,
  LEGACY_KIND,
  type Kind,
  type Lang,
  type LegacyEntry,
  type LexiconData,
  type Term,
} from "./types";

/** Field a search matched: a language or the romanisation. */
export type MatchField = Lang | "romaji";

export interface SearchOptions {
  kind?: Kind;
  /** 1 to 100 (default 20). */
  limit?: number;
}

export interface SearchHit {
  term: Term;
  score: number;
  /** Field and spelling that matched best. */
  field: MatchField;
  form: string;
  alias: boolean;
}

export interface Label {
  text: string;
  /** Language the text is in: the one asked for, or French when the English form is missing. */
  lang: Lang;
  fallback: boolean;
}

export interface Coverage {
  total: number;
  /** Terms carrying each field. */
  filled: Record<Lang | "romaji", number>;
  byKind: Partial<Record<Kind, { total: number } & Record<Lang | "romaji", number>>>;
}

const emptyCounts = () => ({ ja: 0, fr: 0, en: 0, romaji: 0 });

export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 100;

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Validation issues of a lexicon document (empty: valid). */
export function validateLexicon(data: unknown): string[] {
  const issues: string[] = [];
  const doc = data as Partial<LexiconData> | null;
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return ["not a lexicon object"];
  if (doc.version !== 1) issues.push(`version must be 1, got ${String(doc.version)}`);
  if (!Array.isArray(doc.terms)) return [...issues, "terms is not an array"];
  const ids = new Set<string>();
  const japanese = new Map<string, string>();
  doc.terms.forEach((term, index) => {
    const at = `terms[${index}]${term && typeof term.id === "string" ? ` (${term.id})` : ""}`;
    if (!term || typeof term !== "object") {
      issues.push(`${at}: not an object`);
      return;
    }
    const allowed = new Set(["id", "kind", "ja", "fr", "en", "romaji", "aliases", "sources"]);
    for (const key of Object.keys(term))
      if (!allowed.has(key)) issues.push(`${at}: unknown field ${key}`);
    if (typeof term.id !== "string" || !ID_PATTERN.test(term.id))
      issues.push(`${at}: id must be a lowercase ASCII slug`);
    else if (ids.has(term.id)) issues.push(`${at}: duplicate id`);
    else ids.add(term.id);
    if (!KINDS.includes(term.kind)) issues.push(`${at}: unknown kind ${String(term.kind)}`);
    for (const lang of LANGS) {
      const value = term[lang];
      if (typeof value !== "string") issues.push(`${at}: ${lang} must be a string`);
      else if (value !== value.trim()) issues.push(`${at}: ${lang} has outer blanks`);
      else if (lang !== "en" && !value) issues.push(`${at}: ${lang} is empty`);
    }
    if (term.romaji !== undefined && (typeof term.romaji !== "string" || !term.romaji.trim()))
      issues.push(`${at}: romaji must be a non-empty string`);
    const spellings = [term.ja, ...(term.aliases?.ja ?? [])];
    if (term.aliases !== undefined) {
      if (typeof term.aliases !== "object" || term.aliases === null || Array.isArray(term.aliases))
        issues.push(`${at}: aliases must be an object`);
      else
        for (const [lang, list] of Object.entries(term.aliases)) {
          if (!(LANGS as readonly string[]).includes(lang))
            issues.push(`${at}: aliases.${lang} is not a language`);
          else if (
            !Array.isArray(list) ||
            list.length === 0 ||
            list.some((v) => typeof v !== "string" || !v.trim() || v !== v.trim())
          )
            issues.push(`${at}: aliases.${lang} must list trimmed non-empty strings`);
          else if (new Set(list).size !== list.length || list.includes(term[lang as Lang]))
            issues.push(`${at}: aliases.${lang} repeats a form`);
        }
    }
    for (const spelling of spellings) {
      if (typeof spelling !== "string") continue;
      const owner = japanese.get(spelling);
      if (owner !== undefined && owner !== term.id)
        issues.push(`${at}: Japanese spelling ${spelling} already belongs to ${owner}`);
      japanese.set(spelling, term.id);
    }
    if (term.sources !== undefined) {
      if (
        !Array.isArray(term.sources) ||
        term.sources.some(
          (s) =>
            !s ||
            typeof s.ref !== "string" ||
            !s.ref.trim() ||
            (s.lang !== undefined && ![...LANGS, "romaji"].includes(s.lang)),
        )
      )
        issues.push(`${at}: sources must be { lang?, ref } objects`);
    }
  });
  return issues;
}

export class LexiconError extends Error {
  constructor(readonly issues: string[]) {
    super(`invalid lexicon: ${issues.slice(0, 5).join("; ")}${issues.length > 5 ? "; …" : ""}`);
  }
}

interface Form {
  key: string;
  field: MatchField;
  form: string;
  alias: boolean;
}

/** Spellings of a term, in resolution order: ja, fr, en, romaji, then aliases (ja, fr, en). */
function formsOf(term: Term): Form[] {
  const forms: Form[] = [];
  for (const lang of LANGS)
    if (term[lang])
      forms.push({ key: fold(term[lang]), field: lang, form: term[lang], alias: false });
  if (term.romaji)
    forms.push({ key: fold(term.romaji), field: "romaji", form: term.romaji, alias: true });
  for (const lang of LANGS)
    for (const alias of term.aliases?.[lang] ?? [])
      forms.push({ key: fold(alias), field: lang, form: alias, alias: true });
  return forms.filter((form) => form.key !== "");
}

/** Score of one form against a folded query (0: no match). */
function scoreOf(form: Form, query: string): number {
  if (form.key === query) return form.alias ? 90 : 100;
  if (form.key.startsWith(query)) return form.alias ? 60 : 70;
  if (form.key.includes(query)) return form.alias ? 40 : 50;
  if (codePoints(form.key) >= 2 && query.includes(form.key)) return 20;
  return 0;
}

export class Lexicon {
  readonly version: 1;
  readonly terms: readonly Term[];
  readonly #byId: Map<string, Term>;
  readonly #forms: Form[][];

  constructor(data: LexiconData) {
    this.version = data.version;
    this.terms = data.terms;
    this.#byId = new Map(data.terms.map((term) => [term.id, term]));
    this.#forms = data.terms.map(formsOf);
  }

  /** Validate then build; throws `LexiconError` with every issue. */
  static parse(data: unknown): Lexicon {
    const issues = validateLexicon(data);
    if (issues.length) throw new LexiconError(issues);
    return new Lexicon(data as LexiconData);
  }

  get size(): number {
    return this.terms.length;
  }

  get(id: string): Term | undefined {
    return this.#byId.get(id);
  }

  /**
   * The term an id or a form designates: the id first, then an exact folded match on a main
   * form (ja, fr, en), the romanisation, then an alias; the first term in data order wins a tie.
   */
  resolve(idOrForm: string): Term | undefined {
    const byId = this.#byId.get(idOrForm.trim().toLowerCase());
    if (byId) return byId;
    const key = fold(idOrForm);
    if (!key) return undefined;
    for (const pass of [false, true]) {
      for (let index = 0; index < this.terms.length; index++) {
        const hit = this.#forms[index]!.some((form) => form.alias === pass && form.key === key);
        if (hit) return this.terms[index];
      }
    }
    return undefined;
  }

  /** Form of `term` in `lang`; the English form falls back to the French one while it is missing. */
  label(term: Term, lang: Lang): Label {
    const text = term[lang];
    if (text) return { text, lang, fallback: false };
    return { text: term.fr, lang: "fr", fallback: true };
  }

  /** Terms matching `query` in any language, best first (score, shortest form, id). */
  search(query: string, options: SearchOptions = {}): SearchHit[] {
    const key = fold(query);
    if (!key) return [];
    const limit = Math.min(
      SEARCH_MAX_LIMIT,
      Math.max(1, Math.trunc(options.limit ?? SEARCH_DEFAULT_LIMIT)),
    );
    const hits: (SearchHit & { length: number })[] = [];
    this.terms.forEach((term, index) => {
      if (options.kind && term.kind !== options.kind) return;
      let best: (SearchHit & { length: number }) | null = null;
      for (const form of this.#forms[index]!) {
        const score = scoreOf(form, key);
        if (score === 0) continue;
        const length = codePoints(form.key);
        if (!best || score > best.score || (score === best.score && length < best.length))
          best = { term, score, field: form.field, form: form.form, alias: form.alias, length };
      }
      if (best) hits.push(best);
    });
    const ranked = hits.toSorted(
      (a, b) =>
        b.score - a.score ||
        a.length - b.length ||
        (a.term.id < b.term.id ? -1 : a.term.id > b.term.id ? 1 : 0),
    );
    return ranked.slice(0, limit).map(({ length: _length, ...hit }) => hit);
  }

  /** Masking entries towards `target`: Japanese spellings (main form and aliases) → target form. */
  maskEntries(target: Exclude<Lang, "ja">): MaskEntry<Term>[] {
    return this.terms.map((term) => ({
      sources: [term.ja, ...(term.aliases?.ja ?? [])],
      target: term[target],
      value: term,
    }));
  }

  /** Mask the Japanese terms of `text` for a translation into `target`. */
  mask(text: string, target: Exclude<Lang, "ja">, options: MaskOptions = {}): Masked<Term> {
    return maskText(text, this.maskEntries(target), options);
  }

  /**
   * Rows of the legacy `data/lexique-db-canonique.json`: one per Japanese spelling, longest
   * first, then by spelling (root collation, the order the file always had).
   */
  legacyEntries(): LegacyEntry[] {
    const rows: LegacyEntry[] = [];
    for (const term of this.terms) {
      for (const ja of [term.ja, ...(term.aliases?.ja ?? [])]) {
        rows.push({ ja, fr: term.fr, kind: LEGACY_KIND[term.kind], length: codePoints(ja) });
      }
    }
    const collator = new Intl.Collator("und");
    return rows.toSorted((a, b) => b.length - a.length || collator.compare(a.ja, b.ja));
  }

  coverage(): Coverage {
    const fields = [...LANGS, "romaji"] as const;
    const coverage: Coverage = { total: this.terms.length, filled: emptyCounts(), byKind: {} };
    for (const term of this.terms) {
      const kind = (coverage.byKind[term.kind] ??= { total: 0, ...emptyCounts() });
      kind.total++;
      for (const field of fields) {
        if (term[field]) {
          coverage.filled[field]++;
          kind[field]++;
        }
      }
    }
    return coverage;
  }
}
