// SPDX-License-Identifier: Apache-2.0
//! Discovery of the local model endpoints (chat, embeddings, rerank) named by the
//! `SHENRON_AI_*` environment contract. Readiness is a loopback TCP probe of the endpoint.

use std::{net::ToSocketAddrs as _, time::Duration};

use shenron_rag::ai_env;

/// What a local endpoint serves.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    /// Chat completions.
    Chat,
    /// Embeddings.
    Embed,
    /// Reranking.
    Rerank,
}

/// A configured local endpoint.
#[derive(Debug, Clone)]
pub struct Running {
    /// The endpoint accepts connections.
    pub ready: bool,
    /// Model id served.
    pub alias: String,
    /// Loopback port.
    pub port: u16,
    base: String,
}

impl Running {
    /// OpenAI root of the endpoint.
    #[must_use]
    pub fn base_url(&self) -> String {
        self.base.clone()
    }
}

/// The endpoint of `role` from the environment, `None` when none is configured.
#[must_use]
pub fn discover_running(role: Role) -> Option<Running> {
    let (url, model) = match role {
        Role::Chat => (ai_env::CHAT_BASE_URL.resolve(), ai_env::CHAT_MODEL.resolve()),
        Role::Embed => (ai_env::EMBED_BASE_URL.resolve(), ai_env::EMBED_MODEL.resolve()),
        Role::Rerank => (ai_env::RERANK_BASE_URL.resolve(), ai_env::RERANK_MODEL.resolve()),
    };
    let base = url?.trim_end_matches('/').to_owned();
    let authority = base.split_once("://").map_or(base.as_str(), |(_, rest)| rest);
    let authority = authority.split('/').next().unwrap_or(authority);
    let port = authority.rsplit_once(':').and_then(|(_, port)| port.parse().ok()).unwrap_or(80);
    let ready =
        authority.to_socket_addrs().ok().and_then(|mut addrs| addrs.next()).is_some_and(|addr| {
            std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok()
        });
    Some(Running { ready, alias: model.unwrap_or_else(|| "local".to_owned()), port, base })
}
