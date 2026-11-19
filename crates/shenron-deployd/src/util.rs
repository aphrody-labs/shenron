// SPDX-License-Identifier: Apache-2.0
//! Small shared helpers: durations, time, hashing and atomic file writes.

use std::fmt;
use std::path::Path;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use sha2::{Digest, Sha256};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;
use tokio::io::AsyncReadExt;

/// Installs the ring crypto provider for reqwest (idempotent; the crate builds rustls without C).
pub fn ensure_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

/// Parses `500ms`, `30s`, `5m`, `2h` or a bare number of seconds.
pub fn parse_duration(text: &str) -> Result<Duration> {
    let text = text.trim();
    let split = text.find(|c: char| !c.is_ascii_digit()).unwrap_or(text.len());
    let (digits, unit) = text.split_at(split);
    let n: u64 = digits.parse().with_context(|| format!("invalid duration {text:?}"))?;
    Ok(match unit.trim() {
        "" | "s" => Duration::from_secs(n),
        "ms" => Duration::from_millis(n),
        "m" => Duration::from_secs(n * 60),
        "h" => Duration::from_secs(n * 3600),
        other => bail!("invalid duration unit {other:?} in {text:?}"),
    })
}

/// Current time as RFC 3339 (UTC, seconds).
pub fn now_rfc3339() -> String {
    format_unix(OffsetDateTime::now_utc().unix_timestamp())
}

pub fn format_unix(ts: i64) -> String {
    OffsetDateTime::from_unix_timestamp(ts)
        .ok()
        .and_then(|t| t.format(&Rfc3339).ok())
        .unwrap_or_default()
}

pub fn parse_rfc3339(text: &str) -> Result<i64> {
    Ok(OffsetDateTime::parse(text, &Rfc3339)
        .with_context(|| format!("invalid RFC 3339 timestamp {text:?}"))?
        .unix_timestamp())
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

/// Streams a file through SHA-256; returns `(hex digest, size)`.
pub async fn hash_file(path: &Path) -> Result<(String, u64)> {
    let mut file = tokio::fs::File::open(path)
        .await
        .with_context(|| format!("open {}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 256 * 1024];
    let mut size = 0u64;
    loop {
        let n = file.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        size += n as u64;
    }
    Ok((hex::encode(hasher.finalize()), size))
}

/// Writes `bytes` next to `path` and renames over it, so readers never see a partial file.
pub async fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let dir = path.parent().context("path has no parent")?;
    tokio::fs::create_dir_all(dir).await?;
    let name = path.file_name().context("path has no file name")?.to_string_lossy();
    let tmp = dir.join(format!(".{name}.{}.tmp", std::process::id()));
    tokio::fs::write(&tmp, bytes).await?;
    if let Err(e) = tokio::fs::rename(&tmp, path).await {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(e).with_context(|| format!("rename onto {}", path.display()));
    }
    Ok(())
}

/// Path components used in keys and directories: no separators, no dot-dot, bounded length.
pub fn is_safe_component(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s != "."
        && s != ".."
        && s.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '+'))
}

pub fn ensure_safe_component(kind: &str, s: &str) -> Result<()> {
    if !is_safe_component(s) {
        bail!("{kind} {s:?} is not a safe path component");
    }
    Ok(())
}

/// Error wrapper to mark a failure as an integrity violation (never retried for the same version).
#[derive(Debug)]
pub struct Integrity(pub String);

impl fmt::Display for Integrity {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for Integrity {}

pub fn is_integrity(err: &anyhow::Error) -> bool {
    err.chain().any(|c| c.is::<Integrity>())
}
