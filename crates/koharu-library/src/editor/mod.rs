// SPDX-License-Identifier: MIT OR Apache-2.0
//! The Koharu editor engine: one open project, its canvas presentation, processing jobs, the
//! agent and the settings. It is the only owner of this state; every host is a thin binding:
//!
//! - `koharu-app`: Tauri commands (Specta), in the desktop process;
//! - `koharu-sdk`: JSON Lines on stdio ([`dispatch`]), for `shenron-server` and Bun;
//! - [`crate::Service`]: the headless method set of `@shenron/koharu/native`.
//!
//! Hosts receive live values through [`Sink`]s (Tauri channels, JSON Lines events).

mod agent;
mod canvas;
pub mod dispatch;
mod fonts;
pub mod knowledge;
mod output;
mod preferences;
mod types;

use std::{
    collections::HashMap,
    future::Future,
    path::{Path, PathBuf},
    pin::Pin,
    sync::{Arc, OnceLock, Weak},
};

use anyhow::{Context as _, Result, bail};
use async_trait::async_trait;
use koharu_desktop::{CanvasState, Desktop};
use koharu_pipeline::{
    Committer, InpaintingMask, Operation, Pipeline, PipelineError, Progress, Report, Request,
    RunStatus, Scope, StageOutput, StopToken,
};
use koharu_scene::{Commit, EntityId, Snapshot};
use parking_lot::Mutex as SyncMutex;
use strum::{EnumMessage as _, IntoEnumIterator as _};
use tokio::sync::{Mutex, OnceCell};

pub use agent::AgentStatus;
pub use fonts::{FontFace, FontFamily, FontMetadata, FontRange, FontSource};
pub use koharu_agent::Toolbox;
pub use output::PageFormat;
pub use preferences::{
    CredentialInput, LanguageChoice, Preferences, ProviderPreference, ProviderPreferences,
};
pub use types::{
    CanvasPagePreparation, DeviceResources, Download, DownloadState, ExportFormat, Job, JobId,
    JobState, LayerCommit, ModelResources, PageImportSource, PageSelection, PaintBrush,
    StartupState,
};

use crate::{
    home::Roots,
    import,
    project::{Page, PageSummary, Project, ProjectInfo, ProjectLibrary, ProjectSummary},
};

/// A live value receiver; `false` means it is gone and is dropped.
pub type Sink<T> = Arc<dyn Fn(T) -> bool + Send + Sync>;

/// The receivers of one editor window (`subscribe`); a new subscription replaces them.
pub struct Subscription {
    pub canvas: Sink<CanvasState>,
    pub job: Sink<Job>,
    pub download: Sink<Download>,
    pub resources: Sink<ModelResources>,
    pub project: Sink<Option<ProjectInfo>>,
}

struct Slot<T>(SyncMutex<Option<Sink<T>>>);

impl<T> Default for Slot<T> {
    fn default() -> Self {
        Self(SyncMutex::new(None))
    }
}

impl<T> Slot<T> {
    fn set(&self, sink: Sink<T>) {
        *self.0.lock() = Some(sink);
    }

    fn publish(&self, value: T) {
        let mut slot = self.0.lock();
        if slot.as_ref().is_some_and(|sink| !sink(value)) {
            slot.take();
        }
    }
}

type Change<'project, T> = Pin<Box<dyn Future<Output = Result<(Commit, T)>> + Send + 'project>>;

struct Inner {
    projects: ProjectLibrary,
    cpu: bool,
    project: Mutex<Option<Project>>,
    desktop: Desktop,
    pipeline: OnceCell<Pipeline>,
    jobs: SyncMutex<HashMap<JobId, Job>>,
    stops: SyncMutex<HashMap<JobId, StopToken>>,
    inpainting_mask: SyncMutex<Option<InpaintingMask>>,
    canvas: Slot<CanvasState>,
    job: Slot<Job>,
    download: Slot<Download>,
    resources: Slot<ModelResources>,
    project_info: Slot<Option<ProjectInfo>>,
    agent: OnceLock<agent::AgentState>,
}

/// The editor engine. Cloning shares it.
#[derive(Clone)]
pub struct Editor {
    inner: Arc<Inner>,
}

