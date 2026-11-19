// SPDX-License-Identifier: Apache-2.0
//! Release manifest and ed25519 detached signature.
//!
//! The signature covers the exact bytes of `manifest.json`, so no canonicalisation is needed;
//! the agent verifies the bytes first and parses them second.

use std::path::Path;

use anyhow::{Context, Result, bail};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};

use crate::util::{ensure_safe_component, parse_rfc3339};

pub const SCHEMA: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Manifest {
    pub schema: u32,
    pub service: String,
    pub channel: String,
    /// Git sha of the build.
    pub version: String,
    /// RFC 3339; the agent never accepts a manifest older than the installed one (replay guard).
    pub created_at: String,
    pub artifacts: Vec<Artifact>,
    pub health: Option<Health>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Artifact {
    /// File name inside the release directory.
    pub name: String,
    pub url: String,
    pub sha256: String,
    pub size: u64,
    /// Octal permission bits, e.g. `0755`.
    pub mode: Option<String>,
    /// Extract a `.tar.gz` into the release directory instead of storing it as a file.
    #[serde(default)]
    pub unpack: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Health {
    pub url: String,
    #[serde(default = "default_status")]
    pub expect_status: u16,
    #[serde(default = "default_retries")]
    pub retries: u32,
    #[serde(default = "default_interval_ms")]
    pub interval_ms: u64,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
}

fn default_status() -> u16 {
    200
}
fn default_retries() -> u32 {
    10
}
fn default_interval_ms() -> u64 {
    2000
}
fn default_timeout_ms() -> u64 {
    5000
}

impl Manifest {
    pub fn validate(&self) -> Result<()> {
        if self.schema != SCHEMA {
            bail!("unsupported manifest schema {}", self.schema);
        }
        ensure_safe_component("service", &self.service)?;
        ensure_safe_component("channel", &self.channel)?;
        ensure_safe_component("version", &self.version)?;
        parse_rfc3339(&self.created_at)?;
        if self.artifacts.is_empty() {
            bail!("manifest has no artifacts");
        }
        let mut names = std::collections::HashSet::new();
        for a in &self.artifacts {
            ensure_safe_component("artifact name", &a.name)?;
            if !names.insert(&a.name) {
                bail!("artifact {:?} listed twice", a.name);
            }
            if a.sha256.len() != 64 || !a.sha256.chars().all(|c| c.is_ascii_hexdigit()) {
                bail!("artifact {:?}: sha256 is not 64 hex digits", a.name);
            }
            if a.url.is_empty() {
                bail!("artifact {:?}: empty url", a.name);
            }
            if let Some(m) = &a.mode {
                parse_mode(m).with_context(|| format!("artifact {:?}", a.name))?;
            }
        }
        Ok(())
    }

    pub fn created_at_unix(&self) -> i64 {
        parse_rfc3339(&self.created_at).unwrap_or(0)
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        let mut bytes = serde_json::to_vec_pretty(self)?;
        bytes.push(b'\n');
        Ok(bytes)
    }
}

/// Store key of the mutable channel pointer (`manifest.json`, with `.sig` next to it).
pub fn channel_key(service: &str, channel: &str) -> String {
    format!("{service}/channels/{channel}/manifest.json")
}

/// Store key of an immutable release object (`manifest.json`, `manifest.json.sig` or an artifact).
pub fn release_key(service: &str, version: &str, name: &str) -> String {
    format!("{service}/releases/{version}/{name}")
}

pub fn parse_mode(text: &str) -> Result<u32> {
    let m = u32::from_str_radix(text.trim_start_matches("0o"), 8)
        .with_context(|| format!("invalid octal mode {text:?}"))?;
    if m > 0o777 {
        bail!("mode {text:?} sets bits beyond rwx");
    }
    Ok(m)
}

#[derive(Debug, thiserror::Error)]
pub enum VerifyError {
    #[error("signature is not valid base64 of 64 bytes")]
    MalformedSignature,
    #[error("signature does not match any pinned public key")]
    BadSignature,
    #[error("no public key is pinned")]
    NoKeys,
}

/// A manifest whose signature has been verified.
#[derive(Debug, Clone)]
pub struct SignedManifest {
    pub bytes: Vec<u8>,
    pub signature: String,
    pub manifest: Manifest,
}

impl SignedManifest {
    /// Verifies `signature` over `bytes` against any of `trusted`, then parses and validates.
    pub fn open(bytes: Vec<u8>, signature: &str, trusted: &[VerifyingKey]) -> Result<Self> {
        verify(&bytes, signature, trusted)?;
        let manifest: Manifest = serde_json::from_slice(&bytes).context("parse manifest")?;
        manifest.validate()?;
        Ok(Self { bytes, signature: signature.trim().to_owned(), manifest })
    }

    pub fn sign(manifest: Manifest, key: &SigningKey) -> Result<Self> {
        manifest.validate()?;
        let bytes = manifest.to_bytes()?;
        let signature = sign(&bytes, key);
        Ok(Self { bytes, signature, manifest })
    }
}

pub fn sign(bytes: &[u8], key: &SigningKey) -> String {
    B64.encode(key.sign(bytes).to_bytes())
}

pub fn verify(bytes: &[u8], signature: &str, trusted: &[VerifyingKey]) -> Result<(), VerifyError> {
    if trusted.is_empty() {
        return Err(VerifyError::NoKeys);
    }
    let raw = B64.decode(signature.trim()).map_err(|_| VerifyError::MalformedSignature)?;
    let raw: [u8; 64] = raw.try_into().map_err(|_| VerifyError::MalformedSignature)?;
    let sig = Signature::from_bytes(&raw);
    if trusted.iter().any(|k| k.verify_strict(bytes, &sig).is_ok()) {
        Ok(())
    } else {
        Err(VerifyError::BadSignature)
    }
}

pub fn parse_public_key(text: &str) -> Result<VerifyingKey> {
    let raw = B64.decode(text.trim()).context("public key is not base64")?;
    let raw: [u8; 32] = raw.try_into().map_err(|_| anyhow::anyhow!("public key is not 32 bytes"))?;
    VerifyingKey::from_bytes(&raw).context("invalid ed25519 public key")
}

pub fn parse_signing_key(text: &str) -> Result<SigningKey> {
    let raw = B64.decode(text.trim()).context("signing key is not base64")?;
    let raw: [u8; 32] = raw.try_into().map_err(|_| anyhow::anyhow!("signing key is not a 32 byte seed"))?;
    Ok(SigningKey::from_bytes(&raw))
}

pub fn encode_key(bytes: &[u8]) -> String {
    B64.encode(bytes)
}

pub fn generate_signing_key() -> Result<SigningKey> {
    let mut seed = [0u8; 32];
    getrandom::fill(&mut seed).map_err(|e| anyhow::anyhow!("os random: {e}"))?;
    Ok(SigningKey::from_bytes(&seed))
}

/// Pinned keys from the config (inline and files).
pub fn load_trusted(cfg: &crate::config::TrustConfig) -> Result<Vec<VerifyingKey>> {
    let mut keys = Vec::new();
    for k in &cfg.public_keys {
        keys.push(parse_public_key(k)?);
    }
    for f in &cfg.public_key_files {
        let text = std::fs::read_to_string(f).with_context(|| format!("read {}", f.display()))?;
        keys.push(parse_public_key(&text).with_context(|| f.display().to_string())?);
    }
    Ok(keys)
}

/// Signing key from `signing.key_file` or `SHENRON_DEPLOYD_SIGNING_KEY[_FILE]`.
pub fn load_signing_key(cfg: &crate::config::SigningConfig) -> Result<SigningKey> {
    if let Some(f) = &cfg.key_file {
        return parse_signing_key(&std::fs::read_to_string(f).with_context(|| format!("read {}", f.display()))?);
    }
    match crate::config::env_secret("SHENRON_DEPLOYD_SIGNING_KEY")? {
        Some(v) => parse_signing_key(&v),
        None => bail!("no signing key: set signing.key_file or SHENRON_DEPLOYD_SIGNING_KEY[_FILE]"),
    }
}

pub fn write_private(path: &Path, content: &str) -> Result<()> {
    use std::io::Write;
    #[cfg(unix)]
    use std::os::unix::fs::OpenOptionsExt;
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    opts.mode(0o600);
    let mut f = opts.open(path).with_context(|| format!("create {}", path.display()))?;
    f.write_all(content.as_bytes())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    pub fn sample() -> Manifest {
        Manifest {
            schema: SCHEMA,
            service: "demo".into(),
            channel: "stable".into(),
            version: "abc123".into(),
            created_at: "2026-11-19T10:00:00Z".into(),
            artifacts: vec![Artifact {
                name: "demo".into(),
                url: "https://store.example/demo/releases/abc123/demo".into(),
                sha256: "0".repeat(64),
                size: 4,
                mode: Some("0755".into()),
                unpack: false,
            }],
            health: Some(Health {
                url: "http://127.0.0.1:1/health".into(),
                expect_status: 200,
                retries: 3,
                interval_ms: 10,
                timeout_ms: 100,
            }),
        }
    }

    #[test]
    fn sign_verify_roundtrip() {
        let key = generate_signing_key().unwrap();
        let signed = SignedManifest::sign(sample(), &key).unwrap();
        let opened = SignedManifest::open(signed.bytes.clone(), &signed.signature, &[key.verifying_key()]).unwrap();
        assert_eq!(opened.manifest, sample());
    }

    #[test]
    fn tampered_manifest_is_rejected() {
        let key = generate_signing_key().unwrap();
        let signed = SignedManifest::sign(sample(), &key).unwrap();
        let mut bytes = signed.bytes.clone();
        let pos = bytes.windows(6).position(|w| w == b"abc123").unwrap();
        bytes[pos] = b'x';
        let err = SignedManifest::open(bytes, &signed.signature, &[key.verifying_key()]).unwrap_err();
        assert!(matches!(err.downcast_ref::<VerifyError>(), Some(VerifyError::BadSignature)));
    }

    #[test]
    fn unpinned_key_is_rejected_and_rotation_accepts_either() {
        let a = generate_signing_key().unwrap();
        let b = generate_signing_key().unwrap();
        let signed = SignedManifest::sign(sample(), &a).unwrap();
        assert!(SignedManifest::open(signed.bytes.clone(), &signed.signature, &[b.verifying_key()]).is_err());
        assert!(
            SignedManifest::open(signed.bytes.clone(), &signed.signature, &[b.verifying_key(), a.verifying_key()])
                .is_ok()
        );
        assert!(matches!(verify(&signed.bytes, &signed.signature, &[]), Err(VerifyError::NoKeys)));
        assert!(matches!(verify(&signed.bytes, "not base64!", &[a.verifying_key()]), Err(VerifyError::MalformedSignature)));
    }

    #[test]
    fn invalid_manifests_are_refused() {
        let mut m = sample();
        m.version = "../evil".into();
        assert!(m.validate().is_err());
        let mut m = sample();
        m.artifacts[0].sha256 = "xyz".into();
        assert!(m.validate().is_err());
        let mut m = sample();
        m.artifacts[0].name = "a/b".into();
        assert!(m.validate().is_err());
        let mut m = sample();
        m.artifacts[0].mode = Some("4755".into());
        assert!(m.validate().is_err());
        let mut m = sample();
        m.artifacts.clear();
        assert!(m.validate().is_err());
    }

    #[test]
    fn key_encoding_roundtrip() {
        let key = generate_signing_key().unwrap();
        let again = parse_signing_key(&encode_key(&key.to_bytes())).unwrap();
        assert_eq!(key.verifying_key(), again.verifying_key());
        let pk = parse_public_key(&encode_key(&key.verifying_key().to_bytes())).unwrap();
        assert_eq!(pk, key.verifying_key());
    }
}
