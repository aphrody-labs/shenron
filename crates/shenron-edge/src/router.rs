// SPDX-License-Identifier: Apache-2.0
//! Host and path routing: virtual hosts by `Host`, then the first matching route in file order.

use std::collections::HashMap;
use std::sync::Arc;

use anyhow::{Context, Result};
use regex::{Regex, RegexBuilder};

use crate::cache::{ValidTtl, Zone};
use crate::config::{RouteCacheConfig, RouteConfig, VhostConfig};
use crate::pool::Pool;

#[derive(Debug)]
pub enum Matcher {
    Any,
    Exact(String),
    Prefix(String),
    Regex(Regex),
}

impl Matcher {
    pub fn matches(&self, path: &str) -> bool {
        match self {
            Self::Any => true,
            Self::Exact(p) => p == path,
            Self::Prefix(p) => path.starts_with(p.as_str()),
            Self::Regex(r) => r.is_match(path),
        }
    }
}

pub struct RouteCache {
    pub zone: Arc<Zone>,
    pub cfg: RouteCacheConfig,
    pub valid: Vec<ValidTtl>,
}

impl RouteCache {
    pub fn allows_stale(&self, condition: &str) -> bool {
        self.cfg.use_stale.iter().any(|c| c == condition)
    }
}

pub struct Route {
    pub matcher: Matcher,
    pub cfg: RouteConfig,
    pub pool: Arc<Pool>,
    pub cache: Option<RouteCache>,
}

pub struct Vhost {
    pub cfg: VhostConfig,
    pub routes: Vec<Arc<Route>>,
}

impl Vhost {
    pub fn route(&self, path: &str) -> Option<&Arc<Route>> {
        self.routes.iter().find(|r| r.matcher.matches(path))
    }
}

#[derive(Default)]
pub struct Router {
    exact: HashMap<String, Arc<Vhost>>,
    wildcard: Vec<(String, Arc<Vhost>)>,
}

/// Host header without port and without the trailing dot, lowercased.
pub fn normalize_host(raw: &str) -> String {
    let raw = raw.trim();
    let host = if let Some(rest) = raw.strip_prefix('[') {
        rest.split(']').next().unwrap_or(rest)
    } else {
        raw.rsplit_once(':')
            .filter(|(_, port)| port.bytes().all(|b| b.is_ascii_digit()))
            .map_or(raw, |(h, _)| h)
    };
    host.trim_end_matches('.').to_ascii_lowercase()
}

impl Router {
    pub fn build(
        vhosts: &[VhostConfig],
        pools: &HashMap<String, Arc<Pool>>,
        zones: &HashMap<String, Arc<Zone>>,
    ) -> Result<Self> {
        let mut router = Self::default();
        for cfg in vhosts {
            let routes = cfg
                .routes
                .iter()
                .map(|r| build_route(r, pools, zones))
                .collect::<Result<Vec<_>>>()?;
            let vhost = Arc::new(Vhost { cfg: cfg.clone(), routes });
            for name in &cfg.names {
                let name = name.to_ascii_lowercase();
                match name.strip_prefix("*.") {
                    Some(suffix) => {
                        router.wildcard.push((format!(".{suffix}"), Arc::clone(&vhost)))
                    },
                    None => {
                        router.exact.entry(name).or_insert_with(|| Arc::clone(&vhost));
                    },
                }
            }
        }
        Ok(router)
    }

    pub fn find(&self, host: &str) -> Option<&Arc<Vhost>> {
        self.exact.get(host).or_else(|| {
            self.wildcard.iter().find(|(suffix, _)| host.ends_with(suffix.as_str())).map(|(_, v)| v)
        })
    }
}

fn build_route(
    cfg: &RouteConfig,
    pools: &HashMap<String, Arc<Pool>>,
    zones: &HashMap<String, Arc<Zone>>,
) -> Result<Arc<Route>> {
    let matcher = if let Some(p) = &cfg.prefix {
        Matcher::Prefix(p.clone())
    } else if let Some(p) = &cfg.exact {
        Matcher::Exact(p.clone())
    } else if let Some(p) = &cfg.regex {
        Matcher::Regex(
            RegexBuilder::new(p)
                .case_insensitive(cfg.ignore_case)
                .build()
                .with_context(|| format!("route regex `{p}`"))?,
        )
    } else {
        Matcher::Any
    };
    let pool = pools.get(&cfg.pool).with_context(|| format!("unknown pool `{}`", cfg.pool))?;
    let cache = cfg
        .cache
        .as_ref()
        .map(|c| {
            let zone =
                zones.get(&c.zone).with_context(|| format!("unknown cache zone `{}`", c.zone))?;
            Ok::<_, anyhow::Error>(RouteCache {
                zone: Arc::clone(zone),
                valid: c
                    .valid
                    .iter()
                    .map(|v| ValidTtl { status: v.status.clone(), ttl: v.ttl.0 })
                    .collect(),
                cfg: c.clone(),
            })
        })
        .transpose()?;
    Ok(Arc::new(Route { matcher, cfg: cfg.clone(), pool: Arc::clone(pool), cache }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hosts_are_normalized() {
        assert_eq!(normalize_host("DragonBallFR.com:443"), "dragonballfr.com");
        assert_eq!(normalize_host("[::1]:8443"), "::1");
        assert_eq!(normalize_host("a.test."), "a.test");
        assert_eq!(normalize_host("a.test"), "a.test");
    }

    #[test]
    fn matchers_follow_file_order_semantics() {
        let regex = Matcher::Regex(
            RegexBuilder::new("^/(assets|db|media|banners|og|fonts)/")
                .case_insensitive(true)
                .build()
                .unwrap(),
        );
        assert!(regex.matches("/Media/x.png"));
        assert!(!regex.matches("/api/media/x"));
        assert!(Matcher::Prefix("/_next/static/".into()).matches("/_next/static/a.js"));
        assert!(Matcher::Exact("/_next/image".into()).matches("/_next/image"));
        assert!(!Matcher::Exact("/_next/image".into()).matches("/_next/image/x"));
        assert!(Matcher::Any.matches("/anything"));
    }
}
