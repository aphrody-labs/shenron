// SPDX-License-Identifier: Apache-2.0
//! Access control of the public HTTP server: who gets the elevated (read + write + admin) tool set.
//!
//! A caller is elevated when it either
//!
//! - presents `Authorization: Bearer <token>` with an accepted token: any entry of
//!   `SHENRON_MCP_TOKENS` (comma-separated), plus `SHENRON_ADMIN_TOKEN`, `SHENRON_API_ADMIN_TOKEN` and `DBFR_TOKEN` when
//!   they are set. Comparison is constant-time. A bearer that is present but unknown is refused
//!   (401), never silently downgraded to anonymous access; or
//! - connects from an address listed in `SHENRON_MCP_ALLOWED_IPS` (comma-separated IPs or CIDR
//!   blocks, IPv4 and IPv6).
//!
//! The client address is the TCP peer, except when the peer itself belongs to
//! `SHENRON_MCP_TRUSTED_PROXIES` (loopback by default): then it is read from `X-Forwarded-For`
//! (right-most entry that is not a trusted proxy) or, failing that, `X-Real-IP`. Forwarding headers
//! sent by an untrusted peer are ignored, so they cannot be used to spoof an allow-listed address.
//!
//! Everyone else is anonymous and only ever reaches the read-only tools.

use std::net::{IpAddr, SocketAddr};

use axum::http::{HeaderMap, header};

/// Shortest bearer token accepted from `SHENRON_MCP_TOKENS` (shorter ones are ignored).
pub const MIN_TOKEN_LEN: usize = 16;

/// An IP address or CIDR block.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Cidr {
    addr: IpAddr,
    prefix: u8,
}

impl Cidr {
    /// Parse `1.2.3.4`, `10.0.0.0/8`, `::1` or `2001:db8::/32`.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        let text = text.trim();
        let (host, prefix) = match text.split_once('/') {
            Some((host, prefix)) => (host, Some(prefix.trim().parse::<u8>().ok()?)),
            None => (text, None),
        };
        let addr: IpAddr = host.trim().parse().ok()?;
        let addr = addr.to_canonical();
        let max = if addr.is_ipv4() { 32 } else { 128 };
        let prefix = prefix.unwrap_or(max);
        (prefix <= max).then_some(Self { addr, prefix })
    }

    /// Does the block contain `ip`? Families never mix (IPv4-mapped IPv6 is unwrapped first).
    #[must_use]
    pub fn contains(&self, ip: IpAddr) -> bool {
        let (candidate, width) = match (self.addr, ip.to_canonical()) {
            (IpAddr::V4(_), IpAddr::V4(v4)) => (u128::from(u32::from(v4)), 32_u32),
            (IpAddr::V6(_), IpAddr::V6(v6)) => (u128::from(v6), 128_u32),
            _ => return false,
        };
        let base = match self.addr {
            IpAddr::V4(v4) => u128::from(u32::from(v4)),
            IpAddr::V6(v6) => u128::from(v6),
        };
        let shift = width - u32::from(self.prefix);
        if shift >= 128 {
            return true;
        }
        (candidate >> shift) == (base >> shift)
    }
}

/// How a request is authorised.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Decision {
    /// Valid bearer token.
    ElevatedToken,
    /// Allow-listed client address.
    ElevatedIp,
    /// No credential: read-only tools.
    Anonymous,
    /// A bearer token was presented but is not accepted: 401.
    Invalid,
}

impl Decision {
    /// Does this decision unlock read + write + admin tools?
    #[must_use]
    pub const fn is_elevated(self) -> bool {
        matches!(self, Self::ElevatedToken | Self::ElevatedIp)
    }
}

/// The access policy of one server.
#[derive(Debug, Clone, Default)]
pub struct Access {
    tokens: Vec<String>,
    allowed_ips: Vec<Cidr>,
    trusted_proxies: Vec<Cidr>,
}

fn list(raw: &str) -> impl Iterator<Item = &str> {
    raw.split(',').map(str::trim).filter(|item| !item.is_empty())
}

fn cidrs(name: &str, raw: &str) -> Vec<Cidr> {
    list(raw)
        .filter_map(|item| {
            let parsed = Cidr::parse(item);
            if parsed.is_none() {
                tracing::warn!(variable = name, entry = item, "ignoring invalid IP/CIDR entry");
            }
            parsed
        })
        .collect()
}

