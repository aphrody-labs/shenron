// SPDX-License-Identifier: Apache-2.0
//! The Shenron HTTP contract served by Rust (Axum), one route group at a time.
//!
//! The contract is the zod catalogue of `packages/api/src/contract` exported as
//! `packages/api/openapi/public.json`. Each group ported here answers byte-for-byte the same JSON as
//! the TypeScript host (`createShenronApi`): both replay the golden HTTP cases of
//! `data/api/fixtures/*.json` (`tests/parity.rs`, `packages/api/test/rust-parity.test.ts`), and every
//! operation listed in [`OPERATIONS`] must exist in the OpenAPI document (`tests/contract.rs`).
//! Migration ledger and ratchet: `migration/rust.toml`, `cargo run -p shenron-migrate -- check`.

mod http;
mod lexicon;

use axum::{
    Json, Router,
    http::header::CACHE_CONTROL,
    response::{IntoResponse, Response},
    routing::get,
};
use serde_json::json;
use shenron_lexicon::Lexicon;

/// Operations of the contract this crate serves, as `(method, OpenAPI path)`.
pub const OPERATIONS: &[(&str, &str)] = &[
    ("get", "/health"),
    ("get", "/api/health"),
    ("get", "/api/public/lexicon"),
    ("get", "/api/public/lexicon/{idOrForm}"),
];

/// Capabilities behind the routes; a group whose capability is absent is not mounted.
#[derive(Clone, Copy)]
pub struct Ports {
    pub lexicon: Option<&'static Lexicon>,
}

impl Default for Ports {
    /// The embedded lexicon (`data/lexicon/terms.json`).
    fn default() -> Self {
        Self { lexicon: Some(Lexicon::embedded()) }
    }
}

/// The router of every ported group.
pub fn router(ports: Ports) -> Router {
    // `/health` is cached briefly by the edge; `/api/health` never is.
    let health = |policy: String| move || std::future::ready(ok(&policy));
    let mut app = Router::new()
        .route("/health", get(health(http::public_cache(5))))
        .route("/api/health", get(health("no-store".into())));
    if let Some(lexicon) = ports.lexicon {
        app = app.merge(lexicon::routes(lexicon));
    }
    app
}

fn ok(policy: &str) -> Response {
    ([(CACHE_CONTROL, policy.to_owned())], Json(json!({ "status": "ok" }))).into_response()
}
