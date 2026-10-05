//! Glossary hook: protect domain terms from the translation engine and restore their official
//! target spelling afterwards.
//!
//! Matched source terms are replaced, longest first and without overlap, by neutral numbered
//! tokens (`Zeta001`) that survive any engine; the translation is then scanned for those tokens
//! (tolerating case, accents on vowels and one separator, as in `Zêta001` or `ZETA 001`) and each
//! one is replaced by the official form. A token that survives restoration is reported, never
//! silently kept.
//!
//! Entries are `{ "source": …, "target": … }`; `ja`/`fr` are accepted as aliases so Shenron's
//! canonical lexicon (`data/lexique-db-canonique.json`) loads as is, extra fields ignored.

use std::{
    path::Path,
    str::FromStr,
    sync::{Arc, PoisonError, RwLock},
};

use anyhow::Context;
use serde::{Deserialize, Serialize};

use crate::Language;

/// Environment variable naming a glossary JSON file loaded by [`Glossary::from_env`].
pub const GLOSSARY_ENV: &str = "KOHARU_GLOSSARY";
/// Optional target language of the glossary named by [`GLOSSARY_ENV`] (default: any).
pub const GLOSSARY_TARGET_ENV: &str = "KOHARU_GLOSSARY_TARGET";

const DEFAULT_PREFIX: &str = "Zeta";
/// Tokens carry three digits.
const MAX_TERMS: usize = 999;
const DIGITS: usize = 3;

/// One protected term and its official target form.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GlossaryEntry {
    #[serde(alias = "ja")]
    pub source: String,
    #[serde(alias = "fr")]
    pub target: String,
}

impl GlossaryEntry {
    #[must_use]
    pub fn new(source: impl Into<String>, target: impl Into<String>) -> Self {
        Self {
            source: source.into(),
            target: target.into(),
        }
    }
}

/// A set of protected terms.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Glossary {
    entries: Vec<GlossaryEntry>,
    prefix: String,
    target_language: Option<Language>,
}

/// Source text with its terms masked, plus what is needed to restore the translation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Masked {
    /// Text to submit to the engine.
    pub text: String,
    /// Token and official form of every masked term.
    pub table: Vec<(String, String)>,
    /// Distinct terms found but left in clear because the token budget was exhausted.
    pub overflow: usize,
}

/// A restored translation.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Restored {
    pub text: String,
    /// Tokens the table does not know (engine invention); empty means a complete restoration.
    pub unresolved: Vec<String>,
}

impl Glossary {
    /// A glossary applying to every target language, with the default `Zeta` token prefix.
    #[must_use]
    pub fn new(entries: impl IntoIterator<Item = GlossaryEntry>) -> Self {
        Self {
            entries: entries
                .into_iter()
                .filter(|entry| !entry.target.is_empty() && entry.source.chars().count() >= 2)
                .collect(),
            prefix: DEFAULT_PREFIX.to_owned(),
            target_language: None,
        }
    }

    /// Parse a JSON array of entries.
    pub fn from_json(json: &str) -> anyhow::Result<Self> {
        let entries: Vec<GlossaryEntry> =
            serde_json::from_str(json).context("glossary is not a JSON array of entries")?;
        Ok(Self::new(entries))
    }

    pub fn from_path(path: impl AsRef<Path>) -> anyhow::Result<Self> {
        let path = path.as_ref();
        let json = std::fs::read_to_string(path)
            .with_context(|| format!("cannot read glossary {}", path.display()))?;
        Self::from_json(&json).with_context(|| format!("invalid glossary {}", path.display()))
    }

    /// The glossary named by [`GLOSSARY_ENV`], or `None` when it is unset or blank. A set but
    /// unreadable file is an error: a misconfigured glossary must not translate unprotected.
    pub fn from_env() -> anyhow::Result<Option<Self>> {
        let Some(path) = std::env::var_os(GLOSSARY_ENV).filter(|value| !value.is_empty()) else {
            return Ok(None);
        };
        let mut glossary = Self::from_path(path)?;
        if let Some(tag) = std::env::var(GLOSSARY_TARGET_ENV)
            .ok()
            .filter(|tag| !tag.trim().is_empty())
        {
            let language = Language::from_str(tag.trim())
                .map_err(|_| anyhow::anyhow!("{GLOSSARY_TARGET_ENV}: unknown language {tag}"))?;
            glossary = glossary.for_target(language);
        }
        Ok(Some(glossary))
    }

    /// Apply only to requests translating into `language`.
    #[must_use]
    pub fn for_target(mut self, language: Language) -> Self {
        self.target_language = Some(language);
        self
    }

