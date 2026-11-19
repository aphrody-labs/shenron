// SPDX-License-Identifier: Apache-2.0
//! Local chat models (ABI 4) on upstream llama.cpp's `llama-server`.
//!
//! - provisioning: model files named by `file:<path>`, an `https://` URL, `hf:<repo>/<file>` or a
//!   built-in id are made present in a caller-owned store (`<modelsDir>/registry.json` and the
//!   files): resumed, digest-checked downloads whose progress `shenron_llama_progress` reads;
//! - router: one OpenAI-compatible endpoint (`/health`, `/v1/models`, `/v1/*`) over the configured
//!   models. One `llama-server` runs at a time, started on the first request for its model;
//! - daemon: the host re-executes itself with the supervisor's verb; here it runs `llama-server`
//!   with the given arguments in the foreground.

use std::{
    collections::{BTreeMap, HashMap},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Mutex, PoisonError},
    time::Duration,
};

use axum::{
    Router,
    body::Body,
    extract::State,
    http::{HeaderMap, Method, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::any,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use tokio::{io::AsyncWriteExt as _, process::Child};

use crate::types::{LlamaProgress, LlamaProvisioned, LlamaRouterInfo};

/// Pinned artifacts addressable by id (same sources and digests as `packages/config/src/chat-model.ts`).
const BUILTIN: &[(&str, &str, &str, &str)] = &[
    (
        "qwen3-4b-instruct-2507-q4km",
        "Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        "https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/a06e946bb6b655725eafa393f4a9745d460374c9/Qwen3-4B-Instruct-2507-Q4_K_M.gguf",
        "3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597",
    ),
    (
        "gemma-4-e2b-it-q4km",
        "gemma-4-E2B-it-Q4_K_M.gguf",
        "https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF/resolve/0314792d7f1f7e229411f620751375812bb9faf2/gemma-4-E2B-it-Q4_K_M.gguf",
        "740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8",
    ),
];

/// One model file: built-in id or reference (`hf:`, `https://`, `file:`), with its digest.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArtifactRequest {
    /// Built-in id or reference.
    pub spec: String,
    /// SHA-256 of a raw reference (built-in entries carry their own).
    #[serde(default)]
    pub sha256: Option<String>,
    /// Adapter scale (adapters only, default 1.0).
    #[serde(default)]
    pub scale: Option<f32>,
}

/// Request of `shenron_llama_provision_job`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProvisionRequest {
    /// Model store root (`registry.json` and the files).
    pub models_dir: PathBuf,
    /// Extra catalog (`{"<id>": {"file", "url", "sha256"}}`), searched before the built-in one.
    #[serde(default)]
    pub catalog: Option<PathBuf>,
    /// Base model (default: the Qwen3 4B instruct build).
    #[serde(default)]
    pub model: Option<ArtifactRequest>,
    /// Adapters.
    #[serde(default)]
    pub lora: Vec<ArtifactRequest>,
    /// Transfer again even when present.
    #[serde(default)]
    pub force: bool,
}

/// How the supervisor starts its daemon: `program args… <daemon args>` (unused: kept for the ABI).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DaemonRequest {
    /// Executable to run.
    pub program: PathBuf,
    /// Leading arguments.
    #[serde(default)]
    pub args: Vec<String>,
}

/// Request of `shenron_llama_router_start`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RouterRequest {
    /// Router configuration file (`{"models": [...]}`).
    pub config: PathBuf,
    /// Model store root, as provisioned.
    pub models_dir: PathBuf,
    /// Server state root; each model keeps its log in `<state_dir>/<id>`.
    pub state_dir: PathBuf,
    /// `llama-server` binary or directory; else `SHENRON_LLAMA_BIN`, then `search_dirs`, then `PATH`.
    #[serde(default)]
    pub llama_bin: Option<PathBuf>,
    /// Extra directories holding `llama/` or `llama-server` (the app's resources).
    #[serde(default)]
    pub search_dirs: Vec<PathBuf>,
    /// Listen address (default `127.0.0.1:0`).
    #[serde(default)]
    pub bind: Option<String>,
    /// Daemon launcher of the supervisor.
    pub daemon: DaemonRequest,
}

