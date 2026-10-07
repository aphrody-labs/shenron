// SPDX-License-Identifier: Apache-2.0
/** Shared hash anti-join semantics from aphrody_train.hashing; no inference or I/O. */
import { sha256Hex } from "@shenron/media/sha256";

export { sha256Hex as sha256 } from "@shenron/media/sha256";
export interface TextNormalizationOptions {
  /** Conservative compatibility spelling checks; not a complete Unicode confusables table. */
  compatibility?: boolean;
}
export interface GoldTextRow {
  query: string;
  expect: string[];
}
const SEGMENT_SPLIT = /[.!?;:\n\r。！？]+/u;
const SEGMENT_STRIP = new Set(" \t\"'`«»“”‘’()[]{}<>,-–—*#_|.!?;:…。！？");
const MIN_SEGMENT_CHARS = 12;

/** Historical defaults: NFC, optional lowercasing, collapsed whitespace. */
export function normalizeText(
  text: string,
  casefold = false,
  options: TextNormalizationOptions = {},
): string {
  let value = text.normalize(options.compatibility ? "NFKC" : "NFC");
  if (casefold) value = value.toLowerCase().normalize("NFC");
  if (options.compatibility) {
    if (casefold) value = value.replace(/ß/g, "ss").replace(/ς/g, "σ");
    value = value.replace(/[\u200b-\u200d\u2060\ufeff]/g, "").replace(/\u0085/gu, " ");
  }
  return value.split(/\s+/u).filter(Boolean).join(" ");
}
function segmentKey(text: string, options: TextNormalizationOptions): string {
  const chars = [...normalizeText(text, true, options)];
  let start = 0;
  let end = chars.length;
  while (start < end && SEGMENT_STRIP.has(chars[start] as string)) start++;
  while (end > start && SEGMENT_STRIP.has(chars[end - 1] as string)) end--;
  return chars.slice(start, end).join("");
}

/** Whole text plus every nontrivial sentence/line segment, matching the owner hash anti-join. */
export function segmentHashes(text: string, options: TextNormalizationOptions = {}): Set<string> {
  const out = new Set<string>();
  const whole = segmentKey(text, options);
  if (whole) out.add(sha256Hex(whole));
  for (const part of text.split(SEGMENT_SPLIT)) {
    const value = segmentKey(part, options);
    if ([...value].length >= MIN_SEGMENT_CHARS && value !== whole) out.add(sha256Hex(value));
  }
  return out;
}
function* iterStrings(value: unknown): Generator<string> {
  if (typeof value === "string") yield value;
  else if (Array.isArray(value)) for (const item of value) yield* iterStrings(item);
  else if (value && typeof value === "object")
    for (const item of Object.values(value)) yield* iterStrings(item);
}

export function goldKeys(
  gold: readonly GoldTextRow[],
  options: TextNormalizationOptions = {},
): Set<string> {
  const keys = new Set<string>();
  for (const row of gold)
    for (const text of [row.query, ...row.expect])
      if (text.trim()) for (const key of segmentHashes(text.trim(), options)) keys.add(key);
  return keys;
}
export function overlapsGold(
  value: unknown,
  keys: ReadonlySet<string>,
  options: TextNormalizationOptions = {},
): boolean {
  for (const text of iterStrings(value))
    for (const key of segmentHashes(text, options)) if (keys.has(key)) return true;
  return false;
}
