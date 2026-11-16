//! Authentication. Two ways in, both checked on every request:
//! 1. a Better Auth session or bearer token, validated by the issuer (`SHENRON_AUTH_URL`, the shared
//!    Better Auth model: `GET /api/auth/get-session`), role `admin` required;
//! 2. the operator break-glass token `SHENRON_ADMIN_TOKEN`, compared in constant time.
use axum::http::{HeaderMap, header};
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "via", rename_all = "kebab-case")]
pub enum Principal {
    Token,
    Session { user: String, role: String },
}

/// Constant-time equality for secrets of equal or different length.
pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    let mut diff = a.len() ^ b.len();
    for i in 0..a.len().max(b.len()) {
        diff |= usize::from(a.get(i).copied().unwrap_or(0) ^ b.get(i).copied().unwrap_or(0));
    }
    diff == 0
}

pub fn bearer(headers: &HeaderMap) -> Option<&str> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let (scheme, token) = value.split_once(' ')?;
    scheme.eq_ignore_ascii_case("bearer").then_some(token.trim())
}

pub fn static_token_ok(configured: Option<&str>, headers: &HeaderMap) -> bool {
    match (configured, bearer(headers)) {
        (Some(expected), Some(given)) if expected.len() >= 16 => {
            ct_eq(expected.as_bytes(), given.as_bytes())
        },
        _ => false,
    }
}

/// Reads the Better Auth `get-session` payload: `{ "user": { "id", "email", "role" }, ... }` or `null`.
pub fn session_principal(payload: &serde_json::Value, admin_roles: &[String]) -> Option<Principal> {
    let user = payload.get("user")?;
    let role = user.get("role").and_then(|r| r.as_str()).unwrap_or("");
    let allowed = role.split(',').any(|r| admin_roles.iter().any(|a| a == r.trim()));
    if !allowed {
        return None;
    }
    let id = user.get("id").and_then(|v| v.as_str()).unwrap_or("unknown");
    Some(Principal::Session { user: id.to_string(), role: role.to_string() })
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    fn fixture_token() -> String {
        ["fixture", "value", "only", "not-real"].join("-")
    }

    fn headers(value: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(header::AUTHORIZATION, HeaderValue::from_str(value).unwrap());
        h
    }

    #[test]
    fn constant_time_compare() {
        assert!(ct_eq(b"abcdef", b"abcdef"));
        assert!(!ct_eq(b"abcdef", b"abcdeg"));
        assert!(!ct_eq(b"abc", b"abcd"));
    }

    #[test]
    fn static_token_needs_length_and_match() {
        let owned = fixture_token();
        let token = owned.as_str();
        assert!(static_token_ok(Some(token), &headers(&format!("Bearer {token}"))));
        assert!(static_token_ok(Some(token), &headers(&format!("bearer {token}"))));
        assert!(!static_token_ok(Some(token), &headers("Bearer other-other-other")));
        assert!(!static_token_ok(Some("short"), &headers("Bearer short")));
        assert!(!static_token_ok(None, &headers("Bearer anything")));
    }

    #[test]
    fn session_needs_admin_role() {
        let roles = vec!["admin".to_string()];
        let ok = serde_json::json!({"user": {"id": "u1", "role": "admin"}});
        let no = serde_json::json!({"user": {"id": "u2", "role": "user"}});
        assert!(session_principal(&ok, &roles).is_some());
        assert!(session_principal(&no, &roles).is_none());
        assert!(session_principal(&serde_json::Value::Null, &roles).is_none());
    }
}
