// SPDX-License-Identifier: Apache-2.0
//! On-disk store of one cache zone. Layout: `<dir>/<h0h1>/<h2h3>/<hash>.idx` holds the `Vary`
//! header names of the key, `<hash>-<variance>.ent` holds one stored response. Entries are written
//! to a temporary file and renamed, so a reader never sees a partial object.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use http::HeaderMap;
use serde::{Deserialize, Serialize};
use tokio::sync::watch;

use crate::config::CacheZoneConfig;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Entry {
    pub status: u16,
    pub headers: Vec<(String, Vec<u8>)>,
    pub body: Vec<u8>,
    /// Unix seconds after which the entry is stale.
    pub expires_at: u64,
}

#[derive(Debug)]
pub struct Hit {
    pub entry: Entry,
    pub fresh: bool,
}

type LockMap = Mutex<HashMap<String, watch::Receiver<bool>>>;

pub struct Zone {
    pub name: String,
    dir: PathBuf,
    pub max_size: u64,
    pub inactive: Duration,
    pub max_object: u64,
    pub sweep_interval: Duration,
    locks: Arc<LockMap>,
}

/// Held by the request that refreshes a key; dropping it wakes the waiting requests.
pub struct LockGuard {
    locks: Arc<LockMap>,
    key: String,
    done: watch::Sender<bool>,
}

pub enum LockOutcome {
    Leader(LockGuard),
    Waiter(watch::Receiver<bool>),
}

impl Drop for LockGuard {
    fn drop(&mut self) {
        self.locks.lock().unwrap_or_else(std::sync::PoisonError::into_inner).remove(&self.key);
        self.done.send_replace(true);
    }
}

pub fn now_secs() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs())
}

/// Hash of the request header values named by `Vary` (`0` when the response does not vary).
pub fn vary_hash(names: &[String], request: &HeaderMap) -> String {
    if names.is_empty() {
        return "0".to_owned();
    }
    let mut hasher = blake3::Hasher::new();
    for name in names {
        hasher.update(name.as_bytes());
        hasher.update(b":");
        for value in request.get_all(name.as_str()) {
            hasher.update(value.as_bytes());
            hasher.update(b",");
        }
        hasher.update(b"\n");
    }
    hasher.finalize().to_hex()[..16].to_owned()
}

fn key_hash(key: &str) -> String {
    blake3::hash(key.as_bytes()).to_hex()[..32].to_owned()
}

impl Zone {
    pub fn new(cfg: &CacheZoneConfig) -> Result<Self> {
        std::fs::create_dir_all(&cfg.dir)
            .with_context(|| format!("creating cache directory {}", cfg.dir.display()))?;
        Ok(Self {
            name: cfg.name.clone(),
            dir: cfg.dir.clone(),
            max_size: cfg.max_size.0,
            inactive: cfg.inactive.0,
            max_object: cfg.max_object.0,
            sweep_interval: cfg.sweep_interval.0,
            locks: Arc::default(),
        })
    }

    fn bucket(&self, hash: &str) -> PathBuf {
        self.dir.join(&hash[0..2]).join(&hash[2..4])
    }

    pub async fn lookup(&self, key: &str, request: &HeaderMap, now: u64) -> Option<Hit> {
        let hash = key_hash(key);
        let bucket = self.bucket(&hash);
        let idx = tokio::fs::read(bucket.join(format!("{hash}.idx"))).await.ok()?;
        let names: Vec<String> = serde_json::from_slice(&idx).ok()?;
        let path = bucket.join(format!("{hash}-{}.ent", vary_hash(&names, request)));
        let raw = tokio::fs::read(&path).await.ok()?;
        let entry: Entry = postcard::from_bytes(&raw).ok()?;
        touch(path);
        Some(Hit { fresh: entry.expires_at > now, entry })
    }

