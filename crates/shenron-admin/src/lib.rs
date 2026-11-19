//! The admin. service: authenticated panel API over the site and bot, plus the static Rust web build.
pub mod auth;
pub mod panels;

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value, json};
use tower_http::services::{ServeDir, ServeFile};

use crate::auth::Principal;
use crate::panels::{Panel, Upstream};

#[derive(Clone, Debug)]
pub struct Config {
    pub site_url: String,
    pub bot_url: String,
    pub auth_url: Option<String>,
    pub admin_token: Option<String>,
    pub admin_roles: Vec<String>,
    pub allowed_origins: Vec<String>,
    pub panels_dir: Option<PathBuf>,
    pub web_dir: Option<PathBuf>,
}

impl Config {
    /// Reads `SHENRON_*` variables; secrets are read, never logged.
    pub fn from_env() -> Self {
        let var = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
        let list = |k: &str, default: &str| -> Vec<String> {
            var(k)
                .unwrap_or_else(|| default.to_string())
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        };
        Self {
            site_url: var("SHENRON_SITE_URL").unwrap_or_else(|| "http://127.0.0.1:5011".into()),
            bot_url: var("SHENRON_BOT_URL").unwrap_or_else(|| "http://127.0.0.1:5006".into()),
            auth_url: var("SHENRON_AUTH_URL"),
            admin_token: var("SHENRON_ADMIN_TOKEN"),
            admin_roles: list("SHENRON_ADMIN_ROLES", "admin"),
            allowed_origins: list("SHENRON_ADMIN_UPSTREAMS", ""),
            panels_dir: var("SHENRON_ADMIN_PANELS_DIR").map(PathBuf::from),
            web_dir: var("SHENRON_ADMIN_WEB_DIR").map(PathBuf::from),
        }
    }
}

pub struct AppState {
    config: Config,
    panels: Vec<Panel>,
    http: reqwest::Client,
}

pub type Shared = Arc<AppState>;

pub fn build_state(config: Config) -> anyhow::Result<Shared> {
    rustls::crypto::ring::default_provider().install_default().ok();
    let mut panels = panels::builtin_panels();
    if let Some(dir) = &config.panels_dir {
        let taken: HashSet<String> = panels.iter().map(|p| p.id.clone()).collect();
        panels.extend(panels::load_plugin_panels(dir, &taken, &config.allowed_origins));
    }
    let http = reqwest::Client::builder().timeout(Duration::from_secs(15)).build()?;
    Ok(Arc::new(AppState { config, panels, http }))
}

pub fn router(state: Shared) -> Router {
    let api = Router::new()
        .route("/api/health", get(health))
        .route("/api/me", get(me))
        .route("/api/panels", get(list_panels))
        .route("/api/panels/{id}", get(read_panel))
        .with_state(state.clone());
    match &state.config.web_dir {
        Some(dir) => {
            let index = dir.join("index.html");
            api.fallback_service(ServeDir::new(dir).fallback(ServeFile::new(index)))
        },
        None => api,
    }
}

fn error(status: StatusCode, message: &str) -> Response {
    (status, Json(json!({ "error": message }))).into_response()
}

async fn authenticate(state: &AppState, headers: &HeaderMap) -> Result<Principal, StatusCode> {
    if auth::static_token_ok(state.config.admin_token.as_deref(), headers) {
        return Ok(Principal::Token);
    }
    let Some(issuer) = state.config.auth_url.as_deref() else {
        return Err(StatusCode::UNAUTHORIZED);
    };
    let mut request =
        state.http.get(format!("{}/api/auth/get-session", issuer.trim_end_matches('/')));
    for name in [header::AUTHORIZATION, header::COOKIE] {
        if let Some(value) = headers.get(&name) {
            request = request.header(name, value);
        }
    }
    let payload: Value = match request.send().await {
        Ok(r) if r.status().is_success() => r.json().await.unwrap_or(Value::Null),
        _ => Value::Null,
    };
    auth::session_principal(&payload, &state.config.admin_roles).ok_or(StatusCode::UNAUTHORIZED)
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true, "service": "shenron-admin" }))
}