impl Editor {
    /// An editor on a project library. `cpu` pins the model device to the CPU. Must run in a
    /// Tokio runtime (the renderer and the download relay start here); the model runtime only
    /// starts on [`Editor::warm_up`], the first subscription or the first processing request.
    pub fn new(projects: ProjectLibrary, cpu: bool) -> Result<Self> {
        let inner = Arc::new(Inner {
            projects,
            cpu,
            project: Mutex::new(None),
            desktop: Desktop::new()?,
            pipeline: OnceCell::new(),
            jobs: SyncMutex::new(HashMap::new()),
            stops: SyncMutex::new(HashMap::new()),
            inpainting_mask: SyncMutex::new(None),
            canvas: Slot::default(),
            job: Slot::default(),
            download: Slot::default(),
            resources: Slot::default(),
            project_info: Slot::default(),
            agent: OnceLock::new(),
        });
        let state = agent::AgentState::new(agent::EditorHost::new(Arc::downgrade(&inner)))?;
        if inner.agent.set(state).is_err() {
            unreachable!("the agent state is set once, here");
        }
        tokio::spawn(relay_downloads(Arc::downgrade(&inner)));
        Ok(Self { inner })
    }

    /// An editor on Shenron's storage roots: projects of the home (upstream projects still
    /// readable) and the package store selected for the process.
    pub fn from_roots(roots: &Roots, cpu: bool) -> Result<Self> {
        roots.configure_store();
        Self::new(ProjectLibrary::from_roots(roots)?, cpu)
    }

    /// Root of new projects.
    #[must_use]
    pub fn projects_root(&self) -> &Path {
        self.inner.projects.root()
    }

    fn from_inner(inner: Arc<Inner>) -> Self {
        Self { inner }
    }

    fn agent(&self) -> &agent::AgentState {
        self.inner.agent.get().expect("the agent state is set at construction")
    }

    /// Start the model runtime now instead of on first use.
    pub async fn warm_up(&self) -> Result<()> {
        self.runtime().await.map(drop)
    }

    /// The model pipeline, started once (ML runtime, device, live configuration).
    async fn runtime(&self) -> Result<Pipeline> {
        let inner = &self.inner;
        let pipeline = inner
            .pipeline
            .get_or_try_init(|| async {
                koharu_ml::init().await.context("failed to initialize the ML runtime")?;
                let device = koharu_ml::device(inner.cpu);
                tracing::info!(
                    backend = %device.backend,
                    device_type = ?device.device_type,
                    device = ?device.description,
                    memory_bytes = ?device.memory_total,
                    "Koharu runtime ready",
                );
                let pipeline = Pipeline::load(device)?;
                tokio::spawn(relay_resources(
                    pipeline.subscribe_resources(),
                    Arc::downgrade(inner),
                ));
                let current = inner
                    .project
                    .lock()
                    .await
                    .as_ref()
                    .map(|project| (project.snapshot(), project.active_page()));
                match current {
                    Some((snapshot, page)) => {
                        inner.desktop.show_page(&snapshot, page).await?;
                    },
                    None => inner.desktop.clear().await,
                }
                Ok::<_, anyhow::Error>(pipeline)
            })
            .await?;
        Ok(pipeline.clone())
    }

    // ── Subscription ────────────────────────────────────────────────────────────────────

    /// Bind a window's receivers once the runtime is ready and return its startup state.
    pub async fn subscribe(&self, subscription: Subscription) -> Result<StartupState> {
        self.runtime().await?;
        let inner = &self.inner;
        inner.canvas.set(subscription.canvas);
        inner.job.set(subscription.job);
        inner.download.set(subscription.download);
        inner.resources.set(subscription.resources);
        inner.project_info.set(subscription.project);
        Ok(StartupState {
            preferences: Preferences::load()?,
            jobs: inner.jobs.lock().values().cloned().collect(),
            canvas: inner.desktop.canvas_state(),
        })
    }

    fn publish_canvas(&self) {
        self.inner.canvas.publish(self.inner.desktop.canvas_state());
    }

    /// Present `commit` on the canvas and publish the new canvas state.
    async fn synchronize(&self, commit: &Commit, page: Option<EntityId>) -> Result<()> {
        self.inner.desktop.synchronize(&commit.snapshot, page, commit).await?;
        self.publish_canvas();
        Ok(())
    }

    /// Stop the jobs and the agent work of a closing window.
    pub fn cancel_work(&self) {
        self.stop_jobs();
        self.agent().cancel_all();
    }

