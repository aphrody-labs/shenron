// SPDX-License-Identifier: MIT OR Apache-2.0
//! The headless method set of `koharu-sdk` (`@aphrody/shenron-koharu/native`, the Shenron editorial
//! chain): `project.*`, `page.*`, `text.*`, `layer.*`, `raster.stroke`, `pipeline.*`,
//! `canvas.*`, `preferences.*`, `models.*`, `resources.status` and `agent.*`.
//!
//! Every method runs on the one [`Editor`] of the process: the same project, jobs, canvas and
//! agent the editor commands use. Methods address pages explicitly; asynchronous work
//! (`pipeline.start`, `agent.run`, `agent.login`) reports through event lines without `id`.

use std::{
    path::PathBuf,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};

use anyhow::{Context as _, Result, bail};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use koharu_agent::{Codex, Config as AgentConfig, RunId};
use koharu_desktop::Frame;
use koharu_pipeline::{Progress, Report, RunStatus, StopToken};
use koharu_scene::EntityId;
use serde::{Deserialize, de::DeserializeOwned};
use serde_json::{Value, json};
use tokio::sync::mpsc;

use crate::{
    Operation, PipelineConfig, ProvidersConfig, Scope,
    editor::{Editor, PageFormat},
    project::{GeometryUpdate, Point, RasterStrokeMode, TypographyUpdate},
    renderer::TypesettingConfig,
    secrets,
    translator::{Provider, ProviderConfig, Translator},
};

struct ActivePipeline {
    job: u64,
    stop: StopToken,
    task: tokio::task::JoinHandle<()>,
}

struct ActiveLogin {
    cancelled: Arc<AtomicBool>,
    task: tokio::task::JoinHandle<()>,
}

/// The headless methods over an [`Editor`]; event lines go to `output`.
pub struct Service {
    editor: Editor,
    output: mpsc::UnboundedSender<Value>,
    pipeline: Option<ActivePipeline>,
    login: Option<ActiveLogin>,
    next_job: u64,
}

impl Service {
    #[must_use]
    pub fn new(editor: Editor, output: mpsc::UnboundedSender<Value>) -> Self {
        Self { editor, output, pipeline: None, login: None, next_job: 0 }
    }

    #[must_use]
    pub fn editor(&self) -> &Editor {
        &self.editor
    }

    /// Stop the jobs, the agent run and the sign-in this process started.
    pub fn shutdown(&mut self) {
        if let Some(login) = self.login.take() {
            login.cancelled.store(true, Ordering::SeqCst);
            let _ = self.editor.cancel_agent_login();
            login.task.abort();
        }
        if let Some(pipeline) = self.pipeline.take() {
            pipeline.stop.stop();
            pipeline.task.abort();
        }
        self.editor.cancel_work();
    }

    fn active_pipeline(&mut self) -> Option<&ActivePipeline> {
        if self.pipeline.as_ref().is_some_and(|job| job.task.is_finished()) {
            self.pipeline = None;
        }
        self.pipeline.as_ref()
    }

    fn login_active(&mut self) -> bool {
        if self.login.as_ref().is_some_and(|login| login.task.is_finished()) {
            self.login = None;
        }
        self.login.is_some()
    }

    fn processing(&mut self) -> bool {
        self.active_pipeline().is_some() || self.editor.busy()
    }

    fn check_device(&self, cpu: Option<bool>) -> Result<()> {
        if cpu.is_some_and(|cpu| cpu != self.editor.cpu()) {
            bail!("compute device is fixed for this SDK process");
        }
        Ok(())
    }

    async fn info(&self) -> Result<Value> {
        Ok(json!(self.editor.project_info().await.context("no project is open")?))
    }

