// SPDX-License-Identifier: Apache-2.0
//! The one TOML file that describes the edge: listeners, certificates, cache zones, upstream
//! pools and virtual hosts. Nothing is hardcoded in the binary; see `deploy/edge/*.toml`.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use serde::Deserialize;
use serde::de::{self, Deserializer};

/// A duration written `500ms`, `5s`, `10m`, `2h`, `30d` (a bare integer is seconds).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Dur(pub Duration);

/// A byte size written `512KiB`, `32MiB`, `2GiB` (a bare integer is bytes).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Size(pub u64);

pub fn parse_duration(text: &str) -> Result<Duration> {
    let text = text.trim();
    let split = text.find(|c: char| !c.is_ascii_digit()).unwrap_or(text.len());
    let (digits, unit) = text.split_at(split);
    let value: u64 = digits.parse().with_context(|| format!("invalid duration `{text}`"))?;
    let millis = match unit.trim() {
        "ms" => value,
        "" | "s" => value * 1000,
        "m" => value * 60_000,
        "h" => value * 3_600_000,
        "d" => value * 86_400_000,
        other => bail!("unknown duration unit `{other}` in `{text}`"),
    };
    Ok(Duration::from_millis(millis))
}

pub fn parse_size(text: &str) -> Result<u64> {
    let text = text.trim();
    let split = text.find(|c: char| !c.is_ascii_digit()).unwrap_or(text.len());
    let (digits, unit) = text.split_at(split);
    let value: u64 = digits.parse().with_context(|| format!("invalid size `{text}`"))?;
    let factor: u64 = match unit.trim().to_ascii_lowercase().as_str() {
        "" | "b" => 1,
        "k" | "kb" | "kib" => 1 << 10,
        "m" | "mb" | "mib" => 1 << 20,
        "g" | "gb" | "gib" => 1 << 30,
        "t" | "tb" | "tib" => 1 << 40,
        other => bail!("unknown size unit `{other}` in `{text}`"),
    };
    Ok(value * factor)
}

#[derive(Deserialize)]
#[serde(untagged)]
enum NumOrText {
    Num(u64),
    Text(String),
}

impl<'de> Deserialize<'de> for Dur {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        match NumOrText::deserialize(d)? {
            NumOrText::Num(n) => Ok(Self(Duration::from_secs(n))),
            NumOrText::Text(t) => parse_duration(&t).map(Self).map_err(de::Error::custom),
        }
    }
}

impl<'de> Deserialize<'de> for Size {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        match NumOrText::deserialize(d)? {
            NumOrText::Num(n) => Ok(Self(n)),
            NumOrText::Text(t) => parse_size(&t).map(Self).map_err(de::Error::custom),
        }
    }
}

const fn default_true() -> bool {
    true
}