    /// Token prefix (letters only; default `Zeta`). Must not be a word of the target language.
    #[must_use]
    pub fn with_token_prefix(mut self, prefix: impl Into<String>) -> Self {
        let prefix = prefix.into();
        if !prefix.is_empty() {
            self.prefix = prefix;
        }
        self
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    #[must_use]
    pub fn applies_to(&self, target: Language) -> bool {
        !self.entries.is_empty() && self.target_language.is_none_or(|own| own == target)
    }

    /// Mask the terms found in `text`: longest first, one pass, no overlap, on word edges for
    /// katakana and Latin terms (`セル` is not masked inside `カプセル`). A term gets the same
    /// token everywhere in the segment.
    #[must_use]
    pub fn mask(&self, text: &str) -> Masked {
        let chars: Vec<char> = text.chars().collect();
        let mut by_initial: std::collections::HashMap<char, Vec<(Vec<char>, usize)>> =
            std::collections::HashMap::new();
        for (index, entry) in self.entries.iter().enumerate() {
            let source: Vec<char> = entry.source.chars().collect();
            by_initial
                .entry(source[0])
                .or_default()
                .push((source, index));
        }
        let mut candidates: Vec<(usize, usize, usize)> = Vec::new();
        for (start, initial) in chars.iter().enumerate() {
            let Some(list) = by_initial.get(initial) else {
                continue;
            };
            for (source, index) in list {
                let end = start + source.len();
                if chars.get(start..end) == Some(source.as_slice())
                    && word_edges(&chars, start, end)
                {
                    candidates.push((start, end, *index));
                }
            }
        }
        candidates.sort_by(|a, b| (b.1 - b.0).cmp(&(a.1 - a.0)).then(a.0.cmp(&b.0)));
        let mut occupied = vec![false; chars.len()];
        let mut kept: Vec<(usize, usize, usize)> = Vec::new();
        for candidate in candidates {
            if occupied[candidate.0..candidate.1].iter().any(|taken| *taken) {
                continue;
            }
            occupied[candidate.0..candidate.1].fill(true);
            kept.push(candidate);
        }
        kept.sort_by_key(|candidate| candidate.0);

        let mut table: Vec<(String, String)> = Vec::new();
        let mut token_of: std::collections::HashMap<usize, Option<usize>> =
            std::collections::HashMap::new();
        let mut overflow = 0;
        let mut masked = String::with_capacity(text.len());
        let mut cursor = 0;
        for (start, end, index) in kept {
            let slot = *token_of.entry(index).or_insert_with(|| {
                if table.len() >= MAX_TERMS {
                    overflow += 1;
                    None
                } else {
                    let number = table.len() + 1;
                    table.push((
                        format!("{}{number:0DIGITS$}", self.prefix),
                        self.entries[index].target.clone(),
                    ));
                    Some(number - 1)
                }
            });
            let Some(slot) = slot else { continue };
            masked.extend(&chars[cursor..start]);
            masked.push_str(&table[slot].0);
            cursor = end;
        }
        masked.extend(&chars[cursor..]);
        Masked {
            text: masked,
            table,
            overflow,
        }
    }

    /// Put the official forms back in place of the tokens of `masked`, whatever spelling the
    /// engine gave them. A form the engine already translated next to its token (`Terre Zeta003`)
    /// is not doubled.
    #[must_use]
    pub fn restore(&self, translation: &str, masked: &Masked) -> Restored {
        let chars: Vec<char> = translation.chars().collect();
        let prefix: Vec<char> = self.prefix.chars().map(fold).collect();
        let mut out = String::with_capacity(translation.len());
        let mut unresolved = Vec::new();
        let mut i = 0;
        while i < chars.len() {
            let Some((end, number)) = token_at(&chars, i, &prefix) else {
                out.push(chars[i]);
                i += 1;
                continue;
            };
            let raw: String = chars[i..end].iter().collect();
            let form = number
                .checked_sub(1)
                .and_then(|slot| masked.table.get(slot))
                .map(|(_, form)| form.as_str());
            let Some(form) = form else {
                unresolved.push(raw.clone());
                out.push_str(&raw);
                i = end;
                continue;
            };
            let form_chars: Vec<char> = form.chars().collect();
            if ends_with_word(&out, &form_chars) {
                let kept = out.trim_end_matches([' ', '\t']).len();
                out.truncate(kept);
                i = end;
            } else if starts_with_word(&chars, end, &form_chars) {
                i = end;
                while matches!(chars.get(i), Some(' ' | '\t')) {
                    i += 1;
                }
            } else {
                out.push_str(form);
                i = end;
            }
        }
        // A token that is not in the table is reported once, wherever it was seen.
        unresolved.extend(leftover_tokens(&out, &prefix, &masked.table));
        unresolved.sort();
        unresolved.dedup();
        Restored {
            text: out,
            unresolved,
        }
    }
}

/// Tokens still present in restored text (a form that itself looks like a token, for instance).
fn leftover_tokens(text: &str, prefix: &[char], table: &[(String, String)]) -> Vec<String> {
    if table.is_empty() {
        return Vec::new();
    }
    let chars: Vec<char> = text.chars().collect();
    let mut found = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if let Some((end, _)) = token_at(&chars, i, prefix) {
            found.push(chars[i..end].iter().collect());
            i = end;
        } else {
            i += 1;
        }
    }
    found
}

