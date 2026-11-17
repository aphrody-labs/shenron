// SPDX-License-Identifier: Apache-2.0
//! Term protection around a translation engine, identical to `@aphrody/shenron-lexicon`'s `mask.ts`
//! (fixtures `data/lexicon/fixtures/{mask,restore,tokens}.json`).
//!
//! - **Masking**: the source spellings found in a text are replaced, longest first, in one pass
//!   and without overlap, by numbered tokens (`Zeta001`). Katakana and Latin spellings only
//!   match on word edges (`セル` is not masked inside `カプセル`); kanji and kana particles carry
//!   no edge (`悟空達`, `ベジータは`). An entry keeps the same token everywhere; past the token
//!   budget the next entries stay in clear and are counted in [`Masked::overflow`].
//! - **Restoration**: every token the engine returned, whatever it made of it (`Zêta001`,
//!   `ZETA 001`, `Zeta-001`), is replaced by its target form. A form already written next to
//!   its token (`la Terre Zeta003`) is not doubled. Tokens the table does not know (inventions)
//!   stay in clear and are reported in [`Restored::unresolved`]; table tokens absent from the
//!   translation are reported in [`Restored::missing`].
//!
//! Offsets are characters (code points).

use std::collections::{HashMap, HashSet};

use crate::fold::fold_first;

/// Default token prefix: a short Latin name engines copy instead of translating.
pub const DEFAULT_TOKEN_PREFIX: &str = "Zeta";
/// Default number of digits of a token.
pub const DEFAULT_TOKEN_WIDTH: usize = 3;

/// Shape of the tokens.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TokenOptions {
    /// Letters only; must not be a word of the target language (default `Zeta`).
    pub prefix: String,
    /// Digits of a token (default 3). Set explicitly, restoration reads exactly that many digits
    /// (`QXZ00013` is `QXZ0001` followed by `3`); otherwise a run of 3 or 4 digits.
    pub width: Option<usize>,
}

impl Default for TokenOptions {
    fn default() -> Self {
        Self { prefix: DEFAULT_TOKEN_PREFIX.to_owned(), width: None }
    }
}

impl TokenOptions {
    fn prefix(&self) -> &str {
        if self.prefix.is_empty() { DEFAULT_TOKEN_PREFIX } else { &self.prefix }
    }

    fn width(&self) -> usize {
        self.width.unwrap_or(DEFAULT_TOKEN_WIDTH).clamp(1, 9)
    }

    fn fixed_width(&self) -> Option<usize> {
        self.width.map(|_| self.width())
    }

    fn folded_prefix(&self) -> Vec<char> {
        self.prefix().chars().filter_map(fold_first).collect()
    }

    /// Token number `n` (from 1): `Zeta001`.
    #[must_use]
    pub fn token(&self, n: usize) -> String {
        format!("{}{n:0width$}", self.prefix(), width = self.width())
    }
}

/// Masking options: the token shape and the token budget.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct MaskOptions {
    pub tokens: TokenOptions,
    /// Distinct entries masked at most (default and ceiling: the largest number of `width`
    /// digits).
    pub max_tokens: Option<usize>,
}

/// One protected entry: its source spellings and the form restored in the translation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MaskEntry {
    pub sources: Vec<String>,
    pub target: String,
}

impl MaskEntry {
    #[must_use]
    pub fn new(
        sources: impl IntoIterator<Item = impl Into<String>>,
        target: impl Into<String>,
    ) -> Self {
        Self { sources: sources.into_iter().map(Into::into).collect(), target: target.into() }
    }
}

/// An occurrence kept in a text (character offsets).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Occurrence {
    pub start: usize,
    pub end: usize,
    /// Index of the entry in the masker.
    pub entry: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct MaskedToken {
    pub token: String,
    pub number: usize,
    pub target: String,
    /// Index of the entry in the masker.
    pub entry: usize,
}

/// A source text with its terms masked.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Masked {
    /// Text to submit to the engine.
    pub text: String,
    pub tokens: Vec<MaskedToken>,
    /// Distinct entries found but left in clear because the token budget was exhausted.
    pub overflow: usize,
}

