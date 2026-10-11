// SPDX-License-Identifier: Apache-2.0
//! The lexicon: validation, lookup by id or by any form, localisation, search and masking per
//! target language. Same rules as `@aphrody/shenron-lexicon`'s `lexicon.ts` (fixtures
//! `data/lexicon/fixtures/lexicon.json`).

use std::{
    collections::{BTreeMap, HashMap, HashSet},
    sync::OnceLock,
};

use serde::Serialize;

use crate::{
    fold::fold,
    mask::{MaskEntry, MaskOptions, Masker},
    types::{Kind, Lang, LexiconData, Term},
};

/// `data/lexicon/terms.json`, embedded at build time.
pub const EMBEDDED_JSON: &str = include_str!("../../../data/lexicon/terms.json");

/// Default and largest number of search hits.
pub const SEARCH_DEFAULT_LIMIT: usize = 20;
pub const SEARCH_MAX_LIMIT: usize = 100;

/// A lexicon document that cannot be used.
#[derive(Debug, thiserror::Error)]
pub enum LexiconError {
    #[error("the lexicon is not valid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("invalid lexicon: {}", .0.join("; "))]
    Invalid(Vec<String>),
}

/// Field a search matched: a language or the romanisation.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MatchField {
    Ja,
    Fr,
    En,
    Romaji,
}

impl MatchField {
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Ja => "ja",
            Self::Fr => "fr",
            Self::En => "en",
            Self::Romaji => "romaji",
        }
    }
}

impl From<Lang> for MatchField {
    fn from(lang: Lang) -> Self {
        match lang {
            Lang::Ja => Self::Ja,
            Lang::Fr => Self::Fr,
            Lang::En => Self::En,
        }
    }
}

#[derive(Clone, Debug)]
struct Form {
    key: String,
    length: usize,
    field: MatchField,
    /// The spelling as written.
    text: String,
    alias: bool,
}

/// Spellings of a term, in resolution order: ja, fr, en, romaji, then aliases (ja, fr, en).
fn forms_of(term: &Term) -> Vec<Form> {
    let mut forms = Vec::new();
    let mut push = |text: &str, field: MatchField, alias: bool| {
        let key = fold(text);
        if !key.is_empty() {
            let length = key.chars().count();
            forms.push(Form { key, length, field, text: text.to_owned(), alias });
        }
    };
    for lang in Lang::ALL {
        let form = term.form(lang);
        if !form.is_empty() {
            push(form, lang.into(), false);
        }
    }
    if let Some(romaji) = term.romaji.as_deref() {
        push(romaji, MatchField::Romaji, true);
    }
    for lang in Lang::ALL {
        for alias in term.aliases(lang) {
            push(alias, lang.into(), true);
        }
    }
    forms
}

/// Score of one form against a folded query (0: no match).
fn score_of(form: &Form, query: &str) -> u32 {
    if form.key == query {
        if form.alias { 90 } else { 100 }
    } else if form.key.starts_with(query) {
        if form.alias { 60 } else { 70 }
    } else if form.key.contains(query) {
        if form.alias { 40 } else { 50 }
    } else if form.length >= 2 && query.contains(&form.key) {
        20
    } else {
        0
    }
}

/// Search filters.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct SearchOptions {
    pub kind: Option<Kind>,
    /// 1 to [`SEARCH_MAX_LIMIT`] (default [`SEARCH_DEFAULT_LIMIT`]).
    pub limit: Option<usize>,
}

/// One search result.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SearchHit<'a> {
    pub term: &'a Term,
    pub score: u32,
    /// Field and spelling that matched best.
    pub field: MatchField,
    pub form: &'a str,
    pub alias: bool,
}

/// A term's form in a language.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Label<'a> {
    pub text: &'a str,
    /// Language of `text`: the one asked for, or French when the English form is missing.
    pub lang: Lang,
    pub fallback: bool,
}

/// Terms carrying each field.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
pub struct Filled {
    pub ja: usize,
    pub fr: usize,
    pub en: usize,
    pub romaji: usize,
}

impl Filled {
    fn count(&mut self, term: &Term) {
        self.ja += usize::from(!term.ja.is_empty());
        self.fr += usize::from(!term.fr.is_empty());
        self.en += usize::from(!term.en.is_empty());
        self.romaji += usize::from(term.romaji.is_some());
    }
}

