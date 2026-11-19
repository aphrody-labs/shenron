// SPDX-License-Identifier: Apache-2.0
//! On-disk release layout, atomic `current` symlink swap, unpacking, garbage collection and state.
//!
//! ```text
//! <root>/releases/<service>/<version>/...   immutable, one directory per release
//! <root>/current/<service> -> ../releases/<service>/<version>   swapped with rename(2)
//! <state_dir>/<service>.json                last known state
//! ```

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};

use crate::manifest::{Artifact, SignedManifest, parse_mode};
use crate::store::Store;
use crate::util::{Integrity, ensure_safe_component, write_atomic};

#[derive(Debug, Clone)]
pub struct Layout {
    pub root: PathBuf,
    pub state_dir: PathBuf,
}

impl Layout {
    pub fn new(root: PathBuf, state_dir: PathBuf) -> Self {
        Self { root, state_dir }
    }
    pub fn releases_dir(&self, service: &str) -> PathBuf {
        self.root.join("releases").join(service)
    }
    pub fn release_dir(&self, service: &str, version: &str) -> PathBuf {
        self.releases_dir(service).join(version)
    }
    pub fn current_link(&self, service: &str) -> PathBuf {
        self.root.join("current").join(service)
    }
    pub fn state_file(&self, service: &str) -> PathBuf {
        self.state_dir.join(format!("{service}.json"))
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Release {
    pub version: String,
    pub created_at: String,
    pub deployed_at: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    #[default]
    Idle,
    Deploying,
    Healthy,
    /// The new release failed and the previous one is serving again.
    RolledBack,
    /// Failed and nothing healthy to go back to.
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Event {
    pub at: String,
    pub kind: String,
    pub version: Option<String>,
    pub detail: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ServiceState {
    pub service: String,
    pub channel: String,
    pub status: Status,
    pub current: Option<Release>,
    pub previous: Option<Release>,
    pub last_check_at: Option<String>,
    pub last_error: Option<String>,
    /// Versions that failed integrity or health: not retried until forced or superseded.
    pub failed: BTreeMap<String, String>,
    pub events: Vec<Event>,
}

impl ServiceState {
    pub fn new(service: &str, channel: &str) -> Self {
        Self { service: service.to_owned(), channel: channel.to_owned(), ..Self::default() }
    }

    pub fn push_event(&mut self, kind: &str, version: Option<&str>, detail: impl Into<String>) {
        self.events.push(Event {
            at: crate::util::now_rfc3339(),
            kind: kind.to_owned(),
            version: version.map(str::to_owned),
            detail: detail.into(),
        });
        let excess = self.events.len().saturating_sub(30);
        self.events.drain(..excess);
    }

    pub async fn load(layout: &Layout, service: &str, channel: &str) -> Result<Self> {
        match tokio::fs::read(layout.state_file(service)).await {
            Ok(b) => Ok(serde_json::from_slice(&b).with_context(|| format!("parse state of {service}"))?),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Self::new(service, channel)),
            Err(e) => Err(e.into()),
        }
    }

    pub async fn save(&self, layout: &Layout) -> Result<()> {
        write_atomic(&layout.state_file(&self.service), &serde_json::to_vec_pretty(self)?).await
    }
}

/// Version the `current` link points at.
pub fn current_version(layout: &Layout, service: &str) -> Option<String> {
    let target = std::fs::read_link(layout.current_link(service)).ok()?;
    Some(target.file_name()?.to_string_lossy().into_owned())
}

/// Atomically points `current/<service>` at `releases/<service>/<version>` (relative link, rename over).
#[cfg(unix)]
pub fn swap_current(layout: &Layout, service: &str, version: &str) -> Result<()> {
    ensure_safe_component("service", service)?;
    ensure_safe_component("version", version)?;
    let dir = layout.release_dir(service, version);
    if !dir.is_dir() {
        bail!("release {} does not exist", dir.display());
    }
    let link = layout.current_link(service);
    let parent = link.parent().context("current link has no parent")?;
    std::fs::create_dir_all(parent)?;
    if let Ok(meta) = std::fs::symlink_metadata(&link)
        && !meta.file_type().is_symlink()
    {
        bail!("{} exists and is not a symlink", link.display());
    }
    let tmp = parent.join(format!(".{service}.{}.tmp", std::process::id()));
    let _ = std::fs::remove_file(&tmp);
    std::os::unix::fs::symlink(Path::new("..").join("releases").join(service).join(version), &tmp)?;
    if let Err(e) = std::fs::rename(&tmp, &link) {
        let _ = std::fs::remove_file(&tmp);
        return Err(e).with_context(|| format!("swap {}", link.display()));
    }
    Ok(())
}

#[cfg(not(unix))]
pub fn swap_current(_: &Layout, _: &str, _: &str) -> Result<()> {
    bail!("the symlink swap needs a Unix host")
}

/// Downloads, verifies and unpacks the artifacts of `signed` into `releases/<service>/<version>`.
/// Reuses a complete release already on disk. Integrity failures are marked [`Integrity`].
pub async fn stage_release(layout: &Layout, store: &Store, signed: &SignedManifest) -> Result<PathBuf> {
    let m = &signed.manifest;
    let final_dir = layout.release_dir(&m.service, &m.version);
    if final_dir.join(".complete").is_file() {
        return Ok(final_dir);
    }
    let releases = layout.releases_dir(&m.service);
    tokio::fs::create_dir_all(&releases).await?;
    sweep_staging(&releases).await;
    let staging = releases.join(format!(".staging-{}-{}", m.version, std::process::id()));
    let _ = tokio::fs::remove_dir_all(&staging).await;
    tokio::fs::create_dir_all(&staging).await?;

    let result = fill_staging(store, signed, &staging).await;
    if let Err(e) = result {
        let _ = tokio::fs::remove_dir_all(&staging).await;
        return Err(e);
    }
    tokio::fs::write(staging.join("manifest.json"), &signed.bytes).await?;
    tokio::fs::write(staging.join("manifest.json.sig"), &signed.signature).await?;
    tokio::fs::write(staging.join(".complete"), b"").await?;
    // A previous incomplete attempt may have left a directory without the marker.
    let _ = tokio::fs::remove_dir_all(&final_dir).await;
    tokio::fs::rename(&staging, &final_dir).await.with_context(|| format!("publish release {}", final_dir.display()))?;
    Ok(final_dir)
}

async fn fill_staging(store: &Store, signed: &SignedManifest, staging: &Path) -> Result<()> {
    for artifact in &signed.manifest.artifacts {
        let dest = staging.join(&artifact.name);
        let (sha, size) = store
            .download(&artifact.url, &dest, artifact.size)
            .await
            .with_context(|| format!("download {}", artifact.name))?;
        if size != artifact.size {
            return Err(Integrity(format!("{}: size {size} != manifest {}", artifact.name, artifact.size)).into());
        }
        if !sha.eq_ignore_ascii_case(&artifact.sha256) {
            return Err(Integrity(format!("{}: sha256 {sha} != manifest {}", artifact.name, artifact.sha256)).into());
        }
        finish_artifact(artifact, &dest, staging).await?;
    }
    Ok(())
}

async fn finish_artifact(artifact: &Artifact, file: &Path, staging: &Path) -> Result<()> {
    if artifact.unpack {
        let (file, staging) = (file.to_owned(), staging.to_owned());
        tokio::task::spawn_blocking(move || -> Result<()> {
            let gz = flate2::read::GzDecoder::new(std::fs::File::open(&file)?);
            tar::Archive::new(gz).unpack(&staging).context("unpack archive")?;
            std::fs::remove_file(&file)?;
            Ok(())
        })
        .await??;
        return Ok(());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = match &artifact.mode {
            Some(m) => parse_mode(m)?,
            None => 0o644,
        };
        tokio::fs::set_permissions(file, std::fs::Permissions::from_mode(mode)).await?;
    }
    #[cfg(not(unix))]
    let _ = parse_mode;
    Ok(())
}

/// Removes staging directories left by crashed deploys (older than one hour).
async fn sweep_staging(releases: &Path) {
    let Ok(mut rd) = tokio::fs::read_dir(releases).await else { return };
    while let Ok(Some(e)) = rd.next_entry().await {
        if !e.file_name().to_string_lossy().starts_with(".staging-") {
            continue;
        }
        let old = e
            .metadata()
            .await
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.elapsed().ok())
            .is_some_and(|age| age.as_secs() > 3600);
        if old {
            let _ = tokio::fs::remove_dir_all(e.path()).await;
        }
    }
}

/// Keeps `current`, `previous` and the `keep` most recent other releases.
pub async fn gc(layout: &Layout, service: &str, protected: &[&str], keep: usize) -> Result<Vec<String>> {
    let dir = layout.releases_dir(service);
    let mut found = Vec::new();
    let mut rd = tokio::fs::read_dir(&dir).await?;
    while let Some(e) = rd.next_entry().await? {
        let name = e.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || protected.contains(&name.as_str()) || !e.file_type().await?.is_dir() {
            continue;
        }
        let mtime = e.metadata().await?.modified()?;
        found.push((mtime, name));
    }
    found.sort_by(|a, b| b.cmp(a));
    let mut removed = Vec::new();
    for (_, name) in found.into_iter().skip(keep) {
        tokio::fs::remove_dir_all(dir.join(&name)).await?;
        removed.push(name);
    }
    Ok(removed)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    fn layout(dir: &Path) -> Layout {
        Layout::new(dir.to_path_buf(), dir.join("state"))
    }

    fn mk_release(l: &Layout, svc: &str, ver: &str) {
        std::fs::create_dir_all(l.release_dir(svc, ver)).unwrap();
        std::fs::write(l.release_dir(svc, ver).join("id"), ver).unwrap();
    }

    #[test]
    fn swap_is_atomic_relative_and_reversible() {
        let tmp = tempfile::tempdir().unwrap();
        let l = layout(tmp.path());
        mk_release(&l, "svc", "v1");
        mk_release(&l, "svc", "v2");
        assert_eq!(current_version(&l, "svc"), None);
        swap_current(&l, "svc", "v1").unwrap();
        assert_eq!(current_version(&l, "svc").as_deref(), Some("v1"));
        assert_eq!(std::fs::read_to_string(l.current_link("svc").join("id")).unwrap(), "v1");
        swap_current(&l, "svc", "v2").unwrap();
        assert_eq!(std::fs::read_to_string(l.current_link("svc").join("id")).unwrap(), "v2");
        swap_current(&l, "svc", "v1").unwrap();
        assert_eq!(current_version(&l, "svc").as_deref(), Some("v1"));
        let target = std::fs::read_link(l.current_link("svc")).unwrap();
        assert!(target.is_relative(), "link must be relative: {target:?}");
        // no temporary link is left behind
        let leftovers: Vec<_> = std::fs::read_dir(tmp.path().join("current"))
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().starts_with('.'))
            .collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn swap_refuses_missing_release_and_real_directories() {
        let tmp = tempfile::tempdir().unwrap();
        let l = layout(tmp.path());
        assert!(swap_current(&l, "svc", "nope").is_err());
        mk_release(&l, "svc", "v1");
        std::fs::create_dir_all(l.current_link("svc")).unwrap();
        assert!(swap_current(&l, "svc", "v1").is_err());
        assert!(swap_current(&l, "svc", "../v1").is_err());
    }

    #[tokio::test]
    async fn gc_keeps_protected_and_recent() {
        let tmp = tempfile::tempdir().unwrap();
        let l = layout(tmp.path());
        for v in ["a", "b", "c", "d", "e"] {
            mk_release(&l, "svc", v);
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
        let removed = gc(&l, "svc", &["a", "e"], 1).await.unwrap();
        assert_eq!(removed.len(), 2);
        assert!(l.release_dir("svc", "a").exists() && l.release_dir("svc", "e").exists() && l.release_dir("svc", "d").exists());
    }

    #[tokio::test]
    async fn state_roundtrip() {
        let tmp = tempfile::tempdir().unwrap();
        let l = layout(tmp.path());
        let mut s = ServiceState::new("svc", "stable");
        s.failed.insert("v9".into(), "health".into());
        s.push_event("deploy", Some("v1"), "ok");
        s.save(&l).await.unwrap();
        let back = ServiceState::load(&l, "svc", "stable").await.unwrap();
        assert_eq!(back.failed.get("v9").map(String::as_str), Some("health"));
        assert_eq!(back.events.len(), 1);
    }
}