/// Constant-time equality (the length difference is folded into the result, never short-circuits).
fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    let mut diff = left.len() ^ right.len();
    for index in 0..left.len().max(right.len()) {
        let a = left.get(index).copied().unwrap_or(0);
        let b = right.get(index).copied().unwrap_or(0);
        diff |= usize::from(a ^ b);
    }
    diff == 0
}

fn parse_forwarded(entry: &str) -> Option<IpAddr> {
    let entry = entry.trim();
    entry
        .parse::<IpAddr>()
        .ok()
        .or_else(|| entry.parse::<SocketAddr>().ok().map(|socket| socket.ip()))
        .or_else(|| entry.trim_start_matches('[').trim_end_matches(']').parse::<IpAddr>().ok())
}

enum Bearer<'a> {
    Absent,
    Malformed,
    Token(&'a str),
}

fn bearer(headers: &HeaderMap) -> Bearer<'_> {
    let Some(value) = headers.get(header::AUTHORIZATION) else {
        return Bearer::Absent;
    };
    let Ok(value) = value.to_str() else {
        return Bearer::Malformed;
    };
    let value = value.trim();
    match value.split_once(char::is_whitespace) {
        Some((scheme, token)) if scheme.eq_ignore_ascii_case("bearer") => {
            Bearer::Token(token.trim())
        },
        // `Bearer` with nothing after it is a (void) token, not an absent credential.
        None if value.eq_ignore_ascii_case("bearer") => Bearer::Token(""),
        // Another scheme (Basic, ...) is not ours: treat it as no credential.
        _ => Bearer::Absent,
    }
}

impl Access {
    /// A policy from explicit parts (tokens shorter than [`MIN_TOKEN_LEN`] are dropped).
    #[must_use]
    pub fn new(tokens: &[&str], allowed_ips: &[&str], trusted_proxies: &[&str]) -> Self {
        Self {
            tokens: tokens
                .iter()
                .map(|token| token.trim())
                .filter(|token| token.len() >= MIN_TOKEN_LEN)
                .map(str::to_owned)
                .collect(),
            allowed_ips: allowed_ips.iter().filter_map(|ip| Cidr::parse(ip)).collect(),
            trusted_proxies: trusted_proxies.iter().filter_map(|ip| Cidr::parse(ip)).collect(),
        }
    }

    /// The policy configured through the environment (see the module documentation).
    #[must_use]
    pub fn from_env() -> Self {
        Self::from_environment(|name| std::env::var(name).ok())
    }

    fn from_environment(get: impl Fn(&str) -> Option<String>) -> Self {
        let mut tokens: Vec<String> = Vec::new();
        if let Some(raw) = get("SHENRON_MCP_TOKENS") {
            for token in list(&raw) {
                if token.len() >= MIN_TOKEN_LEN {
                    tokens.push(token.to_owned());
                } else {
                    tracing::warn!(
                        "ignoring a SHENRON_MCP_TOKENS entry shorter than {MIN_TOKEN_LEN} bytes"
                    );
                }
            }
        }
        for name in ["SHENRON_ADMIN_TOKEN", "SHENRON_API_ADMIN_TOKEN", "DBFR_TOKEN"] {
            if let Some(value) = get(name).map(|v| v.trim().to_owned())
                && value.len() >= MIN_TOKEN_LEN
            {
                tokens.push(value);
            }
        }
        let allowed_ips = get("SHENRON_MCP_ALLOWED_IPS")
            .map(|raw| cidrs("SHENRON_MCP_ALLOWED_IPS", &raw))
            .unwrap_or_default();
        let trusted_proxies = match get("SHENRON_MCP_TRUSTED_PROXIES") {
            Some(raw) => cidrs("SHENRON_MCP_TRUSTED_PROXIES", &raw),
            None => ["127.0.0.0/8", "::1/128"].iter().filter_map(|c| Cidr::parse(c)).collect(),
        };
        Self { tokens, allowed_ips, trusted_proxies }
    }

    /// Number of accepted bearer tokens (never their values).
    #[must_use]
    pub fn token_count(&self) -> usize {
        self.tokens.len()
    }

    /// Number of allow-listed IP entries.
    #[must_use]
    pub fn allowed_ip_count(&self) -> usize {
        self.allowed_ips.len()
    }

    fn is_trusted_proxy(&self, ip: IpAddr) -> bool {
        self.trusted_proxies.iter().any(|block| block.contains(ip))
    }

    fn token_valid(&self, candidate: &str) -> bool {
        // Every token is compared (no early exit) so timing does not reveal which one matched.
        let mut matched = false;
        for token in &self.tokens {
            matched |= constant_time_eq(token.as_bytes(), candidate.as_bytes());
        }
        matched && !candidate.is_empty()
    }

