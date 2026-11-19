// SPDX-License-Identifier: Apache-2.0
//! mTLS status and trigger API. Every connection must present a client certificate signed by
//! `api.client_ca`; there is no other authentication and no shell.

use std::sync::Arc;

use anyhow::{Context, Result};
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_server::tls_rustls::RustlsConfig;
use rustls::RootCertStore;
use rustls::pki_types::pem::PemObject;
use rustls::pki_types::{CertificateDer, PrivateKeyDer};
use rustls::server::WebPkiClientVerifier;
use serde::Deserialize;
use serde_json::json;
use tokio::sync::watch;

use crate::agent::Agent;
use crate::config::ApiConfig;

pub fn router(agent: Arc<Agent>) -> Router {
    Router::new()
        .route("/v1/status", get(status))
        .route("/v1/services/{name}", get(service))
        .route("/v1/services/{name}/check", post(check))
        .route("/v1/services/{name}/rollback", post(rollback))
        .route("/v1/services/{name}/deploy", post(deploy))
        .with_state(agent)
}

pub fn tls_config(cfg: &ApiConfig) -> Result<rustls::ServerConfig> {
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let certs = CertificateDer::pem_file_iter(&cfg.cert)
        .with_context(|| format!("read {}", cfg.cert.display()))?
        .collect::<Result<Vec<_>, _>>()?;
    let key = PrivateKeyDer::from_pem_file(&cfg.key).with_context(|| format!("read {}", cfg.key.display()))?;
    let mut roots = RootCertStore::empty();
    for ca in CertificateDer::pem_file_iter(&cfg.client_ca).with_context(|| format!("read {}", cfg.client_ca.display()))? {
        roots.add(ca?)?;
    }
    let verifier = WebPkiClientVerifier::builder_with_provider(Arc::new(roots), provider.clone()).build()?;
    let mut config = rustls::ServerConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()?
        .with_client_cert_verifier(verifier)
        .with_single_cert(certs, key)?;
    config.alpn_protocols = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
    Ok(config)
}

/// Serves the API until `shutdown` flips to true.
pub async fn serve(agent: Arc<Agent>, cfg: &ApiConfig, mut shutdown: watch::Receiver<bool>) -> Result<()> {
    let tls = RustlsConfig::from_config(Arc::new(tls_config(cfg)?));
    let handle = axum_server::Handle::new();
    let h = handle.clone();
    tokio::spawn(async move {
        let _ = shutdown.wait_for(|stop| *stop).await;
        h.graceful_shutdown(Some(std::time::Duration::from_secs(10)));
    });
    tracing::info!(listen = %cfg.listen, "mTLS API listening");
    axum_server::bind_rustls(cfg.listen, tls).handle(handle).serve(router(agent).into_make_service()).await?;
    Ok(())
}

struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

fn not_found(name: &str) -> ApiError {
    ApiError(StatusCode::NOT_FOUND, format!("service {name:?} is not managed by this agent"))
}

fn failure(e: anyhow::Error) -> ApiError {
    ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{e:#}"))
}

async fn status(State(agent): State<Arc<Agent>>) -> Json<serde_json::Value> {
    Json(json!({ "agent": env!("CARGO_PKG_VERSION"), "services": agent.snapshot() }))
}

async fn service(State(agent): State<Arc<Agent>>, Path(name): Path<String>) -> Result<Json<serde_json::Value>, ApiError> {
    let rt = agent.service(&name).ok_or_else(|| not_found(&name))?;
    Ok(Json(json!(rt.snapshot())))
}

#[derive(Deserialize, Default)]
struct CheckQuery {
    /// Run the check inside the request and return its outcome (default: queue it and answer 202).
    #[serde(default)]
    wait: bool,
    #[serde(default)]
    force: bool,
}

async fn check(State(agent): State<Arc<Agent>>, Path(name): Path<String>, Query(q): Query<CheckQuery>) -> Result<Response, ApiError> {
    let rt = agent.service(&name).ok_or_else(|| not_found(&name))?;
    if q.wait || q.force {
        let outcome = agent.check(&name, q.force).await.map_err(failure)?;
        return Ok(Json(outcome).into_response());
    }
    rt.notify.notify_one();
    Ok((StatusCode::ACCEPTED, Json(json!({ "queued": true }))).into_response())
}

async fn rollback(State(agent): State<Arc<Agent>>, Path(name): Path<String>) -> Result<Response, ApiError> {
    agent.service(&name).ok_or_else(|| not_found(&name))?;
    Ok(Json(agent.rollback(&name).await.map_err(failure)?).into_response())
}

#[derive(Deserialize)]
struct DeployBody {
    version: String,
}

async fn deploy(State(agent): State<Arc<Agent>>, Path(name): Path<String>, Json(body): Json<DeployBody>) -> Result<Response, ApiError> {
    agent.service(&name).ok_or_else(|| not_found(&name))?;
    Ok(Json(agent.deploy_version(&name, &body.version).await.map_err(failure)?).into_response())
}