    pub async fn store(
        &self,
        key: &str,
        vary: &[String],
        variance: &str,
        entry: &Entry,
    ) -> Result<()> {
        let hash = key_hash(key);
        let bucket = self.bucket(&hash);
        tokio::fs::create_dir_all(&bucket).await?;
        let idx = serde_json::to_vec(vary)?;
        let idx_path = bucket.join(format!("{hash}.idx"));
        if tokio::fs::read(&idx_path).await.ok().as_deref() != Some(idx.as_slice()) {
            write_atomic(&idx_path, &idx).await?;
        }
        let raw = postcard::to_stdvec(entry)?;
        write_atomic(&bucket.join(format!("{hash}-{variance}.ent")), &raw).await
    }

    /// Become the refreshing request of `key`, or get a receiver that fires when the leader is done.
    pub fn lock(&self, key: &str) -> LockOutcome {
        let mut map = self.locks.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(rx) = map.get(key) {
            return LockOutcome::Waiter(rx.clone());
        }
        let (done, rx) = watch::channel(false);
        map.insert(key.to_owned(), rx);
        LockOutcome::Leader(LockGuard { locks: Arc::clone(&self.locks), key: key.to_owned(), done })
    }

    /// Delete entries not used for `inactive`, then the oldest ones while the zone exceeds `max_size`.
    pub fn sweep(&self, now: SystemTime) -> SweepStats {
        sweep_dir(&self.dir, self.max_size, self.inactive, now)
    }
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct SweepStats {
    pub kept: usize,
    pub removed: usize,
    pub bytes: u64,
}

fn touch(path: PathBuf) {
    // Recent use keeps an entry out of the `inactive` eviction; refresh at most once a minute.
    tokio::task::spawn_blocking(move || {
        let Ok(file) = std::fs::File::options().append(true).open(&path) else { return };
        let stale = file
            .metadata()
            .and_then(|m| m.modified())
            .is_ok_and(|m| m.elapsed().is_ok_and(|age| age > Duration::from_secs(60)));
        if stale {
            let _ = file.set_modified(SystemTime::now());
        }
    });
}

async fn write_atomic(path: &Path, data: &[u8]) -> Result<()> {
    let tmp = path.with_extension(format!("tmp-{}-{}", std::process::id(), now_nanos()));
    tokio::fs::write(&tmp, data).await?;
    if let Err(err) = tokio::fs::rename(&tmp, path).await {
        let _ = tokio::fs::remove_file(&tmp).await;
        return Err(err.into());
    }
    Ok(())
}

fn now_nanos() -> u128 {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_nanos())
}

fn walk(dir: &Path, out: &mut Vec<(PathBuf, u64, SystemTime)>) {
    let Ok(read) = std::fs::read_dir(dir) else { return };
    for item in read.flatten() {
        let path = item.path();
        let Ok(meta) = item.metadata() else { continue };
        if meta.is_dir() {
            walk(&path, out);
        } else if let Ok(modified) = meta.modified() {
            out.push((path, meta.len(), modified));
        }
    }
}

