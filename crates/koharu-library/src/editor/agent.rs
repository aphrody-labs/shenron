// SPDX-License-Identifier: MIT OR Apache-2.0
//! The editor's Codex agent: its runs and sign-in, and the host that lets it read and edit
//! the open project (plus the tools of an optional [`Toolbox`]).

use std::{
    collections::HashMap,
    sync::{Arc, Weak},
};

use anyhow::{Context as _, Result, anyhow, bail};
use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use koharu_agent::{
    Account, Agent, Codex, CodexModel, Config, Control, Event, Host, Invocation, LoginEvent,
    RunId, Tool, ToolCall, Toolbox,
};
use koharu_desktop::Frame;
use koharu_pipeline::StopToken;
use parking_lot::{Mutex, RwLock};
use serde::Serialize;
use serde_json::{Value, json};
use specta::Type;
use tokio::sync::Notify;

use super::{Change, Editor, Inner, Preferences, Sink, output};
use crate::{
    agent_tools::*,
    project::{GeometryUpdate, Point, Project, Typography, TypographyUpdate},
};

#[derive(Clone, Debug, Serialize, Type)]
pub struct AgentStatus {
    pub account: Option<Account>,
    pub models: Vec<CodexModel>,
    pub config: Config,
    pub running: Option<RunId>,
}

type SharedToolbox = Arc<RwLock<Option<Arc<dyn Toolbox>>>>;

pub(super) struct AgentState {
    agent: Arc<Agent<EditorHost>>,
    inner: Weak<Inner>,
    toolbox: SharedToolbox,
    runs: Mutex<HashMap<RunId, Control>>,
    login: Mutex<Option<Control>>,
    idle: Notify,
}

impl AgentState {
    pub(super) fn new(host: EditorHost) -> Result<Self> {
        let toolbox = Arc::clone(&host.toolbox);
        let inner = host.inner.clone();
        Ok(Self {
            agent: Arc::new(Agent::new(Codex::new()?, host)?),
            inner,
            toolbox,
            runs: Mutex::new(HashMap::new()),
            login: Mutex::new(None),
            idle: Notify::new(),
        })
    }

    pub(super) fn set_toolbox(&self, toolbox: Option<Arc<dyn Toolbox>>) {
        *self.toolbox.write() = toolbox;
    }

    pub(super) async fn status(&self) -> Result<AgentStatus> {
        let mut account = self.agent.codex().account()?;
        let models = if account.is_some() {
            match self.agent.models().await {
                Ok(models) => models,
                Err(error) => {
                    account = self.agent.codex().account()?;
                    if account.is_some() {
                        return Err(error);
                    }
                    self.agent.clear().await;
                    Vec::new()
                }
            }
        } else {
            Vec::new()
        };
        Ok(AgentStatus {
            account,
            models,
            config: self.agent.config()?,
            running: self.running(),
        })
    }

    pub(super) async fn models(&self) -> Result<Vec<CodexModel>> {
        self.agent.models().await
    }

    pub(super) fn running(&self) -> Option<RunId> {
        self.runs.lock().keys().next().copied()
    }

    pub(super) fn login_running(&self) -> bool {
        self.login.lock().is_some()
    }

    /// Cancel every run and the sign-in, wait for them, then forget the conversation.
    pub(super) async fn reset(&self) {
        if let Some(login) = self.login.lock().as_ref() {
            login.cancel();
        }
        for control in self.runs.lock().values() {
            control.cancel();
        }
        loop {
            let idle = self.idle.notified();
            if self.login.lock().is_none() && self.runs.lock().is_empty() {
                break;
            }
            idle.await;
        }
        self.agent.clear().await;
    }

    pub(super) fn cancel_all(&self) {
        if let Some(login) = self.login.lock().take() {
            login.cancel();
        }
        for control in self.runs.lock().drain().map(|(_, control)| control) {
            control.cancel();
        }
    }

    pub(super) async fn clear(&self) -> Result<()> {
        if !self.runs.lock().is_empty() {
            bail!("cannot clear agent history during a run");
        }
        self.agent.clear().await;
        Ok(())
    }