    fn stop_jobs(&self) {
        let mut stops = self.inner.stops.lock();
        for stop in stops.values() {
            stop.stop();
        }
        stops.clear();
        self.inner.jobs.lock().clear();
    }

    // ── Projects ────────────────────────────────────────────────────────────────────────

    pub async fn project_info(&self) -> Option<ProjectInfo> {
        self.inner.project.lock().await.as_ref().map(Project::info)
    }

    /// The open project's current snapshot.
    pub async fn snapshot(&self) -> Result<Snapshot> {
        Ok(self.inner.project.lock().await.as_ref().context("no project is open")?.snapshot())
    }

    pub async fn pages(&self) -> Result<Vec<PageSummary>> {
        Project::pages(&self.snapshot().await?)
    }

    /// The active page of the open project.
    pub async fn active_page(&self) -> Result<Option<Page>> {
        let current = {
            let project = self.inner.project.lock().await;
            project.as_ref().map(|project| (project.snapshot(), project.active_page()))
        };
        current
            .and_then(|(snapshot, page)| page.map(|page| (snapshot, page)))
            .map(|(snapshot, page)| Project::page(&snapshot, page))
            .transpose()
    }

    pub async fn page(&self, page: EntityId) -> Result<Page> {
        Project::page(&self.snapshot().await?, page)
    }

    pub fn list_projects(&self) -> Result<Vec<ProjectSummary>> {
        self.inner.projects.list()
    }

    pub async fn create_project(&self, name: &str) -> Result<ProjectInfo> {
        let opened = self.inner.projects.create(name).await?;
        tracing::info!("Koharu project created");
        self.replace_project(opened).await
    }

    pub async fn open_project(&self, name: &str) -> Result<ProjectInfo> {
        let opened = self.inner.projects.open(name).await?;
        self.replace_project(opened).await
    }

    async fn replace_project(&self, opened: Project) -> Result<ProjectInfo> {
        let snapshot = opened.snapshot();
        let page = opened.active_page();
        let info = opened.info();

        self.agent().reset().await;
        self.stop_jobs();
        let previous = self.inner.project.lock().await.replace(opened);

        self.inner.desktop.show_page(&snapshot, page).await?;
        drop(previous);
        self.publish_canvas();
        self.inner.project_info.publish(Some(info.clone()));
        Ok(info)
    }

    pub async fn close_project(&self) -> Result<()> {
        self.agent().reset().await;
        self.stop_jobs();
        let previous = self.inner.project.lock().await.take();
        self.inner.desktop.clear().await;
        drop(previous);
        self.publish_canvas();
        self.inner.project_info.publish(None);
        Ok(())
    }

    pub async fn delete_project(&self, name: &str) -> Result<()> {
        let active = self
            .inner
            .project
            .lock()
            .await
            .as_ref()
            .is_some_and(|project| project.name == name.trim());
        if active {
            self.close_project().await?;
        }
        let library = self.inner.projects.clone();
        let name = name.to_owned();
        tokio::task::spawn_blocking(move || library.delete(&name))
            .await
            .context("project deletion task failed")?
    }

    pub async fn select_page(&self, page: EntityId) -> Result<PageSelection> {
        let (snapshot, project, selected) = {
            let mut current = self.inner.project.lock().await;
            let project = current.as_mut().context("no project is open")?;
            project.select_page(page)?;
            let snapshot = project.snapshot();
            let selected = Project::page(&snapshot, page)?;
            (snapshot, project.info(), selected)
        };
        if self.inner.desktop.show_page(&snapshot, Some(page)).await? {
            self.publish_canvas();
        }
        Ok(PageSelection { project, page: selected })
    }

