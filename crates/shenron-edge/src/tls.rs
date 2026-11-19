// SPDX-License-Identifier: Apache-2.0
//! Certificates by SNI with hot reload: the resolver reads an atomically swapped list, so a
//! renewed or reloaded certificate is used by the next handshake without restarting a listener.

use std::fmt;
use std::fs::File;
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result, bail};
use arc_swap::ArcSwap;
use rustls::crypto::ring::sign::any_supported_type;
use rustls::server::{ClientHello, ResolvesServerCert};
use rustls::sign::CertifiedKey;

use crate::config::{AcmeConfig, CertConfig, Config};

struct Entry {
    name: String,
    domains: Vec<String>,
    key: Arc<CertifiedKey>,
}

#[derive(Default)]
pub struct CertStore {
    entries: ArcSwap<Vec<Entry>>,
}

impl fmt::Debug for CertStore {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let names: Vec<String> = self.entries.load().iter().map(|e| e.name.clone()).collect();
        f.debug_struct("CertStore").field("certificates", &names).finish()
    }
}

/// Where the certificate and key of a configured certificate live.
pub fn cert_paths(cert: &CertConfig, acme: Option<&AcmeConfig>) -> Option<(PathBuf, PathBuf)> {
    if cert.acme {
        let dir = acme?.storage_dir.join(&cert.name);
        return Some((dir.join("fullchain.pem"), dir.join("privkey.pem")));
    }
    Some((cert.cert_file.clone()?, cert.key_file.clone()?))
}

pub fn load_pem(cert: &Path, key: &Path) -> Result<CertifiedKey> {
    let chain = rustls_pemfile::certs(&mut BufReader::new(
        File::open(cert).with_context(|| format!("opening {}", cert.display()))?,
    ))
    .collect::<Result<Vec<_>, _>>()
    .with_context(|| format!("reading certificates from {}", cert.display()))?;
    if chain.is_empty() {
        bail!("{} holds no certificate", cert.display());
    }
    let private = rustls_pemfile::private_key(&mut BufReader::new(
        File::open(key).with_context(|| format!("opening {}", key.display()))?,
    ))
    .with_context(|| format!("reading the key from {}", key.display()))?
    .with_context(|| format!("{} holds no private key", key.display()))?;
    let signing = any_supported_type(&private).context("unsupported private key type")?;
    Ok(CertifiedKey::new(chain, signing))
}

/// Seconds until the leaf certificate expires (negative once expired).
pub fn seconds_to_expiry(cert: &CertifiedKey) -> Result<i64> {
    let leaf = cert.cert.first().context("empty certificate chain")?;
    let (_, parsed) = x509_parser::parse_x509_certificate(leaf.as_ref())
        .context("parsing the leaf certificate")?;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_secs();
    Ok(parsed.validity().not_after.timestamp() - i64::try_from(now)?)
}

fn domain_matches(pattern: &str, host: &str) -> bool {
    match pattern.strip_prefix("*.") {
        Some(suffix) => host
            .strip_suffix(suffix)
            .and_then(|head| head.strip_suffix('.'))
            .is_some_and(|label| !label.is_empty() && !label.contains('.')),
        None => pattern == host,
    }
}

impl CertStore {
    /// Load every configured certificate. A certificate that ACME has not issued yet is skipped
    /// (its handshakes fail until it exists); a missing static file is an error.
    pub fn reload(&self, config: &Config) -> Result<()> {
        let mut entries = Vec::new();
        for cert in &config.certificates {
            let Some((cert_path, key_path)) = cert_paths(cert, config.acme.as_ref()) else {
                continue;
            };
            if cert.acme && !cert_path.exists() {
                tracing::warn!(certificate = %cert.name, "no ACME certificate on disk yet");
                continue;
            }
            let key = load_pem(&cert_path, &key_path)
                .with_context(|| format!("certificate `{}`", cert.name))?;
            entries.push(Entry {
                name: cert.name.clone(),
                domains: cert.domains.iter().map(|d| d.to_ascii_lowercase()).collect(),
                key: Arc::new(key),
            });
        }
        self.entries.store(Arc::new(entries));
        Ok(())
    }

    pub fn select(&self, server_name: Option<&str>) -> Option<Arc<CertifiedKey>> {
        let entries = self.entries.load();
        match server_name {
            Some(name) => {
                let name = name.to_ascii_lowercase();
                entries
                    .iter()
                    .find(|e| e.domains.iter().any(|d| domain_matches(d, &name)))
                    .map(|e| Arc::clone(&e.key))
            },
            None => entries.first().map(|e| Arc::clone(&e.key)),
        }
    }

    pub fn count(&self) -> usize {
        self.entries.load().len()
    }
}

impl ResolvesServerCert for CertStore {
    fn resolve(&self, hello: ClientHello<'_>) -> Option<Arc<CertifiedKey>> {
        self.select(hello.server_name())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wildcard_matches_exactly_one_label() {
        assert!(domain_matches("*.dragonballfr.com", "tv.dragonballfr.com"));
        assert!(!domain_matches("*.dragonballfr.com", "dragonballfr.com"));
        assert!(!domain_matches("*.dragonballfr.com", "a.b.dragonballfr.com"));
        assert!(domain_matches("dragonballfr.com", "dragonballfr.com"));
    }

    #[test]
    fn loads_pem_selects_by_sni_and_reports_expiry() {
        let dir = tempfile::tempdir().unwrap();
        let generated = rcgen::generate_simple_self_signed(vec!["a.test".to_owned()]).unwrap();
        std::fs::write(dir.path().join("c.pem"), generated.cert.pem()).unwrap();
        std::fs::write(dir.path().join("k.pem"), generated.signing_key.serialize_pem()).unwrap();
        let config = Config::parse(&format!(
            "[server]\nhttps_listen=[\"127.0.0.1:1\"]\n[[certificate]]\nname=\"a\"\ndomains=[\"a.test\",\"*.a.test\"]\ncert_file={:?}\nkey_file={:?}\n",
            dir.path().join("c.pem"),
            dir.path().join("k.pem")
        ))
        .unwrap();
        let store = CertStore::default();
        assert!(store.select(Some("a.test")).is_none());
        store.reload(&config).unwrap();
        assert_eq!(store.count(), 1);
        assert!(store.select(Some("A.test")).is_some());
        assert!(store.select(Some("x.a.test")).is_some());
        assert!(store.select(Some("other.test")).is_none());
        assert!(store.select(None).is_some(), "no SNI falls back to the first certificate");
        let key = store.select(None).unwrap();
        assert!(seconds_to_expiry(&key).unwrap() > 86_400 * 300);
    }
}