    pub async fn call(&mut self, method: &str, value: Value) -> Result<Value> {
        match method {
            "agent.status" => {
                let authenticated = Codex::new()?.account()?.is_some();
                let login_running = self.login_active() || self.editor.agent_login_running();
                let config = AgentConfig::load()?.read()?.clone();
                Ok(json!({
                    "authenticated": authenticated,
                    "running": self.editor.agent_run(),
                    "login_running": login_running,
                    "config": config,
                }))
            },
            "agent.models" => Ok(json!(self.editor.agent_models().await?)),
            "agent.setConfig" => {
                let AgentPreference { config } = decode(value)?;
                Ok(json!({"config": self.editor.save_agent_config(config)?}))
            },
            "agent.clear" => {
                self.editor.clear_agent().await?;
                Ok(Value::Null)
            },
            "agent.login" => {
                if self.login_active() || self.editor.agent_login_running() {
                    bail!("agent login is already active");
                }
                let cancelled = Arc::new(AtomicBool::new(false));
                let editor = self.editor.clone();
                let output = self.output.clone();
                let task_cancelled = Arc::clone(&cancelled);
                let task = tokio::spawn(async move {
                    let events = output.clone();
                    let result = editor
                        .login_agent(Arc::new(move |event| {
                            events.send(json!({"event": "agent_login", "value": event})).is_ok()
                        }))
                        .await;
                    let value = match result {
                        Ok(_) => json!({"type": "completed", "authenticated": true}),
                        Err(_) if task_cancelled.load(Ordering::SeqCst) => {
                            json!({"type": "cancelled"})
                        },
                        Err(error) => json!({"type": "failed", "message": format!("{error:#}")}),
                    };
                    let _ = output.send(json!({"event": "agent_login", "value": value}));
                });
                self.login = Some(ActiveLogin { cancelled, task });
                Ok(json!({"started": true}))
            },
            "agent.cancelLogin" => {
                if !self.login_active() {
                    bail!("no agent login is active");
                }
                if let Some(login) = &self.login {
                    login.cancelled.store(true, Ordering::SeqCst);
                }
                self.editor.cancel_agent_login()?;
                Ok(json!({"cancelled": true}))
            },
            "agent.logout" => {
                if self.editor.agent_run().is_some() || self.login_active() {
                    bail!("cancel the active agent work before logout");
                }
                self.editor.logout_agent().await?;
                Ok(json!({"authenticated": false}))
            },
            "agent.run" => {
                let AgentRun { prompt, cpu } = decode(value)?;
                self.check_device(cpu)?;
                if prompt.trim().is_empty() {
                    bail!("agent prompt must not be empty");
                }
                if self.editor.agent_run().is_some() {
                    bail!("an agent run is already active");
                }
                if self.processing() {
                    bail!("a pipeline job is active");
                }
                if self.login_active() {
                    bail!("agent login is active");
                }
                if self.editor.project_info().await.is_none() {
                    bail!("no project is open");
                }
                let output = self.output.clone();
                let run = self.editor.run_agent(
                    &prompt,
                    Arc::new(move |event| {
                        let value = json!(event);
                        let run = value.get("run").cloned().unwrap_or(Value::Null);
                        output.send(json!({"event": "agent", "run": run, "value": value})).is_ok()
                    }),
                )?;
                Ok(json!({"run": run}))
            },
            "agent.cancel" => {
                let AgentCancel { run } = decode(value)?;
                if self.editor.agent_run() != Some(run) {
                    bail!("agent run identifier does not match the active run");
                }
                self.editor.cancel_agent(run)?;
                Ok(json!({"cancelled": true}))
            },
            "preferences.get" => {
                let pipeline = PipelineConfig::load()?.read()?.clone();
                let providers = ProvidersConfig::load()?.read()?.clone();
                let typesetting = TypesettingConfig::load()?.read()?.clone();
                let entries = providers
                    .entries()
                    .into_iter()
                    .map(|config| -> Result<Value> {
                        let provider = config.provider();
                        let configured = if provider == Provider::Local {
                            false
                        } else {
                            let key: &'static str = provider.into();
                            secrets::get(key)?.is_some()
                        };
                        Ok(json!({"config": config, "credential_configured": configured}))
                    })
                    .collect::<Result<Vec<_>>>()?;
                Ok(json!({"pipeline": pipeline, "providers": entries, "typesetting": typesetting}))
            },
            "preferences.setPipeline" => {
                let PipelinePreference { mut pipeline } = decode(value)?;
                pipeline.remember_selected_profiles();
                pipeline.validate()?;
                let config = PipelineConfig::load()?;
                let mut current = config.write()?;
                *current = pipeline;
                current.save()?;
                Ok(json!({"pipeline": config.read()?.clone()}))
            },
            "preferences.setProviders" => {
                let ProviderPreferences { entries } = decode(value)?;
                let providers = ProvidersConfig::from_entries(entries)?;
                let config = ProvidersConfig::load()?;
                let mut current = config.write()?;
                *current = providers;
                current.save()?;
                Ok(json!({"providers": config.read()?.entries()}))
            },
            "preferences.setTypesetting" => {
                let TypesettingPreference { typesetting } = decode(value)?;
                let config = TypesettingConfig::load()?;
                let mut current = config.write()?;
                *current = typesetting;
                current.save()?;
                Ok(json!({"typesetting": config.read()?.clone()}))
            },
            "preferences.setCredential" => {
                let CredentialPreference { provider, value, clear } = decode(value)?;
                let provider: Provider = provider.parse()?;
                if provider == Provider::Local {
                    bail!("local translation does not accept credentials");
                }
                let key: &'static str = provider.into();
                if clear.unwrap_or(false) {
                    secrets::delete(key)?;
                } else if let Some(value) = value {
                    if value.trim().is_empty() {
                        secrets::delete(key)?;
                    } else {
                        secrets::set(key, &value.into())?;
                    }
                } else {
                    bail!("credential value or clear must be provided");
                }
                Ok(json!({"credential_configured": secrets::get(key)?.is_some()}))
            },
            "models.translation" => Ok(json!(Translator::models().await?)),
            "models.pipeline" => Ok(json!(PipelineConfig::model_catalog())),
            "resources.status" => {
                let sample = self.editor.resources();
                Ok(json!({
                    "store": crate::runtime::Store::root(),
                    "device": koharu_ml::device(self.editor.cpu()),
                    "sample": sample.map(|sample| json!({
                        "process_memory_bytes": sample.process_memory,
                        "system_memory_bytes": sample.system_memory,
                        "process_cpu_percent": sample.process_cpu,
                        "devices": sample.devices.into_iter().map(|device| json!({
                            "name": device.name,
                            "selected": device.selected,
                            "memory_budget_bytes": device.memory_budget,
                            "memory_used_bytes": device.memory_used,
                            "utilization_percent": device.utilization,
                        })).collect::<Vec<_>>(),
                    })),
                }))
            },
            "project.list" => Ok(json!(self.editor.list_projects()?)),
            "project.delete" => {
                let Named { name } = decode(value)?;
                if self.editor.project_info().await.is_some_and(|open| open.name == name.trim()) {
                    bail!("close the project before deleting it");
                }
                self.editor.delete_project(&name).await?;
                Ok(Value::Null)
            },
            "project.create" | "project.open" => {
                let Named { name } = decode(value)?;
                if self.editor.project_info().await.is_some() {
                    bail!("close the current project first");
                }
                let info = if method == "project.create" {
                    self.editor.create_project(&name).await?
                } else {
                    self.editor.open_project(&name).await?
                };
                Ok(json!(info))
            },
            "project.close" => {
                if self.editor.agent_run().is_some() {
                    bail!("cancel the active agent run before closing the project");
                }
                if self.processing() {
                    bail!("cancel the active pipeline job before closing the project");
                }
                self.editor.close_project().await?;
                Ok(Value::Null)
            },
            "project.info" => self.info().await,
            "project.pages" => Ok(json!(self.editor.pages().await?)),
            "project.page" => {
                let PageId { page } = decode(value)?;
                Ok(json!(self.editor.page(page).await?))
            },
            "project.selectPage" => {
                let PageId { page } = decode(value)?;
                Ok(json!(self.editor.select_page(page).await?.project))
            },
            "project.importPaths" => {
                let Paths { paths } = decode(value)?;
                let pages = self.editor.import_files(paths).await?;
                Ok(json!({"pages": pages, "project": self.info().await?}))
            },
            "page.rename" => {
                let Rename { page, label } = decode(value)?;
                self.editor.rename_page(page, label).await?;
                self.info().await
            },
            "page.delete" => {
                let Pages { pages } = decode(value)?;
                self.editor.delete_pages(pages).await?;
                self.info().await
            },
            "page.move" => {
                let MovePage { page, index } = decode(value)?;
                self.editor.move_page(page, index).await?;
                self.info().await
            },
            "text.addPoint" => {
                let AddPoint { page, point } = decode(value)?;
                let commit = self.editor.add_point_text(Some(page), point).await?;
                Ok(json!({"layer": commit.layer, "project": self.info().await?}))
            },
            "text.addBox" => {
                let AddBox { page, frame } = decode(value)?;
                let commit = self.editor.add_text_box(Some(page), frame).await?;
                Ok(json!({"layer": commit.layer, "project": self.info().await?}))
            },
            "text.setSource" => {
                let SetText { layer, text } = decode(value)?;
                self.editor.set_source_text(layer, text).await?;
                self.info().await
            },
            "text.setTranslation" => {
                let SetTranslation { layer, text } = decode(value)?;
                self.editor.set_translation(layer, text).await?;
                self.info().await
            },
            "text.setTypography" => {
                let Updates { updates }: Updates<TypographyUpdate> = decode(value)?;
                self.editor.set_typography(updates).await?;
                self.info().await
            },
            "layer.setGeometry" => {
                let Updates { updates }: Updates<GeometryUpdate> = decode(value)?;
                self.editor.set_geometry(updates).await?;
                self.info().await
            },
            "layer.setVisibility" => {
                let Visibility { layers, visible, opacity } = decode(value)?;
                self.editor.set_visibility(layers, visible, opacity).await?;
                self.info().await
            },
            "layer.delete" => {
                let Layers { layers } = decode(value)?;
                self.editor.delete_layers(layers).await?;
                self.info().await
            },
            "layer.move" => {
                let MoveLayer { layer, parent, index } = decode(value)?;
                self.editor.move_layer(layer, parent, index).await?;
                self.info().await
            },
            "raster.stroke" => {
                let RasterStroke { page, layer, mode, color, diameter, points } = decode(value)?;
                let mode = match mode.as_str() {
                    "paint" => RasterStrokeMode::Paint,
                    "erase" => RasterStrokeMode::Erase,
                    _ => bail!("raster mode must be paint or erase"),
                };
                let commit = self
                    .editor
                    .raster_stroke(None, Some(page), layer, mode, color, diameter, points)
                    .await?;
                Ok(json!({"layer": commit.layer, "project": self.info().await?}))
            },
            "project.undo" => {
                self.editor.undo().await?;
                self.info().await
            },
            "project.redo" => {
                self.editor.redo().await?;
                self.info().await
            },
            "page.result" => {
                let PageId { page } = decode(value)?;
                Ok(json!(self.editor.page_result(page).await?))
            },
            "page.sourceSha256" => {
                let PageId { page } = decode(value)?;
                Ok(json!({"sha256": self.editor.page_source_sha256(page).await?}))
            },
            "pipeline.run" => {
                let RunPipeline { operation, scope, cpu } = decode(value)?;
                self.check_device(cpu)?;
                if self.editor.agent_run().is_some() || self.processing() {
                    bail!("another processing job is active");
                }
                let report = self
                    .editor
                    .run(
                        scope.unwrap_or_default(),
                        operation.unwrap_or_default(),
                        StopToken::default(),
                        None,
                    )
                    .await?;
                let mut value = report_value(&report);
                value["project"] = self.info().await?;
                Ok(value)
            },
            "pipeline.status" => Ok(json!({
                "running": self.active_pipeline().map(|job| job.job),
            })),
            "pipeline.start" => {
                let RunPipeline { operation, scope, cpu } = decode(value)?;
                self.check_device(cpu)?;
                if self.editor.agent_run().is_some() || self.processing() {
                    bail!("another processing job is active");
                }
                if self.editor.project_info().await.is_none() {
                    bail!("no project is open");
                }
                self.next_job = self.next_job.checked_add(1).context("pipeline job ID overflow")?;
                let job = self.next_job;
                let stop = StopToken::default();
                let editor = self.editor.clone();
                let output = self.output.clone();
                let task_stop = stop.clone();
                let task = tokio::spawn(async move {
                    let _ = output.send(
                        json!({"event": "pipeline", "job": job, "value": {"type": "started"}}),
                    );
                    let progress_output = output.clone();
                    let progress = Arc::new(move |event: Progress| {
                        let _ = progress_output.send(json!({
                            "event": "pipeline",
                            "job": job,
                            "value": progress_value(event),
                        }));
                    });
                    let result = editor
                        .run(
                            scope.unwrap_or_default(),
                            operation.unwrap_or_default(),
                            task_stop,
                            Some(progress),
                        )
                        .await;
                    let value = match result {
                        Ok(report) => {
                            let mut value = report_value(&report);
                            value["type"] = json!(if report.status == RunStatus::Stopped {
                                "stopped"
                            } else {
                                "completed"
                            });
                            value["project"] = json!(editor.project_info().await);
                            value
                        },
                        Err(error) => json!({"type": "failed", "message": format!("{error:#}")}),
                    };
                    let _ = output.send(json!({"event": "pipeline", "job": job, "value": value}));
                });
                self.pipeline = Some(ActivePipeline { job, stop, task });
                Ok(json!({"job": job}))
            },
            "pipeline.cancel" => {
                let PipelineCancel { job } = decode(value)?;
                let active = self.active_pipeline().context("no pipeline job is active")?;
                if active.job != job {
                    bail!("pipeline job identifier does not match the active job");
                }
                active.stop.stop();
                Ok(json!({"cancelled": true}))
            },
            "page.exportPng" | "page.exportPsd" => {
                let Export { page, path } = decode(value)?;
                let format =
                    if method == "page.exportPng" { PageFormat::Png } else { PageFormat::Psd };
                let bytes = self.editor.export_page(page, format).await?;
                tokio::fs::write(&path, &bytes).await?;
                Ok(json!({"path": path, "bytes": bytes.len()}))
            },
            "canvas.preparePage" => {
                let PageId { page } = decode(value)?;
                let revision = self.editor.snapshot().await?.revision();
                let prepared = self.editor.prepare_canvas_page(page).await?;
                Ok(json!({
                    "prepared": prepared.is_some(),
                    "revision": prepared.map_or(revision, |prepared| prepared.revision),
                }))
            },
            "canvas.manifest" => {
                let PageId { page } = decode(value)?;
                let revision = self.editor.snapshot().await?.revision();
                let bytes = self.editor.canvas_page_manifest(page, revision)?;
                Ok(json!({"base64": STANDARD.encode(bytes)}))
            },
            "canvas.resource" => {
                let CanvasResource { page, resource } = decode(value)?;
                let revision = self.editor.snapshot().await?.revision();
                let bytes = self.editor.canvas_page_resource(page, revision, &resource)?;
                Ok(json!({"base64": STANDARD.encode(bytes)}))
            },
            _ => bail!("unknown SDK method: {method}"),
        }
    }
}