/// Terms of one kind and the fields they carry.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize)]
pub struct KindCoverage {
    pub total: usize,
    #[serde(flatten)]
    pub filled: Filled,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct Coverage {
    pub total: usize,
    pub filled: Filled,
    #[serde(rename = "byKind")]
    pub by_kind: BTreeMap<Kind, KindCoverage>,
}

fn is_slug(id: &str) -> bool {
    !id.is_empty()
        && id.split('-').all(|part| {
            !part.is_empty() && part.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        })
}

/// Validation issues of a lexicon document (empty: valid). The schema's rules plus the
/// cross-term ones (unique ids, a Japanese spelling owned by one term).
#[must_use]
pub fn validate(data: &LexiconData) -> Vec<String> {
    let mut issues = Vec::new();
    if data.version != 1 {
        issues.push(format!("version must be 1, got {}", data.version));
    }
    let mut ids = HashSet::new();
    let mut japanese: HashMap<&str, &str> = HashMap::new();
    for (index, term) in data.terms.iter().enumerate() {
        let at = format!("terms[{index}] ({})", term.id);
        if !is_slug(&term.id) {
            issues.push(format!("{at}: id must be a lowercase ASCII slug"));
        } else if !ids.insert(term.id.as_str()) {
            issues.push(format!("{at}: duplicate id"));
        }
        for lang in Lang::ALL {
            let value = term.form(lang);
            if value != value.trim() {
                issues.push(format!("{at}: {lang} has outer blanks"));
            } else if lang != Lang::En && value.is_empty() {
                issues.push(format!("{at}: {lang} is empty"));
            }
        }
        if term.romaji.as_deref().is_some_and(|romaji| romaji.trim().is_empty()) {
            issues.push(format!("{at}: romaji must be a non-empty string"));
        }
        if let Some(aliases) = &term.aliases {
            if aliases.ja.is_none() && aliases.fr.is_none() && aliases.en.is_none() {
                issues.push(format!("{at}: aliases is empty"));
            }
            for lang in Lang::ALL {
                let list = match lang {
                    Lang::Ja => &aliases.ja,
                    Lang::Fr => &aliases.fr,
                    Lang::En => &aliases.en,
                };
                let Some(list) = list else { continue };
                if list.is_empty() || list.iter().any(|v| v.trim().is_empty() || v != v.trim()) {
                    issues
                        .push(format!("{at}: aliases.{lang} must list trimmed non-empty strings"));
                } else if list.iter().collect::<HashSet<_>>().len() != list.len()
                    || list.iter().any(|v| v == term.form(lang))
                {
                    issues.push(format!("{at}: aliases.{lang} repeats a form"));
                }
            }
        }
        for spelling in term.japanese_spellings() {
            if let Some(owner) = japanese.insert(spelling, &term.id)
                && owner != term.id
            {
                issues
                    .push(format!("{at}: Japanese spelling {spelling} already belongs to {owner}"));
            }
        }
        if term.sources.as_ref().is_some_and(|sources| {
            sources.is_empty() || sources.iter().any(|source| source.reference.trim().is_empty())
        }) {
            issues.push(format!("{at}: sources must be {{ lang?, ref }} objects"));
        }
    }
    issues
}

/// The lexicon, indexed for lookup and search.
#[derive(Clone, Debug)]
pub struct Lexicon {
    version: u32,
    terms: Vec<Term>,
    by_id: HashMap<String, usize>,
    forms: Vec<Vec<Form>>,
}

impl Lexicon {
    /// The lexicon embedded from `data/lexicon/terms.json` (parsed once). The file is validated
    /// in CI (`bun scripts/data/lexicon.ts --check`, this crate's tests).
    ///
    /// # Panics
    /// When the embedded file is invalid, which the repository gates forbid.
    #[must_use]
    pub fn embedded() -> &'static Self {
        static EMBEDDED: OnceLock<Lexicon> = OnceLock::new();
        EMBEDDED.get_or_init(|| {
            Self::from_json(EMBEDDED_JSON)
                .unwrap_or_else(|error| panic!("embedded data/lexicon/terms.json: {error}"))
        })
    }

    /// Parse and validate a `terms.json` document.
    pub fn from_json(json: &str) -> Result<Self, LexiconError> {
        Self::from_data(serde_json::from_str(json)?)
    }

    /// Validate and index a document.
    pub fn from_data(data: LexiconData) -> Result<Self, LexiconError> {
        let issues = validate(&data);
        if !issues.is_empty() {
            return Err(LexiconError::Invalid(issues));
        }
        let by_id =
            data.terms.iter().enumerate().map(|(index, term)| (term.id.clone(), index)).collect();
        let forms = data.terms.iter().map(forms_of).collect();
        Ok(Self { version: data.version, terms: data.terms, by_id, forms })
    }

