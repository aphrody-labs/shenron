// SPDX-License-Identifier: Apache-2.0
//! `/api/public/lexicon*`: list, search in any language and the localised resolution of a term
//! (contract `packages/api/src/contract/lexicon.ts`).

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::HeaderMap,
    response::Response,
    routing::get,
};
use serde::Serialize;
use shenron_lexicon::{Kind, Lang, Lexicon, SEARCH_MAX_LIMIT, SearchOptions, Term};

use crate::http::{
    accepted_lang, cached, int_param, invalid, js_length, not_found, query_map, single,
};

/// `cache: { maxAgeSeconds: 3600, varyAcceptLanguage: true }` of both lexicon endpoints.
const TTL: u32 = 3600;

/// `q` and `{idOrForm}`: at most 200 characters.
const TEXT_MAX: usize = 200;

pub fn routes(lexicon: &'static Lexicon) -> Router {
    Router::new()
        .route("/api/public/lexicon", get(list))
        .route("/api/public/lexicon/{id_or_form}", get(term))
        .with_state(lexicon)
}

#[derive(Serialize)]
struct Aliases<'a> {
    ja: &'a [String],
    fr: &'a [String],
    en: &'a [String],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LexiconTerm<'a> {
    id: &'a str,
    kind: Kind,
    label: &'a str,
    label_lang: Lang,
    fallback: bool,
    ja: &'a str,
    fr: &'a str,
    en: Option<&'a str>,
    romaji: Option<&'a str>,
    aliases: Aliases<'a>,
    #[serde(skip_serializing_if = "Option::is_none")]
    score: Option<u32>,
}

#[derive(Serialize)]
struct LexiconList<'a> {
    lang: Lang,
    version: u32,
    items: Vec<LexiconTerm<'a>>,
    total: usize,
    limit: usize,
    offset: usize,
}

fn served<'a>(
    lexicon: &Lexicon,
    term: &'a Term,
    lang: Lang,
    score: Option<u32>,
) -> LexiconTerm<'a> {
    let label = lexicon.label(term, lang);
    let aliases = term.aliases.as_ref();
    LexiconTerm {
        id: &term.id,
        kind: term.kind,
        label: label.text,
        label_lang: label.lang,
        fallback: label.fallback,
        ja: &term.ja,
        fr: &term.fr,
        en: (!term.en.is_empty()).then_some(term.en.as_str()),
        romaji: term.romaji.as_deref(),
        aliases: Aliases {
            ja: names(aliases.and_then(|a| a.ja.as_ref())),
            fr: names(aliases.and_then(|a| a.fr.as_ref())),
            en: names(aliases.and_then(|a| a.en.as_ref())),
        },
        score,
    }
}

fn names(list: Option<&Vec<String>>) -> &[String] {
    list.map_or(&[], Vec::as_slice)
}

/// `z.enum(LANGS)`: the exact codes, no language tag.
fn lang_param(value: Option<&str>) -> Result<Option<Lang>, String> {
    value
        .map(|raw| {
            Lang::ALL
                .into_iter()
                .find(|lang| lang.as_str() == raw)
                .ok_or_else(|| format!("lang: invalid option {raw:?}"))
        })
        .transpose()
}

fn kind_param(value: Option<&str>) -> Result<Option<Kind>, String> {
    value
        .map(|raw| {
            Kind::ALL
                .into_iter()
                .find(|kind| kind.as_str() == raw)
                .ok_or_else(|| format!("kind: invalid option {raw:?}"))
        })
        .transpose()
}

struct ListQuery {
    lang: Option<Lang>,
    kind: Option<Kind>,
    q: Option<String>,
    limit: usize,
    offset: usize,
}

fn list_query(pairs: Vec<(String, String)>) -> Result<ListQuery, String> {
    let map = query_map(pairs);
    let lang = lang_param(single(&map, "lang")?)?;
    let kind = kind_param(single(&map, "kind")?)?;
    let q = single(&map, "q")?.map(str::to_owned);
    if q.as_deref().is_some_and(|q| js_length(q) > TEXT_MAX) {
        return Err(format!("q: too big: expected string to have <={TEXT_MAX} characters"));
    }
    #[allow(clippy::cast_precision_loss)]
    let max = SEARCH_MAX_LIMIT as f64;
    // Integers checked in range by `int_param`; the float to usize cast saturates.
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let limit = int_param(&map, "limit", 1.0, max, 20.0)? as usize;
    #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
    let offset = int_param(&map, "offset", 0.0, f64::MAX, 0.0)? as usize;
    Ok(ListQuery { lang, kind, q, limit, offset })
}

async fn list(
    State(lexicon): State<&'static Lexicon>,
    headers: HeaderMap,
    Query(pairs): Query<Vec<(String, String)>>,
) -> Response {
    let query = match list_query(pairs) {
        Ok(query) => query,
        Err(message) => return invalid(message),
    };
    let lang = query.lang.unwrap_or_else(|| accepted_lang(&headers));
    let search = query.q.as_deref().map(str::trim).unwrap_or_default();
    let page: Vec<(&Term, Option<u32>)> = if search.is_empty() {
        lexicon
            .terms()
            .iter()
            .filter(|term| query.kind.is_none_or(|kind| term.kind == kind))
            .map(|term| (term, None))
            .collect()
    } else {
        let options = SearchOptions { kind: query.kind, limit: Some(SEARCH_MAX_LIMIT) };
        lexicon.search(search, options).into_iter().map(|hit| (hit.term, Some(hit.score))).collect()
    };
    let items = page
        .iter()
        .skip(query.offset)
        .take(query.limit)
        .map(|&(term, score)| served(lexicon, term, lang, score))
        .collect();
    let body = LexiconList {
        lang,
        version: lexicon.version(),
        items,
        total: page.len(),
        limit: query.limit,
        offset: query.offset,
    };
    cached(TTL, query.lang.is_some(), Json(body))
}

async fn term(
    State(lexicon): State<&'static Lexicon>,
    headers: HeaderMap,
    Path(id_or_form): Path<String>,
    Query(pairs): Query<Vec<(String, String)>>,
) -> Response {
    let map = query_map(pairs);
    let pinned = match single(&map, "lang").and_then(lang_param) {
        Ok(lang) => lang,
        Err(message) => return invalid(message),
    };
    let lang = pinned.unwrap_or_else(|| accepted_lang(&headers));
    if js_length(&id_or_form) > TEXT_MAX {
        return invalid(format!(
            "idOrForm: too big: expected string to have <={TEXT_MAX} characters"
        ));
    }
    match lexicon.resolve(&id_or_form) {
        Some(term) => cached(TTL, pinned.is_some(), Json(served(lexicon, term, lang, None))),
        None => not_found(),
    }
}