fn decode<T: DeserializeOwned>(value: Value) -> Result<T> {
    serde_json::from_value(value).context("invalid method parameters")
}

fn report_value(report: &Report) -> Value {
    json!({
        "status": format!("{:?}", report.status).to_lowercase(),
        "base": report.base,
        "finalRevision": report.final_revision,
        "completed": report.completed,
        "total": report.total,
        "elapsedMs": report.elapsed.as_millis(),
    })
}

fn progress_value(progress: Progress) -> Value {
    match progress {
        Progress::Started { pages, stages } => {
            json!({"type": "progress_started", "pages": pages, "stages": stages})
        },
        Progress::Loading { page, stage, model } => {
            json!({"type": "loading", "page": page, "stage": stage, "model": model})
        },
        Progress::Running { page, stage, model } => {
            json!({"type": "running", "page": page, "stage": stage, "model": model})
        },
        Progress::Finished { page, stage, model, elapsed } => {
            json!({
                "type": "finished",
                "page": page,
                "stage": stage,
                "model": model,
                "elapsedMs": elapsed.as_millis()
            })
        },
        Progress::Skipped { page, stage } => {
            json!({"type": "skipped", "page": page, "stage": stage})
        },
    }
}

#[derive(Deserialize)]
struct Named {
    name: String,
}
#[derive(Deserialize)]
struct PageId {
    page: EntityId,
}
#[derive(Deserialize)]
struct Pages {
    pages: Vec<EntityId>,
}
#[derive(Deserialize)]
struct Paths {
    paths: Vec<PathBuf>,
}
#[derive(Deserialize)]
struct Rename {
    page: EntityId,
    label: String,
}
#[derive(Deserialize)]
struct MovePage {
    page: EntityId,
    index: usize,
}
#[derive(Deserialize)]
struct AddPoint {
    page: EntityId,
    point: Point,
}
#[derive(Deserialize)]
struct AddBox {
    page: EntityId,
    frame: Frame,
}
#[derive(Deserialize)]
struct SetText {
    layer: EntityId,
    text: String,
}
#[derive(Deserialize)]
struct SetTranslation {
    layer: EntityId,
    text: Option<String>,
}
#[derive(Deserialize)]
struct Updates<T> {
    updates: Vec<T>,
}
#[derive(Deserialize)]
struct Layers {
    layers: Vec<EntityId>,
}
#[derive(Deserialize)]
struct MoveLayer {
    layer: EntityId,
    parent: EntityId,
    index: usize,
}
#[derive(Deserialize)]
struct RasterStroke {
    page: EntityId,
    layer: Option<EntityId>,
    mode: String,
    color: [u8; 4],
    diameter: f32,
    points: Vec<Point>,
}
#[derive(Deserialize)]
struct Visibility {
    layers: Vec<EntityId>,
    visible: Option<bool>,
    opacity: Option<f32>,
}
#[derive(Deserialize)]
struct RunPipeline {
    operation: Option<Operation>,
    scope: Option<Scope>,
    cpu: Option<bool>,
}
#[derive(Deserialize)]
struct Export {
    page: EntityId,
    path: PathBuf,
}
#[derive(Deserialize)]
struct CanvasResource {
    page: EntityId,
    resource: String,
}
#[derive(Deserialize)]
struct PipelinePreference {
    pipeline: PipelineConfig,
}
#[derive(Deserialize)]
struct ProviderPreferences {
    entries: Vec<ProviderConfig>,
}
#[derive(Deserialize)]
struct TypesettingPreference {
    typesetting: TypesettingConfig,
}
#[derive(Deserialize)]
struct CredentialPreference {
    provider: String,
    value: Option<String>,
    clear: Option<bool>,
}
#[derive(Deserialize)]
struct AgentRun {
    prompt: String,
    cpu: Option<bool>,
}
#[derive(Deserialize)]
struct AgentCancel {
    run: RunId,
}
#[derive(Deserialize)]
struct AgentPreference {
    config: AgentConfig,
}
#[derive(Deserialize)]
struct PipelineCancel {
    job: u64,
}