    #[must_use]
    pub const fn version(&self) -> u32 {
        self.version
    }

    #[must_use]
    pub fn terms(&self) -> &[Term] {
        &self.terms
    }

    #[must_use]
    pub fn len(&self) -> usize {
        self.terms.len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.terms.is_empty()
    }

    #[must_use]
    pub fn get(&self, id: &str) -> Option<&Term> {
        self.by_id.get(id).map(|index| &self.terms[*index])
    }

    /// The term an id or a form designates: the id first, then an exact folded match on a main
    /// form (ja, fr, en), the romanisation, then an alias; the first term in data order wins a
    /// tie.
    #[must_use]
    pub fn resolve(&self, id_or_form: &str) -> Option<&Term> {
        if let Some(term) = self.get(&id_or_form.trim().to_lowercase()) {
            return Some(term);
        }
        let key = fold(id_or_form);
        if key.is_empty() {
            return None;
        }
        [false, true].into_iter().find_map(|alias| {
            self.forms
                .iter()
                .position(|forms| forms.iter().any(|form| form.alias == alias && form.key == key))
                .map(|index| &self.terms[index])
        })
    }

    /// Form of `term` in `lang`; the English form falls back to the French one while it is
    /// missing.
    #[must_use]
    pub fn label<'a>(&self, term: &'a Term, lang: Lang) -> Label<'a> {
        let text = term.form(lang);
        if text.is_empty() {
            Label { text: &term.fr, lang: Lang::Fr, fallback: true }
        } else {
            Label { text, lang, fallback: false }
        }
    }

    /// Terms matching `query` in any language, best first (score, shortest form, id).
    #[must_use]
    pub fn search(&self, query: &str, options: SearchOptions) -> Vec<SearchHit<'_>> {
        let key = fold(query);
        if key.is_empty() {
            return Vec::new();
        }
        let limit = options.limit.unwrap_or(SEARCH_DEFAULT_LIMIT).clamp(1, SEARCH_MAX_LIMIT);
        let mut hits: Vec<(SearchHit<'_>, usize)> = Vec::new();
        for (term, forms) in self.terms.iter().zip(&self.forms) {
            if options.kind.is_some_and(|kind| kind != term.kind) {
                continue;
            }
            let mut best: Option<(SearchHit<'_>, usize)> = None;
            for form in forms {
                let score = score_of(form, &key);
                if score == 0 {
                    continue;
                }
                let better = best.as_ref().is_none_or(|(hit, length)| {
                    score > hit.score || (score == hit.score && form.length < *length)
                });
                if better {
                    let hit = SearchHit {
                        term,
                        score,
                        field: form.field,
                        form: &form.text,
                        alias: form.alias,
                    };
                    best = Some((hit, form.length));
                }
            }
            hits.extend(best);
        }
        hits.sort_by(|(a, a_length), (b, b_length)| {
            b.score.cmp(&a.score).then(a_length.cmp(b_length)).then(a.term.id.cmp(&b.term.id))
        });
        hits.into_iter().take(limit).map(|(hit, _)| hit).collect()
    }

    /// Masking entries towards `target`: the Japanese spellings (main form and aliases) of each
    /// term, restored as its `target` form. Japanese is no target: no entry.
    #[must_use]
    pub fn mask_entries(&self, target: Lang) -> Vec<MaskEntry> {
        if target == Lang::Ja {
            return Vec::new();
        }
        self.terms
            .iter()
            .map(|term| MaskEntry::new(term.japanese_spellings(), term.form(target)))
            .collect()
    }

    /// A masker protecting the lexicon's terms in a translation into `target`; entry `i` of the
    /// masker is term `i` of [`Lexicon::terms`].
    #[must_use]
    pub fn masker(&self, target: Lang, options: MaskOptions) -> Masker {
        Masker::new(self.mask_entries(target), options)
    }

    #[must_use]
    pub fn coverage(&self) -> Coverage {
        let mut coverage = Coverage { total: self.terms.len(), ..Coverage::default() };
        for term in &self.terms {
            coverage.filled.count(term);
            let kind = coverage.by_kind.entry(term.kind).or_default();
            kind.total += 1;
            kind.filled.count(term);
        }
        coverage
    }
}