    /// The client address: the peer, or the forwarded address when the peer is a trusted proxy.
    /// `None` when a trusted proxy forwarded something unusable (never elevated then).
    #[must_use]
    pub fn client_ip(&self, peer: IpAddr, headers: &HeaderMap) -> Option<IpAddr> {
        let peer = peer.to_canonical();
        if !self.is_trusted_proxy(peer) {
            return Some(peer);
        }
        let forwarded: Vec<&str> = headers
            .get_all("x-forwarded-for")
            .iter()
            .filter_map(|value| value.to_str().ok())
            .flat_map(|value| value.split(','))
            .collect();
        if !forwarded.is_empty() {
            // Walk from the proxy side: the first entry no trusted proxy vouches for is the client.
            for entry in forwarded.iter().rev() {
                let ip = parse_forwarded(entry)?.to_canonical();
                if !self.is_trusted_proxy(ip) {
                    return Some(ip);
                }
            }
            return Some(peer);
        }
        if let Some(real) = headers.get("x-real-ip").and_then(|value| value.to_str().ok()) {
            return parse_forwarded(real).map(|ip| ip.to_canonical());
        }
        Some(peer)
    }

    /// Authorise a request from `peer` carrying `headers`.
    #[must_use]
    pub fn authorize(&self, peer: IpAddr, headers: &HeaderMap) -> Decision {
        match bearer(headers) {
            Bearer::Malformed => return Decision::Invalid,
            Bearer::Token(token) => {
                return if self.token_valid(token) {
                    Decision::ElevatedToken
                } else {
                    Decision::Invalid
                };
            },
            Bearer::Absent => {},
        }
        match self.client_ip(peer, headers) {
            Some(ip) if self.allowed_ips.iter().any(|block| block.contains(ip)) => {
                Decision::ElevatedIp
            },
            _ => Decision::Anonymous,
        }
    }
}

#[cfg(test)]
mod tests {
    use axum::http::HeaderValue;

    use super::*;

    const TOKEN: &str = "mcp-secret-token-0123456789";

    fn ip(text: &str) -> IpAddr {
        text.parse().expect("test IP")
    }

