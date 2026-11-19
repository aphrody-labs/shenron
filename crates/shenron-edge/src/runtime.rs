// SPDX-License-Identifier: Apache-2.0
//! Process-wide shared state and the background services: SIGHUP reload, pool re-resolution,
//! cache sweeping and certificate renewal.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use anyhow::Result;
use arc_swap::ArcSwap;
use async_trait::async_trait;
use pingora::server::ShutdownWatch;
use pingora::services::background::BackgroundService;
use tokio::signal::unix::{SignalKind, signal};
use tokio::sync::Notify;

use crate::acme;
use crate::config::Config;
use crate::state::State;
use crate::tls::CertStore;

pub struct Shared {
    pub path: PathBuf,
    pub state: ArcSwap<State>,
    pub certs: Arc<CertStore>,
    /// ACME HTTP-01 tokens currently published: token to key authorization.
    pub challenges: Mutex<HashMap<String, String>>,
    /// Wakes the ACME loop (after a reload, or to retry now).
    pub acme_wake: Notify,
}

impl Shared {
    pub fn load(path: PathBuf) -> Result<Arc<Self>> {
        let state = State::build(Config::load(&path)?)?;
        let certs = Arc::new(CertStore::default());
        certs.reload(&state.config)?;
        Ok(Arc::new(Self {
            path,
            state: ArcSwap::from_pointee(state),
            certs,
            challenges: Mutex::default(),
            acme_wake: Notify::new(),
        }))
    }

    /// Re-read the file; on any error the running configuration stays in place.
    pub fn reload(&self) -> Result<()> {
        let state = State::build(Config::load(&self.path)?)?;
        self.certs.reload(&state.config)?;
        self.state.store(Arc::new(state));
        self.acme_wake.notify_one();
        Ok(())
    }

    pub fn challenge(&self, token: &str) -> Option<String> {
        self.challenges
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(token)
            .cloned()
    }
}

/// SIGHUP: reload the configuration, the certificates and the routing tables.
pub struct ReloadService(pub Arc<Shared>);

#[async_trait]
impl BackgroundService for ReloadService {
    async fn start(&self, mut shutdown: ShutdownWatch) {
        let Ok(mut hup) = signal(SignalKind::hangup()) else {
            tracing::error!("cannot install the SIGHUP handler; hot reload is off");
            return;
        };
        loop {
            tokio::select! {
                _ = hup.recv() => match self.0.reload() {
                    Ok(()) => tracing::info!(path = %self.0.path.display(), "configuration reloaded"),
                    Err(err) => tracing::error!(error = %format!("{err:#}"), "reload failed, keeping the running configuration"),
                },
                _ = shutdown.changed() => return,
            }
        }
    }
}

/// Upstream DNS refresh and cache zone sweeping.
pub struct MaintenanceService(pub Arc<Shared>);

#[async_trait]
impl BackgroundService for MaintenanceService {
    async fn start(&self, mut shutdown: ShutdownWatch) {
        let mut tick = tokio::time::interval(Duration::from_secs(5));
        let mut last_resolve = Instant::now();
        let mut last_sweep: HashMap<String, Instant> = HashMap::new();
        loop {
            tokio::select! {
                _ = tick.tick() => {}
                _ = shutdown.changed() => return,
            }
            let state = self.0.state.load_full();
            if last_resolve.elapsed() >= state.config.server.resolve_interval.0 {
                last_resolve = Instant::now();
                for pool in state.pools.values() {
                    for server in &pool.servers {
                        server.refresh();
                    }
                }
            }
            for zone in state.zones.values() {
                let due =
                    last_sweep.get(&zone.name).is_none_or(|at| at.elapsed() >= zone.sweep_interval);
                if !due {
                    continue;
                }
                last_sweep.insert(zone.name.clone(), Instant::now());
                let zone = Arc::clone(zone);
                if let Ok(stats) = tokio::task::spawn_blocking(move || {
                    let stats = zone.sweep(SystemTime::now());
                    (zone.name.clone(), stats)
                })
                .await
                {
                    tracing::debug!(zone = %stats.0, kept = stats.1.kept, removed = stats.1.removed, bytes = stats.1.bytes, "cache sweep");
                }
            }
        }
    }
}

/// Obtain and renew the certificates flagged `acme = true`.
pub struct AcmeService(pub Arc<Shared>);

#[async_trait]
impl BackgroundService for AcmeService {
    async fn start(&self, mut shutdown: ShutdownWatch) {
        loop {
            let interval = self
                .0
                .state
                .load()
                .config
                .acme
                .as_ref()
                .map_or(Duration::from_secs(3600), |a| a.check_interval.0);
            acme::run_cycle(&self.0).await;
            tokio::select! {
                () = tokio::time::sleep(interval) => {}
                () = self.0.acme_wake.notified() => {}
                _ = shutdown.changed() => return,
            }
        }
    }
}
