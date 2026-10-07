// SPDX-License-Identifier: Apache-2.0
//! Local chat models (ABI 4): Aphrody's `aphrody-llama-server` local chat, in process.
//!
//! Shenron owns no model logic here. Provisioning (catalog resolution, resumed and
//! digest-checked downloads into a caller-owned store), the OpenAI-compatible router over the
//! models (one `llama-server` at a time, started on first use, `/v1/models` listing only what
//! can answer) and the supervisor daemon are Aphrody's (`crates/ai/llama-server/LOCAL-CHAT.md`).
//! This module only:
//!
//! - runs `provision_chat` as a job and keeps its latest progress for `shenron_llama_progress`;
//! - binds the router on the library's runtime, one per process (`shenron_llama_router_*`);
//! - runs the daemon role (`shenron_llama_daemon`) for a host that re-executes itself as the
//!   supervisor's daemon launcher, so no extra executable ships beside it.

use std::{
    collections::HashMap,
    ffi::OsString,
    future::IntoFuture,
    path::PathBuf,
    sync::{Mutex, PoisonError},
    time::Duration,
};

use aphrody_llama_server::{
    ArtifactSpec, ChatProvisionRequest, DaemonCommand, LoraSpec, ProvisionProgress,
    locate_llama_server, provision_chat,
    router::{ChatRouter, RouterConfig, RouterContext},
};
use serde::Deserialize;

use crate::types::{LlamaProgress, LlamaProvisioned, LlamaRouterInfo};

/// One model file: catalog id or reference (`hf:`, `https://`, `file:`), with its digest.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ArtifactRequest {
    /// Catalog id or reference.
    pub spec: String,
    /// SHA-256 of a raw reference (catalog entries carry their own).
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
    /// Product catalog (`catalog.json` schema), searched before the built-in one.
    #[serde(default)]
    pub catalog: Option<PathBuf>,
    /// Base model (default: Aphrody's default chat model).
    #[serde(default)]
    pub model: Option<ArtifactRequest>,
    /// Adapters.
    #[serde(default)]
    pub lora: Vec<ArtifactRequest>,
    /// Transfer again even when present.
    #[serde(default)]
    pub force: bool,
}

/// How the supervisor starts its daemon: `program args… <daemon args>`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DaemonRequest {
    /// Executable to run.
    pub program: PathBuf,
    /// Leading arguments (for example the host's own `llama-daemon` verb).
    #[serde(default)]
    pub args: Vec<String>,
}

/// Request of `shenron_llama_router_start`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RouterRequest {
    /// Router configuration file (`router.json` of LOCAL-CHAT.md).
    pub config: PathBuf,
    /// Model store root, as provisioned.
    pub models_dir: PathBuf,
    /// Server state root; each llama model keeps `<state_dir>/<id>`.
    pub state_dir: PathBuf,
    /// `llama-server` binary or directory; else Aphrody's lookup (`APHRODY_LLAMA_BIN`, …).
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

fn artifact(request: &ArtifactRequest) -> ArtifactSpec {
    ArtifactSpec { spec: request.spec.clone(), sha256: request.sha256.clone() }
}

impl ProvisionRequest {
    /// The Aphrody request.
    ///
    /// # Errors
    /// The declared catalog cannot be read.
    pub fn to_aphrody(&self) -> Result<ChatProvisionRequest, String> {
        let declared = match &self.catalog {
            Some(path) => Some(aphrody_models::Catalog::load(path).map_err(|e| e.to_string())?),
            None => None,
        };
        Ok(ChatProvisionRequest {
            models_dir: Some(self.models_dir.clone()),
            declared,
            model: self.model.as_ref().map(artifact),
            lora: self
                .lora
                .iter()
                .map(|lora| LoraSpec { artifact: artifact(lora), scale: lora.scale.unwrap_or(1.0) })
                .collect(),
            force: self.force,
        })
    }
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

/// Provision the files of `request`, publishing progress under `job`.
///
/// # Errors
/// Resolution, transfer, digest or store failure.
pub async fn provision(
    job: u64,
    request: ChatProvisionRequest,
) -> Result<LlamaProvisioned, String> {
    let _slot = ProgressSlot(job);
    let model = provision_chat(&request, |p: &ProvisionProgress| {
        progress_map().lock().unwrap_or_else(PoisonError::into_inner).insert(
            job,
            LlamaProgress {
                role: p.role.clone(),
                spec: p.spec.clone(),
                downloaded: p.downloaded as f64,
                total: p.total.map(|total| total as f64),
            },
        );
    })
    .await
    .map_err(|error| error.to_string())?;
    Ok(LlamaProvisioned {
        model_id: model.model_id,
        weights: model.weights.display().to_string(),
        lora: model.lora.iter().map(|lora| lora.path.display().to_string()).collect(),
        transferred: model.artifacts.iter().any(|artifact| artifact.transferred),
    })
}

struct Running {
    router: ChatRouter,
    stop: tokio::sync::oneshot::Sender<()>,
    server: tokio::task::JoinHandle<std::io::Result<()>>,
}

fn running() -> &'static tokio::sync::Mutex<Option<Running>> {
    static RUNNING: tokio::sync::Mutex<Option<Running>> = tokio::sync::Mutex::const_new(None);
    &RUNNING
}

/// Stop the router of this process and the llama model it started; `true` if one ran.
pub async fn stop() -> bool {
    let Some(previous) = running().lock().await.take() else { return false };
    let _ = previous.stop.send(());
    let _ = tokio::time::timeout(Duration::from_secs(5), previous.server).await;
    previous.router.shutdown().await;
    true
}

/// Bind the router of `request` (replacing a previous one) and serve it in the background.
///
/// # Errors
/// Unreadable configuration or catalog, or an address that cannot be bound.
pub async fn start(request: RouterRequest) -> Result<LlamaRouterInfo, String> {
    stop().await;
    let config = RouterConfig::load(&request.config)?;
    let ids: Vec<String> = config.models.iter().map(|model| model.id().to_owned()).collect();
    let context = RouterContext {
        models_dir: request.models_dir,
        state_dir: request.state_dir,
        llama_bin: locate_llama_server(request.llama_bin.as_deref(), &request.search_dirs),
        daemon: DaemonCommand { program: request.daemon.program, args: request.daemon.args },
    };
    let llama_bin = context.llama_bin.as_ref().map(|path| path.display().to_string());
    let router = ChatRouter::new(config, context)?;
    let bind = request.bind.unwrap_or_else(|| "127.0.0.1:0".to_owned());
    let listener = tokio::net::TcpListener::bind(&bind)
        .await
        .map_err(|error| format!("cannot bind {bind}: {error}"))?;
    let addr = listener.local_addr().map_err(|error| error.to_string())?;
    let (stop_tx, stop_rx) = tokio::sync::oneshot::channel::<()>();
    let server = tokio::spawn(
        axum::serve(listener, router.app())
            .with_graceful_shutdown(async move {
                let _ = stop_rx.await;
            })
            .into_future(),
    );
    *running().lock().await = Some(Running { router, stop: stop_tx, server });
    Ok(LlamaRouterInfo {
        url: format!("http://{addr}"),
        base_url: format!("http://{addr}/v1"),
        health_url: format!("http://{addr}/health"),
        models: ids,
        llama_bin,
    })
}

/// Run the supervisor's daemon role with `args` (what follows the launcher's own arguments).
#[must_use]
pub fn daemon(args: Vec<String>) -> i32 {
    let mut argv = vec![OsString::from("aphrody-llama-daemon")];
    argv.extend(args.into_iter().map(OsString::from));
    aphrody_llama_server::cli_main(argv)
}