fn sweep_dir(dir: &Path, max_size: u64, inactive: Duration, now: SystemTime) -> SweepStats {
    let mut files = Vec::new();
    walk(dir, &mut files);
    let mut stats = SweepStats::default();
    let mut live = Vec::new();
    for (path, size, modified) in files {
        let age = now.duration_since(modified).unwrap_or_default();
        let is_tmp = path.extension().is_some_and(|e| e.to_string_lossy().starts_with("tmp-"));
        let limit = if is_tmp { Duration::from_secs(3600) } else { inactive };
        if age > limit {
            if std::fs::remove_file(&path).is_ok() {
                stats.removed += 1;
            }
        } else {
            live.push((path, size, modified));
        }
    }
    let mut total: u64 = live.iter().map(|(_, size, _)| size).sum();
    if total > max_size {
        live.sort_by_key(|(_, _, modified)| *modified);
        let target = max_size / 10 * 9;
        let mut kept = Vec::new();
        for (path, size, modified) in live {
            if total > target && std::fs::remove_file(&path).is_ok() {
                total -= size;
                stats.removed += 1;
            } else {
                kept.push((path, size, modified));
            }
        }
        live = kept;
    }
    stats.kept = live.len();
    stats.bytes = total;
    stats
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Dur, Size};
    use http::HeaderValue;

    fn zone(dir: &Path) -> Zone {
        Zone::new(&CacheZoneConfig {
            name: "t".into(),
            dir: dir.to_path_buf(),
            max_size: Size(1 << 20),
            inactive: Dur(Duration::from_secs(60)),
            max_object: Size(1 << 20),
            sweep_interval: Dur(Duration::from_secs(60)),
        })
        .unwrap()
    }

    fn entry(body: &str, expires_at: u64) -> Entry {
        Entry {
            status: 200,
            headers: vec![("content-type".into(), b"text/html".to_vec())],
            body: body.as_bytes().to_vec(),
            expires_at,
        }
    }

    #[tokio::test]
    async fn store_then_lookup_fresh_and_stale() {
        let tmp = tempfile::tempdir().unwrap();
        let z = zone(tmp.path());
        let req = HeaderMap::new();
        assert!(z.lookup("k", &req, 100).await.is_none());
        z.store("k", &[], "0", &entry("hello", 200)).await.unwrap();
        let hit = z.lookup("k", &req, 100).await.unwrap();
        assert!(hit.fresh);
        assert_eq!(hit.entry.body, b"hello");
        let stale = z.lookup("k", &req, 300).await.unwrap();
        assert!(!stale.fresh);
    }

    #[tokio::test]
    async fn vary_selects_the_variant() {
        let tmp = tempfile::tempdir().unwrap();
        let z = zone(tmp.path());
        let names = vec!["rsc".to_owned()];
        let mut rsc = HeaderMap::new();
        rsc.insert("rsc", HeaderValue::from_static("1"));
        let plain = HeaderMap::new();
        z.store("k", &names, &vary_hash(&names, &rsc), &entry("flight", 200)).await.unwrap();
        z.store("k", &names, &vary_hash(&names, &plain), &entry("html", 200)).await.unwrap();
        assert_eq!(z.lookup("k", &rsc, 1).await.unwrap().entry.body, b"flight");
        assert_eq!(z.lookup("k", &plain, 1).await.unwrap().entry.body, b"html");
        assert_eq!(vary_hash(&[], &rsc), "0");
    }

    #[tokio::test]
    async fn lock_has_one_leader_and_wakes_waiters() {
        let tmp = tempfile::tempdir().unwrap();
        let z = zone(tmp.path());
        let LockOutcome::Leader(guard) = z.lock("k") else { panic!("first caller leads") };
        let LockOutcome::Waiter(mut rx) = z.lock("k") else { panic!("second caller waits") };
        assert!(!*rx.borrow());
        drop(guard);
        rx.wait_for(|done| *done).await.unwrap();
        assert!(
            matches!(z.lock("k"), LockOutcome::Leader(_)),
            "free again after the leader is done"
        );
    }

    #[tokio::test]
    async fn sweep_removes_inactive_then_oldest_over_budget() {
        let tmp = tempfile::tempdir().unwrap();
        let z = zone(tmp.path());
        for name in ["a", "b", "c"] {
            z.store(name, &[], "0", &entry(&"x".repeat(100), 10)).await.unwrap();
        }
        let now = SystemTime::now();
        assert_eq!(sweep_dir(tmp.path(), 1 << 20, Duration::from_secs(60), now).removed, 0);
        let later = now + Duration::from_secs(120);
        let stats = sweep_dir(tmp.path(), 1 << 20, Duration::from_secs(60), later);
        assert_eq!(stats.kept, 0);
        assert_eq!(stats.removed, 6, "three entries and three indexes");
        for name in ["a", "b", "c"] {
            z.store(name, &[], "0", &entry(&"x".repeat(100), 10)).await.unwrap();
        }
        let tiny = sweep_dir(tmp.path(), 150, Duration::from_secs(60), SystemTime::now());
        assert!(tiny.bytes <= 150, "{tiny:?}");
    }
}