/// Lowercase and drop the accent of a vowel.
fn fold(c: char) -> char {
    match c.to_lowercase().next().unwrap_or(c) {
        'à' | 'â' | 'ä' | 'á' => 'a',
        'é' | 'è' | 'ê' | 'ë' => 'e',
        'î' | 'ï' | 'í' => 'i',
        'ô' | 'ö' | 'ó' => 'o',
        'ù' | 'û' | 'ü' | 'ú' => 'u',
        other => other,
    }
}

/// A token at `start`: folded prefix, at most one separator, then a run of 3 or 4 digits.
/// Returns the end of the match and the token number.
fn token_at(chars: &[char], start: usize, prefix: &[char]) -> Option<(usize, usize)> {
    let mut i = start;
    for expected in prefix {
        if fold(*chars.get(i)?) != *expected {
            return None;
        }
        i += 1;
    }
    if chars.get(i).is_some_and(|c| c.is_whitespace() || matches!(c, '-' | '_')) {
        i += 1;
    }
    let digits_start = i;
    while chars.get(i).is_some_and(char::is_ascii_digit) {
        i += 1;
    }
    let digits = i - digits_start;
    if !(3..=4).contains(&digits) {
        return None;
    }
    let number = chars[digits_start..i]
        .iter()
        .collect::<String>()
        .parse()
        .ok()?;
    Some((i, number))
}

fn is_word_char(c: char) -> bool {
    c.is_alphanumeric()
}

fn eq_folded(left: &[char], right: &[char]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right)
            .all(|(l, r)| l.to_lowercase().eq(r.to_lowercase()))
}

/// `out` ends with the word `form` (up to trailing blanks), not as the tail of a longer word.
fn ends_with_word(out: &str, form: &[char]) -> bool {
    let trimmed: Vec<char> = out.trim_end_matches([' ', '\t']).chars().collect();
    let Some(start) = trimmed.len().checked_sub(form.len()) else {
        return false;
    };
    eq_folded(&trimmed[start..], form) && (start == 0 || !is_word_char(trimmed[start - 1]))
}

/// `chars[from..]` starts with the word `form` (after blanks), not as a prefix of a longer word.
fn starts_with_word(chars: &[char], from: usize, form: &[char]) -> bool {
    let mut i = from;
    while matches!(chars.get(i), Some(' ' | '\t')) {
        i += 1;
    }
    chars
        .get(i..i + form.len())
        .is_some_and(|slice| eq_folded(slice, form))
        && !chars.get(i + form.len()).copied().is_some_and(is_word_char)
}

#[derive(PartialEq, Eq)]
enum Class {
    Katakana,
    Latin,
}

fn class(c: Option<&char>) -> Option<Class> {
    let c = *c?;
    if matches!(c, '\u{30A1}'..='\u{30FA}' | '\u{30FC}'..='\u{30FF}' | '\u{31F0}'..='\u{31FF}' | '\u{FF66}'..='\u{FF9F}')
    {
        Some(Class::Katakana)
    } else if c.is_ascii_alphanumeric() || matches!(c, '\u{C0}'..='\u{24F}') {
        Some(Class::Latin)
    } else {
        None
    }
}

/// `chars[start..end]` is not a fragment of a longer katakana or Latin word. Kanji and kana
/// particles carry no boundary: Japanese glues them to names (`悟空達`, `ベジータは`).
fn word_edges(chars: &[char], start: usize, end: usize) -> bool {
    if let Some(first) = class(chars.get(start))
        && start > 0
        && class(chars.get(start - 1)).is_some_and(|before| before == first)
    {
        return false;
    }
    if let Some(last) = class(chars.get(end - 1))
        && class(chars.get(end)).is_some_and(|after| after == last)
    {
        return false;
    }
    true
}

static DEFAULT: RwLock<Option<Arc<Glossary>>> = RwLock::new(None);

/// Install the process-wide glossary used by every [`crate::Translator`] that has none of its
/// own (`None` removes it). This is how a host wires a glossary through a pipeline that builds
/// its translator internally.
pub fn set_default_glossary(glossary: Option<Arc<Glossary>>) {
    *DEFAULT.write().unwrap_or_else(PoisonError::into_inner) = glossary;
}

