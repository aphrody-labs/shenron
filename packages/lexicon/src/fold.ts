// SPDX-License-Identifier: Apache-2.0
/**
 * Search key of a form, identical to `shenron_lexicon::fold` (fixtures
 * `data/lexicon/fixtures/fold.json`). Per code point:
 *
 * 1. fullwidth ASCII (U+FF01–U+FF5E) becomes ASCII, the ideographic space a space;
 * 2. lowercase (Unicode default mapping, without context);
 * 3. Latin letters lose their diacritics (table below), combining marks are dropped;
 * 4. katakana (U+30A1–U+30F6) become hiragana;
 * 5. only letters and digits are kept (`Kaïō-ken` → `kaioken`, `Mr. Satan` → `mrsatan`).
 *
 * The table is explicit rather than `normalize("NFD")` so the Rust and TypeScript outputs
 * cannot drift with the runtime's Unicode tables.
 */

const ACCENTED = "àáâãäåçèéêëìíîïñòóôõöùúûüýÿāăąćĉċčďēĕėęěĝğġģĥĩīĭįĵķĺļľńņňōŏőŕŗřśŝşšţťũūŭůűųŵŷźżž";
const BASE = "aaaaaaceeeeiiiinooooouuuuyyaaaccccdeeeeegggghiiiijklllnnnooorrrssssttuuuuuuwyzzz";

const BASE_OF: ReadonlyMap<string, string> = new Map(
  [...ACCENTED].map((c, index) => [c, BASE[index]!] as const),
);

const ALPHANUMERIC = /^[\p{Alphabetic}\p{N}]$/u;

/** Lowercase of one code point, then its unaccented Latin base (`É` → `e`). */
export function foldChar(c: string): string {
  let out = "";
  for (const lower of c.toLowerCase()) {
    const code = lower.codePointAt(0)!;
    if (code >= 0x300 && code <= 0x36f) continue;
    out += BASE_OF.get(lower) ?? lower;
  }
  return out;
}

/** Search key of `text` (see the module comment). */
export function fold(text: string): string {
  let out = "";
  for (const raw of text) {
    let code = raw.codePointAt(0)!;
    if (code >= 0xff01 && code <= 0xff5e) code -= 0xfee0;
    else if (code === 0x3000) code = 0x20;
    for (const c of foldChar(String.fromCodePoint(code))) {
      let point = c.codePointAt(0)!;
      if (point >= 0x30a1 && point <= 0x30f6) point -= 0x60;
      const folded = String.fromCodePoint(point);
      if (ALPHANUMERIC.test(folded)) out += folded;
    }
  }
  return out;
}

/** Number of code points (the length the Rust side counts). */
export function codePoints(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n;
}
