// SPDX-License-Identifier: Apache-2.0
//! Host agent: polls the manifest channel of each managed service and runs the deploy state
//! machine (verify, stage, swap, restart, probe, rollback).

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use anyhow::{Context, Result, bail};
use ed25519_dalek::VerifyingKey;
use serde::Serialize;
use tokio::sync::{Notify, watch};

use crate::config::{Config, ServiceConfig};
use crate::health;
use crate::manifest::{self, Health, Manifest, SignedManifest, VerifyError, channel_key, release_key};
use crate::release::{self, Layout, Release, ServiceState, Status};
use crate::restart::restart_unit;
use crate::store::{Fetch, Store};
use crate::util::{is_integrity, now_rfc3339};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "outcome", rename_all = "snake_case")]
pub enum Outcome {
    /// The channel still points at the installed version.
    NoChange { version: Option<String> },
    Deployed { version: String, previous: Option<String> },
    /// The new release failed its health gate; the previous one serves again.
    RolledBack { version: String, restored: String, reason: String },
    /// The new release failed and there was nothing to go back to.
    Failed { version: String, reason: String },
    /// Integrity failure (sha256, size): nothing was switched.
    Rejected { version: String, reason: String },
    /// Known-bad or older than the installed release: ignored.
    Skipped { version: String, reason: String },
}

struct Inner {
    state: ServiceState,
    etag: Option<String>,
}

pub struct ServiceRt {
    pub cfg: ServiceConfig,
    inner: tokio::sync::Mutex<Inner>,
    snapshot: Mutex<ServiceState>,
    pub notify: Notify,
}

impl ServiceRt {
    pub fn snapshot(&self) -> ServiceState {
        self.snapshot.lock().expect("snapshot lock").clone()
    }
}

pub struct Agent {
    pub cfg: Config,
    pub layout: Layout,
    store: Store,
    trusted: Vec<VerifyingKey>,
    http: reqwest::Client,
    services: BTreeMap<String, Arc<ServiceRt>>,
}

impl Agent {
    pub async fn new(cfg: Config) -> Result<Self> {
        let root = cfg.root()?.to_path_buf();
        let layout = Layout::new(root, cfg.state_dir()?);
        let trusted = manifest::load_trusted(&cfg.trust)?;
        if trusted.is_empty() {
            bail!("no pinned public key: set trust.public_keys or trust.public_key_files");
        }
        if cfg.services.is_empty() {
            bail!("no [[service]] declared");
        }
        let store = Store::new(&cfg.store)?;
        crate::util::ensure_crypto_provider();
        let http = reqwest::Client::builder()
            .no_proxy()
            .user_agent(concat!("shenron-deployd/", env!("CARGO_PKG_VERSION")))
            .build()?;
        tokio::fs::create_dir_all(&layout.state_dir).await?;
        let mut services = BTreeMap::new();
        for sc in &cfg.services {
            let state = ServiceState::load(&layout, &sc.name, sc.channel()).await?;
            services.insert(
                sc.name.clone(),
                Arc::new(ServiceRt {
                    cfg: sc.clone(),
                    snapshot: Mutex::new(state.clone()),
                    inner: tokio::sync::Mutex::new(Inner { state, etag: None }),
                    notify: Notify::new(),
                }),
            );
        }
        Ok(Self { cfg, layout, store, trusted, http, services })
    }

    pub fn service(&self, name: &str) -> Option<&Arc<ServiceRt>> {
        self.services.get(name)
    }

    pub fn snapshot(&self) -> Vec<ServiceState> {
        self.services.values().map(|s| s.snapshot()).collect()
    }

    /// Runs one poll loop per service until `shutdown` flips to true.
    pub async fn run(self: Arc<Self>, shutdown: watch::Receiver<bool>) {
        let mut tasks = Vec::new();
        for rt in self.services.values() {
            let (agent, rt, mut stop) = (self.clone(), rt.clone(), shutdown.clone());
            tasks.push(tokio::spawn(async move {
                loop {
                    match agent.check(&rt.cfg.name, false).await {
                        Ok(Outcome::NoChange { .. } | Outcome::Skipped { .. }) => {
                            tracing::debug!(service = %rt.cfg.name, "check done: nothing to deploy");
                        }
                        Ok(outcome) => tracing::info!(service = %rt.cfg.name, ?outcome, "check done"),
                        Err(e) => tracing::warn!(service = %rt.cfg.name, error = %format!("{e:#}"), "check failed"),
                    }
                    let wait = jittered(agent.cfg.poll_interval);
                    tokio::select! {
                        () = tokio::time::sleep(wait) => {}
                        () = rt.notify.notified() => {}
                        _ = stop.changed() => {}
                    }
                    if *stop.borrow() {
                        break;
                    }
                }
            }));
        }
        for t in tasks {
            let _ = t.await;
        }
    }

