// SPDX-License-Identifier: Apache-2.0
//! Disk cache zones (nginx `proxy_cache_path`): key and variance rules, cacheability policy and the
//! on-disk store.

mod policy;
mod store;

pub use policy::{ValidTtl, ttl_for, vary_names};
pub use store::{Entry, Hit, LockGuard, LockOutcome, Zone, now_secs, vary_hash};

use crate::config::{BypassConfig, VarianceRule};

/// Conditions accepted by `use_stale` (nginx `proxy_cache_use_stale`).
pub const STALE_CONDITIONS: [&str; 7] =
    ["error", "timeout", "updating", "http_500", "http_502", "http_503", "http_504"];

/// Cache key: scheme, host and request URI, then one `|value` per variance rule.
pub fn build_key(scheme: &str, host: &str, uri: &str, variants: &[String]) -> String {
    let mut key = format!("{scheme}{host}{uri}");
    for value in variants {
        key.push('|');
        key.push_str(value);
    }
    key
}

/// Value of one variance rule for a request header (`image/avif` accepted gives `avif`).
pub fn variant_value(rule: &VarianceRule, header: Option<&str>) -> String {
    let lowered = header.map(str::to_ascii_lowercase).unwrap_or_default();
    rule.map
        .iter()
        .find(|m| lowered.contains(&m.contains.to_ascii_lowercase()))
        .map_or_else(|| rule.default.clone(), |m| m.value.clone())
}

/// Whether the request skips the cache entirely (lookup and store).
pub fn bypass(rules: &BypassConfig, cookie: Option<&str>, query: Option<&str>) -> bool {
    if let Some(cookie) = cookie {
        let cookie = cookie.to_ascii_lowercase();
        if rules.cookies.iter().any(|pattern| cookie.contains(&pattern.to_ascii_lowercase())) {
            return true;
        }
    }
    let Some(query) = query else { return false };
    query.split('&').any(|pair| {
        let (name, value) = pair.split_once('=').unwrap_or((pair, ""));
        rules.args.iter().any(|arg| arg == name) && !value.is_empty() && value != "0"
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::VarianceMap;

    fn accept_rule() -> VarianceRule {
        VarianceRule {
            header: "accept".into(),
            default: "orig".into(),
            map: vec![
                VarianceMap { contains: "image/avif".into(), value: "avif".into() },
                VarianceMap { contains: "image/webp".into(), value: "webp".into() },
            ],
        }
    }

    #[test]
    fn image_accept_variance_matches_the_nginx_map() {
        let rule = accept_rule();
        assert_eq!(variant_value(&rule, Some("image/avif,image/webp,*/*")), "avif");
        assert_eq!(variant_value(&rule, Some("IMAGE/WEBP,*/*")), "webp");
        assert_eq!(variant_value(&rule, Some("*/*")), "orig");
        assert_eq!(variant_value(&rule, None), "orig");
    }

    #[test]
    fn key_matches_scheme_host_uri_plus_variants() {
        assert_eq!(
            build_key(
                "https",
                "dragonballfr.com",
                "/_next/image?url=%2Fa.png&w=64",
                &["avif".into()]
            ),
            "httpsdragonballfr.com/_next/image?url=%2Fa.png&w=64|avif"
        );
    }

    #[test]
    fn bypass_on_session_cookies_and_nocache_arg() {
        let rules = BypassConfig {
            cookies: vec!["better-auth".into(), "shenron_session".into()],
            args: vec!["nocache".into()],
        };
        assert!(bypass(&rules, Some("a=b; __Secure-better-auth.session_token=x"), None));
        assert!(bypass(&rules, Some("SHENRON_SESSION=1"), None));
        assert!(!bypass(&rules, Some("theme=dark"), None));
        assert!(bypass(&rules, None, Some("x=1&nocache=1")));
        assert!(!bypass(&rules, None, Some("nocache=0")));
        assert!(!bypass(&rules, None, Some("nocache=")));
        assert!(!bypass(&rules, None, Some("page=2")));
    }
}