    fn headers(pairs: &[(&'static str, &str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.append(*name, HeaderValue::from_str(value).expect("header value"));
        }
        map
    }

    fn policy() -> Access {
        Access::new(
            &[TOKEN],
            &["203.0.113.0/24", "2001:db8::/32", "198.51.100.7"],
            &["127.0.0.0/8", "::1", "10.0.0.0/8"],
        )
    }

    #[test]
    fn cidr_matching_covers_both_families() {
        let block = Cidr::parse("10.1.0.0/16").expect("cidr");
        assert!(block.contains(ip("10.1.200.3")));
        assert!(!block.contains(ip("10.2.0.1")));
        assert!(!block.contains(ip("2001:db8::1")));
        let v6 = Cidr::parse("2001:db8::/32").expect("cidr");
        assert!(v6.contains(ip("2001:db8:1::5")));
        assert!(!v6.contains(ip("2001:db9::1")));
        assert!(Cidr::parse("0.0.0.0/0").expect("cidr").contains(ip("8.8.8.8")));
        assert!(Cidr::parse("1.2.3.4").expect("host").contains(ip("1.2.3.4")));
        assert!(Cidr::parse("::ffff:1.2.3.4").expect("mapped").contains(ip("1.2.3.4")));
        assert!(Cidr::parse("1.2.3.4/33").is_none());
        assert!(Cidr::parse("nope").is_none());
    }

    #[test]
    fn a_valid_token_is_elevated_and_an_unknown_one_is_refused() {
        let access = policy();
        let good = headers(&[("authorization", &format!("Bearer {TOKEN}"))]);
        assert_eq!(access.authorize(ip("8.8.8.8"), &good), Decision::ElevatedToken);
        let lower = headers(&[("authorization", &format!("bearer {TOKEN}"))]);
        assert_eq!(access.authorize(ip("8.8.8.8"), &lower), Decision::ElevatedToken);
        let bad = headers(&[("authorization", "Bearer wrong-token-0123456789")]);
        assert_eq!(access.authorize(ip("8.8.8.8"), &bad), Decision::Invalid);
        let empty = headers(&[("authorization", "Bearer ")]);
        assert_eq!(access.authorize(ip("8.8.8.8"), &empty), Decision::Invalid);
        // A bad token is refused even from an allow-listed address: no silent downgrade.
        assert_eq!(access.authorize(ip("203.0.113.9"), &bad), Decision::Invalid);
        // Other schemes carry no credential for us.
        let basic = headers(&[("authorization", "Basic dXNlcjpwYXNz")]);
        assert_eq!(access.authorize(ip("8.8.8.8"), &basic), Decision::Anonymous);
    }

    #[test]
    fn short_tokens_are_never_accepted() {
        let access = Access::new(&["short"], &[], &[]);
        assert_eq!(access.token_count(), 0);
        let auth = headers(&[("authorization", "Bearer short")]);
        assert_eq!(access.authorize(ip("8.8.8.8"), &auth), Decision::Invalid);
    }

    #[test]
    fn canonical_site_admin_token_unlocks_authenticated_tools_without_ip_allowlists() {
        let access = Access::from_environment(|name| {
            (name == "SHENRON_ADMIN_TOKEN").then(|| format!("  {TOKEN}  "))
        });
        assert_eq!(access.token_count(), 1);
        assert_eq!(access.allowed_ip_count(), 0);
        let auth = headers(&[("authorization", &format!("Bearer {TOKEN}"))]);
        assert_eq!(access.authorize(ip("8.8.8.8"), &auth), Decision::ElevatedToken);
        assert_eq!(access.authorize(ip("8.8.8.8"), &HeaderMap::new()), Decision::Anonymous);
        let short = Access::from_environment(|name| {
            (name == "SHENRON_ADMIN_TOKEN").then(|| "short".to_owned())
        });
        assert_eq!(short.token_count(), 0);
    }

    #[test]
    fn an_allow_listed_direct_ip_is_elevated() {
        let access = policy();
        assert_eq!(access.authorize(ip("203.0.113.50"), &HeaderMap::new()), Decision::ElevatedIp);
        assert_eq!(access.authorize(ip("198.51.100.7"), &HeaderMap::new()), Decision::ElevatedIp);
        assert_eq!(access.authorize(ip("2001:db8::9"), &HeaderMap::new()), Decision::ElevatedIp);
        assert_eq!(access.authorize(ip("198.51.100.8"), &HeaderMap::new()), Decision::Anonymous);
    }

    #[test]
    fn a_trusted_proxy_forwards_the_client_address() {
        let access = policy();
        let via_xff = headers(&[("x-forwarded-for", "203.0.113.50")]);
        assert_eq!(access.authorize(ip("127.0.0.1"), &via_xff), Decision::ElevatedIp);
        let via_real = headers(&[("x-real-ip", "203.0.113.50")]);
        assert_eq!(access.authorize(ip("10.0.0.2"), &via_real), Decision::ElevatedIp);
        // A client-supplied left entry never wins over the address the proxy appended.
        let spoof = headers(&[("x-forwarded-for", "203.0.113.50, 8.8.8.8")]);
        assert_eq!(access.authorize(ip("127.0.0.1"), &spoof), Decision::Anonymous);
        // Chained trusted proxies are skipped.
        let chain = headers(&[("x-forwarded-for", "8.8.4.4, 203.0.113.50, 10.0.0.9")]);
        assert_eq!(access.authorize(ip("127.0.0.1"), &chain), Decision::ElevatedIp);
        // Nothing forwarded: the proxy itself is the client (loopback is not allow-listed here).
        assert_eq!(access.authorize(ip("127.0.0.1"), &HeaderMap::new()), Decision::Anonymous);
        // Garbage from a trusted proxy fails closed.
        let garbage = headers(&[("x-forwarded-for", "not-an-ip")]);
        assert_eq!(access.authorize(ip("127.0.0.1"), &garbage), Decision::Anonymous);
        let ported = headers(&[("x-forwarded-for", "203.0.113.50:4433")]);
        assert_eq!(access.authorize(ip("127.0.0.1"), &ported), Decision::ElevatedIp);
    }

    #[test]
    fn a_spoofed_header_from_an_untrusted_peer_is_ignored() {
        let access = policy();
        let xff = headers(&[("x-forwarded-for", "203.0.113.50")]);
        assert_eq!(access.authorize(ip("8.8.8.8"), &xff), Decision::Anonymous);
        let real = headers(&[("x-real-ip", "203.0.113.50")]);
        assert_eq!(access.authorize(ip("8.8.8.8"), &real), Decision::Anonymous);
        assert_eq!(access.client_ip(ip("8.8.8.8"), &xff), Some(ip("8.8.8.8")));
    }

    #[test]
    fn constant_time_equality_matches_plain_equality() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
        assert!(!constant_time_eq(b"", b"a"));
    }
}
