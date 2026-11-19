// SPDX-License-Identifier: Apache-2.0
//! TOML configuration. Nothing is hardcoded: every host, path, key and URL comes from the file
//! or from the environment (`${VAR}` and `${VAR:-default}` are expanded before parsing), and the
//! per-service defaults are derived from the service name.

use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Deserializer};

use crate::util::{ensure_safe_component, parse_duration};

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// Release root: `<root>/releases/<service>/<version>` and `<root>/current/<service>`.
    /// Required by the agent.
    pub root: Option<PathBuf>,
    /// State files, default `<root>/state`.
    pub state_dir: Option<PathBuf>,
    /// Poll interval of the manifest channel, default 30s.
    #[serde(default = "default_poll", deserialize_with = "de_duration")]
    pub poll_interval: Duration,
    pub store: StoreConfig,
    #[serde(default)]
    pub trust: TrustConfig,
    #[serde(default)]
    pub signing: SigningConfig,
    pub api: Option<ApiConfig>,
    #[serde(default, rename = "service")]
    pub services: Vec<ServiceConfig>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StoreKind {
    /// A local directory (publisher side), served by any static HTTPS server; agents may read it
    /// directly through `file://` URLs when the directory is mounted.
    Dir,
    /// A plain HTTP(S) server: GET for reads, PUT (optional bearer token) for writes.
    Http,
    /// S3 compatible (Garage, MinIO, R2) with SigV4, path-style addressing.
    S3,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StoreConfig {
    pub kind: StoreKind,
    /// `http`: base URL. `s3`: endpoint URL.
    pub url: Option<String>,
    /// `dir`: directory path.
    pub path: Option<PathBuf>,
    /// Base URL the agents download from, written into the manifest. Defaults to `url`
    /// (`http`), `<url>/<bucket>` (`s3`) or a `file://` URL (`dir`).
    pub public_url: Option<String>,
    /// Key prefix inside the store, default empty.
    #[serde(default)]
    pub prefix: String,
    pub bucket: Option<String>,
    pub region: Option<String>,
    /// Credentials, never in the file in clear: `${ENV}` or `SHENRON_DEPLOYD_S3_ACCESS_KEY[_FILE]`.
    pub access_key: Option<String>,
    pub secret_key: Option<String>,
    /// Bearer token for `http` stores (`SHENRON_DEPLOYD_STORE_TOKEN[_FILE]`).
    pub token: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TrustConfig {
    /// Pinned ed25519 public keys, base64 of the 32 raw bytes. Several allow key rotation.
    #[serde(default)]
    pub public_keys: Vec<String>,
    #[serde(default)]
    pub public_key_files: Vec<PathBuf>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SigningConfig {
    /// File holding the base64 ed25519 seed. Alternative: `SHENRON_DEPLOYD_SIGNING_KEY`.
    pub key_file: Option<PathBuf>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ApiConfig {
    pub listen: SocketAddr,
    pub cert: PathBuf,
    pub key: PathBuf,
    /// CA that signs the client certificates allowed to call the API.
    pub client_ca: PathBuf,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RestartMode {
    /// D-Bus (zbus), falling back to `systemctl` when the bus is unreachable.
    #[default]
    Auto,
    Dbus,
    Systemctl,
    /// No restart (the unit follows the symlink by itself, or tests).
    None,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    #[default]
    System,
    User,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ServiceConfig {
    pub name: String,
    /// Manifest channel, default `stable`.
    pub channel: Option<String>,
    /// systemd unit, default `<name>.service`.
    pub unit: Option<String>,
    /// Overrides the health URL of the manifest.
    pub health_url: Option<String>,
    /// Releases kept on disk besides current and previous, default 3.
    pub keep: Option<usize>,
    #[serde(default)]
    pub restart: RestartMode,
    #[serde(default)]
    pub scope: Scope,
}

impl ServiceConfig {
    pub fn channel(&self) -> &str {
        self.channel.as_deref().unwrap_or("stable")
    }
    pub fn unit(&self) -> String {
        self.unit.clone().unwrap_or_else(|| format!("{}.service", self.name))
    }
    pub fn keep(&self) -> usize {
        self.keep.unwrap_or(3)
    }
}

fn default_poll() -> Duration {
    Duration::from_secs(30)
}

fn de_duration<'de, D: Deserializer<'de>>(d: D) -> Result<Duration, D::Error> {
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum Raw {
        Secs(u64),
        Text(String),
    }
    match Raw::deserialize(d)? {
        Raw::Secs(s) => Ok(Duration::from_secs(s)),
        Raw::Text(t) => parse_duration(&t).map_err(serde::de::Error::custom),
    }
}

impl Config {
    pub fn load(path: &Path) -> Result<Self> {
        let text = std::fs::read_to_string(path).with_context(|| format!("read {}", path.display()))?;
        Self::parse(&text).with_context(|| format!("parse {}", path.display()))
    }

    pub fn parse(text: &str) -> Result<Self> {
        let expanded = expand_env(text, |k| std::env::var(k).ok())?;
        let cfg: Config = toml::from_str(&expanded)?;
        cfg.validate()?;
        Ok(cfg)
    }

    fn validate(&self) -> Result<()> {
        let mut seen = std::collections::HashSet::new();
        for s in &self.services {
            ensure_safe_component("service name", &s.name)?;
            ensure_safe_component("channel", s.channel())?;
            if !seen.insert(&s.name) {
                bail!("service {:?} declared twice", s.name);
            }
        }
        Ok(())
    }

    pub fn root(&self) -> Result<&Path> {
        self.root.as_deref().context("`root` is required (config or ${ENV})")
    }

    pub fn state_dir(&self) -> Result<PathBuf> {
        Ok(match &self.state_dir {
            Some(p) => p.clone(),
            None => self.root()?.join("state"),
        })
    }

    pub fn service(&self, name: &str) -> Option<&ServiceConfig> {
        self.services.iter().find(|s| s.name == name)
    }
}

/// Expands `${VAR}` and `${VAR:-default}` outside of comment lines.
pub fn expand_env(text: &str, lookup: impl Fn(&str) -> Option<String>) -> Result<String> {
    let mut out = String::with_capacity(text.len());
    for line in text.split_inclusive('\n') {
        if line.trim_start().starts_with('#') {
            out.push_str(line);
            continue;
        }
        let mut rest = line;
        while let Some(start) = rest.find("${") {
            out.push_str(&rest[..start]);
            let after = &rest[start + 2..];
            let end = after.find('}').context("unterminated ${...} in config")?;
            let (name, default) = match after[..end].split_once(":-") {
                Some((n, d)) => (n, Some(d)),
                None => (&after[..end], None),
            };
            match (lookup(name), default) {
                (Some(v), _) if !v.is_empty() => out.push_str(&v),
                (_, Some(d)) => out.push_str(d),
                _ => bail!("environment variable {name} is not set (used in config)"),
            }
            rest = &after[end + 1..];
        }
        out.push_str(rest);
    }
    Ok(out)
}

/// Reads `VAR`, or the file named by `VAR_FILE`.
pub fn env_secret(var: &str) -> Result<Option<String>> {
    if let Ok(v) = std::env::var(var) {
        return Ok(Some(v.trim().to_owned()));
    }
    if let Ok(f) = std::env::var(format!("{var}_FILE")) {
        let v = std::fs::read_to_string(&f).with_context(|| format!("read {var}_FILE {f}"))?;
        return Ok(Some(v.trim().to_owned()));
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn env_expansion_and_defaults() {
        let env = |k: &str| (k == "ROOT").then(|| "/srv/x".to_owned());
        let out = expand_env("root = \"${ROOT}\"\n# ${UNSET}\nurl = \"${UNSET:-http://a}\"\n", env).unwrap();
        assert!(out.contains("root = \"/srv/x\""));
        assert!(out.contains("# ${UNSET}"));
        assert!(out.contains("url = \"http://a\""));
        assert!(expand_env("a = \"${NOPE}\"", |_| None).is_err());
    }

    #[test]
    fn service_defaults_derive_from_name() {
        let cfg = Config::parse(
            r#"
            root = "/opt/x"
            poll_interval = "5s"
            [store]
            kind = "http"
            url = "https://store.example/d"
            [[service]]
            name = "shenron-tv"
            "#,
        )
        .unwrap();
        let s = cfg.service("shenron-tv").unwrap();
        assert_eq!(s.unit(), "shenron-tv.service");
        assert_eq!(s.channel(), "stable");
        assert_eq!(s.keep(), 3);
        assert_eq!(cfg.poll_interval, Duration::from_secs(5));
        assert_eq!(cfg.state_dir().unwrap(), Path::new("/opt/x/state"));
    }

    #[test]
    fn rejects_unsafe_service_names() {
        let bad = r#"
            [store]
            kind = "dir"
            path = "/x"
            [[service]]
            name = "../etc"
        "#;
        assert!(Config::parse(bad).is_err());
    }
}