    /// File extensions the importer reads (images, archives, PDF).
    #[must_use]
    pub fn import_extensions() -> Vec<&'static str> {
        import::Format::iter().flat_map(|format| format.get_serializations()).copied().collect()
    }

    /// The importable files below `folder`, symbolic links not followed.
    #[must_use]
    pub fn importable_files(folder: &Path) -> Vec<PathBuf> {
        walkdir::WalkDir::new(folder)
            .follow_links(false)
            .into_iter()
            .filter_map(|entry| match entry {
                Ok(entry) if entry.file_type().is_file() => Some(entry.into_path()),
                Ok(_) => None,
                Err(error) => {
                    tracing::warn!(%error, "could not inspect an import directory entry");
                    None
                },
            })
            .filter(|path| {
                path.extension()
                    .and_then(|extension| extension.to_str())
                    .is_some_and(|extension| extension.parse::<import::Format>().is_ok())
            })
            .collect()
    }

    /// Import pages from images, archives and PDF files into the open project, in order.
    pub async fn import_files(&self, files: Vec<PathBuf>) -> Result<Vec<EntityId>> {
        if !self.inner.stops.lock().is_empty() {
            bail!("pages cannot be imported while processing is running");
        }
        if files.is_empty() {
            bail!("no supported images were found in the selection");
        }
        let pages = tokio_rayon::spawn(move || import::import(files)).await?;
        let page_count = pages.len();
        let (commit, page, ids) = {
            let mut current = self.inner.project.lock().await;
            let project = current.as_mut().context("no project is open")?;
            let (commit, ids) = project.import_pages(pages).await?;
            (commit, project.active_page(), ids)
        };
        self.synchronize(&commit, page).await?;
        tracing::info!(page_count, "Koharu pages imported");
        Ok(ids)
    }

    // ── Edits ───────────────────────────────────────────────────────────────────────────

    /// Apply one project change, then present it. `record` adds it to the undo history;
    /// `reconcile` moves the active page off a deleted one.
    async fn mutate<T>(
        &self,
        record: bool,
        reconcile: bool,
        change: impl for<'project> FnOnce(&'project mut Project) -> Change<'project, T>,
    ) -> Result<(Commit, T)> {
        let (commit, value, page) = {
            let mut current = self.inner.project.lock().await;
            let project = current.as_mut().context("no project is open")?;
            let (commit, value) = change(project).await?;
            if record {
                project.record_commit(&commit);
            }
            if reconcile {
                project.reconcile_page();
            }
            (commit, value, project.active_page())
        };
        self.synchronize(&commit, page).await?;
        Ok((commit, value))
    }

    pub async fn rename_page(&self, page: EntityId, label: String) -> Result<Commit> {
        let (commit, ()) = self
            .mutate(true, false, |project| {
                Box::pin(async move { Ok((project.rename_page(page, label).await?, ())) })
            })
            .await?;
        Ok(commit)
    }

    pub async fn delete_pages(&self, pages: Vec<EntityId>) -> Result<Commit> {
        let (commit, ()) = self
            .mutate(true, true, |project| {
                Box::pin(async move { Ok((project.delete_pages(pages).await?, ())) })
            })
            .await?;
        Ok(commit)
    }

    pub async fn move_page(&self, page: EntityId, index: usize) -> Result<Commit> {
        let (commit, ()) = self
            .mutate(true, false, |project| {
                Box::pin(async move { Ok((project.move_page(page, index).await?, ())) })
            })
            .await?;
        Ok(commit)
    }

    pub async fn set_source_text(&self, layer: EntityId, text: String) -> Result<Commit> {
        let (commit, ()) = self
            .mutate(true, false, |project| {
                Box::pin(async move { Ok((project.set_source_text(layer, text).await?, ())) })
            })
            .await?;
        Ok(commit)
    }

    pub async fn set_translation(&self, layer: EntityId, text: Option<String>) -> Result<Commit> {
        let (commit, ()) = self
            .mutate(true, false, |project| {
                Box::pin(async move { Ok((project.set_translation(layer, text).await?, ())) })
            })
            .await?;
        Ok(commit)
    }

    pub async fn set_typography(
        &self,
        updates: Vec<crate::project::TypographyUpdate>,
    ) -> Result<Commit> {
        let (commit, ()) = self
            .mutate(true, false, |project| {
                Box::pin(async move { Ok((project.set_typography(updates).await?, ())) })
            })
            .await?;
        Ok(commit)
    }

    pub async fn set_geometry(
        &self,
        updates: Vec<crate::project::GeometryUpdate>,
    ) -> Result<Commit> {
        let (commit, ()) = self
            .mutate(true, false, |project| {
                Box::pin(async move { Ok((project.set_geometry(updates).await?, ())) })
            })
            .await?;
        Ok(commit)
    }

    pub async fn set_visibility(
        &self,
        layers: Vec<EntityId>,
        visible: Option<bool>,
        opacity: Option<f32>,
    ) -> Result<Commit> {
        let (commit, ()) = self
            .mutate(true, false, |project| {
                Box::pin(async move {
                    Ok((project.set_visibility(layers, visible, opacity).await?, ()))
                })
            })
            .await?;
        Ok(commit)
    }

    pub async fn delete_layers(&self, layers: Vec<EntityId>) -> Result<Commit> {
        let (commit, ()) = self
            .mutate(true, false, |project| {
                Box::pin(async move { Ok((project.delete_layers(layers).await?, ())) })
            })
            .await?;
        Ok(commit)
    }

    /// Move a layer under `parent` at `index`; returns the active page after the move.
    pub async fn move_layer(
        &self,
        layer: EntityId,
        parent: EntityId,
        index: usize,
    ) -> Result<Page> {
        let (commit, ()) = self
            .mutate(true, false, |project| {
                Box::pin(async move { Ok((project.move_layer(layer, parent, index).await?, ())) })
            })
            .await?;
        let page = self
            .inner
            .project
            .lock()
            .await
            .as_ref()
            .and_then(Project::active_page)
            .context("no active page")?;
        Project::page(&commit.snapshot, page)
    }

    pub async fn undo(&self) -> Result<Commit> {
        let (commit, ()) = self
            .mutate(false, true, |project| Box::pin(async move { Ok((project.undo().await?, ())) }))
            .await?;
        Ok(commit)
    }

    pub async fn redo(&self) -> Result<Commit> {
        let (commit, ()) = self
            .mutate(false, true, |project| Box::pin(async move { Ok((project.redo().await?, ())) }))
            .await?;
        Ok(commit)
    }

    // ── Processing ──────────────────────────────────────────────────────────────────────

    /// Reserve the single processing slot for `job`.
    fn begin_job(&self, job: JobId, stop: StopToken) -> Result<()> {
        let mut stops = self.inner.stops.lock();
        if !stops.is_empty() {
            bail!("another process is already running");
        }
        stops.insert(job, stop);
        Ok(())
    }

    /// `true` while a processing job runs.
    #[must_use]
    pub fn busy(&self) -> bool {
        !self.inner.stops.lock().is_empty()
    }

    /// `true` when the models run on the CPU.
    #[must_use]
    pub fn cpu(&self) -> bool {
        self.inner.cpu
    }

    fn end_job(&self, job: JobId) {
        self.inner.stops.lock().remove(&job);
    }

    /// Run the pipeline on the open project and wait for its report. Each stage output is
    /// committed, recorded in the undo history and presented on the canvas.
    pub async fn run(
        &self,
        scope: Scope,
        operation: Operation,
        stop: StopToken,
        progress: Option<koharu_pipeline::ProgressSink>,
    ) -> Result<Report> {
        let snapshot = self.snapshot().await?;
        let pipeline = self.runtime().await?;
        let job = JobId::new();
        self.begin_job(job, stop.clone())?;
        let result = self
            .execute(
                &pipeline,
                snapshot,
                Request { operation, scope, stop, progress, inpainting_mask: None },
            )
            .await;
        self.end_job(job);
        result.map_err(anyhow::Error::from)
    }

    async fn execute(
        &self,
        pipeline: &Pipeline,
        snapshot: Snapshot,
        request: Request,
    ) -> std::result::Result<Report, PipelineError> {
        let mut committer = EditorCommitter { editor: self.clone() };
        let report = pipeline.execute(snapshot, request, &mut committer).await;
        if let Ok(report) = &report {
            tracing::info!(
                status = ?report.status,
                completed = report.completed,
                total = report.total,
                elapsed_ms = report.elapsed.as_secs_f64() * 1000.0,
                "Koharu pipeline finished",
            );
        }
        report
    }

    /// Start a processing job; its progress and outcome go to the job receiver.
    pub async fn process(&self, scope: Scope, operation: Operation) -> Result<JobId> {
        let snapshot = self.snapshot().await?;
        let pipeline = self.runtime().await?;
        let id = JobId::new();
        let stop = StopToken::default();
        self.begin_job(id, stop.clone())?;
        let job = Job {
            id,
            state: JobState::Running,
            completed: 0,
            total: 0,
            page: None,
            stage: None,
            model: None,
            error: None,
        };
        self.inner.jobs.lock().insert(id, job.clone());
        self.inner.job.publish(job);

        let inpainting_mask = self.inner.inpainting_mask.lock().take();
        let editor = self.clone();
        tokio::spawn(async move {
            let progress = Arc::new(SyncMutex::new((0_usize, 0_usize)));
            let weak = Arc::downgrade(&editor.inner);
            let request = Request {
                operation,
                scope,
                stop,
                progress: Some(Arc::new(move |event| {
                    if let Some(inner) = weak.upgrade() {
                        Editor::from_inner(inner).progress(id, &progress, event);
                    }
                })),
                inpainting_mask,
            };
            let result = editor.execute(&pipeline, snapshot, request).await;
            let (stopped, error) = match result {
                Ok(report) => (report.status == RunStatus::Stopped, None),
                Err(error) => {
                    tracing::error!(stage = ?error.stage, %error, "processing failed");
                    (false, Some(format!("{error:#}")))
                },
            };
            editor.end_job(id);
            let job = editor.inner.jobs.lock().remove(&id).map(|mut job| {
                job.state = if stopped {
                    JobState::Stopped
                } else if error.is_some() {
                    JobState::Failed
                } else {
                    JobState::Finished
                };
                job.error = error;
                job
            });
            if let Some(job) = job {
                editor.inner.job.publish(job);
            }
        });
        Ok(id)
    }

    /// Fold one progress event into the job and publish it; stage durations are traced.
    fn progress(&self, id: JobId, counts: &SyncMutex<(usize, usize)>, event: Progress) {
        let update = match event {
            Progress::Started { pages, stages } => {
                let mut counts = counts.lock();
                *counts = (0, pages.len().saturating_mul(stages.len()));
                Some((0, counts.1, None, None, None))
            },
            Progress::Loading { page, stage, model } => {
                let counts = counts.lock();
                Some((counts.0, counts.1, Some(page), Some(stage), Some(model)))
            },
            Progress::Finished { page, stage, model, elapsed } => {
                tracing::info!(
                    stage = %stage,
                    model,
                    duration_ms = elapsed.as_secs_f64() * 1000.0,
                    "Koharu stage finished",
                );
                let mut counts = counts.lock();
                counts.0 = counts.0.saturating_add(1).min(counts.1);
                Some((counts.0, counts.1, Some(page), Some(stage), Some(model)))
            },
            Progress::Skipped { page, stage } => {
                let mut counts = counts.lock();
                counts.0 = counts.0.saturating_add(1).min(counts.1);
                Some((counts.0, counts.1, Some(page), Some(stage), None))
            },
            Progress::Running { .. } => None,
        };
        let Some((completed, total, page, stage, model)) = update else {
            return;
        };
        let job = self.inner.jobs.lock().get_mut(&id).map(|job| {
            job.completed = completed;
            job.total = total;
            job.page = page;
            job.stage = stage;
            job.model = model;
            job.clone()
        });
        if let Some(job) = job {
            self.inner.job.publish(job);
        }
    }

    pub fn stop_job(&self, job: JobId) -> Result<()> {
        self.inner
            .stops
            .lock()
            .get(&job)
            .with_context(|| format!("job {job} is not running"))?
            .stop();
        tracing::info!(%job, "Koharu job stop requested");
        Ok(())
    }

    /// Latest CPU and accelerator sample, once the runtime runs.
    #[must_use]
    pub fn resources(&self) -> Option<ModelResources> {
        self.inner
            .pipeline
            .get()
            .map(|pipeline| pipeline.subscribe_resources().borrow().clone().into())
    }

    // ── Agent ───────────────────────────────────────────────────────────────────────────

    /// Extra agent tools (Shenron knowledge, for example); `None` removes them.
    pub fn set_toolbox(&self, toolbox: Option<Arc<dyn Toolbox>>) {
        self.agent().set_toolbox(toolbox);
    }

    pub async fn agent_status(&self) -> Result<AgentStatus> {
        self.agent().status().await
    }

    pub async fn agent_models(&self) -> Result<Vec<koharu_agent::CodexModel>> {
        self.agent().models().await
    }

    /// Run the device sign-in to Codex; returns once it completes, fails or is cancelled.
    pub async fn login_agent(
        &self,
        on_event: Sink<koharu_agent::LoginEvent>,
    ) -> Result<AgentStatus> {
        self.agent().login(on_event).await
    }

    pub fn cancel_agent_login(&self) -> Result<()> {
        self.agent().cancel_login()
    }

    #[must_use]
    pub fn agent_login_running(&self) -> bool {
        self.agent().login_running()
    }

    pub async fn logout_agent(&self) -> Result<AgentStatus> {
        self.agent().logout().await
    }

    pub fn save_agent_config(&self, config: koharu_agent::Config) -> Result<koharu_agent::Config> {
        self.agent().save_config(config)
    }

    pub fn run_agent(
        &self,
        prompt: &str,
        on_event: Sink<koharu_agent::Event>,
    ) -> Result<koharu_agent::RunId> {
        self.agent().run(prompt, on_event)
    }

    pub fn cancel_agent(&self, run: koharu_agent::RunId) -> Result<()> {
        self.agent().cancel(run)
    }

    #[must_use]
    pub fn agent_run(&self) -> Option<koharu_agent::RunId> {
        self.agent().running()
    }

    /// Forget the conversation (refused during a run).
    pub async fn clear_agent(&self) -> Result<()> {
        self.agent().clear().await
    }

    // ── Preferences ─────────────────────────────────────────────────────────────────────

    pub fn preferences(&self) -> Result<Preferences> {
        Preferences::load()
    }

    pub fn save_preferences(
        &self,
        pipeline: koharu_pipeline::PipelineConfig,
        providers: ProviderPreferences,
        typesetting: koharu_renderer::TypesettingConfig,
    ) -> Result<Preferences> {
        Preferences::save(pipeline, providers, typesetting)
    }

    pub async fn translation_models(&self) -> Result<Vec<koharu_translator::Model>> {
        koharu_translator::Translator::models().await
    }
}