    fn rt(&self, service: &str) -> Result<&Arc<ServiceRt>> {
        self.services.get(service).with_context(|| format!("service {service:?} is not managed by this agent"))
    }

    async fn commit(&self, rt: &ServiceRt, state: &ServiceState) {
        if let Err(e) = state.save(&self.layout).await {
            tracing::error!(service = %state.service, error = %format!("{e:#}"), "cannot persist state");
        }
        *rt.snapshot.lock().expect("snapshot lock") = state.clone();
    }

    async fn fetch_signed(&self, manifest_key: &str, etag: Option<&str>) -> Result<Option<(SignedManifest, Option<String>)>> {
        let sig_key = format!("{manifest_key}.sig");
        let mut attempt = 0;
        loop {
            attempt += 1;
            let (bytes, new_etag) = match self.store.get(manifest_key, etag).await? {
                Fetch::NotModified => return Ok(None),
                Fetch::Missing => bail!("no manifest at {manifest_key}"),
                Fetch::Body { bytes, etag } => (bytes, etag),
            };
            let sig = match self.store.get(&sig_key, None).await? {
                Fetch::Body { bytes, .. } => String::from_utf8(bytes).context("signature is not UTF-8")?,
                _ => bail!("no signature at {sig_key}"),
            };
            match SignedManifest::open(bytes, &sig, &self.trusted) {
                Ok(s) => return Ok(Some((s, new_etag))),
                // The manifest and its signature are two objects: tolerate a publish in flight.
                Err(e) if attempt < 3 && matches!(e.downcast_ref::<VerifyError>(), Some(VerifyError::BadSignature)) => {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
                Err(e) => return Err(e.context(format!("verify {manifest_key}"))),
            }
        }
    }

    /// Polls the channel once. `force` ignores the ETag, the known-bad list and the replay guard.
    pub async fn check(&self, service: &str, force: bool) -> Result<Outcome> {
        let rt = self.rt(service)?;
        let mut inner = rt.inner.lock().await;
        let result = self.check_locked(rt, &mut inner, force).await;
        inner.state.last_check_at = Some(now_rfc3339());
        match &result {
            Ok(_) => inner.state.last_error = None,
            Err(e) => inner.state.last_error = Some(format!("{e:#}")),
        }
        if result.is_err() || matches!(result, Ok(Outcome::NoChange { .. })) {
            *rt.snapshot.lock().expect("snapshot lock") = inner.state.clone();
        } else {
            let state = inner.state.clone();
            self.commit(rt, &state).await;
        }
        result
    }

    async fn check_locked(&self, rt: &ServiceRt, inner: &mut Inner, force: bool) -> Result<Outcome> {
        let key = channel_key(&rt.cfg.name, rt.cfg.channel());
        let etag = if force { None } else { inner.etag.clone() };
        let Some((signed, new_etag)) = self.fetch_signed(&key, etag.as_deref()).await? else {
            return Ok(Outcome::NoChange { version: inner.state.current.as_ref().map(|r| r.version.clone()) });
        };
        let m = &signed.manifest;
        if m.service != rt.cfg.name || m.channel != rt.cfg.channel() {
            bail!("manifest at {key} is for {}/{}, not {}/{}", m.service, m.channel, rt.cfg.name, rt.cfg.channel());
        }
        let outcome = self.decide_and_deploy(rt, inner, signed, force).await?;
        inner.etag = new_etag;
        Ok(outcome)
    }

    async fn decide_and_deploy(&self, rt: &ServiceRt, inner: &mut Inner, signed: SignedManifest, force: bool) -> Result<Outcome> {
        let m = &signed.manifest;
        let current = inner.state.current.clone();
        if current.as_ref().is_some_and(|c| c.version == m.version) && !force {
            return Ok(Outcome::NoChange { version: Some(m.version.clone()) });
        }
        if !force {
            if let Some(reason) = inner.state.failed.get(&m.version) {
                return Ok(Outcome::Skipped { version: m.version.clone(), reason: format!("known bad: {reason}") });
            }
            if let Some(c) = &current
                && m.created_at_unix() < crate::util::parse_rfc3339(&c.created_at).unwrap_or(0)
            {
                return Ok(Outcome::Skipped {
                    version: m.version.clone(),
                    reason: format!("created_at {} is older than the installed {} (replay guard)", m.created_at, c.created_at),
                });
            }
        }
        self.deploy(rt, inner, signed).await
    }

    /// Deploys an explicit published version (even an older one), bypassing the guards.
    pub async fn deploy_version(&self, service: &str, version: &str) -> Result<Outcome> {
        crate::util::ensure_safe_component("version", version)?;
        let rt = self.rt(service)?;
        let mut inner = rt.inner.lock().await;
        let key = release_key(service, version, "manifest.json");
        let (signed, _) = self.fetch_signed(&key, None).await?.context("release manifest not found")?;
        if signed.manifest.service != service || signed.manifest.version != version {
            bail!("manifest at {key} does not describe {service} {version}");
        }
        inner.state.failed.remove(version);
        let result = self.deploy(rt, &mut inner, signed).await;
        if let Err(e) = &result {
            inner.state.last_error = Some(format!("{e:#}"));
        }
        let state = inner.state.clone();
        self.commit(rt, &state).await;
        result
    }

    fn health_for(&self, rt: &ServiceRt, m: &Manifest) -> Option<Health> {
        match (&rt.cfg.health_url, &m.health) {
            (Some(url), Some(h)) => Some(Health { url: url.clone(), ..h.clone() }),
            (Some(url), None) => Some(Health { url: url.clone(), expect_status: 200, retries: 10, interval_ms: 2000, timeout_ms: 5000 }),
            (None, h) => h.clone(),
        }
    }

    async fn activate(&self, rt: &ServiceRt, health: Option<&Health>) -> Result<()> {
        restart_unit(rt.cfg.restart, rt.cfg.scope, &rt.cfg.unit()).await?;
        match health {
            Some(h) => health::probe(&self.http, h).await,
            None => {
                tracing::warn!(service = %rt.cfg.name, "no health probe configured: restart success is the only gate");
                Ok(())
            }
        }
    }

    async fn deploy(&self, rt: &ServiceRt, inner: &mut Inner, signed: SignedManifest) -> Result<Outcome> {
        let m = signed.manifest.clone();
        let name = rt.cfg.name.as_str();
        let before = inner.state.status;
        inner.state.status = Status::Deploying;
        inner.state.push_event("deploy_start", Some(&m.version), "staging release");
        let snapshot = inner.state.clone();
        self.commit(rt, &snapshot).await;

        if let Err(e) = release::stage_release(&self.layout, &self.store, &signed).await {
            inner.state.status = before;
            if is_integrity(&e) {
                let reason = format!("{e:#}");
                inner.state.failed.insert(m.version.clone(), reason.clone());
                inner.state.push_event("rejected", Some(&m.version), reason.clone());
                return Ok(Outcome::Rejected { version: m.version, reason });
            }
            return Err(e);
        }

        let previous_version = release::current_version(&self.layout, name);
        if let Err(e) = release::swap_current(&self.layout, name, &m.version) {
            inner.state.status = before;
            return Err(e);
        }
        let health = self.health_for(rt, &m);
        match self.activate(rt, health.as_ref()).await {
            Ok(()) => {
                let now = now_rfc3339();
                inner.state.previous = inner.state.current.take();
                inner.state.current = Some(Release { version: m.version.clone(), created_at: m.created_at.clone(), deployed_at: now });
                inner.state.status = Status::Healthy;
                inner.state.failed.remove(&m.version);
                inner.state.push_event("deployed", Some(&m.version), "healthy");
                let protect: Vec<&str> = [Some(m.version.as_str()), previous_version.as_deref()].into_iter().flatten().collect();
                if let Err(e) = release::gc(&self.layout, name, &protect, rt.cfg.keep()).await {
                    tracing::warn!(service = name, error = %format!("{e:#}"), "release gc failed");
                }
                Ok(Outcome::Deployed { version: m.version, previous: previous_version })
            }
            Err(e) => {
                let reason = format!("{e:#}");
                tracing::error!(service = name, version = %m.version, %reason, "release failed, rolling back");
                inner.state.failed.insert(m.version.clone(), reason.clone());
                inner.state.push_event("failed", Some(&m.version), reason.clone());
                self.rollback_after_failure(rt, inner, &m, previous_version, reason).await
            }
        }
    }

    async fn rollback_after_failure(
        &self,
        rt: &ServiceRt,
        inner: &mut Inner,
        failed: &Manifest,
        previous: Option<String>,
        reason: String,
    ) -> Result<Outcome> {
        let name = rt.cfg.name.as_str();
        let Some(prev) = previous else {
            inner.state.current = Some(Release {
                version: failed.version.clone(),
                created_at: failed.created_at.clone(),
                deployed_at: now_rfc3339(),
            });
            inner.state.status = Status::Failed;
            return Ok(Outcome::Failed { version: failed.version.clone(), reason });
        };
        release::swap_current(&self.layout, name, &prev).context("rollback: swap symlink")?;
        let health = self.previous_health(rt, &prev).await;
        match self.activate(rt, health.as_ref()).await {
            Ok(()) => {
                inner.state.status = Status::RolledBack;
                inner.state.push_event("rolled_back", Some(&prev), format!("restored after {}", failed.version));
                Ok(Outcome::RolledBack { version: failed.version.clone(), restored: prev, reason })
            }
            Err(e) => {
                inner.state.status = Status::Failed;
                let detail = format!("rollback to {prev} is unhealthy: {e:#}");
                inner.state.push_event("rollback_failed", Some(&prev), detail.clone());
                Ok(Outcome::Failed { version: failed.version.clone(), reason: format!("{reason}; {detail}") })
            }
        }
    }

    /// Health parameters recorded with an installed release.
    async fn previous_health(&self, rt: &ServiceRt, version: &str) -> Option<Health> {
        let path = self.layout.release_dir(&rt.cfg.name, version).join("manifest.json");
        let bytes = tokio::fs::read(path).await.ok()?;
        let m: Manifest = serde_json::from_slice(&bytes).ok()?;
        self.health_for(rt, &m)
    }

    /// Manual rollback to the previous release; the failed one is marked known-bad.
    pub async fn rollback(&self, service: &str) -> Result<Outcome> {
        let rt = self.rt(service)?;
        let mut inner = rt.inner.lock().await;
        let result = self.rollback_locked(rt, &mut inner).await;
        if let Err(e) = &result {
            inner.state.last_error = Some(format!("{e:#}"));
        }
        let state = inner.state.clone();
        self.commit(rt, &state).await;
        result
    }

    async fn rollback_locked(&self, rt: &ServiceRt, inner: &mut Inner) -> Result<Outcome> {
        let name = rt.cfg.name.as_str();
        let prev = inner.state.previous.clone().context("no previous release to roll back to")?;
        let cur = inner.state.current.clone().context("no current release")?;
        if !self.layout.release_dir(name, &prev.version).join(".complete").is_file() {
            bail!("previous release {} is no longer on disk", prev.version);
        }
        release::swap_current(&self.layout, name, &prev.version)?;
        let health = self.previous_health(rt, &prev.version).await;
        if let Err(e) = self.activate(rt, health.as_ref()).await {
            release::swap_current(&self.layout, name, &cur.version)?;
            let _ = self.activate(rt, self.previous_health(rt, &cur.version).await.as_ref()).await;
            return Err(e.context(format!("rollback to {} failed, {} restored", prev.version, cur.version)));
        }
        inner.state.failed.insert(cur.version.clone(), "manual rollback".to_owned());
        inner.state.current = Some(Release { deployed_at: now_rfc3339(), ..prev.clone() });
        inner.state.previous = Some(cur.clone());
        inner.state.status = Status::RolledBack;
        inner.state.push_event("rolled_back", Some(&prev.version), format!("manual rollback from {}", cur.version));
        Ok(Outcome::RolledBack { version: cur.version, restored: prev.version, reason: "manual rollback".to_owned() })
    }
}

fn jittered(base: Duration) -> Duration {
    let spread = (base.as_millis() as u64 / 10).max(1);
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.subsec_nanos() as u64);
    base + Duration::from_millis(nanos % spread)
}