#[derive(Debug, Clone, Deserialize)]
struct RouterConfig {
    models: Vec<ModelConfig>,
}

#[derive(Debug, Clone, Deserialize)]
struct ModelConfig {
    id: String,
    model: String,
    #[serde(default)]
    lora: Vec<LoraConfig>,
    #[serde(default)]
    ctx: Option<u32>,
    #[serde(default)]
    extra_args: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct LoraConfig {
    spec: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct RegistryEntry {
    file: String,
    sha256: String,
}

type Registry = BTreeMap<String, RegistryEntry>;

fn read_registry(models_dir: &Path) -> Registry {
    std::fs::read_to_string(models_dir.join("registry.json"))
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_registry(models_dir: &Path, registry: &Registry) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(registry).map_err(|e| e.to_string())?;
    std::fs::write(models_dir.join("registry.json"), raw).map_err(|e| format!("registry: {e}"))
}

/// Where a spec comes from.
struct Source {
    file: String,
    url: Option<String>,
    sha256: Option<String>,
}

fn file_name_of(reference: &str) -> String {
    let path = reference.split(['?', '#']).next().unwrap_or(reference);
    path.rsplit('/').next().filter(|name| !name.is_empty()).unwrap_or("model.gguf").to_owned()
}

fn resolve_source(
    spec: &str,
    sha256: Option<&str>,
    extra: &HashMap<String, serde_json::Value>,
) -> Result<Source, String> {
    let sha = sha256.map(str::to_ascii_lowercase);
    if spec.starts_with("https://") || spec.starts_with("http://") {
        return Ok(Source { file: file_name_of(spec), url: Some(spec.to_owned()), sha256: sha });
    }
    if let Some(rest) = spec.strip_prefix("hf:") {
        let (repo_file, revision) = rest.split_once('@').unwrap_or((rest, "main"));
        let mut parts = repo_file.splitn(3, '/');
        let (Some(org), Some(repo), Some(file)) = (parts.next(), parts.next(), parts.next()) else {
            return Err(format!("`{spec}`: expected hf:<org>/<repo>/<file>[@revision]"));
        };
        return Ok(Source {
            file: file_name_of(file),
            url: Some(format!("https://huggingface.co/{org}/{repo}/resolve/{revision}/{file}")),
            sha256: sha,
        });
    }
    if let Some(entry) = extra.get(spec) {
        let text =
            |key: &str| entry.get(key).and_then(serde_json::Value::as_str).map(str::to_owned);
        let url = text("url").ok_or_else(|| format!("catalog entry `{spec}` has no url"))?;
        return Ok(Source {
            file: text("file").unwrap_or_else(|| file_name_of(&url)),
            sha256: sha.or_else(|| text("sha256")),
            url: Some(url),
        });
    }
    if let Some((_, file, url, digest)) = BUILTIN.iter().find(|(id, ..)| *id == spec) {
        return Ok(Source {
            file: (*file).to_owned(),
            url: Some((*url).to_owned()),
            sha256: sha.or_else(|| Some((*digest).to_owned())),
        });
    }
    Err(format!("unknown model reference `{spec}`"))
}

fn progress_map() -> &'static Mutex<HashMap<u64, LlamaProgress>> {
    static PROGRESS: std::sync::OnceLock<Mutex<HashMap<u64, LlamaProgress>>> =
        std::sync::OnceLock::new();
    PROGRESS.get_or_init(Mutex::default)
}

/// Latest progress of provisioning job `job`, while it runs.
#[must_use]
pub fn progress(job: u64) -> Option<LlamaProgress> {
    progress_map().lock().unwrap_or_else(PoisonError::into_inner).get(&job).cloned()
}

/// Forgets the progress of a job when dropped (whatever the outcome).
struct ProgressSlot(u64);

impl Drop for ProgressSlot {
    fn drop(&mut self) {
        progress_map().lock().unwrap_or_else(PoisonError::into_inner).remove(&self.0);
    }
}

async fn sha256_file(path: &Path) -> Result<String, String> {
    let path = path.to_owned();
    tokio::task::spawn_blocking(move || {
        use std::io::Read as _;
        let mut file =
            std::fs::File::open(&path).map_err(|e| format!("{}: {e}", path.display()))?;
        let mut hasher = Sha256::new();
        let mut buffer = vec![0_u8; 1 << 20];
        loop {
            let read = file.read(&mut buffer).map_err(|e| e.to_string())?;
            if read == 0 {
                break;
            }
            hasher.update(&buffer[..read]);
        }
        Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Download `url` into `target` (resumed from `<target>.part`), publishing progress under `job`.
async fn download(
    job: u64,
    role: &str,
    spec: &str,
    url: &str,
    target: &Path,
) -> Result<(), String> {
    let part = target.with_extension("part");
    let existing = std::fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
    let client = reqwest::Client::new();
    let mut request = client.get(url);
    if existing > 0 {
        request = request.header("Range", format!("bytes={existing}-"));
    }
    let mut response = request.send().await.map_err(|e| format!("{url}: {e}"))?;
    let resumed = response.status() == StatusCode::PARTIAL_CONTENT;
    if !response.status().is_success() {
        return Err(format!("{url}: HTTP {}", response.status()));
    }
    let offset = if resumed { existing } else { 0 };
    let total = response.content_length().map(|length| length + offset);
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(resumed)
        .truncate(!resumed)
        .open(&part)
        .await
        .map_err(|e| format!("{}: {e}", part.display()))?;
    let mut downloaded = offset;
    while let Some(chunk) = response.chunk().await.map_err(|e| format!("{url}: {e}"))? {
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        progress_map().lock().unwrap_or_else(PoisonError::into_inner).insert(
            job,
            LlamaProgress {
                role: role.to_owned(),
                spec: spec.to_owned(),
                downloaded: downloaded as f64,
                total: total.map(|total| total as f64),
            },
        );
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    std::fs::rename(&part, target).map_err(|e| format!("{}: {e}", target.display()))
}

/// `true` when no digest is expected or the file at `path` has it.
async fn digest_matches(path: &Path, expected: Option<&str>) -> bool {
    match expected {
        Some(expected) => {
            sha256_file(path).await.is_ok_and(|actual| actual.eq_ignore_ascii_case(expected))
        },
        None => true,
    }
}

/// One file made present; returns its path and whether bytes were transferred.
async fn provision_one(
    job: u64,
    role: &str,
    artifact: &ArtifactRequest,
    request: &ProvisionRequest,
    extra: &HashMap<String, serde_json::Value>,
) -> Result<(PathBuf, bool), String> {
    if let Some(path) = artifact.spec.strip_prefix("file:") {
        let path = PathBuf::from(path);
        if !path.is_file() {
            return Err(format!("{}: not a file", path.display()));
        }
        if let Some(expected) = &artifact.sha256 {
            let actual = sha256_file(&path).await?;
            if !actual.eq_ignore_ascii_case(expected) {
                return Err(format!("{}: digest {actual} differs from {expected}", path.display()));
            }
        }
        return Ok((path, false));
    }
    let source = resolve_source(&artifact.spec, artifact.sha256.as_deref(), extra)?;
    std::fs::create_dir_all(&request.models_dir).map_err(|e| format!("models dir: {e}"))?;
    let target = request.models_dir.join(&source.file);
    let mut transferred = false;
    if request.force
        || !target.is_file()
        || !digest_matches(&target, source.sha256.as_deref()).await
    {
        let url =
            source.url.as_deref().ok_or_else(|| format!("`{}` has no source", artifact.spec))?;
        download(job, role, &artifact.spec, url, &target).await?;
        transferred = true;
        if let Some(expected) = &source.sha256 {
            let actual = sha256_file(&target).await?;
            if !actual.eq_ignore_ascii_case(expected) {
                std::fs::remove_file(&target).ok();
                return Err(format!("{}: digest {actual} differs from {expected}", source.file));
            }
        }
    }
    let digest = sha256_file(&target).await?;
    let mut registry = read_registry(&request.models_dir);
    registry.insert(artifact.spec.clone(), RegistryEntry { file: source.file, sha256: digest });
    write_registry(&request.models_dir, &registry)?;
    Ok((target, transferred))
}

/// Provision the files of `request`, publishing progress under `job`.
///
/// # Errors
/// Resolution, transfer, digest or store failure.
pub async fn provision(job: u64, request: ProvisionRequest) -> Result<LlamaProvisioned, String> {
    let _slot = ProgressSlot(job);
    let extra: HashMap<String, serde_json::Value> = match &request.catalog {
        Some(path) => serde_json::from_str(
            &std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?,
        )
        .map_err(|e| format!("{}: {e}", path.display()))?,
        None => HashMap::new(),
    };
    let base = request.model.clone().unwrap_or(ArtifactRequest {
        spec: BUILTIN[0].0.to_owned(),
        sha256: None,
        scale: None,
    });
    let (weights, mut transferred) = provision_one(job, "weights", &base, &request, &extra).await?;
    let mut lora = Vec::new();
    for adapter in &request.lora {
        let (path, moved) = provision_one(job, "lora", adapter, &request, &extra).await?;
        transferred |= moved;
        lora.push(path.display().to_string());
    }
    Ok(LlamaProvisioned {
        model_id: base.spec,
        weights: weights.display().to_string(),
        lora,
        transferred,
    })
}

/// `llama-server` from `explicit` (file or directory), `SHENRON_LLAMA_BIN`, `search_dirs`
/// (`llama/` or the directory itself), then `PATH`.
fn locate_llama_server(explicit: Option<&Path>, search_dirs: &[PathBuf]) -> Option<PathBuf> {
    let name = if cfg!(windows) { "llama-server.exe" } else { "llama-server" };
    let in_dir = |dir: &Path| {
        [dir.join(name), dir.join("llama").join(name)].into_iter().find(|path| path.is_file())
    };
    let from = |path: &Path| {
        if path.is_dir() { in_dir(path) } else { path.is_file().then(|| path.to_owned()) }
    };
    explicit
        .and_then(from)
        .or_else(|| std::env::var_os("SHENRON_LLAMA_BIN").and_then(|v| from(Path::new(&v))))
        .or_else(|| search_dirs.iter().find_map(|dir| in_dir(dir)))
        .or_else(|| {
            std::env::var_os("PATH").and_then(|paths| {
                std::env::split_paths(&paths)
                    .find_map(|dir| Some(dir.join(name)).filter(|p| p.is_file()))
            })
        })
}

struct Running {
    id: String,
    port: u16,
    child: Child,
}

struct Shared {
    models: Vec<ModelConfig>,
    models_dir: PathBuf,
    state_dir: PathBuf,
    llama_bin: Option<PathBuf>,
    running: tokio::sync::Mutex<Option<Running>>,
    client: reqwest::Client,
}

impl Shared {
    fn path_of(&self, spec: &str) -> Option<PathBuf> {
        if let Some(path) = spec.strip_prefix("file:") {
            return Some(PathBuf::from(path)).filter(|p| p.is_file());
        }
        let registry = read_registry(&self.models_dir);
        registry
            .get(spec)
            .map(|entry| self.models_dir.join(&entry.file))
            .filter(|path| path.is_file())
    }

    fn reason(&self, model: &ModelConfig) -> Option<String> {
        if self.llama_bin.is_none() {
            return Some("llama-server not found".to_owned());
        }
        if self.path_of(&model.model).is_none() {
            return Some("model file not provisioned".to_owned());
        }
        model
            .lora
            .iter()
            .find(|l| self.path_of(&l.spec).is_none())
            .map(|_| "adapter not provisioned".to_owned())
    }

    /// The loopback port serving `id`, starting its `llama-server` (and stopping another) first.
    async fn ensure(&self, id: &str) -> Result<u16, String> {
        let model = self
            .models
            .iter()
            .find(|m| m.id == id)
            .ok_or_else(|| format!("unknown model `{id}`"))?;
        let mut running = self.running.lock().await;
        if let Some(current) = running.as_mut() {
            if current.id == id && current.child.try_wait().ok().flatten().is_none() {
                return Ok(current.port);
            }
            current.child.kill().await.ok();
            *running = None;
        }
        if let Some(reason) = self.reason(model) {
            return Err(reason);
        }
        let bin = self.llama_bin.clone().ok_or("llama-server not found")?;
        let weights = self.path_of(&model.model).ok_or("model file not provisioned")?;
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .and_then(|l| l.local_addr())
            .map_err(|e| e.to_string())?
            .port();
        let log_dir = self.state_dir.join(&model.id);
        std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
        let log =
            std::fs::File::create(log_dir.join("llama-server.log")).map_err(|e| e.to_string())?;
        let mut command = tokio::process::Command::new(bin);
        command
            .arg("--model")
            .arg(weights)
            .args([
                "--host",
                "127.0.0.1",
                "--port",
                &port.to_string(),
                "--alias",
                &model.id,
                "--jinja",
            ])
            .args(["--ctx-size", &model.ctx.unwrap_or(8192).to_string()]);
        for adapter in &model.lora {
            if let Some(path) = self.path_of(&adapter.spec) {
                command.arg("--lora").arg(path);
            }
        }
        command
            .args(&model.extra_args)
            .stdin(Stdio::null())
            .stdout(log.try_clone().map_err(|e| e.to_string())?)
            .stderr(log)
            .kill_on_drop(true);
        let child = command.spawn().map_err(|e| format!("llama-server: {e}"))?;
        let mut current = Running { id: id.to_owned(), port, child };
        let health = format!("http://127.0.0.1:{port}/health");
        for _ in 0..1200 {
            if let Some(status) = current.child.try_wait().map_err(|e| e.to_string())? {
                return Err(format!("llama-server exited ({status})"));
            }
            if self.client.get(&health).send().await.is_ok_and(|r| r.status().is_success()) {
                *running = Some(current);
                return Ok(port);
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        current.child.kill().await.ok();
        Err("llama-server did not become ready in 10 minutes".to_owned())
    }
}

fn json_response(status: StatusCode, body: &serde_json::Value) -> Response {
    (status, [("content-type", "application/json")], body.to_string()).into_response()
}

async fn health(State(shared): State<std::sync::Arc<Shared>>) -> Response {
    let running_id = shared.running.lock().await.as_ref().map(|r| r.id.clone());
    let backends: Vec<_> = shared
        .models
        .iter()
        .map(|model| {
            let reason = shared.reason(model);
            serde_json::json!({
                "id": model.id,
                "available": reason.is_none(),
                "running": running_id.as_deref() == Some(model.id.as_str()),
                "reason": reason,
            })
        })
        .collect();
    json_response(StatusCode::OK, &serde_json::json!({"status": "ok", "backends": backends}))
}

async fn models(State(shared): State<std::sync::Arc<Shared>>) -> Response {
    let data: Vec<_> = shared
        .models
        .iter()
        .filter(|model| shared.reason(model).is_none())
        .map(|model| serde_json::json!({"id": model.id, "object": "model", "owned_by": "local"}))
        .collect();
    json_response(StatusCode::OK, &serde_json::json!({"object": "list", "data": data}))
}

async fn proxy(
    State(shared): State<std::sync::Arc<Shared>>,
    method: Method,
    uri: Uri,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    let requested = serde_json::from_slice::<serde_json::Value>(&body)
        .ok()
        .and_then(|value| value.get("model").and_then(|m| m.as_str().map(str::to_owned)));
    let id = requested.or_else(|| shared.models.first().map(|m| m.id.clone()));
    let Some(id) = id else {
        return json_response(
            StatusCode::NOT_FOUND,
            &serde_json::json!({"error": "no model configured"}),
        );
    };
    let port = match shared.ensure(&id).await {
        Ok(port) => port,
        Err(error) => {
            return json_response(
                StatusCode::SERVICE_UNAVAILABLE,
                &serde_json::json!({"error": error}),
            );
        },
    };
    let target =
        format!("http://127.0.0.1:{port}{}", uri.path_and_query().map_or("", |pq| pq.as_str()));
    let mut request = shared.client.request(method, target).body(body);
    if let Some(content_type) = headers.get("content-type") {
        request = request.header("content-type", content_type);
    }
    match request.send().await {
        Ok(upstream) => {
            let status =
                StatusCode::from_u16(upstream.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
            let content_type = upstream.headers().get("content-type").cloned();
            let mut response = Response::new(Body::from_stream(upstream.bytes_stream()));
            *response.status_mut() = status;
            if let Some(content_type) = content_type {
                response.headers_mut().insert("content-type", content_type);
            }
            response
        },
        Err(error) => {
            json_response(StatusCode::BAD_GATEWAY, &serde_json::json!({"error": error.to_string()}))
        },
    }
}

struct Serving {
    shared: std::sync::Arc<Shared>,
    stop: tokio::sync::oneshot::Sender<()>,
    server: tokio::task::JoinHandle<std::io::Result<()>>,
}

fn serving() -> &'static tokio::sync::Mutex<Option<Serving>> {
    static SERVING: tokio::sync::Mutex<Option<Serving>> = tokio::sync::Mutex::const_new(None);
    &SERVING
}

/// Stop the router of this process and the llama model it started; `true` if one ran.
pub async fn stop() -> bool {
    let Some(previous) = serving().lock().await.take() else { return false };
    previous.stop.send(()).ok();
    tokio::time::timeout(Duration::from_secs(5), previous.server).await.ok();
    if let Some(mut running) = previous.shared.running.lock().await.take() {
        running.child.kill().await.ok();
    }
    true
}

/// Bind the router of `request` (replacing a previous one) and serve it in the background.
///
/// # Errors
/// Unreadable configuration, or an address that cannot be bound.
pub async fn start(request: RouterRequest) -> Result<LlamaRouterInfo, String> {
    stop().await;
    let raw = std::fs::read_to_string(&request.config)
        .map_err(|e| format!("{}: {e}", request.config.display()))?;
    let config: RouterConfig =
        serde_json::from_str(&raw).map_err(|e| format!("{}: {e}", request.config.display()))?;
    let llama_bin = locate_llama_server(request.llama_bin.as_deref(), &request.search_dirs);
    let ids: Vec<String> = config.models.iter().map(|model| model.id.clone()).collect();
    let shared = std::sync::Arc::new(Shared {
        models: config.models,
        models_dir: request.models_dir,
        state_dir: request.state_dir,
        llama_bin: llama_bin.clone(),
        running: tokio::sync::Mutex::new(None),
        client: reqwest::Client::new(),
    });
    let app = Router::new()
        .route("/health", axum::routing::get(health))
        .route("/v1/models", axum::routing::get(models))
        .route("/v1/{*path}", any(proxy))
        .with_state(shared.clone());
    let bind = request.bind.unwrap_or_else(|| "127.0.0.1:0".to_owned());
    let listener = tokio::net::TcpListener::bind(&bind)
        .await
        .map_err(|error| format!("cannot bind {bind}: {error}"))?;
    let addr = listener.local_addr().map_err(|error| error.to_string())?;
    let (stop_tx, stop_rx) = tokio::sync::oneshot::channel::<()>();
    let server = tokio::spawn(
        axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                stop_rx.await.ok();
            })
            .into_future(),
    );
    *serving().lock().await = Some(Serving { shared, stop: stop_tx, server });
    Ok(LlamaRouterInfo {
        url: format!("http://{addr}"),
        base_url: format!("http://{addr}/v1"),
        health_url: format!("http://{addr}/health"),
        models: ids,
        llama_bin: llama_bin.map(|path| path.display().to_string()),
    })
}

/// Run `llama-server` with `args` in the foreground and return its exit code.
#[must_use]
pub fn daemon(args: Vec<String>) -> i32 {
    let Some(bin) = locate_llama_server(None, &[]) else { return 127 };
    std::process::Command::new(bin)
        .args(args)
        .status()
        .map_or(126, |status| status.code().unwrap_or(1))
}

use std::future::IntoFuture as _;
