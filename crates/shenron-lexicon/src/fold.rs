// SPDX-License-Identifier: Apache-2.0
//! Search key of a form, identical to `fold()` of `@shenron/lexicon` (fixtures
//! `data/lexicon/fixtures/fold.json`). Per character:
//!
//! 1. fullwidth ASCII (U+FF01–U+FF5E) becomes ASCII, the ideographic space a space;
//! 2. lowercase (Unicode default mapping, without context);
//! 3. Latin letters lose their diacritics (explicit table), combining marks are dropped;
//! 4. katakana (U+30A1–U+30F6) become hiragana;
//! 5. only letters and digits are kept (`Kaïō-ken` → `kaioken`, `Mr. Satan` → `mrsatan`).

/// Lowercase Latin letters carrying a diacritic …
const ACCENTED: &str =
    "àáâãäåçèéêëìíîïñòóôõöùúûüýÿāăąćĉċčďēĕėęěĝğġģĥĩīĭįĵķĺļľńņňōŏőŕŗřśŝşšţťũūŭůűųŵŷźżž";
/// … and their bases, position by position.
const BASE: &str =
    "aaaaaaceeeeiiiinooooouuuuyyaaaccccdeeeeegggghiiiijklllnnnooorrrssssttuuuuuuwyzzz";

fn is_combining(c: char) -> bool {
    ('\u{300}'..='\u{36F}').contains(&c)
}

fn base_of(c: char) -> char {
    if c.is_ascii() {
        return c;
    }
    ACCENTED
        .chars()
        .position(|accented| accented == c)
        .and_then(|index| BASE.chars().nth(index))
        .unwrap_or(c)
}

/// Lowercase of `c` without its diacritics, as a sequence (`É` → `e`, `İ` → `i`).
pub fn fold_char(c: char) -> impl Iterator<Item = char> {
    c.to_lowercase().filter(|lower| !is_combining(*lower)).map(base_of)
}

/// First character of [`fold_char`] (what token matching compares).
#[must_use]
pub fn fold_first(c: char) -> Option<char> {
    fold_char(c).next()
}

fn unwiden(c: char) -> char {
    match c {
        '\u{FF01}'..='\u{FF5E}' => char::from_u32(c as u32 - 0xFEE0).unwrap_or(c),
        '\u{3000}' => ' ',
        _ => c,
    }
}

fn hiragana(c: char) -> char {
    if ('\u{30A1}'..='\u{30F6}').contains(&c) {
        char::from_u32(c as u32 - 0x60).unwrap_or(c)
    } else {
        c
    }
}

/// Search key of `text` (see the module documentation).
#[must_use]
pub fn fold(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for raw in text.chars() {
        for c in fold_char(unwiden(raw)) {
            let c = hiragana(c);
            if c.is_alphanumeric() {
                out.push(c);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_table_pairs_every_accented_letter_with_its_base() {
        assert_eq!(ACCENTED.chars().count(), BASE.chars().count());
        assert!(BASE.chars().all(|c| c.is_ascii_lowercase()));
    }

    #[test]
    fn folds_case_accents_punctuation_and_katakana() {
        assert_eq!(fold("Kaïō-ken"), "kaioken");
        assert_eq!(fold("ミスター・サタン"), "みすたーさたん");
        assert_eq!(fold("ＶＥＧＥＴＡ　様"), "vegeta様");
    }
}
