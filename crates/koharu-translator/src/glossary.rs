//! Glossary hook: protect domain terms from the translation engine and restore their official
//! target spelling afterwards.
//!
//! The masking and restoration rules belong to Shenron's lexicon crate ([`shenron_lexicon::mask`]):
//! matched source terms are replaced, longest first and without overlap, by neutral numbered
//! tokens (`Zeta001`) that survive any engine; the translation is then scanned for those tokens
//! (tolerating case, accents on vowels and one separator, as in `Zêta001` or `ZETA 001`) and each
//! one is replaced by the official form. A token that survives restoration is reported, never
//! silently kept.
//!
//! A glossary comes from Shenron's canonical lexicon ([`Glossary::shenron`], embedded, French or
//! English target), from a lexicon document (`data/lexicon/terms.json` format), or from a JSON
//! array of `{ "source": …, "target": … }` entries (`ja`/`fr` accepted as aliases so the legacy
//! `data/lexique-db-canonique.json` loads as is, extra fields ignored).

use std::{
    path::Path,
    str::FromStr,
    sync::{Arc, PoisonError, RwLock},
};

use anyhow::Context;
use serde::{Deserialize, Serialize};
use shenron_lexicon::{Lang, Lexicon, MaskEntry, MaskOptions, Masker, TokenOptions};

use crate::Language;

/// Environment variable naming a glossary JSON file loaded by [`Glossary::from_env`].
pub const GLOSSARY_ENV: &str = "KOHARU_GLOSSARY";
/// Optional target language of the glossary named by [`GLOSSARY_ENV`] (default: any; a lexicon
/// document is then read for French).
pub const GLOSSARY_TARGET_ENV: &str = "KOHARU_GLOSSARY_TARGET";

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
        Self { source: source.into(), target: target.into() }
    }
}

/// A set of protected terms.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Glossary {
    masker: Masker,
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
    /// Masked terms whose token the engine dropped.
    pub missing: Vec<String>,
}

/// The lexicon language of a translation target (Shenron's lexicon targets French and English).
#[must_use]
pub fn lexicon_language(language: Language) -> Option<Lang> {
    match language {
        Language::French => Some(Lang::Fr),
        Language::English => Some(Lang::En),
        _ => None,
    }
}

impl Glossary {
    /// A glossary applying to every target language, with the default `Zeta` token prefix.
    #[must_use]
    pub fn new(entries: impl IntoIterator<Item = GlossaryEntry>) -> Self {
        let entries =
            entries.into_iter().map(|entry| MaskEntry::new([entry.source], entry.target)).collect();
        Self::from_entries(entries)
    }

    fn from_entries(entries: Vec<MaskEntry>) -> Self {
        Self { masker: Masker::new(entries, MaskOptions::default()), target_language: None }
    }

    /// The terms of `lexicon` protected in translations into `target` (French or English): every
    /// Japanese spelling of a term is restored as its form in that language. Terms without a form
    /// in the target language stay unmasked. Applies to `target` only.
    #[must_use]
    pub fn from_lexicon(lexicon: &Lexicon, target: Language) -> Self {
        let entries =
            lexicon_language(target).map(|lang| lexicon.mask_entries(lang)).unwrap_or_default();
        Self::from_entries(entries).for_target(target)
    }

    /// Shenron's canonical lexicon (embedded) for a translation into `target`; `None` for a
    /// language the lexicon has no forms in.
    #[must_use]
    pub fn shenron(target: Language) -> Option<Self> {
        lexicon_language(target)?;
        Some(Self::from_lexicon(Lexicon::embedded(), target))
    }

    /// Parse a JSON array of entries or a lexicon document (read for French).
    pub fn from_json(json: &str) -> anyhow::Result<Self> {
        Self::from_json_for(json, None)
    }

    /// Parse a JSON array of entries, or a lexicon document read for `target` (French when
    /// `None`).
    pub fn from_json_for(json: &str, target: Option<Language>) -> anyhow::Result<Self> {
        let value: serde_json::Value =
            serde_json::from_str(json).context("glossary is not valid JSON")?;
        if value.get("terms").is_some() {
            let lexicon = Lexicon::from_json(json).context("invalid lexicon document")?;
            let glossary = Self::from_lexicon(&lexicon, target.unwrap_or(Language::French));
            return Ok(if target.is_some() {
                glossary
            } else {
                Self { target_language: None, ..glossary }
            });
        }
        let entries: Vec<GlossaryEntry> =
            serde_json::from_value(value).context("glossary is not a JSON array of entries")?;
        Ok(Self::new(entries))
    }

    pub fn from_path(path: impl AsRef<Path>) -> anyhow::Result<Self> {
        Self::from_path_for(path, None)
    }

    /// [`Glossary::from_json_for`] over a file.
    pub fn from_path_for(path: impl AsRef<Path>, target: Option<Language>) -> anyhow::Result<Self> {
        let path = path.as_ref();
        let json = std::fs::read_to_string(path)
            .with_context(|| format!("cannot read glossary {}", path.display()))?;
        Self::from_json_for(&json, target)
            .with_context(|| format!("invalid glossary {}", path.display()))
    }