    pub(super) async fn login(&self, on_event: Sink<LoginEvent>) -> Result<AgentStatus> {
        let control = Control::default();
        {
            let mut login = self.login.lock();
            if login.is_some() {
                bail!("Codex sign-in is already running");
            }
            *login = Some(control.clone());
        }
        tracing::info!(provider = "codex", "Koharu agent sign-in started");
        let result = self
            .agent
            .codex()
            .login_device(&control, |event| {
                on_event(event);
            })
            .await;
        self.login.lock().take();
        self.idle.notify_waiters();
        result?;
        self.status().await
    }

    pub(super) fn cancel_login(&self) -> Result<()> {
        self.login
            .lock()
            .as_ref()
            .context("no agent login is active")?
            .cancel();
        Ok(())
    }

    pub(super) async fn logout(&self) -> Result<AgentStatus> {
        self.reset().await;
        self.agent.codex().logout()?;
        self.status().await
    }

    pub(super) fn save_config(&self, config: Config) -> Result<Config> {
        self.agent.save_config(config)
    }

    pub(super) fn run(&self, prompt: &str, on_event: Sink<Event>) -> Result<RunId> {
        let prompt = prompt.trim().to_owned();
        if prompt.is_empty() {
            bail!("message cannot be empty");
        }
        if self.agent.codex().account()?.is_none() {
            bail!("Codex is not signed in");
        }
        let run = RunId::new();
        let control = Control::default();
        {
            let mut runs = self.runs.lock();
            if !runs.is_empty() {
                bail!("another agent request is already running");
            }
            runs.insert(run, control.clone());
        }
        let agent = Arc::clone(&self.agent);
        let inner = self.inner.clone();
        tokio::spawn(async move {
            let publish_control = control.clone();
            let result = agent
                .run(run, prompt, control, |event| {
                    if !on_event(event) {
                        publish_control.cancel();
                    }
                })
                .await;
            if let Err(error) = result {
                tracing::error!(%run, error = ?error, "agent request failed");
            }
            drop(agent);
            if let Some(inner) = inner.upgrade() {
                let editor = Editor::from_inner(inner);
                let state = editor.agent();
                state.runs.lock().remove(&run);
                state.idle.notify_waiters();
            }
        });
        Ok(run)
    }

    pub(super) fn cancel(&self, run: RunId) -> Result<()> {
        self.runs
            .lock()
            .get(&run)
            .with_context(|| format!("agent run {run} is not active"))?
            .cancel();
        Ok(())
    }
}

/// The agent's view of the editor: project context, project tools and the toolbox.
pub(super) struct EditorHost {
    inner: Weak<Inner>,
    toolbox: SharedToolbox,
}

impl EditorHost {
    pub(super) fn new(inner: Weak<Inner>) -> Self {
        Self {
            inner,
            toolbox: Arc::new(RwLock::new(None)),
        }
    }

    fn editor(&self) -> Result<Editor> {
        self.inner
            .upgrade()
            .map(Editor::from_inner)
            .context("the Koharu editor is closed")
    }

    fn toolbox(&self) -> Option<Arc<dyn Toolbox>> {
        self.toolbox.read().clone()
    }

    async fn project_context(&self) -> Result<Value> {
        let editor = self.editor()?;
        let (project, pages) = {
            let current = editor.inner.project.lock().await;
            let project = current.as_ref().context("no project is open")?;
            let snapshot = project.snapshot();
            let pages = Project::pages(&snapshot)?
                .into_iter()
                .map(|page| Project::page(&snapshot, page.id))
                .collect::<Result<Vec<_>>>()?;
            (project.info(), pages)
        };
        let preferences = Preferences::load()?;
        let fonts = editor.inner.desktop.renderer().available_fonts().await?;
        let providers = preferences
            .providers
            .entries
            .iter()
            .map(|provider| {
                json!({
                    "name": provider.name,
                    "config": provider.config,
                    "credential_configured": provider
                        .credential
                        .as_ref()
                        .is_some_and(|credential| credential.configured),
                })
            })
            .collect::<Vec<_>>();
        Ok(json!({
            "project": project,
            "pages": pages,
            "configuration": {
                "pipeline": preferences.pipeline,
                "providers": providers,
                "typesetting": preferences.typesetting,
                "available_fonts": fonts.into_iter().map(|font| font.name).collect::<Vec<_>>(),
            },
        }))
    }