#[must_use]
pub fn default_glossary() -> Option<Arc<Glossary>> {
    DEFAULT
        .read()
        .unwrap_or_else(PoisonError::into_inner)
        .clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lexicon() -> Glossary {
        Glossary::new([
            GlossaryEntry::new("孫悟空", "Son Goku"),
            GlossaryEntry::new("悟空", "Goku"),
            GlossaryEntry::new("セル", "Cell"),
            GlossaryEntry::new("カプセルコーポレーション", "Capsule Corporation"),
            GlossaryEntry::new("界王拳", "Kaïō-ken"),
        ])
    }

    #[test]
    fn masks_longest_first_without_overlap_and_reuses_tokens() {
        let masked = lexicon().mask("孫悟空は界王拳を使う。悟空と孫悟空。");
        assert_eq!(masked.text, "Zeta001はZeta002を使う。Zeta003とZeta001。");
        assert_eq!(masked.table[0], ("Zeta001".to_owned(), "Son Goku".to_owned()));
        assert_eq!(masked.table[2].1, "Goku");
        assert_eq!(masked.overflow, 0);
    }

    #[test]
    fn katakana_terms_stay_whole_inside_longer_words() {
        let masked = lexicon().mask("カプセルコーポレーションのセル");
        assert_eq!(masked.text, "Zeta001のZeta002");
        assert_eq!(masked.table[0].1, "Capsule Corporation");
        assert_eq!(masked.table[1].1, "Cell");
    }

    #[test]
    fn restores_tokens_whatever_the_engine_made_of_them() {
        let glossary = lexicon();
        let masked = glossary.mask("孫悟空は界王拳を使う。");
        let restored = glossary.restore("ZETA 001 utilise zêta002.", &masked);
        assert_eq!(restored.text, "Son Goku utilise Kaïō-ken.");
        assert!(restored.unresolved.is_empty());
    }

    #[test]
    fn a_form_already_translated_next_to_its_token_is_not_doubled() {
        let glossary = Glossary::new([GlossaryEntry::new("地球", "Terre")]);
        let masked = glossary.mask("地球");
        assert_eq!(glossary.restore("sur la Terre Zeta001 !", &masked).text, "sur la Terre !");
        assert_eq!(glossary.restore("sur Zeta001 Terre !", &masked).text, "sur Terre !");
        assert_eq!(glossary.restore("sur la Zeta001 !", &masked).text, "sur la Terre !");
    }

    #[test]
    fn unknown_tokens_are_reported() {
        let glossary = lexicon();
        let masked = glossary.mask("孫悟空");
        let restored = glossary.restore("Zeta001 et Zeta007", &masked);
        assert_eq!(restored.text, "Son Goku et Zeta007");
        assert_eq!(restored.unresolved, vec!["Zeta007".to_owned()]);
    }

    #[test]
    fn token_budget_is_a_hard_cap_and_overflow_stays_in_clear() {
        let entries: Vec<GlossaryEntry> = (0..1_001u32)
            .map(|n| {
                let source: String = format!("ア{}", char::from_u32(0x4E00 + n).unwrap());
                GlossaryEntry::new(source, format!("T{n}"))
            })
            .collect();
        let text: String = entries.iter().map(|entry| entry.source.clone()).collect();
        let masked = Glossary::new(entries).mask(&text);
        assert_eq!(masked.table.len(), MAX_TERMS);
        assert_eq!(masked.overflow, 2);
    }

    #[test]
    fn target_language_scopes_the_glossary() {
        let glossary = lexicon().for_target(Language::French);
        assert!(glossary.applies_to(Language::French));
        assert!(!glossary.applies_to(Language::English));
        assert!(lexicon().applies_to(Language::English));
    }

    #[test]
    fn loads_shenron_lexicon_entries_and_ignores_extra_fields() {
        let glossary = Glossary::from_json(
            r#"[{"ja":"界王拳","fr":"Kaioken","kind":"technique","length":3},
                {"source":"x","target":"y"},{"ja":"元気玉","fr":""}]"#,
        )
        .unwrap();
        assert_eq!(glossary.len(), 1);
        assert!(Glossary::from_json("{}").is_err());
    }

    /// The repository's canonical lexicon is the glossary's real input.
    #[test]
    fn the_repository_lexicon_loads_and_protects_canonical_names() {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../data/lexique-db-canonique.json");
        if !path.is_file() {
            return;
        }
        let glossary = Glossary::from_path(path).unwrap().for_target(Language::French);
        assert!(glossary.len() > 100);
        let masked = glossary.mask("ベジータは界王拳を使った。");
        assert!(masked.text.contains("Zeta001"), "{}", masked.text);
        let restored = glossary.restore(&masked.text, &masked);
        assert!(restored.unresolved.is_empty());
        assert!(!restored.text.contains("Zeta"));
    }
}