    /// The glossary named by [`GLOSSARY_ENV`], or `None` when it is unset or blank. A set but
    /// unreadable file is an error: a misconfigured glossary must not translate unprotected.
    pub fn from_env() -> anyhow::Result<Option<Self>> {
        let Some(path) = std::env::var_os(GLOSSARY_ENV).filter(|value| !value.is_empty()) else {
            return Ok(None);
        };
        let target = std::env::var(GLOSSARY_TARGET_ENV)
            .ok()
            .filter(|tag| !tag.trim().is_empty())
            .map(|tag| {
                Language::from_str(tag.trim())
                    .map_err(|_| anyhow::anyhow!("{GLOSSARY_TARGET_ENV}: unknown language {tag}"))
            })
            .transpose()?;
        let glossary = Self::from_path_for(path, target)?;
        Ok(Some(match target {
            Some(language) => glossary.for_target(language),
            None => glossary,
        }))
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
            let options = MaskOptions {
                tokens: TokenOptions { prefix, ..self.masker.options().tokens.clone() },
                ..self.masker.options().clone()
            };
            self.masker = Masker::new(self.masker.entries().to_vec(), options);
        }
        self
    }

    /// Number of protected terms (entries with a target form).
    #[must_use]
    pub fn len(&self) -> usize {
        self.masker.active()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    #[must_use]
    pub fn applies_to(&self, target: Language) -> bool {
        !self.is_empty() && self.target_language.is_none_or(|own| own == target)
    }

    /// Mask the terms found in `text`: longest first, one pass, no overlap, on word edges for
    /// katakana and Latin terms (`セル` is not masked inside `カプセル`). A term gets the same
    /// token everywhere in the segment.
    #[must_use]
    pub fn mask(&self, text: &str) -> Masked {
        let masked = self.masker.mask(text);
        Masked { table: masked.table(), text: masked.text, overflow: masked.overflow }
    }

    /// Put the official forms back in place of the tokens of `masked`, whatever spelling the
    /// engine gave them. A form the engine already translated next to its token (`Terre Zeta003`)
    /// is not doubled.
    #[must_use]
    pub fn restore(&self, translation: &str, masked: &Masked) -> Restored {
        let restored =
            shenron_lexicon::restore(translation, &masked.table, &self.masker.options().tokens);
        Restored { text: restored.text, unresolved: restored.unresolved, missing: restored.missing }
    }
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
    DEFAULT.read().unwrap_or_else(PoisonError::into_inner).clone()
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
    fn restores_tokens_whatever_the_engine_made_of_them() {
        let glossary = lexicon();
        let masked = glossary.mask("孫悟空は界王拳を使う。");
        let restored = glossary.restore("ZETA 001 utilise zêta002.", &masked);
        assert_eq!(restored.text, "Son Goku utilise Kaïō-ken.");
        assert!(restored.unresolved.is_empty());
        assert!(restored.missing.is_empty());
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
    fn a_custom_prefix_masks_and_restores() {
        let glossary = lexicon().with_token_prefix("Yuni");
        let masked = glossary.mask("悟空");
        assert_eq!(masked.text, "Yuni001");
        assert_eq!(glossary.restore("Yuni001 !", &masked).text, "Goku !");
    }

    #[test]
    fn target_language_scopes_the_glossary() {
        let glossary = lexicon().for_target(Language::French);
        assert!(glossary.applies_to(Language::French));
        assert!(!glossary.applies_to(Language::English));
        assert!(lexicon().applies_to(Language::English));
    }

    #[test]
    fn loads_legacy_entries_and_ignores_extra_fields() {
        let glossary = Glossary::from_json(
            r#"[{"ja":"界王拳","fr":"Kaioken","kind":"technique","length":3},
                {"source":"x","target":"y"},{"ja":"元気玉","fr":""}]"#,
        )
        .unwrap();
        assert_eq!(glossary.len(), 1);
        assert!(Glossary::from_json("{}").is_err());
    }

    #[test]
    fn loads_a_lexicon_document_for_its_target() {
        let json = r#"{"version":1,"terms":[
            {"id":"frieza","kind":"character","ja":"フリーザ","fr":"Freezer","en":"Frieza"},
            {"id":"vegeta","kind":"character","ja":"ベジータ","fr":"Vegeta","en":""}]}"#;
        let french = Glossary::from_json(json).unwrap();
        assert_eq!(french.len(), 2);
        assert!(french.applies_to(Language::English));
        let english = Glossary::from_json_for(json, Some(Language::English)).unwrap();
        assert_eq!(english.len(), 1);
        assert!(!english.applies_to(Language::French));
        let masked = english.mask("ベジータとフリーザ");
        assert_eq!(masked.text, "ベジータとZeta001");
        assert_eq!(english.restore(&masked.text, &masked).text, "ベジータとFrieza");
    }

    /// Shenron's embedded lexicon is the glossary's real input.
    #[test]
    fn the_embedded_lexicon_protects_canonical_names() {
        let glossary = Glossary::shenron(Language::French).unwrap();
        assert!(glossary.len() > 100);
        assert!(glossary.applies_to(Language::French));
        assert!(!glossary.applies_to(Language::English));
        let masked = glossary.mask("ベジータは界王拳を使った。");
        assert_eq!(masked.text, "Zeta001はZeta002を使った。");
        let restored = glossary.restore(&masked.text, &masked);
        assert!(restored.unresolved.is_empty());
        assert_eq!(restored.text, "VegetaはKaiokenを使った。");
        let english = Glossary::shenron(Language::English).unwrap();
        assert!(english.len() > 10);
        assert!(Glossary::shenron(Language::Japanese).is_none());
    }

    /// The legacy derived file still loads (consumers of `data/lexique-db-canonique.json`).
    #[test]
    fn the_legacy_lexicon_file_loads() {
        let path =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../../data/lexique-db-canonique.json");
        if !path.is_file() {
            return;
        }
        let glossary = Glossary::from_path(path).unwrap().for_target(Language::French);
        assert!(glossary.len() > 100);
        let masked = glossary.mask("ベジータは界王拳を使った。");
        assert!(masked.text.contains("Zeta001"), "{}", masked.text);
        assert!(glossary.restore(&masked.text, &masked).unresolved.is_empty());
    }
}