async fn me(State(state): State<Shared>, headers: HeaderMap) -> Response {
    match authenticate(&state, &headers).await {
        Ok(principal) => Json(principal).into_response(),
        Err(status) => error(status, "unauthorized"),
    }
}

async fn list_panels(State(state): State<Shared>, headers: HeaderMap) -> Response {
    if let Err(status) = authenticate(&state, &headers).await {
        return error(status, "unauthorized");
    }
    let listing: Vec<Value> = state
        .panels
        .iter()
        .map(|p| json!({ "id": p.id, "title": p.title, "group": p.group, "source": p.source }))
        .collect();
    Json(listing).into_response()
}

async fn read_panel(
    State(state): State<Shared>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Response {
    if let Err(status) = authenticate(&state, &headers).await {
        return error(status, "unauthorized");
    }
    let Some(panel) = state.panels.iter().find(|p| p.id == id) else {
        return error(StatusCode::NOT_FOUND, "unknown panel");
    };
    let base = match &panel.upstream {
        Upstream::Site => state.config.site_url.clone(),
        Upstream::Bot => state.config.bot_url.clone(),
        Upstream::Url(base) => base.clone(),
    };
    let mut request = state.http.get(format!("{}{}", base.trim_end_matches('/'), panel.path));
    // The caller's own credentials travel to the upstream, which applies its own authorization.
    for name in [header::AUTHORIZATION, header::COOKIE] {
        if let Some(value) = headers.get(&name) {
            request = request.header(name, value);
        }
    }
    match request.send().await {
        Ok(upstream) => {
            let status =
                StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
            let data: Value = upstream.json().await.unwrap_or(Value::Null);
            (status, Json(json!({ "panel": panel.id, "status": status.as_u16(), "data": data })))
                .into_response()
        },
        Err(e) => {
            tracing::warn!(panel = %panel.id, error = %e, "upstream unreachable");
            error(StatusCode::BAD_GATEWAY, "upstream unreachable")
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::Request;
    use tower::ServiceExt;

    fn fixture_token() -> String {
        ["fixture", "value", "only", "not-real"].join("-")
    }

    fn app() -> Router {
        let config = Config {
            site_url: "http://127.0.0.1:1".into(),
            bot_url: "http://127.0.0.1:1".into(),
            auth_url: None,
            admin_token: Some(fixture_token()),
            admin_roles: vec!["admin".into()],
            allowed_origins: vec![],
            panels_dir: None,
            web_dir: None,
        };
        router(build_state(config).unwrap())
    }

    async fn get_with(path: &str, token: Option<&str>) -> (StatusCode, Value) {
        let mut req = Request::builder().uri(path);
        if let Some(t) = token {
            req = req.header(header::AUTHORIZATION, format!("Bearer {t}"));
        }
        let res = app().oneshot(req.body(Body::empty()).unwrap()).await.unwrap();
        let status = res.status();
        let bytes = axum::body::to_bytes(res.into_body(), 1 << 20).await.unwrap();
        (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
    }

    #[tokio::test]
    async fn health_is_open_and_panels_are_closed() {
        assert_eq!(get_with("/api/health", None).await.0, StatusCode::OK);
        assert_eq!(get_with("/api/panels", None).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(
            get_with("/api/panels", Some("wrong-wrong-wrong-")).await.0,
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn token_lists_builtin_panels_and_reports_unreachable_upstream() {
        let (status, body) = get_with("/api/panels", Some(&fixture_token())).await;
        assert_eq!(status, StatusCode::OK);
        assert!(body.as_array().unwrap().iter().any(|p| p["id"] == "overview"));
        let (status, _) = get_with("/api/panels/overview", Some(&fixture_token())).await;
        assert_eq!(status, StatusCode::BAD_GATEWAY);
        assert_eq!(
            get_with("/api/panels/nope", Some(&fixture_token())).await.0,
            StatusCode::NOT_FOUND
        );
    }
}