/// Commits pipeline stage outputs to the open project and presents them.
struct EditorCommitter {
    editor: Editor,
}

#[async_trait]
impl Committer for EditorCommitter {
    async fn commit(&mut self, output: StageOutput) -> Result<Snapshot> {
        let (commit, page) = {
            let mut current = self.editor.inner.project.lock().await;
            let project = current.as_mut().context("no project is open")?;
            let Some(commit) = project.commit_rebased(output.patch).await? else {
                return Ok(project.snapshot());
            };
            project.record_commit(&commit);
            (commit, project.active_page())
        };
        let snapshot = commit.snapshot.clone();
        self.editor.synchronize(&commit, page).await?;
        Ok(snapshot)
    }
}

async fn relay_resources(
    mut resources: tokio::sync::watch::Receiver<koharu_pipeline::ResourceSnapshot>,
    inner: Weak<Inner>,
) {
    while resources.changed().await.is_ok() {
        let snapshot = resources.borrow_and_update().clone();
        let Some(inner) = inner.upgrade() else { break };
        inner.resources.publish(snapshot.into());
    }
}

async fn relay_downloads(inner: Weak<Inner>) {
    use aphrody_ml_runtime::download::Event;
    use tokio::sync::broadcast::error::RecvError;

    let mut downloads = aphrody_ml_runtime::download::subscribe();
    loop {
        let event = match downloads.recv().await {
            Ok(event) => event,
            Err(RecvError::Lagged(skipped)) => {
                tracing::warn!(skipped, "download channel fell behind");
                continue;
            },
            Err(RecvError::Closed) => break,
        };
        let download = match event {
            Event::Started { id, name } => Download {
                id,
                state: DownloadState::Running,
                name: Some(name),
                completed: 0,
                total: 0,
                error: None,
            },
            Event::Progress { id, name, completed, total } => Download {
                id,
                state: DownloadState::Running,
                name: Some(name),
                completed,
                total,
                error: None,
            },
            Event::Finished { id } => Download {
                id,
                state: DownloadState::Finished,
                name: None,
                completed: 0,
                total: 0,
                error: None,
            },
            Event::Failed { id, name, error } => {
                tracing::warn!(%name, %error, "Koharu download failed");
                Download {
                    id,
                    state: DownloadState::Failed,
                    name: Some(name),
                    completed: 0,
                    total: 0,
                    error: Some(error),
                }
            },
        };
        let Some(inner) = inner.upgrade() else { break };
        inner.download.publish(download);
    }
}
