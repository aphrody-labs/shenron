//! tv.: HTTP API (v1) over the video library, ingest queue and HLS files.
mod db;
mod ingest;

use axum::{
    Json, Router,
    body::Body,
    extract::{Path as UrlPath, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{Html, IntoResponse, Response},
    routing::get,
};
use db::Db;
use std::{
    path::PathBuf,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::Semaphore;

pub struct Config {
    pub data: PathBuf,
    pub ffmpeg: String,
    pub ffprobe: String,
    pub ytdlp: String,
    pub ffmpeg_threads: usize,
    pub max_filesize: String,
    pub token: Option<String>,
    pub slots: Semaphore,
}

fn env(k: &str, d: &str) -> String {
    std::env::var(k).ok().filter(|v| !v.is_empty()).unwrap_or_else(|| d.to_string())
}

#[derive(Clone)]
struct App {
    cfg: Arc<Config>,
    db: Arc<Db>,
}

const PLAYER: &str = include_str!("../assets/player.html");
const HLS_JS: &[u8] = include_bytes!("../assets/hls.min.js");

fn err(code: StatusCode, msg: &str) -> Response {
    (code, Json(serde_json::json!({ "error": msg }))).into_response()
}

async fn health(State(a): State<App>) -> Json<serde_json::Value> {
    Json(
        serde_json::json!({ "status": "ok", "service": "shenron-tv", "videos": a.db.list().len() }),
    )
}

async fn list(State(a): State<App>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "videos": a.db.list() }))
}

async fn one(State(a): State<App>, UrlPath(id): UrlPath<String>) -> Response {
    match a.db.get(&id) {
        Some(v) => Json(v).into_response(),
        None => err(StatusCode::NOT_FOUND, "unknown video"),
    }
}

#[derive(serde::Deserialize)]
struct NewVideo {
    url: String,
    title: Option<String>,
}

async fn create(State(a): State<App>, headers: HeaderMap, Json(req): Json<NewVideo>) -> Response {
    let Some(expected) = a.cfg.token.as_deref() else {
        return err(StatusCode::FORBIDDEN, "ingest disabled: SHENRON_TV_TOKEN is not set");
    };
    let given = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    if given != Some(expected) {
        return err(StatusCode::UNAUTHORIZED, "bad token");
    }
    if !(req.url.starts_with("https://") || req.url.starts_with("http://"))
        || req.url.len() > 2048
        || req.url.chars().any(char::is_whitespace)
    {
        return err(StatusCode::BAD_REQUEST, "url must be a single http(s) URL");
    }
    let id = uuid::Uuid::now_v7().to_string();
    let title =
        req.title.clone().filter(|t| !t.trim().is_empty()).unwrap_or_else(|| req.url.clone());
    let now = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs() as i64);
    if let Err(e) = a.db.insert(&id, &title, &req.url, now) {
        return err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string());
    }
    tokio::spawn(ingest::job(a.cfg.clone(), a.db.clone(), id.clone(), req.url, req.title));
    (StatusCode::ACCEPTED, Json(serde_json::json!({ "id": id, "status": "queued" })))
        .into_response()
}

fn safe(part: &str) -> bool {
    !part.is_empty()
        && part.len() < 96
        && part.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))
        && !part.starts_with('.')
}

async fn hls(State(a): State<App>, UrlPath((id, file)): UrlPath<(String, String)>) -> Response {
    if !safe(&id) || !safe(&file) {
        return err(StatusCode::BAD_REQUEST, "bad path");
    }
    let ctype = match file.rsplit('.').next() {
        Some("m3u8") => "application/vnd.apple.mpegurl",
        Some("ts") => "video/mp2t",
        Some("jpg") => "image/jpeg",
        _ => return err(StatusCode::NOT_FOUND, "not found"),
    };
    match tokio::fs::read(a.cfg.data.join("hls").join(&id).join(&file)).await {
        Ok(bytes) => {
            let cache = if ctype == "application/vnd.apple.mpegurl" {
                "no-cache"
            } else {
                "public, max-age=31536000, immutable"
            };
            let mut r = Response::new(Body::from(bytes));
            r.headers_mut().insert(header::CONTENT_TYPE, HeaderValue::from_static(ctype));
            r.headers_mut().insert(header::CACHE_CONTROL, HeaderValue::from_static(cache));
            r.headers_mut()
                .insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
            r
        },
        Err(_) => err(StatusCode::NOT_FOUND, "not found"),
    }
}

async fn page() -> Html<&'static str> {
    Html(PLAYER)
}

async fn hls_js() -> Response {
    (
        [
            (header::CONTENT_TYPE, "text/javascript"),
            (header::CACHE_CONTROL, "public, max-age=86400"),
        ],
        HLS_JS,
    )
        .into_response()
}

fn router(app: App) -> Router {
    Router::new()
        .route("/", get(page))
        .route("/assets/hls.min.js", get(hls_js))
        .route("/health", get(health))
        .route("/healthz", get(health))
        .route("/api/v1/videos", get(list).post(create))
        .route("/api/v1/videos/{id}", get(one))
        .route("/hls/{id}/{file}", get(hls))
        .with_state(app)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();
    let data = PathBuf::from(env("SHENRON_TV_DATA", "/var/lib/shenron-tv"));
    std::fs::create_dir_all(&data)?;
    let cfg = Arc::new(Config {
        ffmpeg: env("SHENRON_TV_FFMPEG", "ffmpeg"),
        ffprobe: env("SHENRON_TV_FFPROBE", "ffprobe"),
        ytdlp: env("SHENRON_TV_YTDLP", "yt-dlp"),
        ffmpeg_threads: env("SHENRON_TV_THREADS", "2").parse().unwrap_or(2),
        max_filesize: env("SHENRON_TV_MAX_FILESIZE", "2G"),
        token: std::env::var("SHENRON_TV_TOKEN").ok().filter(|t| !t.is_empty()),
        slots: Semaphore::new(env("SHENRON_TV_JOBS", "1").parse().unwrap_or(1)),
        data: data.clone(),
    });
    let db = Arc::new(Db::open(&data.join("library.db"))?);
    let bind = env("SHENRON_TV_BIND", "127.0.0.1:8793");
    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!(%bind, "shenron-tv listening");
    axum::serve(listener, router(App { cfg, db }))
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        let mut term = signal(SignalKind::terminate()).expect("SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    }
    #[cfg(not(unix))]
    let _ = tokio::signal::ctrl_c().await;
}

#[cfg(test)]
mod tests {
    use super::safe;
    #[test]
    fn path_parts_are_strict() {
        assert!(safe("master.m3u8") && safe("v0_00001.ts"));
        assert!(!safe("..") && !safe(".hidden") && !safe("a/b") && !safe(""));
    }
}
