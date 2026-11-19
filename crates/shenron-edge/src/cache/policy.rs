// SPDX-License-Identifier: Apache-2.0
//! What the upstream response lets the edge store, and for how long. Same precedence as nginx:
//! `Set-Cookie` and `Vary: *` forbid; then `X-Accel-Expires`, `Cache-Control`, `Expires`; then the
//! per-status `valid` rules.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use http::HeaderMap;
use http::header::{CACHE_CONTROL, EXPIRES, SET_COOKIE, VARY};

/// One `proxy_cache_valid` rule.
#[derive(Debug, Clone)]
pub struct ValidTtl {
    pub status: Vec<u16>,
    pub ttl: Duration,
}

enum Directive {
    Forbid,
    Ttl(u64),
    Silent,
}

fn cache_control(value: &str) -> Directive {
    let mut s_maxage = None;
    let mut max_age = None;
    for token in value.split(',') {
        let token = token.trim().to_ascii_lowercase();
        match token.as_str() {
            "private" | "no-cache" | "no-store" => return Directive::Forbid,
            _ => {},
        }
        if let Some(v) = token.strip_prefix("s-maxage=") {
            s_maxage = v.trim_matches('"').parse::<u64>().ok();
        } else if let Some(v) = token.strip_prefix("max-age=") {
            max_age = v.trim_matches('"').parse::<u64>().ok();
        }
    }
    s_maxage.or(max_age).map_or(Directive::Silent, Directive::Ttl)
}

fn header_text(headers: &HeaderMap, name: &str) -> Option<String> {
    let values: Vec<&str> = headers.get_all(name).iter().filter_map(|v| v.to_str().ok()).collect();
    (!values.is_empty()).then(|| values.join(","))
}

/// Header names listed in `Vary`, lowercased; `None` when the response varies on everything (`*`).
pub fn vary_names(headers: &HeaderMap) -> Option<Vec<String>> {
    let mut names = Vec::new();
    for value in headers.get_all(VARY) {
        for name in value.to_str().unwrap_or_default().split(',') {
            let name = name.trim().to_ascii_lowercase();
            if name == "*" {
                return None;
            }
            if !name.is_empty() && !names.contains(&name) {
                names.push(name);
            }
        }
    }
    names.sort();
    Some(names)
}

/// Time to live of a response, or `None` when it must not be stored.
pub fn ttl_for(
    status: u16,
    headers: &HeaderMap,
    valid: &[ValidTtl],
    honor_upstream: bool,
    now: SystemTime,
) -> Option<Duration> {
    if status >= 500 || status == 206 || headers.contains_key(SET_COOKIE) {
        return None;
    }
    if honor_upstream {
        if let Some(accel) = header_text(headers, "x-accel-expires") {
            let accel = accel.trim();
            if let Some(epoch) = accel.strip_prefix('@') {
                let at = epoch.parse::<u64>().ok()?;
                let now_secs = now.duration_since(UNIX_EPOCH).ok()?.as_secs();
                return at.checked_sub(now_secs).filter(|s| *s > 0).map(Duration::from_secs);
            }
            return match accel.parse::<u64>() {
                Ok(0) | Err(_) => None,
                Ok(secs) => Some(Duration::from_secs(secs)),
            };
        }
        if let Some(cc) = header_text(headers, CACHE_CONTROL.as_str()) {
            match cache_control(&cc) {
                Directive::Forbid | Directive::Ttl(0) => return None,
                Directive::Ttl(secs) => return Some(Duration::from_secs(secs)),
                Directive::Silent => {},
            }
        }
        if let Some(expires) = header_text(headers, EXPIRES.as_str()) {
            // An unparsable `Expires` means "already expired", as in nginx.
            let at = httpdate::parse_http_date(expires.trim()).ok()?;
            return at.duration_since(now).ok().filter(|d| !d.is_zero());
        }
    }
    valid
        .iter()
        .find(|rule| rule.status.contains(&status))
        .map(|rule| rule.ttl)
        .filter(|ttl| !ttl.is_zero())
}

#[cfg(test)]
mod tests {
    use super::*;
    use http::HeaderValue;

    fn headers(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.append(*name, HeaderValue::from_static(value));
        }
        map
    }

    fn valid() -> Vec<ValidTtl> {
        vec![
            ValidTtl { status: vec![200], ttl: Duration::from_secs(600) },
            ValidTtl { status: vec![404], ttl: Duration::from_secs(60) },
        ]
    }

    #[test]
    fn s_maxage_beats_max_age_zero_like_the_live_ssr_pages() {
        let h = headers(&[(
            "cache-control",
            "public, max-age=0, s-maxage=60, stale-while-revalidate=600",
        )]);
        assert_eq!(
            ttl_for(200, &h, &valid(), true, SystemTime::now()),
            Some(Duration::from_secs(60))
        );
    }

    #[test]
    fn forbidding_headers_win_over_valid_rules() {
        for pairs in [
            &[("cache-control", "no-store")][..],
            &[("cache-control", "private, max-age=10")][..],
            &[("set-cookie", "a=b")][..],
            &[("x-accel-expires", "0")][..],
        ] {
            assert_eq!(
                ttl_for(200, &headers(pairs), &valid(), true, SystemTime::now()),
                None,
                "{pairs:?}"
            );
        }
        assert_eq!(vary_names(&headers(&[("vary", "*")])), None);
    }

    #[test]
    fn falls_back_to_valid_rules_by_status() {
        let now = SystemTime::now();
        let none = HeaderMap::new();
        assert_eq!(ttl_for(200, &none, &valid(), true, now), Some(Duration::from_secs(600)));
        assert_eq!(ttl_for(404, &none, &valid(), true, now), Some(Duration::from_secs(60)));
        assert_eq!(ttl_for(301, &none, &valid(), true, now), None);
        assert_eq!(ttl_for(503, &none, &valid(), true, now), None);
        // Ignoring the upstream headers uses the rules only.
        let h = headers(&[("cache-control", "max-age=5")]);
        assert_eq!(ttl_for(200, &h, &valid(), false, now), Some(Duration::from_secs(600)));
    }

    #[test]
    fn expires_header_and_accel_expires() {
        let now = UNIX_EPOCH + Duration::from_secs(1_000_000_000);
        let future = httpdate::fmt_http_date(now + Duration::from_secs(120));
        let mut h = HeaderMap::new();
        h.insert("expires", HeaderValue::from_str(&future).unwrap());
        assert_eq!(ttl_for(200, &h, &[], true, now), Some(Duration::from_secs(120)));
        let h = headers(&[("x-accel-expires", "30"), ("cache-control", "no-store")]);
        assert_eq!(ttl_for(200, &h, &[], true, now), Some(Duration::from_secs(30)));
    }

    #[test]
    fn vary_names_sorted_and_deduplicated() {
        let h =
            headers(&[("vary", "RSC, Next-Router-State-Tree"), ("vary", "rsc, Accept-Encoding")]);
        assert_eq!(
            vary_names(&h).unwrap(),
            vec!["accept-encoding", "next-router-state-tree", "rsc"]
        );
    }
}
