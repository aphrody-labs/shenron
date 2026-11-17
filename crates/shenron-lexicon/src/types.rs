// SPDX-License-Identifier: Apache-2.0
//! Shapes of `data/lexicon/terms.json` (schema `data/lexicon/terms.schema.json`), shared with
//! `@aphrody/shenron-lexicon`'s `types.ts`.

use std::{fmt, str::FromStr};

use serde::{Deserialize, Serialize};

/// Languages of a term. Japanese is the source of the masking; French and English are targets.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    Ja,
    Fr,
    En,
}

impl Lang {
    pub const ALL: [Self; 3] = [Self::Ja, Self::Fr, Self::En];

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Ja => "ja",
            Self::Fr => "fr",
            Self::En => "en",
        }
    }
}

impl fmt::Display for Lang {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for Lang {
    type Err = String;

    /// `ja`, `fr`, `en`, also as a language tag (`fr-FR`, `en_US`), any case.
    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let primary =
            value.trim().split(['-', '_']).next().unwrap_or_default().to_ascii_lowercase();
        match primary.as_str() {
            "ja" | "jp" => Ok(Self::Ja),
            "fr" => Ok(Self::Fr),
            "en" => Ok(Self::En),
            _ => Err(format!("unknown lexicon language {value:?} (ja, fr or en)")),
        }
    }
}

/// Kinds of a term.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Character,
    Technique,
    Transformation,
    Race,
    Place,
    Item,
    Event,
    Title,
    Saga,
    Arc,
    Organization,
    Other,
}

impl Kind {
    pub const ALL: [Self; 12] = [
        Self::Character,
        Self::Technique,
        Self::Transformation,
        Self::Race,
        Self::Place,
        Self::Item,
        Self::Event,
        Self::Title,
        Self::Saga,
        Self::Arc,
        Self::Organization,
        Self::Other,
    ];

    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Character => "character",
            Self::Technique => "technique",
            Self::Transformation => "transformation",
            Self::Race => "race",
            Self::Place => "place",
            Self::Item => "item",
            Self::Event => "event",
            Self::Title => "title",
            Self::Saga => "saga",
            Self::Arc => "arc",
            Self::Organization => "organization",
            Self::Other => "other",
        }
    }
}

impl fmt::Display for Kind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl FromStr for Kind {
    type Err = String;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        Self::ALL
            .into_iter()
            .find(|kind| kind.as_str() == value.trim())
            .ok_or_else(|| format!("unknown lexicon kind {value:?}"))
    }
}

/// Other attested spellings, per language. Japanese aliases are masked like the main form.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Aliases {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ja: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fr: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub en: Option<Vec<String>>,
}

impl Aliases {
    /// Aliases of `lang` (empty when there are none).
    #[must_use]
    pub fn of(&self, lang: Lang) -> &[String] {
        match lang {
            Lang::Ja => self.ja.as_deref(),
            Lang::Fr => self.fr.as_deref(),
            Lang::En => self.en.as_deref(),
        }
        .unwrap_or_default()
    }
}

/// Field a source documents.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceField {
    Ja,
    Fr,
    En,
    Romaji,
}

/// Provenance of a field: a repository path or an editorial reference.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Source {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub lang: Option<SourceField>,
    #[serde(rename = "ref")]
    pub reference: String,
}

/// One term of the lexicon.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Term {
    /// Stable English slug (`frieza`, `kaio-ken`); never reused for another term.
    pub id: String,
    pub kind: Kind,
    /// Japanese form printed in the manga or the official guides.
    pub ja: String,
    /// French form of the dragonballfr.com wiki.
    pub fr: String,
    /// Official English form; empty while it is not established by a source.
    pub en: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub romaji: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub aliases: Option<Aliases>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sources: Option<Vec<Source>>,
}

impl Term {
    /// Main form in `lang` (empty for a missing English form).
    #[must_use]
    pub fn form(&self, lang: Lang) -> &str {
        match lang {
            Lang::Ja => &self.ja,
            Lang::Fr => &self.fr,
            Lang::En => &self.en,
        }
    }

    /// Aliases in `lang`.
    #[must_use]
    pub fn aliases(&self, lang: Lang) -> &[String] {
        self.aliases.as_ref().map(|aliases| aliases.of(lang)).unwrap_or_default()
    }

    /// Japanese spellings masked before translation: the main form, then the aliases.
    pub fn japanese_spellings(&self) -> impl Iterator<Item = &str> {
        std::iter::once(self.ja.as_str()).chain(self.aliases(Lang::Ja).iter().map(String::as_str))
    }
}

/// The document of `data/lexicon/terms.json`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LexiconData {
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    pub version: u32,
    pub terms: Vec<Term>,
}
