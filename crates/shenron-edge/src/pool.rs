// SPDX-License-Identifier: Apache-2.0
//! Upstream pools: smooth weighted round robin with passive health (nginx `max_fails` and
//! `fail_timeout`) and backup servers.

use std::net::{SocketAddr, ToSocketAddrs};
use std::sync::{Mutex, RwLock};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};

use crate::config::{PoolConfig, UpstreamConfig};

#[derive(Debug)]
pub struct Server {
    pub addr: String,
    pub label: String,
    pub weight: u32,
    pub backup: bool,
    pub tls: bool,
    pub sni: String,
    pub verify: bool,
    pub max_fails: u32,
    pub fail_timeout: Duration,
    resolved: RwLock<SocketAddr>,
}

#[derive(Debug, Default, Clone, Copy)]
struct Health {
    fails: u32,
    last_fail: Option<Instant>,
    current: i64,
}

#[derive(Debug)]
pub struct Pool {
    pub name: String,
    pub servers: Vec<Server>,
    pub connect_timeout: Duration,
    pub read_timeout: Duration,
    pub idle_timeout: Duration,
    health: Mutex<Vec<Health>>,
}

fn resolve(addr: &str) -> Result<SocketAddr> {
    addr.to_socket_addrs()
        .with_context(|| format!("resolving upstream `{addr}`"))?
        .next()
        .with_context(|| format!("upstream `{addr}` resolved to no address"))
}

fn host_of(addr: &str) -> &str {
    let host = addr.rsplit_once(':').map_or(addr, |(host, _)| host);
    host.trim_start_matches('[').trim_end_matches(']')
}

impl Server {
    fn build(cfg: &UpstreamConfig) -> Result<Self> {
        if cfg.weight == 0 {
            bail!("upstream `{}`: weight must be at least 1", cfg.addr);
        }
        Ok(Self {
            addr: cfg.addr.clone(),
            label: cfg.label.clone().unwrap_or_else(|| cfg.addr.clone()),
            weight: cfg.weight,
            backup: cfg.backup,
            tls: cfg.tls,
            sni: cfg.sni.clone().unwrap_or_else(|| host_of(&cfg.addr).to_owned()),
            verify: cfg.verify,
            max_fails: cfg.max_fails,
            fail_timeout: cfg.fail_timeout.0,
            resolved: RwLock::new(resolve(&cfg.addr)?),
        })
    }

    pub fn socket_addr(&self) -> SocketAddr {
        *self.resolved.read().unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    /// Re-resolve a named upstream; keeps the previous address when the lookup fails.
    pub fn refresh(&self) {
        if let Ok(addr) = resolve(&self.addr) {
            *self.resolved.write().unwrap_or_else(std::sync::PoisonError::into_inner) = addr;
        }
    }

    fn available(&self, health: &Health, now: Instant) -> bool {
        if self.max_fails == 0 || health.fails < self.max_fails {
            return true;
        }
        health.last_fail.is_none_or(|at| now.duration_since(at) >= self.fail_timeout)
    }
}

impl Pool {
    pub fn build(cfg: &PoolConfig) -> Result<Self> {
        let servers = cfg.servers.iter().map(Server::build).collect::<Result<Vec<_>>>()?;
        let health = Mutex::new(vec![Health::default(); servers.len()]);
        Ok(Self {
            name: cfg.name.clone(),
            servers,
            connect_timeout: cfg.connect_timeout.0,
            read_timeout: cfg.read_timeout.0,
            idle_timeout: cfg.idle_timeout.0,
            health,
        })
    }

