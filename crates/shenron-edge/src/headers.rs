// SPDX-License-Identifier: Apache-2.0
//! Header rules (nginx `add_header`, `proxy_set_header`, `proxy_hide_header`) and the variables
//! their values may use.

use pingora::http::ResponseHeader;

use crate::config::HeaderRules;

/// Values available to header templates.
#[derive(Debug, Clone, Copy, Default)]
pub struct Vars<'a> {
    pub host: &'a str,
    pub scheme: &'a str,
    pub request_uri: &'a str,
    pub remote_addr: &'a str,
    pub cache_status: &'a str,
    pub upstream_addr: &'a str,
}

/// Replace `$name` tokens; unknown names are left untouched.
pub fn expand(template: &str, vars: &Vars<'_>) -> String {
    let mut out = String::with_capacity(template.len());
    let mut rest = template;
    while let Some(at) = rest.find('$') {
        out.push_str(&rest[..at]);
        let tail = &rest[at + 1..];
        let len = tail.find(|c: char| !(c.is_ascii_lowercase() || c == '_')).unwrap_or(tail.len());
        let name = &tail[..len];
        let value = match name {
            "host" => Some(vars.host),
            "scheme" => Some(vars.scheme),
            "request_uri" => Some(vars.request_uri),
            "remote_addr" => Some(vars.remote_addr),
            "cache_status" | "upstream_cache_status" => Some(vars.cache_status),
            "upstream_addr" => Some(vars.upstream_addr),
            _ => None,
        };
        match value {
            Some(v) => out.push_str(v),
            None => {
                out.push('$');
                out.push_str(name);
            },
        }
        rest = &tail[len..];
    }
    out.push_str(rest);
    out
}

/// Apply remove, then default (set when absent), then add (always appended, empty values skipped).
pub fn apply(resp: &mut ResponseHeader, rules: &HeaderRules, vars: &Vars<'_>) {
    for name in &rules.remove {
        resp.remove_header(name.as_str());
    }
    for (name, template) in &rules.default {
        if !resp.headers.contains_key(name.as_str()) {
            let value = expand(template, vars);
            if !value.is_empty() {
                let _ = resp.insert_header(name.clone(), value);
            }
        }
    }
    for (name, template) in &rules.add {
        let value = expand(template, vars);
        if !value.is_empty() {
            let _ = resp.append_header(name.clone(), value);
        }
    }
}

/// Drop what nginx never passes to the client: `X-Accel-*` and the upstream `Server` and `Date`.
pub fn strip_internal(resp: &mut ResponseHeader) {
    let accel: Vec<String> = resp
        .headers
        .keys()
        .map(|k| k.as_str().to_owned())
        .filter(|k| k.starts_with("x-accel-"))
        .collect();
    for name in accel {
        resp.remove_header(name.as_str());
    }
    resp.remove_header("server");
    resp.remove_header("date");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vars() -> Vars<'static> {
        Vars {
            host: "dragonballfr.com",
            scheme: "https",
            request_uri: "/a?b=1",
            remote_addr: "203.0.113.9",
            cache_status: "HIT",
            upstream_addr: "",
        }
    }

    #[test]
    fn expands_known_variables_only() {
        assert_eq!(
            expand("$scheme://$host$request_uri", &vars()),
            "https://dragonballfr.com/a?b=1"
        );
        assert_eq!(expand("$unknown-$cache_status", &vars()), "$unknown-HIT");
        assert_eq!(expand("price $5", &vars()), "price $5");
    }

    #[test]
    fn rules_follow_nginx_add_header_semantics() {
        let mut resp = ResponseHeader::build(200, None).unwrap();
        resp.insert_header("x-frame-options", "SAMEORIGIN").unwrap();
        resp.insert_header("server", "origin").unwrap();
        resp.insert_header("x-accel-buffering", "no").unwrap();
        resp.insert_header("date", "Thu, 19 Nov 2026 11:00:00 GMT").unwrap();
        strip_internal(&mut resp);
        let mut rules = HeaderRules::default();
        rules.default.insert("X-Frame-Options".into(), "DENY".into());
        rules.default.insert("Referrer-Policy".into(), "no-referrer".into());
        rules.add.insert("X-Shenron-LB-Cache".into(), "$cache_status".into());
        rules.add.insert("X-Shenron-Upstream".into(), "$upstream_addr".into());
        rules.remove.push("x-powered-by".into());
        apply(&mut resp, &rules, &vars());
        let get = |n: &str| resp.headers.get(n).map(|v| v.to_str().unwrap().to_owned());
        assert_eq!(get("x-frame-options").as_deref(), Some("SAMEORIGIN"));
        assert_eq!(get("referrer-policy").as_deref(), Some("no-referrer"));
        assert_eq!(get("x-shenron-lb-cache").as_deref(), Some("HIT"));
        assert_eq!(get("x-shenron-upstream"), None, "empty value: header skipped");
        assert_eq!(get("server"), None);
        assert_eq!(get("x-accel-buffering"), None);
        assert_eq!(get("date"), None);
    }
}
