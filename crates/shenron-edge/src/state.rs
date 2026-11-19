// SPDX-License-Identifier: Apache-2.0
//! The compiled configuration one request works against. A reload builds a new `State` and swaps
//! it in; requests already running keep the one they started with.

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;

use anyhow::{Context, Result};
use ipnet::IpNet;

use crate::cache::Zone;
use crate::config::Config;
use crate::pool::Pool;
use crate::router::Router;

pub struct State {
    pub config: Config,
    pub router: Router,
    pub pools: HashMap<String, Arc<Pool>>,
    pub zones: HashMap<String, Arc<Zone>>,
    pub trusted: Vec<IpNet>,
}

impl State {
    pub fn build(config: Config) -> Result<Self> {
        let pools = config
            .pools
            .iter()
            .map(|p| Ok((p.name.clone(), Arc::new(Pool::build(p)?))))
            .collect::<Result<HashMap<_, _>>>()?;
        let zones = config
            .caches
            .iter()
            .map(|z| Ok((z.name.clone(), Arc::new(Zone::new(z)?))))
            .collect::<Result<HashMap<_, _>>>()?;
        let router = Router::build(&config.vhosts, &pools, &zones)?;
        let trusted = config
            .server
            .trusted_proxies
            .iter()
            .map(|c| {
                c.parse::<IpNet>()
                    .or_else(|_| c.parse::<IpAddr>().map(IpNet::from))
                    .with_context(|| format!("trusted_proxies entry `{c}`"))
            })
            .collect::<Result<Vec<_>>>()?;
        Ok(Self { config, router, pools, zones, trusted })
    }

    pub fn is_trusted(&self, ip: IpAddr) -> bool {
        self.trusted.iter().any(|net| net.contains(&ip))
    }
}
