// SPDX-License-Identifier: Apache-2.0
//! Streamable HTTP transport (MCP 2025-06-18+) for remote clients such as the Claude and
//! Gemini web apps' custom connectors.
//!
//! - `POST|GET|DELETE /mcp`: the MCP endpoint (public server: read-only tools only).
//! - `GET /health`: liveness.
//! - `GET /.well-known/mcp.json`: discovery card (name, endpoint, transport, tools).
//!
//! Inbound `Host` headers are checked against `SHENRON_MCP_ALLOWED_HOSTS`
//! (comma-separated; loopback and dragonballfr.com by default) to stop DNS rebinding.

use std::{net::SocketAddr, time::Duration};

use axum::{Json, Router, routing::get};
use rmcp::transport::streamable_http_server::{
    StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
};

use crate::ShenronMcp;

/// Hosts accepted by default (loopback for local use, the public site behind its proxy).
pub const DEFAULT_ALLOWED_HOSTS: &[&str] =
    &["localhost", "127.0.0.1", "[::1]", "dragonballfr.com", "mcp.dragonballfr.com"];

fn allowed_hosts() -> Vec<String> {
    std::env::var("SHENRON_MCP_ALLOWED_HOSTS")
        .ok()
        .map(|value| {
            value.split(',').map(str::trim).filter(|v| !v.is_empty()).map(str::to_owned).collect()
        })
        .filter(|hosts: &Vec<String>| !hosts.is_empty())
        .unwrap_or_else(|| DEFAULT_ALLOWED_HOSTS.iter().map(|host| (*host).to_owned()).collect())
}

/// The HTTP application serving `server`.
pub fn app(server: ShenronMcp) -> Router {
    let mut config = StreamableHttpServerConfig::default();
    config.allowed_hosts = allowed_hosts();
    config.json_response = true;
    config.sse_keep_alive = Some(Duration::from_secs(15));
    let service = StreamableHttpService::new(
        move || Ok(server),
        LocalSessionManager::default().into(),
        config,
    );
    let tools: Vec<String> = if server == ShenronMcp::public() {
        ShenronMcp::public_tools().list_all().into_iter().map(|t| t.name.to_string()).collect()
    } else {
        ShenronMcp::all_tools().list_all().into_iter().map(|t| t.name.to_string()).collect()
    };
    let card = serde_json::json!({
        "name": "shenron-mcp",
        "title": "Shenron — Dragon Ball FR",
        "description": "Connaissance Dragon Ball de dragonballfr.com : recherche RAG sourcée, wiki, manga, databooks, chronologie, canon.",
        "version": env!("CARGO_PKG_VERSION"),
        "endpoint": "/mcp",
        "transport": "streamable-http",
        "authentication": "none",
        "public": server == ShenronMcp::public(),
        "tools": tools,
    });
    Router::new()
        .nest_service("/mcp", service)
        .route("/health", get(|| async { "ok" }))
        .route("/.well-known/mcp.json", get(move || std::future::ready(Json(card.clone()))))
        .layer(tower_http::cors::CorsLayer::permissive())
        .layer(tower_http::limit::RequestBodyLimitLayer::new(1 << 20))
}

/// Serve `server` on `bind` until the process stops.
pub async fn serve(bind: SocketAddr, server: ShenronMcp) -> std::io::Result<()> {
    let listener = tokio::net::TcpListener::bind(bind).await?;
    tracing::info!(address = %listener.local_addr()?, public = server == ShenronMcp::public(), "shenron-mcp Streamable HTTP");
    axum::serve(listener, app(server)).await
}
