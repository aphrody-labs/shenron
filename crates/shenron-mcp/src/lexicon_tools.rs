// SPDX-License-Identifier: Apache-2.0
//! `dragonball.lexicon_search`: Shenron's one ja/fr/en lexicon (`shenron-lexicon`, embedded),
//! the same search and localisation as `GET /api/public/lexicon` of the Shenron API. Offline,
//! read only.

use rmcp::model::CallToolResult;
use schemars::JsonSchema;
use serde::Deserialize;
use serde_json::{Value, json};
use shenron_lexicon::{Kind, Lang, Lexicon, SearchOptions, Term};

use crate::dragonball_tools::{err, ok};

/// Input of `dragonball.lexicon_search`.
#[derive(Debug, Clone, Deserialize, JsonSchema)]
pub(crate) struct LexiconSearchRequest {
    #[schemars(
        description = "A name, technique, place… in Japanese, French or English (e.g. 'フリーザ', 'Freezer', 'Frieza')"
    )]
    pub query: String,
    #[schemars(description = "Language of the labels: ja, fr or en (default fr)")]
    #[serde(default)]
    pub lang: Option<String>,
    #[schemars(
        description = "Kind filter: character, technique, transformation, race, place, item, event, title, saga, arc, organization, other"
    )]
    #[serde(default)]
    pub kind: Option<String>,
    #[schemars(description = "Number of terms (default 10, max 100)")]
    #[serde(default)]
    pub limit: Option<u32>,
}

fn term_json(lexicon: &Lexicon, term: &Term, lang: Lang, score: u32) -> Value {
    let label = lexicon.label(term, lang);
    json!({
        "id": term.id,
        "kind": term.kind,
        "label": label.text,
        "labelLang": label.lang,
        "fallback": label.fallback,
        "ja": term.ja,
        "fr": term.fr,
        "en": (!term.en.is_empty()).then_some(&term.en),
        "romaji": term.romaji,
        "aliases": {
            "ja": term.aliases(Lang::Ja),
            "fr": term.aliases(Lang::Fr),
            "en": term.aliases(Lang::En),
        },
        "score": score,
    })
}

pub(crate) fn lexicon_search(r: LexiconSearchRequest) -> CallToolResult {
    let lang = match r.lang.as_deref().map(str::trim).filter(|lang| !lang.is_empty()) {
        Some(tag) => match tag.parse::<Lang>() {
            Ok(lang) => lang,
            Err(error) => return err(error),
        },
        None => Lang::Fr,
    };
    let kind = match r.kind.as_deref().map(str::trim).filter(|kind| !kind.is_empty()) {
        Some(kind) => match kind.parse::<Kind>() {
            Ok(kind) => Some(kind),
            Err(error) => return err(error),
        },
        None => None,
    };
    if r.query.trim().is_empty() || r.query.chars().count() > 200 {
        return err("query must contain between 1 and 200 characters");
    }
    let lexicon = Lexicon::embedded();
    let limit = r.limit.map_or(10, |limit| usize::try_from(limit).unwrap_or(100));
    let hits = lexicon.search(&r.query, SearchOptions { kind, limit: Some(limit) });
    let terms: Vec<Value> =
        hits.iter().map(|hit| term_json(lexicon, hit.term, lang, hit.score)).collect();
    ok(json!({
        "query": r.query,
        "lang": lang,
        "total": terms.len(),
        "terms": terms,
        "note": "Empty `en`: no source establishes the English form yet; `label` then falls back to French. A missing term is no proof of an error.",
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text(result: &CallToolResult) -> String {
        serde_json::to_string(result).unwrap_or_default()
    }

    #[test]
    fn finds_a_term_in_any_language_and_labels_it() {
        let result = lexicon_search(LexiconSearchRequest {
            query: "Freezer".into(),
            lang: Some("en".into()),
            kind: None,
            limit: Some(3),
        });
        let body = text(&result);
        assert!(body.contains("frieza"), "{body}");
        assert!(body.contains("Frieza"), "{body}");
    }

    #[test]
    fn rejects_an_unknown_language_or_kind() {
        let request = |lang: &str, kind: &str| LexiconSearchRequest {
            query: "Goku".into(),
            lang: Some(lang.into()),
            kind: Some(kind.into()),
            limit: None,
        };
        assert_eq!(lexicon_search(request("de", "character")).is_error, Some(true));
        assert_eq!(lexicon_search(request("fr", "personnage")).is_error, Some(true));
    }
}
