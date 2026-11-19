// SPDX-License-Identifier: Apache-2.0
//! Assemble the Pingora server from the configuration file.

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Result;
use pingora::listeners::tls::TlsSettings;
use pingora::prelude::*;
use pingora::server::configuration::ServerConf;
use pingora::services::background::background_service;

use crate::proxy::EdgeProxy;
use crate::runtime::{AcmeService, MaintenanceService, ReloadService, Shared};

/// Parse and compile the configuration without binding anything (`--check`).
pub fn check(path: PathBuf) -> Result<()> {
    Shared::load(path).map(|_| ())
}

/// Start the edge; returns only on error, a graceful stop exits the process.
pub fn run(path: PathBuf) -> Result<()> {
    let shared = Shared::load(path)?;
    let config = shared.state.load().config.clone();

    let mut conf = ServerConf::default();
    if config.server.threads > 0 {
        conf.threads = config.server.threads;
    }
    let mut server = Server::new_with_opt_and_conf(None::<Opt>, conf);
    server.bootstrap();

    let mut proxy =
        http_proxy_service(&server.configuration, EdgeProxy { shared: Arc::clone(&shared) });
    for addr in &config.server.http_listen {
        proxy.add_tcp(addr);
    }
    if !config.server.https_listen.is_empty() {
        for addr in &config.server.https_listen {
            let mut tls = TlsSettings::intermediate("", "")?;
            let resolver: Arc<dyn rustls::server::ResolvesServerCert> = shared.certs.clone();
            tls.set_cert_resolver(resolver);
            tls.enable_h2();
            proxy.add_tls_with_settings(addr, None, tls);
        }
    }
    server.add_service(proxy);
    server.add_service(background_service("reload", ReloadService(Arc::clone(&shared))));
    server.add_service(background_service("maintenance", MaintenanceService(Arc::clone(&shared))));
    if config.acme.is_some() {
        server.add_service(background_service("acme", AcmeService(Arc::clone(&shared))));
    }
    tracing::info!(
        http = ?config.server.http_listen,
        https = ?config.server.https_listen,
        certificates = shared.certs.count(),
        "shenron-edge started"
    );
    server.run_forever()
}