    /// Apply a project change as one undoable revision and present it.
    async fn mutate<T>(
        &self,
        change: impl for<'project> FnOnce(&'project mut Project) -> Change<'project, T>,
    ) -> Result<Invocation>
    where
        T: Serialize + Send,
    {
        let editor = self.editor()?;
        let (commit, value) = editor.mutate(true, true, change).await?;
        let project = editor.project_info().await;
        Invocation::changed(json!({
            "revision": commit.revision,
            "project": project,
            "result": value,
        }))
    }

    async fn run_pipeline(&self, arguments: RunPipeline, control: &Control) -> Result<Invocation> {
        let editor = self.editor()?;
        let scope = arguments.scope()?;
        let stop = StopToken::default();
        let watcher = tokio::spawn({
            let control = control.clone();
            let stop = stop.clone();
            async move {
                control.cancelled().await;
                stop.stop();
            }
        });
        let result = editor
            .run(scope, arguments.operation.into(), stop, None)
            .await;
        watcher.abort();
        let report = result?;
        if report.status == koharu_pipeline::RunStatus::Stopped {
            bail!("pipeline processing was cancelled");
        }
        Invocation::changed(json!({
            "base_revision": report.base,
            "final_revision": report.final_revision,
            "completed": report.completed,
            "total": report.total,
            "elapsed_ms": report.elapsed.as_millis(),
        }))
    }
}

#[async_trait]
impl Host for EditorHost {
    async fn context(&self) -> Result<Value> {
        self.project_context().await
    }

    fn tools(&self) -> Vec<Tool> {
        let mut tools = definitions();
        if let Some(toolbox) = self.toolbox() {
            tools.extend(toolbox.tools());
        }
        tools
    }

