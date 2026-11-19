// SPDX-License-Identifier: Apache-2.0
//! Request rules shared with the TypeScript host (`packages/api/src/server/index.ts`): query
//! coercion as zod `z.coerce.number()` sees it, the error envelopes, `Accept-Language`.

use std::collections::HashMap;

use axum::{
    Json,
    http::{
        HeaderMap, HeaderValue, StatusCode,
        header::{CACHE_CONTROL, VARY},
    },
    response::{IntoResponse, Response},
};
use serde_json::json;
use shenron_lexicon::Lang;

/// `public, max-age=N, s-maxage=2N, stale-while-revalidate=4N` (`publicCacheHeaders` of the host).
pub fn public_cache(ttl: u32) -> String {
    let s = ttl.max(1);
    format!("public, max-age={s}, s-maxage={}, stale-while-revalidate={}", s * 2, s * 4)
}

/// Cache policy of a public answer: shared when `pinned` (the query names the language), else
/// private to the reader, since it followed `Accept-Language`.
pub fn cached(ttl: u32, pinned: bool, response: impl IntoResponse) -> Response {
    let value = if pinned { public_cache(ttl) } else { format!("private, max-age={}", ttl.max(1)) };
    let mut response = response.into_response();
    if response.status() == StatusCode::OK {
        let headers = response.headers_mut();
        headers.insert(CACHE_CONTROL, HeaderValue::from_str(&value).expect("ascii"));
        if !pinned {
            headers.insert(VARY, HeaderValue::from_static("Origin, Accept-Language"));
        }
    }
    response
}

/// `{ "error": "Not found" }`, 404.
pub fn not_found() -> Response {
    (StatusCode::NOT_FOUND, Json(json!({ "error": "Not found" }))).into_response()
}

/// The 400 envelope of a request that fails its schema.
pub fn invalid(message: impl Into<String>) -> Response {
    let body =
        json!({ "error": "Invalid request", "code": "invalid_request", "message": message.into() });
    (StatusCode::BAD_REQUEST, Json(body)).into_response()
}

/// Query pairs by key; a repeated key keeps every value (the host turns it into an array, which
/// no scalar field accepts).
pub fn query_map(pairs: Vec<(String, String)>) -> HashMap<String, Vec<String>> {
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for (key, value) in pairs {
        map.entry(key).or_default().push(value);
    }
    map
}

/// The single value of `key`; `Err` when it is repeated.
pub fn single<'a>(
    map: &'a HashMap<String, Vec<String>>,
    key: &str,
) -> Result<Option<&'a str>, String> {
    match map.get(key).map(Vec::as_slice) {
        None => Ok(None),
        Some([value]) => Ok(Some(value.as_str())),
        Some(_) => Err(format!("{key}: expected a single value")),
    }
}

/// Length as JavaScript counts it (UTF-16 code units): zod `.max(n)` on strings.
pub fn js_length(value: &str) -> usize {
    value.encode_utf16().count()
}

/// `Number(value)` of JavaScript, finite results only (`None` for `NaN` and infinities).
pub fn js_number(value: &str) -> Option<f64> {
    let text = value.trim();
    if text.is_empty() {
        return Some(0.0);
    }
    let radix = |digits: &str, radix: u32| {
        (!digits.is_empty()).then(|| u64::from_str_radix(digits, radix).ok()).flatten()
    };
    let lower = text.to_ascii_lowercase();
    let parsed = if let Some(digits) = lower.strip_prefix("0x") {
        radix(digits, 16).map(|n| n as f64)
    } else if let Some(digits) = lower.strip_prefix("0o") {
        radix(digits, 8).map(|n| n as f64)
    } else if let Some(digits) = lower.strip_prefix("0b") {
        radix(digits, 2).map(|n| n as f64)
    } else if lower.contains("inf") || lower.contains("nan") || lower.contains('_') {
        None
    } else {
        text.parse::<f64>().ok()
    };
    parsed.filter(|n| n.is_finite())
}

/// `z.coerce.number().int().min(min).max(max).default(default)`.
pub fn int_param(
    map: &HashMap<String, Vec<String>>,
    key: &str,
    min: f64,
    max: f64,
    default: f64,
) -> Result<f64, String> {
    let Some(raw) = single(map, key)? else { return Ok(default) };
    let number = js_number(raw).ok_or_else(|| format!("{key}: expected number, received NaN"))?;
    if number.fract() != 0.0 {
        return Err(format!("{key}: expected int, received number"));
    }
    if number < min {
        return Err(format!("{key}: too small: expected number to be >={min}"));
    }
    if number > max {
        return Err(format!("{key}: too big: expected number to be <={max}"));
    }
    Ok(number)
}

/// First of `fr`, `en`, `ja` in `Accept-Language` (quality order, stable), else French.
pub fn accepted_lang(headers: &HeaderMap) -> Lang {
    let header = headers.get("accept-language").and_then(|value| value.to_str().ok()).unwrap_or("");
    let mut ranked: Vec<(String, f64)> = header
        .split(',')
        .map(|part| {
            let mut pieces = part.trim().split(';');
            let tag = pieces.next().unwrap_or("").trim();
            let quality = pieces
                .map(str::trim)
                .find(|param| param.starts_with("q="))
                .map_or(Some(1.0), |param| js_number(&param[2..]))
                .unwrap_or(0.0);
            (tag.chars().take(2).collect::<String>().to_lowercase(), quality)
        })
        .filter(|(_, quality)| *quality > 0.0)
        .collect();
    ranked.sort_by(|a, b| b.1.total_cmp(&a.1));
    ranked
        .iter()
        .find_map(|(lang, _)| match lang.as_str() {
            "fr" => Some(Lang::Fr),
            "en" => Some(Lang::En),
            "ja" => Some(Lang::Ja),
            _ => None,
        })
        .unwrap_or(Lang::Fr)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn number_follows_javascript() {
        assert_eq!(js_number(" 5 "), Some(5.0));
        assert_eq!(js_number(""), Some(0.0));
        assert_eq!(js_number("0x10"), Some(16.0));
        assert_eq!(js_number("1e2"), Some(100.0));
        assert_eq!(js_number("abc"), None);
        assert_eq!(js_number("Infinity"), None);
        assert_eq!(js_number("inf"), None);
    }

    #[test]
    fn accept_language_ranks_by_quality() {
        let mut headers = HeaderMap::new();
        headers.insert("accept-language", "de;q=1, ja-JP;q=0.5, en;q=0.9".parse().unwrap());
        assert_eq!(accepted_lang(&headers), Lang::En);
        headers.insert("accept-language", "de, it".parse().unwrap());
        assert_eq!(accepted_lang(&headers), Lang::Fr);
    }
}
