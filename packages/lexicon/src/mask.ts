// SPDX-License-Identifier: Apache-2.0
/**
 * Term protection around a translation engine, identical to `shenron_lexicon::mask`
 * (fixtures `data/lexicon/fixtures/{mask,restore,tokens}.json`).
 *
 * - **Masking**: the source spellings found in the text are replaced, longest first, in one pass
 *   and without overlap, by numbered tokens (`Zeta001`). Katakana and Latin spellings only match
 *   on word edges (`セル` is not masked inside `カプセル`); kanji and kana particles carry no edge
 *   (`悟空達`, `ベジータは`). An entry keeps the same token everywhere; past the token budget the
 *   next entries stay in clear and are counted in `overflow`.
 * - **Restoration**: every token the engine returned, whatever it made of it (`Zêta001`,
 *   `ZETA 001`, `Zeta-001`), is replaced by its target form. A form already written next to its
 *   token (`la Terre Zeta003`) is not doubled. Tokens the table does not know (inventions) stay
 *   in clear and are reported in `unresolved`; table tokens absent from the translation are
 *   reported in `missing`.
 *
 * Offsets are code points, never UTF-16 units.
 */
import { foldChar } from "./fold";

/** Default token prefix: a short Latin name that engines copy instead of translating. */
export const DEFAULT_TOKEN_PREFIX = "Zeta";
/** Default number of digits of a token. */
export const DEFAULT_TOKEN_WIDTH = 3;

export interface TokenOptions {
  /** Letters only; must not be a word of the target language (default `Zeta`). */
  prefix?: string;
  /**
   * Digits of a token (default 3). Given explicitly, restoration reads exactly that many digits
   * (`QXZ00013` is `QXZ0001` followed by `3`); otherwise a run of 3 or 4 digits.
   */
  width?: number;
}

export interface MaskOptions extends TokenOptions {
  /** Distinct entries masked at most (default and ceiling: the largest number of `width` digits). */
  maxTokens?: number;
}

/** One protected entry: its source spellings and the form restored in the translation. */
export interface MaskEntry<T = unknown> {
  sources: readonly string[];
  target: string;
  value: T;
}

export interface Occurrence<T = unknown> {
  /** Code point offsets in the text. */
  start: number;
  end: number;
  /** The spelling found. */
  source: string;
  /** Index of the entry in the list given. */
  index: number;
  entry: MaskEntry<T>;
}

export interface MaskedToken<T = unknown> {
  token: string;
  number: number;
  target: string;
  index: number;
  entry: MaskEntry<T>;
}

export interface Masked<T = unknown> {
  text: string;
  tokens: MaskedToken<T>[];
  /** Distinct entries found but left in clear because the token budget was exhausted. */
  overflow: number;
}

export interface Restored {
  text: string;
  /** Distinct token spellings left in the restored text (inventions of the engine). */
  unresolved: string[];
  /** Table tokens that never appeared in the translation (a term the engine dropped). */
  missing: string[];
}

type CharClass = "katakana" | "latin" | null;

function charClass(c: string | undefined): CharClass {
  if (c === undefined) return null;
  const code = c.codePointAt(0)!;
  if (
    (code >= 0x30a1 && code <= 0x30fa) ||
    (code >= 0x30fc && code <= 0x30ff) ||
    (code >= 0x31f0 && code <= 0x31ff) ||
    (code >= 0xff66 && code <= 0xff9f)
  )
    return "katakana";
  if (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0xc0 && code <= 0x24f)
  )
    return "latin";
  return null;
}

/**
 * `chars[start..end)` is not a fragment of a longer katakana or Latin word. Kanji and kana
 * particles carry no edge: Japanese glues them to names.
 */
export function wordEdges(chars: readonly string[], start: number, end: number): boolean {
  const first = charClass(chars[start]);
  if (first && start > 0 && charClass(chars[start - 1]) === first) return false;
  const last = charClass(chars[end - 1]);
  if (last && charClass(chars[end]) === last) return false;
  return true;
}

function sameChars(chars: readonly string[], at: number, source: readonly string[]): boolean {
  if (at + source.length > chars.length) return false;
  for (let k = 0; k < source.length; k++) if (chars[at + k] !== source[k]) return false;
  return true;
}