    async fn invoke(&self, call: ToolCall, control: &Control) -> Result<Invocation> {
        tracing::debug!(tool = call.name.as_str(), "Koharu agent tool");
        match call.name.as_str() {
            "inspect_project" => {
                let _: InspectProject = arguments(&call)?;
                Invocation::read(self.project_context().await?)
            }
            "view_page" => {
                let arguments: ViewPage = arguments(&call)?;
                let page = entity(&arguments.page)?;
                let editor = self.editor()?;
                let snapshot = editor.snapshot().await?;
                let label = snapshot.page(page)?.page()?.label;
                let bytes = output::rendered_preview(&editor.inner.desktop, &snapshot, page).await?;
                Ok(
                    Invocation::read(json!({ "page": page, "label": label }))?.with_image(
                        format!("Rendered page {label} ({page})"),
                        format!("data:image/webp;base64,{}", STANDARD.encode(bytes)),
                    ),
                )
            }
            "rename_page" => {
                let arguments: RenamePage = arguments(&call)?;
                let page = entity(&arguments.page)?;
                self.mutate(|project| {
                    Box::pin(async move {
                        Ok((
                            project.rename_page(page, arguments.label).await?,
                            json!({ "page": page }),
                        ))
                    })
                })
                .await
            }
            "move_page" => {
                let arguments: MovePage = arguments(&call)?;
                let page = entity(&arguments.page)?;
                self.mutate(|project| {
                    Box::pin(async move {
                        Ok((
                            project.move_page(page, arguments.index).await?,
                            json!({ "page": page }),
                        ))
                    })
                })
                .await
            }
            "delete_pages" => {
                let arguments: DeletePages = arguments(&call)?;
                let pages = entities(&arguments.pages)?;
                self.mutate(|project| {
                    Box::pin(async move {
                        Ok((
                            project.delete_pages(pages.clone()).await?,
                            json!({ "pages": pages }),
                        ))
                    })
                })
                .await
            }
            "add_text_box" => {
                let arguments: AddTextBox = arguments(&call)?;
                let page = entity(&arguments.page)?;
                let frame = Frame {
                    x: arguments.x,
                    y: arguments.y,
                    width: arguments.width,
                    height: arguments.height,
                    angle_degrees: arguments.angle_degrees,
                };
                self.mutate(|project| {
                    Box::pin(async move {
                        let (commit, element) = project.add_text_box(page, frame).await?;
                        Ok((commit, json!({ "page": page, "element": element })))
                    })
                })
                .await
            }
            "set_source_text" => {
                let arguments: SetText = arguments(&call)?;
                let element = entity(&arguments.element)?;
                self.mutate(|project| {
                    Box::pin(async move {
                        Ok((
                            project.set_source_text(element, arguments.text).await?,
                            json!({ "element": element }),
                        ))
                    })
                })
                .await
            }
            "set_translation" => {
                let arguments: SetTranslation = arguments(&call)?;
                let element = entity(&arguments.element)?;
                self.mutate(|project| {
                    Box::pin(async move {
                        Ok((
                            project.set_translation(element, arguments.text).await?,
                            json!({ "element": element }),
                        ))
                    })
                })
                .await
            }
            "set_typography" => {
                let arguments: SetTypography = arguments(&call)?;
                let element = entity(&arguments.element)?;
                let typography = Typography {
                    preferred_font: arguments.preferred_font,
                    font_weight: arguments.font_weight,
                    font_style: arguments.font_style.map(Into::into),
                    size: arguments.size,
                    auto_fit: arguments.auto_fit,
                    color: arguments.color,
                    stroke_color: arguments.stroke_color,
                    stroke_width: arguments.stroke_width,
                    alignment: arguments.alignment.map(Into::into),
                    writing_mode: arguments.writing_mode.map(Into::into),
                };
                self.mutate(|project| {
                    Box::pin(async move {
                        Ok((
                            project
                                .set_typography(vec![TypographyUpdate {
                                    layer: element,
                                    typography,
                                }])
                                .await?,
                            json!({ "element": element }),
                        ))
                    })
                })
                .await
            }
            "set_geometry" => {
                let arguments: SetGeometry = arguments(&call)?;
                let element = entity(&arguments.element)?;
                let points = arguments
                    .points
                    .into_iter()
                    .map(|point| Point {
                        x: point.x,
                        y: point.y,
                    })
                    .collect();
                self.mutate(|project| {
                    Box::pin(async move {
                        Ok((
                            project
                                .set_geometry(vec![GeometryUpdate {
                                    layer: element,
                                    points: Some(points),
                                }])
                                .await?,
                            json!({ "element": element }),
                        ))
                    })
                })
                .await
            }
            "set_visibility" => {
                let arguments: SetVisibility = arguments(&call)?;
                let elements = entities(&arguments.elements)?;
                self.mutate(|project| {
                    Box::pin(async move {
                        Ok((
                            project
                                .set_visibility(
                                    elements.clone(),
                                    arguments.visible,
                                    arguments.opacity,
                                )
                                .await?,
                            json!({ "elements": elements }),
                        ))
                    })
                })
                .await
            }
            "delete_elements" => {
                let arguments: DeleteElements = arguments(&call)?;
                let elements = entities(&arguments.elements)?;
                self.mutate(|project| {
                    Box::pin(async move {
                        Ok((
                            project.delete_layers(elements.clone()).await?,
                            json!({ "elements": elements }),
                        ))
                    })
                })
                .await
            }
            "move_element" => {
                let arguments: MoveElement = arguments(&call)?;
                let element = entity(&arguments.element)?;
                let parent = entity(&arguments.parent)?;
                self.mutate(|project| {
                    Box::pin(async move {
                        Ok((
                            project.move_layer(element, parent, arguments.index).await?,
                            json!({ "element": element, "parent": parent }),
                        ))
                    })
                })
                .await
            }
            "run_pipeline" => self.run_pipeline(arguments(&call)?, control).await,
            name => match self.toolbox() {
                Some(toolbox) => toolbox
                    .invoke(&call, control)
                    .await
                    .unwrap_or_else(|| Err(anyhow!("unknown Koharu tool {name}"))),
                None => bail!("unknown Koharu tool {name}"),
            },
        }
    }
}