impl Masked {
    /// `(token, target)` pairs, in token order: the restoration table.
    #[must_use]
    pub fn table(&self) -> Vec<(String, String)> {
        self.tokens.iter().map(|token| (token.token.clone(), token.target.clone())).collect()
    }
}

/// A restored translation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Restored {
    pub text: String,
    /// Distinct token spellings left in the restored text (inventions of the engine).
    pub unresolved: Vec<String>,
    /// Table tokens that never appeared in the translation (a term the engine dropped).
    pub missing: Vec<String>,
}

#[derive(PartialEq, Eq, Clone, Copy)]
enum Class {
    Katakana,
    Latin,
}

fn class(c: Option<&char>) -> Option<Class> {
    let c = *c?;
    match c {
        '\u{30A1}'..='\u{30FA}'
        | '\u{30FC}'..='\u{30FF}'
        | '\u{31F0}'..='\u{31FF}'
        | '\u{FF66}'..='\u{FF9F}' => Some(Class::Katakana),
        '0'..='9' | 'A'..='Z' | 'a'..='z' | '\u{C0}'..='\u{24F}' => Some(Class::Latin),
        _ => None,
    }
}

/// `chars[start..end]` is not a fragment of a longer katakana or Latin word. Kanji and kana
/// particles carry no edge: Japanese glues them to names.
#[must_use]
pub fn word_edges(chars: &[char], start: usize, end: usize) -> bool {
    if let Some(first) = class(chars.get(start))
        && start > 0
        && class(chars.get(start - 1)) == Some(first)
    {
        return false;
    }
    if let Some(last) = end.checked_sub(1).and_then(|index| class(chars.get(index)))
        && class(chars.get(end)) == Some(last)
    {
        return false;
    }
    true
}

/// Masks the spellings of a fixed set of entries; build it once, mask many segments.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Masker {
    entries: Vec<MaskEntry>,
    by_initial: HashMap<char, Vec<(Vec<char>, usize)>>,
    options: MaskOptions,
}

impl Masker {
    /// Entries without target form and spellings shorter than two characters are ignored.
    #[must_use]
    pub fn new(entries: Vec<MaskEntry>, options: MaskOptions) -> Self {
        let mut by_initial: HashMap<char, Vec<(Vec<char>, usize)>> = HashMap::new();
        for (index, entry) in entries.iter().enumerate() {
            if entry.target.is_empty() {
                continue;
            }
            for source in &entry.sources {
                let chars: Vec<char> = source.chars().collect();
                if chars.len() < 2 {
                    continue;
                }
                by_initial.entry(chars[0]).or_default().push((chars, index));
            }
        }
        Self { entries, by_initial, options }
    }

    #[must_use]
    pub fn entries(&self) -> &[MaskEntry] {
        &self.entries
    }

    #[must_use]
    pub fn options(&self) -> &MaskOptions {
        &self.options
    }

    /// Number of entries that can be masked (a target form and a spelling of two characters).
    #[must_use]
    pub fn active(&self) -> usize {
        self.entries
            .iter()
            .filter(|entry| {
                !entry.target.is_empty()
                    && entry.sources.iter().any(|source| source.chars().nth(1).is_some())
            })
            .count()
    }

    /// Occurrences kept in `chars`: longest first, one pass, no overlap, on word edges; in text
    /// order.
    #[must_use]
    pub fn occurrences(&self, chars: &[char]) -> Vec<Occurrence> {
        let mut candidates = Vec::new();
        for (start, initial) in chars.iter().enumerate() {
            let Some(list) = self.by_initial.get(initial) else { continue };
            for (source, entry) in list {
                let end = start + source.len();
                if chars.get(start..end) == Some(source.as_slice()) && word_edges(chars, start, end)
                {
                    candidates.push(Occurrence { start, end, entry: *entry });
                }
            }
        }
        candidates
            .sort_by(|a, b| (b.end - b.start).cmp(&(a.end - a.start)).then(a.start.cmp(&b.start)));
        let mut taken = vec![false; chars.len()];
        let mut kept = Vec::new();
        for candidate in candidates {
            if taken[candidate.start..candidate.end].iter().any(|busy| *busy) {
                continue;
            }
            taken[candidate.start..candidate.end].fill(true);
            kept.push(candidate);
        }
        kept.sort_by_key(|occurrence| occurrence.start);
        kept
    }