/** Entries that can be masked: a non-empty target and spellings of at least two code points. */
function patterns<T>(entries: readonly MaskEntry<T>[]): Map<string, [string[], string, number][]> {
  const byInitial = new Map<string, [string[], string, number][]>();
  entries.forEach((entry, index) => {
    if (!entry.target) return;
    for (const source of entry.sources) {
      const chars = [...source];
      if (chars.length < 2) continue;
      const list = byInitial.get(chars[0]!) ?? [];
      list.push([chars, source, index]);
      byInitial.set(chars[0]!, list);
    }
  });
  return byInitial;
}

/** Occurrences kept in `text`: longest first, one pass, no overlap, on word edges; in text order. */
export function findOccurrences<T>(
  text: string,
  entries: readonly MaskEntry<T>[],
): Occurrence<T>[] {
  return occurrencesIn([...text], entries);
}

function occurrencesIn<T>(chars: readonly string[], entries: readonly MaskEntry<T>[]) {
  const byInitial = patterns(entries);
  const candidates: Occurrence<T>[] = [];
  chars.forEach((initial, start) => {
    for (const [source, spelling, index] of byInitial.get(initial) ?? []) {
      const end = start + source.length;
      if (sameChars(chars, start, source) && wordEdges(chars, start, end)) {
        candidates.push({ start, end, source: spelling, index, entry: entries[index]! });
      }
    }
  });
  const ordered = candidates.toSorted(
    (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
  );
  const taken = new Uint8Array(chars.length);
  const kept: Occurrence<T>[] = [];
  for (const candidate of ordered) {
    let free = true;
    for (let k = candidate.start; k < candidate.end; k++) {
      if (taken[k]) {
        free = false;
        break;
      }
    }
    if (!free) continue;
    taken.fill(1, candidate.start, candidate.end);
    kept.push(candidate);
  }
  return kept.toSorted((a, b) => a.start - b.start);
}

function width(options: TokenOptions): number {
  const value = options.width ?? DEFAULT_TOKEN_WIDTH;
  return Math.min(9, Math.max(1, Math.trunc(value)));
}

function prefix(options: TokenOptions): string {
  return options.prefix || DEFAULT_TOKEN_PREFIX;
}

/** Token number `n` (from 1): `Zeta001`. */
export function tokenOf(n: number, options: TokenOptions = {}): string {
  return `${prefix(options)}${String(n).padStart(width(options), "0")}`;
}

/** Replace the spellings of `entries` found in `text` by numbered tokens. */
export function maskText<T>(
  text: string,
  entries: readonly MaskEntry<T>[],
  options: MaskOptions = {},
): Masked<T> {
  const ceiling = 10 ** width(options) - 1;
  const max = Math.min(options.maxTokens ?? ceiling, ceiling);
  const chars = [...text];
  const tokens: MaskedToken<T>[] = [];
  const slotOf = new Map<number, number | null>();
  let overflow = 0;
  let out = "";
  let cursor = 0;
  for (const occurrence of occurrencesIn(chars, entries)) {
    let slot = slotOf.get(occurrence.index);
    if (slot === undefined) {
      if (tokens.length >= max) {
        slot = null;
        overflow++;
      } else {
        slot = tokens.length;
        tokens.push({
          token: tokenOf(slot + 1, options),
          number: slot + 1,
          target: occurrence.entry.target,
          index: occurrence.index,
          entry: occurrence.entry,
        });
      }
      slotOf.set(occurrence.index, slot);
    }
    if (slot === null) continue;
    out += chars.slice(cursor, occurrence.start).join("") + tokens[slot]!.token;
    cursor = occurrence.end;
  }
  out += chars.slice(cursor).join("");
  return { text: out, tokens, overflow };
}

const WHITE_SPACE = /^\p{White_Space}$/u;
const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";

/** A token at `start`: folded prefix, at most one separator, then its digits. */
function tokenAt(
  chars: readonly string[],
  start: number,
  folded: readonly string[],
  fixed: number | undefined,
): { end: number; number: number } | null {
  let i = start;
  for (const expected of folded) {
    const c = chars[i];
    if (c === undefined || [...foldChar(c)][0] !== expected) return null;
    i++;
  }
  const separator = chars[i];
  if (
    separator !== undefined &&
    (separator === "-" || separator === "_" || WHITE_SPACE.test(separator))
  )
    i++;
  const digitsStart = i;
  if (fixed !== undefined) {
    for (let k = 0; k < fixed; k++) if (!isDigit(chars[digitsStart + k])) return null;
    i = digitsStart + fixed;
  } else {
    while (isDigit(chars[i])) i++;
    const digits = i - digitsStart;
    if (digits < 3 || digits > 4) return null;
  }
  return { end: i, number: Number(chars.slice(digitsStart, i).join("")) };
}

function foldedPrefix(options: TokenOptions): string[] {
  return [...prefix(options)].map((c) => [...foldChar(c)][0]!);
}

/** Every token spelling of `text`, in order (repeats included). */
export function findTokens(text: string, options: TokenOptions = {}): string[] {
  return scanTokens(
    [...text],
    foldedPrefix(options),
    options.width === undefined ? undefined : width(options),
  );
}

function scanTokens(
  chars: readonly string[],
  folded: readonly string[],
  fixed: number | undefined,
) {
  const found: string[] = [];
  let i = 0;
  while (i < chars.length) {
    const hit = tokenAt(chars, i, folded, fixed);
    if (hit) {
      found.push(chars.slice(i, hit.end).join(""));
      i = hit.end;
    } else i++;
  }
  return found;
}

const isWordChar = (c: string | undefined) => c !== undefined && /^[\p{Alphabetic}\p{N}]$/u.test(c);

function sameFolded(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((c, k) => c.toLowerCase() === right[k]!.toLowerCase())
  );
}