    /// Pick the next server index, skipping the ones in `tried`. Primaries first; backups only when
    /// no primary is available; when everything is out of rotation, any untried server is used
    /// (nginx resets the failure counters in that case).
    pub fn pick(&self, tried: &[usize], now: Instant) -> Option<usize> {
        let mut health = self.health.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let untried: Vec<usize> = (0..self.servers.len()).filter(|i| !tried.contains(i)).collect();
        let healthy = |i: &usize| self.servers[*i].available(&health[*i], now);
        let mut candidates: Vec<usize> =
            untried.iter().copied().filter(|i| !self.servers[*i].backup && healthy(i)).collect();
        if candidates.is_empty() {
            candidates =
                untried.iter().copied().filter(|i| self.servers[*i].backup && healthy(i)).collect();
        }
        if candidates.is_empty() {
            candidates = untried;
        }
        let total: i64 = candidates.iter().map(|i| i64::from(self.servers[*i].weight)).sum();
        let mut best: Option<usize> = None;
        for &i in &candidates {
            health[i].current += i64::from(self.servers[i].weight);
            if best.is_none_or(|b| health[i].current > health[b].current) {
                best = Some(i);
            }
        }
        if let Some(b) = best {
            health[b].current -= total;
        }
        best
    }

    pub fn report_failure(&self, index: usize, now: Instant) {
        let mut health = self.health.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(slot) = health.get_mut(index) {
            let expired = slot
                .last_fail
                .is_some_and(|at| now.duration_since(at) >= self.servers[index].fail_timeout);
            slot.fails = if expired { 1 } else { slot.fails + 1 };
            slot.last_fail = Some(now);
        }
    }

    pub fn report_success(&self, index: usize) {
        let mut health = self.health.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(slot) = health.get_mut(index) {
            slot.fails = 0;
            slot.last_fail = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;

    fn pool(servers: &str) -> Pool {
        let text =
            format!("[server]\nhttp_listen=[\"127.0.0.1:1\"]\n[[pool]]\nname=\"p\"\n{servers}\n");
        let config = Config::parse(&text).unwrap();
        Pool::build(&config.pools[0]).unwrap()
    }

    #[test]
    fn weighted_round_robin_is_smooth() {
        let p = pool(
            "[[pool.server]]\naddr=\"127.0.0.1:1\"\nweight=3\n[[pool.server]]\naddr=\"127.0.0.1:2\"\nweight=1",
        );
        let now = Instant::now();
        let picks: Vec<usize> = (0..8).map(|_| p.pick(&[], now).unwrap()).collect();
        assert_eq!(picks.iter().filter(|i| **i == 0).count(), 6);
        assert_eq!(picks.iter().filter(|i| **i == 1).count(), 2);
        // Smooth: the light server is never picked twice in a row.
        assert!(picks.windows(2).all(|w| w != [1, 1]));
    }

    #[test]
    fn failed_server_leaves_rotation_until_fail_timeout() {
        let p = pool(
            "[[pool.server]]\naddr=\"127.0.0.1:1\"\nmax_fails=2\nfail_timeout=\"10s\"\n[[pool.server]]\naddr=\"127.0.0.1:2\"",
        );
        let t0 = Instant::now();
        p.report_failure(0, t0);
        assert!((0..4).any(|_| p.pick(&[], t0) == Some(0)), "one failure keeps it in rotation");
        p.report_failure(0, t0);
        assert!((0..6).all(|_| p.pick(&[], t0) == Some(1)), "two failures take it out");
        let later = t0 + Duration::from_secs(11);
        assert!((0..4).any(|_| p.pick(&[], later) == Some(0)), "back after fail_timeout");
        p.report_success(0);
        p.report_failure(0, later);
        assert!((0..4).any(|_| p.pick(&[], later) == Some(0)), "success reset the counter");
    }

    #[test]
    fn backup_only_when_primaries_are_down_and_tried_are_skipped() {
        let p = pool(
            "[[pool.server]]\naddr=\"127.0.0.1:1\"\nmax_fails=1\n[[pool.server]]\naddr=\"127.0.0.1:2\"\nbackup=true",
        );
        let now = Instant::now();
        assert_eq!(p.pick(&[], now), Some(0));
        p.report_failure(0, now);
        assert_eq!(p.pick(&[], now), Some(1));
        assert_eq!(p.pick(&[1], now), Some(0), "everything down: untried server anyway");
        assert_eq!(p.pick(&[0, 1], now), None);
    }
}