    /// Replace the spellings found in `text` by numbered tokens.
    #[must_use]
    pub fn mask(&self, text: &str) -> Masked {
        let chars: Vec<char> = text.chars().collect();
        let width = self.options.tokens.width();
        let ceiling = 10usize.pow(u32::try_from(width).unwrap_or(9)) - 1;
        let max = self.options.max_tokens.map_or(ceiling, |max| max.min(ceiling));
        let mut tokens: Vec<MaskedToken> = Vec::new();
        let mut slot_of: HashMap<usize, Option<usize>> = HashMap::new();
        let mut overflow = 0;
        let mut out = String::with_capacity(text.len());
        let mut cursor = 0;
        for occurrence in self.occurrences(&chars) {
            let slot = *slot_of.entry(occurrence.entry).or_insert_with(|| {
                if tokens.len() >= max {
                    overflow += 1;
                    None
                } else {
                    let number = tokens.len() + 1;
                    tokens.push(MaskedToken {
                        token: self.options.tokens.token(number),
                        number,
                        target: self.entries[occurrence.entry].target.clone(),
                        entry: occurrence.entry,
                    });
                    Some(number - 1)
                }
            });
            let Some(slot) = slot else { continue };
            out.extend(&chars[cursor..occurrence.start]);
            out.push_str(&tokens[slot].token);
            cursor = occurrence.end;
        }
        out.extend(&chars[cursor..]);
        Masked { text: out, tokens, overflow }
    }
}

/// Occurrences of `entries` in `text` (see [`Masker::occurrences`]).
#[must_use]
pub fn find_occurrences(text: &str, entries: Vec<MaskEntry>) -> Vec<Occurrence> {
    let chars: Vec<char> = text.chars().collect();
    Masker::new(entries, MaskOptions::default()).occurrences(&chars)
}

fn is_separator(c: char) -> bool {
    c == '-' || c == '_' || c.is_whitespace()
}

/// A token at `start`: folded prefix, at most one separator, then its digits. Returns the end of
/// the match and the token number.
fn token_at(
    chars: &[char],
    start: usize,
    prefix: &[char],
    fixed: Option<usize>,
) -> Option<(usize, usize)> {
    let mut i = start;
    for expected in prefix {
        if fold_first(*chars.get(i)?) != Some(*expected) {
            return None;
        }
        i += 1;
    }
    if chars.get(i).copied().is_some_and(is_separator) {
        i += 1;
    }
    let digits_start = i;
    if let Some(width) = fixed {
        if !(0..width).all(|k| chars.get(digits_start + k).is_some_and(char::is_ascii_digit)) {
            return None;
        }
        i = digits_start + width;
    } else {
        while chars.get(i).is_some_and(char::is_ascii_digit) {
            i += 1;
        }
        if !(3..=4).contains(&(i - digits_start)) {
            return None;
        }
    }
    let number = chars[digits_start..i].iter().collect::<String>().parse().ok()?;
    Some((i, number))
}

fn scan_tokens(chars: &[char], prefix: &[char], fixed: Option<usize>) -> Vec<String> {
    let mut found = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if let Some((end, _)) = token_at(chars, i, prefix, fixed) {
            found.push(chars[i..end].iter().collect());
            i = end;
        } else {
            i += 1;
        }
    }
    found
}

/// Every token spelling of `text`, in order (repeats included).
#[must_use]
pub fn find_tokens(text: &str, options: &TokenOptions) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    scan_tokens(&chars, &options.folded_prefix(), options.fixed_width())
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric()
}

fn same_folded(left: &[char], right: &[char]) -> bool {
    left.len() == right.len()
        && left.iter().zip(right).all(|(l, r)| l.to_lowercase().eq(r.to_lowercase()))
}

fn trim_blanks_end(text: &str) -> &str {
    text.trim_end_matches([' ', '\t'])
}