const trimBlanksEnd = (s: string) => s.replace(/[ \t]+$/, "");

/** `out` ends with the word `form` (up to trailing blanks), not as the tail of a longer word. */
function endsWithWord(out: string, form: readonly string[]): boolean {
  const trimmed = [...trimBlanksEnd(out)];
  const start = trimmed.length - form.length;
  if (start < 0) return false;
  return sameFolded(trimmed.slice(start), form) && (start === 0 || !isWordChar(trimmed[start - 1]));
}

/** `chars[from..]` starts with the word `form` (after blanks), not as a prefix of a longer word. */
function startsWithWord(chars: readonly string[], from: number, form: readonly string[]): boolean {
  let i = from;
  while (chars[i] === " " || chars[i] === "\t") i++;
  if (i + form.length > chars.length) return false;
  return sameFolded(chars.slice(i, i + form.length), form) && !isWordChar(chars[i + form.length]);
}

/** Number carried by a token key: its trailing ASCII digits. */
function numberOf(token: string): number | null {
  const match = /(\d+)$/.exec(token);
  return match ? Number(match[1]) : null;
}

/** Put the target forms back in place of the tokens of `translation`. */
export function restoreTokens(
  translation: string,
  table: Iterable<readonly [string, string]>,
  options: TokenOptions = {},
): Restored {
  const forms = new Map<number, { token: string; form: string }>();
  for (const [token, form] of table) {
    const number = numberOf(token);
    if (number !== null && !forms.has(number)) forms.set(number, { token, form });
  }
  const folded = foldedPrefix(options);
  const fixed = options.width === undefined ? undefined : width(options);
  const chars = [...translation];
  const seen = new Set<number>();
  let out = "";
  let i = 0;
  while (i < chars.length) {
    const hit = tokenAt(chars, i, folded, fixed);
    if (!hit) {
      out += chars[i];
      i++;
      continue;
    }
    const known = forms.get(hit.number);
    if (!known) {
      out += chars.slice(i, hit.end).join("");
      i = hit.end;
      continue;
    }
    seen.add(hit.number);
    const form = [...known.form];
    if (endsWithWord(out, form)) {
      out = trimBlanksEnd(out);
      i = hit.end;
    } else if (startsWithWord(chars, hit.end, form)) {
      i = hit.end;
      while (chars[i] === " " || chars[i] === "\t") i++;
    } else {
      out += known.form;
      i = hit.end;
    }
  }
  const unresolved = [...new Set(scanTokens([...out], folded, fixed))];
  const missing = [...forms].filter(([number]) => !seen.has(number)).map(([, { token }]) => token);
  return { text: out, unresolved, missing };
}