fn default_server_header() -> String {
    "shenron-edge".to_owned()
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    pub server: ServerConfig,
    pub acme: Option<AcmeConfig>,
    #[serde(default, rename = "certificate")]
    pub certificates: Vec<CertConfig>,
    #[serde(default, rename = "cache")]
    pub caches: Vec<CacheZoneConfig>,
    #[serde(default, rename = "pool")]
    pub pools: Vec<PoolConfig>,
    #[serde(default, rename = "vhost")]
    pub vhosts: Vec<VhostConfig>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ServerConfig {
    /// Plain HTTP listeners (redirect to HTTPS, ACME HTTP-01, plain vhosts).
    #[serde(default)]
    pub http_listen: Vec<String>,
    /// TLS listeners (HTTP/2 and HTTP/1.1 through ALPN).
    #[serde(default)]
    pub https_listen: Vec<String>,
    #[serde(default = "default_server_header")]
    pub server_header: String,
    /// Worker threads per service; 0 lets Pingora pick (one per core).
    #[serde(default)]
    pub threads: usize,
    /// CIDRs of the proxies in front of the edge (Cloudflare ranges, WireGuard peers). For a
    /// request from one of them the client address is `CF-Connecting-IP`, else the first
    /// `X-Forwarded-For` entry; for any other peer it is the socket address.
    #[serde(default)]
    pub trusted_proxies: Vec<String>,
    /// `overwrite` (default) replaces `X-Forwarded-For` with the client address; `append` adds the
    /// client address to the incoming list (nginx `$proxy_add_x_forwarded_for`).
    #[serde(default)]
    pub forwarded_for: ForwardedFor,
    #[serde(default = "default_resolve_interval")]
    pub resolve_interval: Dur,
}

fn default_resolve_interval() -> Dur {
    Dur(Duration::from_secs(60))
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ForwardedFor {
    #[default]
    Overwrite,
    Append,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AcmeConfig {
    pub directory_url: String,
    #[serde(default)]
    pub contact: Vec<String>,
    pub storage_dir: PathBuf,
    #[serde(default = "default_renew_before")]
    pub renew_before: Dur,
    #[serde(default = "default_check_interval")]
    pub check_interval: Dur,
}

fn default_renew_before() -> Dur {
    Dur(Duration::from_secs(30 * 86_400))
}

fn default_check_interval() -> Dur {
    Dur(Duration::from_secs(12 * 3600))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CertConfig {
    pub name: String,
    /// Names the certificate answers for (SNI); wildcards `*.example.com` match one label.
    pub domains: Vec<String>,
    pub cert_file: Option<PathBuf>,
    pub key_file: Option<PathBuf>,
    /// Obtain and renew the certificate through ACME HTTP-01 into `acme.storage_dir/<name>/`.
    #[serde(default)]
    pub acme: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CacheZoneConfig {
    pub name: String,
    pub dir: PathBuf,
    pub max_size: Size,
    #[serde(default = "default_inactive")]
    pub inactive: Dur,
    /// Objects larger than this are streamed through and never stored.
    #[serde(default = "default_max_object")]
    pub max_object: Size,
    #[serde(default = "default_sweep")]
    pub sweep_interval: Dur,
}

fn default_inactive() -> Dur {
    Dur(Duration::from_secs(60 * 60))
}

fn default_max_object() -> Size {
    Size(64 << 20)
}

fn default_sweep() -> Dur {
    Dur(Duration::from_secs(60))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PoolConfig {
    pub name: String,
    #[serde(default = "default_connect_timeout")]
    pub connect_timeout: Dur,
    #[serde(default = "default_read_timeout")]
    pub read_timeout: Dur,
    #[serde(default = "default_idle_timeout")]
    pub idle_timeout: Dur,
    #[serde(rename = "server")]
    pub servers: Vec<UpstreamConfig>,
}

fn default_connect_timeout() -> Dur {
    Dur(Duration::from_secs(5))
}

fn default_read_timeout() -> Dur {
    Dur(Duration::from_secs(60))
}

fn default_idle_timeout() -> Dur {
    Dur(Duration::from_secs(60))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpstreamConfig {
    /// `host:port`; a name is resolved at load and every `server.resolve_interval`.
    pub addr: String,
    /// Value of `$upstream_addr` (defaults to `addr`).
    pub label: Option<String>,
    #[serde(default = "default_weight")]
    pub weight: u32,
    /// Used only when no primary server is available.
    #[serde(default)]
    pub backup: bool,
    #[serde(default)]
    pub tls: bool,
    /// TLS server name; defaults to the host part of `addr`.
    pub sni: Option<String>,
    /// Verify the upstream certificate chain and name (nginx `proxy_ssl_verify`).
    #[serde(default = "default_true")]
    pub verify: bool,
    /// Failures inside `fail_timeout` that take the server out of rotation; 0 disables the check.
    #[serde(default = "default_max_fails")]
    pub max_fails: u32,
    #[serde(default = "default_fail_timeout")]
    pub fail_timeout: Dur,
}

const fn default_weight() -> u32 {
    1
}

const fn default_max_fails() -> u32 {
    3
}

fn default_fail_timeout() -> Dur {
    Dur(Duration::from_secs(10))
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HeaderRules {
    /// Appended to every response (nginx `add_header ... always`). Empty values are skipped.
    /// Variables: `$host`, `$scheme`, `$request_uri`, `$remote_addr`, `$cache_status`, `$upstream_addr`.
    #[serde(default)]
    pub add: BTreeMap<String, String>,
    /// Set only when the upstream response lacks the header.
    #[serde(default)]
    pub default: BTreeMap<String, String>,
    /// Removed from the upstream response.
    #[serde(default)]
    pub remove: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VhostConfig {
    pub names: Vec<String>,
    /// Answer plain HTTP with a 301 to `https://<host><uri>`.
    #[serde(default = "default_true")]
    pub redirect_http: bool,
    /// Answer every request with a 301 to `https://<redirect_to><uri>` (www to apex).
    pub redirect_to: Option<String>,
    #[serde(default)]
    pub headers: HeaderRules,
    #[serde(default, rename = "route")]
    pub routes: Vec<RouteConfig>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RouteConfig {
    /// Routes are tried in file order; the first match wins. No matcher matches everything.
    pub prefix: Option<String>,
    pub exact: Option<String>,
    pub regex: Option<String>,
    #[serde(default = "default_true")]
    pub ignore_case: bool,
    pub pool: String,
    /// `Host` sent upstream; defaults to the incoming host. May use variables.
    pub upstream_host: Option<String>,
    /// Extra request headers set on the upstream request. May use variables.
    #[serde(default)]
    pub request_headers: BTreeMap<String, String>,
    #[serde(default)]
    pub headers: HeaderRules,
    /// Upstream statuses that count as a failed attempt for pool health.
    #[serde(default = "default_failure_statuses")]
    pub failure_statuses: Vec<u16>,
    /// Maximum request body (nginx `client_max_body_size`); unlimited when absent.
    pub max_body: Option<Size>,
    pub cache: Option<RouteCacheConfig>,
}

fn default_failure_statuses() -> Vec<u16> {
    vec![502, 503, 504]
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RouteCacheConfig {
    pub zone: String,
    /// `proxy_cache_valid`: fallback TTL by status when the upstream gives none.
    #[serde(default)]
    pub valid: Vec<ValidRule>,
    /// Follow `X-Accel-Expires`, `Cache-Control` and `Expires` of the upstream before `valid`.
    #[serde(default = "default_true")]
    pub honor_upstream: bool,
    /// Extra key parts derived from request headers (Accept variance of images).
    #[serde(default)]
    pub variance: Vec<VarianceRule>,
    #[serde(default)]
    pub bypass: BypassConfig,
    /// Collapse concurrent misses of one key into a single upstream request.
    #[serde(default)]
    pub lock: bool,
    #[serde(default = "default_lock_timeout")]
    pub lock_timeout: Dur,
    /// Serve a stale entry on: `error`, `timeout`, `updating`, `http_500`, `http_502`, `http_503`, `http_504`.
    #[serde(default)]
    pub use_stale: Vec<String>,
}

fn default_lock_timeout() -> Dur {
    Dur(Duration::from_secs(5))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ValidRule {
    pub status: Vec<u16>,
    pub ttl: Dur,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VarianceRule {
    pub header: String,
    pub default: String,
    /// First rule whose `contains` is a case-insensitive substring of the header wins.
    pub map: Vec<VarianceMap>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VarianceMap {
    pub contains: String,
    pub value: String,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BypassConfig {
    /// Case-insensitive substrings of the `Cookie` header that bypass the cache entirely.
    #[serde(default)]
    pub cookies: Vec<String>,
    /// Query arguments that bypass the cache when present and not `0` (`nocache`).
    #[serde(default)]
    pub args: Vec<String>,
}

impl Config {
    pub fn load(path: &Path) -> Result<Self> {
        let text =
            std::fs::read_to_string(path).with_context(|| format!("reading {}", path.display()))?;
        Self::parse(&text)
    }

    pub fn parse(text: &str) -> Result<Self> {
        let config: Self = toml::from_str(text).context("parsing the edge configuration")?;
        config.validate()?;
        Ok(config)
    }

    fn validate(&self) -> Result<()> {
        if self.server.http_listen.is_empty() && self.server.https_listen.is_empty() {
            bail!("server: at least one of http_listen and https_listen is required");
        }
        for cert in &self.certificates {
            if cert.domains.is_empty() {
                bail!("certificate `{}`: domains is empty", cert.name);
            }
            if !cert.acme && (cert.cert_file.is_none() || cert.key_file.is_none()) {
                bail!(
                    "certificate `{}`: cert_file and key_file are required without acme",
                    cert.name
                );
            }
            if cert.acme && self.acme.is_none() {
                bail!("certificate `{}`: acme = true needs an [acme] section", cert.name);
            }
        }
        if !self.server.https_listen.is_empty() && self.certificates.is_empty() {
            bail!("server: https_listen needs at least one [[certificate]]");
        }
        for pool in &self.pools {
            if pool.servers.is_empty() {
                bail!("pool `{}`: no server", pool.name);
            }
        }
        for vhost in &self.vhosts {
            if vhost.names.is_empty() {
                bail!("vhost without names");
            }
            for route in &vhost.routes {
                let matchers =
                    [route.prefix.is_some(), route.exact.is_some(), route.regex.is_some()];
                if matchers.iter().filter(|set| **set).count() > 1 {
                    bail!("vhost `{}`: a route takes one of prefix, exact, regex", vhost.names[0]);
                }
                if !self.pools.iter().any(|p| p.name == route.pool) {
                    bail!("vhost `{}`: unknown pool `{}`", vhost.names[0], route.pool);
                }
                if let Some(cache) = &route.cache {
                    if !self.caches.iter().any(|z| z.name == cache.zone) {
                        bail!("vhost `{}`: unknown cache zone `{}`", vhost.names[0], cache.zone);
                    }
                    for cond in &cache.use_stale {
                        if !crate::cache::STALE_CONDITIONS.contains(&cond.as_str()) {
                            bail!("cache use_stale: unknown condition `{cond}`");
                        }
                    }
                }
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn durations_and_sizes() {
        assert_eq!(parse_duration("500ms").unwrap(), Duration::from_millis(500));
        assert_eq!(parse_duration("30d").unwrap(), Duration::from_secs(30 * 86_400));
        assert_eq!(parse_duration("10").unwrap(), Duration::from_secs(10));
        assert!(parse_duration("5x").is_err());
        assert_eq!(parse_size("2GiB").unwrap(), 2 << 30);
        assert_eq!(parse_size("32mb").unwrap(), 32 << 20);
        assert!(parse_size("1.5g").is_err());
    }

    #[test]
    fn rejects_unknown_pool_and_missing_cert() {
        let bad_pool = r#"
            [server]
            http_listen = ["127.0.0.1:8080"]
            [[vhost]]
            names = ["a.test"]
            [[vhost.route]]
            pool = "nope"
        "#;
        assert!(Config::parse(bad_pool).unwrap_err().to_string().contains("unknown pool"));
        let no_cert = r#"
            [server]
            https_listen = ["127.0.0.1:8443"]
        "#;
        assert!(Config::parse(no_cert).is_err());
    }

    #[test]
    fn rejects_unknown_fields() {
        assert!(Config::parse("[server]\nhttp_listen=[\"127.0.0.1:1\"]\nnope=1").is_err());
    }

    #[test]
    fn shipped_examples_parse_and_are_complete() {
        let fr2 = Config::parse(include_str!("../../../deploy/edge/fr2.example.toml")).unwrap();
        assert_eq!(fr2.vhosts[1].routes.len(), 6, "the six nginx locations");
        assert_eq!(fr2.caches.len(), 3);
        let prd = Config::parse(include_str!("../../../deploy/edge/prd.example.toml")).unwrap();
        assert_eq!(prd.vhosts.len(), 3);
    }
}