/// `out` ends with the word `form` (up to trailing blanks), not as the tail of a longer word.
fn ends_with_word(out: &str, form: &[char]) -> bool {
    let trimmed: Vec<char> = trim_blanks_end(out).chars().collect();
    let Some(start) = trimmed.len().checked_sub(form.len()) else {
        return false;
    };
    same_folded(&trimmed[start..], form) && (start == 0 || !is_word_char(trimmed[start - 1]))
}

/// `chars[from..]` starts with the word `form` (after blanks), not as a prefix of a longer word.
fn starts_with_word(chars: &[char], from: usize, form: &[char]) -> bool {
    let mut i = from;
    while matches!(chars.get(i), Some(' ' | '\t')) {
        i += 1;
    }
    chars.get(i..i + form.len()).is_some_and(|slice| same_folded(slice, form))
        && !chars.get(i + form.len()).copied().is_some_and(is_word_char)
}

/// Number carried by a token key: its trailing ASCII digits.
fn number_of(token: &str) -> Option<usize> {
    let digits = token.len() - token.trim_end_matches(|c: char| c.is_ascii_digit()).len();
    if digits == 0 { None } else { token[token.len() - digits..].parse().ok() }
}

/// Put the target forms of `table` (`(token, form)` pairs) back in place of the tokens of
/// `translation`.
#[must_use]
pub fn restore<T: AsRef<str>, F: AsRef<str>>(
    translation: &str,
    table: &[(T, F)],
    options: &TokenOptions,
) -> Restored {
    let mut forms: Vec<(usize, &str, Vec<char>)> = Vec::new();
    for (token, form) in table {
        let Some(number) = number_of(token.as_ref()) else { continue };
        if forms.iter().all(|(known, _, _)| *known != number) {
            forms.push((number, token.as_ref(), form.as_ref().chars().collect()));
        }
    }
    let prefix = options.folded_prefix();
    let fixed = options.fixed_width();
    let chars: Vec<char> = translation.chars().collect();
    let mut seen: HashSet<usize> = HashSet::new();
    let mut out = String::with_capacity(translation.len());
    let mut i = 0;
    while i < chars.len() {
        let Some((end, number)) = token_at(&chars, i, &prefix, fixed) else {
            out.push(chars[i]);
            i += 1;
            continue;
        };
        let Some((_, _, form)) = forms.iter().find(|(known, _, _)| *known == number) else {
            out.extend(&chars[i..end]);
            i = end;
            continue;
        };
        seen.insert(number);
        if ends_with_word(&out, form) {
            let kept = trim_blanks_end(&out).len();
            out.truncate(kept);
            i = end;
        } else if starts_with_word(&chars, end, form) {
            i = end;
            while matches!(chars.get(i), Some(' ' | '\t')) {
                i += 1;
            }
        } else {
            out.extend(form);
            i = end;
        }
    }
    let restored: Vec<char> = out.chars().collect();
    let mut unresolved: Vec<String> = Vec::new();
    for token in scan_tokens(&restored, &prefix, fixed) {
        if !unresolved.contains(&token) {
            unresolved.push(token);
        }
    }
    let missing = forms
        .iter()
        .filter(|(number, _, _)| !seen.contains(number))
        .map(|(_, token, _)| (*token).to_owned())
        .collect();
    Restored { text: out, unresolved, missing }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_numbers_read_their_trailing_digits() {
        assert_eq!(number_of("Zeta001"), Some(1));
        assert_eq!(number_of("QXZ0010"), Some(10));
        assert_eq!(number_of("Zeta"), None);
    }

    #[test]
    fn the_budget_never_exceeds_the_token_width() {
        let entries: Vec<MaskEntry> = (0..1_001u32)
            .map(|n| {
                MaskEntry::new(
                    [format!("ア{}", char::from_u32(0x4E00 + n).unwrap_or('一'))],
                    format!("T{n}"),
                )
            })
            .collect();
        let text: String = entries.iter().map(|entry| entry.sources[0].clone()).collect();
        let masked = Masker::new(entries, MaskOptions::default()).mask(&text);
        assert_eq!(masked.tokens.len(), 999);
        assert_eq!(masked.overflow, 2);
    }
}
