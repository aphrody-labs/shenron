// SPDX-License-Identifier: MIT OR Apache-2.0
//! The editor's commands by name, for hosts without Tauri (`koharu-sdk`, then the
//! `/api/local/koharu` bridge of `shenron-server`).
//!
//! Names, argument keys (camelCase, as the generated `@shenron/koharu/protocol` sends them)
//! and results are those of the `koharu-app` Tauri commands; a test there keeps both lists
//! equal. Channel arguments are IPC tokens (`__CHANNEL__:<id>`) the [`Bridge`] turns into
//! [`Sink`]s; byte results (canvas packets, thumbnails, font samples) are [`Reply::Bytes`].

use std::{path::PathBuf, sync::Arc};

use anyhow::{Context as _, Result, bail};
use async_trait::async_trait;
use koharu_desktop::{Frame, TransformFrame};
use koharu_pipeline::{Operation, PipelineConfig, Scope};
use koharu_renderer::TypesettingConfig;
use koharu_scene::{EntityId, Revision};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Value, json};

use super::{
    Editor, ExportFormat, JobId, PageImportSource, PaintBrush, ProviderPreferences, Sink,
    Subscription,
};
use crate::project::{GeometryUpdate, Point, TypographyUpdate};

/// Every command [`dispatch`] answers, in the order of `koharu_app::COMMAND_NAMES`.
pub const COMMANDS: &[&str] = &[
    "get_agent_status",
    "login_agent",
    "logout_agent",
    "save_agent_config",
    "run_agent",
    "cancel_agent",
    "subscribe",
    "get_project",
    "get_pages",
    "get_page",
    "list_projects",
    "create_project",
    "open_project",
    "delete_project",
    "close_project",
    "import",
    "select_page",
    "rename_page",
    "delete_pages",
    "move_page",
    "set_source_text",
    "set_translation",
    "set_typography",
    "set_geometry",
    "set_visibility",
    "delete_layers",
    "move_layer",
    "undo",
    "redo",
    "process",
    "stop_job",
    "export",
    "get_thumbnail",
    "get_page_result",
    "get_page_source_sha256",
    "get_fonts",
    "get_font_preview",
    "save_preferences",
    "get_preferences",
    "get_translation_models",
    "get_canvas_manifest",
    "get_canvas_resource",
    "prepare_canvas_page",
    "get_canvas_page_manifest",
    "get_canvas_page_resource",
    "add_point_text",
    "add_text_box",
    "commit_paint",
    "commit_erase",
    "commit_transform",
    "commit_inpaint",
];

/// A command result: JSON, or raw bytes (an `ArrayBuffer` on the client, as over Tauri).
#[derive(Debug)]
pub enum Reply {
    Json(Value),
    Bytes(Vec<u8>),
}

/// What a non-Tauri host provides to the commands: the client's channels and native file
/// pickers (none: `import` and `export` report that they are unavailable).
#[async_trait]
pub trait Bridge: Send + Sync {
    /// The receiver of a client channel named by its IPC token (`__CHANNEL__:<id>`).
    fn channel(&self, token: &str) -> Result<Sink<Value>>;

    /// Files to import (`Files`) or the folder to import (`Folder`); `None` when cancelled.
    async fn pick_import(
        &self,
        source: PageImportSource,
        extensions: &[&'static str],
    ) -> Result<Option<Vec<PathBuf>>>;

    /// Destination folder (PNG, PSD) or archive (CBZ); `None` when cancelled.
    async fn pick_export(&self, format: ExportFormat, project: &str) -> Result<Option<PathBuf>>;
}

/// A typed receiver over a JSON one.
fn typed<T: Serialize + 'static>(sink: Sink<Value>) -> Sink<T> {
    Arc::new(move |value: T| match serde_json::to_value(value) {
        Ok(value) => sink(value),
        Err(error) => {
            tracing::warn!(%error, "channel value is not JSON");
            true
        }
    })
}

fn decode<T: DeserializeOwned>(command: &str, args: Value) -> Result<T> {
    serde_json::from_value(args).with_context(|| format!("invalid arguments for {command}"))
}

fn json<T: Serialize>(value: T) -> Result<Reply> {
    Ok(Reply::Json(serde_json::to_value(value)?))
}

fn done() -> Result<Reply> {
    Ok(Reply::Json(Value::Null))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OnEvent {
    on_event: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunAgent {
    prompt: String,
    on_event: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Subscribe {
    on_canvas: String,
    on_job: String,
    on_download: String,
    on_resources: String,
    on_project: String,
}

#[derive(Deserialize)]
struct Name {
    name: String,
}

#[derive(Deserialize)]
struct Source {
    source: PageImportSource,
}

#[derive(Deserialize)]
struct PageArg {
    page: EntityId,
}

#[derive(Deserialize)]
struct RenamePage {
    page: EntityId,
    label: String,
}

#[derive(Deserialize)]
struct Pages {
    pages: Vec<EntityId>,
}

#[derive(Deserialize)]
struct MovePage {
    page: EntityId,
    index: u32,
}

#[derive(Deserialize)]
struct SourceText {
    layer: EntityId,
    text: String,
}

#[derive(Deserialize)]
struct Translation {
    layer: EntityId,
    text: Option<String>,
}

#[derive(Deserialize)]
struct Updates<T> {
    updates: Vec<T>,
}

#[derive(Deserialize)]
struct Visibility {
    layers: Vec<EntityId>,
    visible: Option<bool>,
    opacity: Option<f32>,
}

#[derive(Deserialize)]
struct Layers {
    layers: Vec<EntityId>,
}

#[derive(Deserialize)]
struct MoveLayer {
    layer: EntityId,
    parent: EntityId,
    index: u32,
}

#[derive(Deserialize)]
struct Process {
    scope: Scope,
    operation: Operation,
}

#[derive(Deserialize)]
struct Job {
    job: JobId,
}

#[derive(Deserialize)]
struct Export {
    format: ExportFormat,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FontPreview {
    family_name: String,
}

#[derive(Deserialize)]
struct SavePreferences {
    pipeline: PipelineConfig,
    providers: ProviderPreferences,
    typesetting: TypesettingConfig,
}

#[derive(Deserialize)]
struct Generation {
    generation: u64,
}

#[derive(Deserialize)]
struct GenerationResource {
    generation: u64,
    resource: String,
}

#[derive(Deserialize)]
struct PageRevision {
    page: EntityId,
    revision: Revision,
}

#[derive(Deserialize)]
struct PageRevisionResource {
    page: EntityId,
    revision: Revision,
    resource: String,
}

#[derive(Deserialize)]
struct PointArg {
    point: Point,
}

#[derive(Deserialize)]
struct FrameArg {
    frame: Frame,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Paint {
    expected_revision: Revision,
    layer: Option<EntityId>,
    points: Vec<Point>,
    brush: PaintBrush,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Erase {
    expected_revision: Revision,
    layer: EntityId,
    points: Vec<Point>,
    diameter: f32,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Transform {
    expected_revision: Revision,
    elements: Vec<TransformFrame>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Inpaint {
    expected_revision: Revision,
    points: Vec<Point>,
    diameter: f32,
}

#[derive(Deserialize)]
struct Config {
    config: koharu_agent::Config,
}

#[derive(Deserialize)]
struct Run {
    run: koharu_agent::RunId,
}

/// Run one editor command by its Tauri name with its JSON arguments.
pub async fn dispatch(
    editor: &Editor,
    bridge: &dyn Bridge,
    command: &str,
    args: Value,
) -> Result<Reply> {
    let args = if args.is_null() { json!({}) } else { args };
    match command {
        "get_agent_status" => json(editor.agent_status().await?),
        "login_agent" => {
            let OnEvent { on_event } = decode(command, args)?;
            json(editor.login_agent(typed(bridge.channel(&on_event)?)).await?)
        }
        "logout_agent" => json(editor.logout_agent().await?),
        "save_agent_config" => {
            let Config { config } = decode(command, args)?;
            json(editor.save_agent_config(config)?)
        }
        "run_agent" => {
            let RunAgent { prompt, on_event } = decode(command, args)?;
            json(editor.run_agent(&prompt, typed(bridge.channel(&on_event)?))?)
        }
        "cancel_agent" => {
            let Run { run } = decode(command, args)?;
            editor.cancel_agent(run)?;
            done()
        }
        "subscribe" => {
            let channels: Subscribe = decode(command, args)?;
            let subscription = Subscription {
                canvas: typed(bridge.channel(&channels.on_canvas)?),
                job: typed(bridge.channel(&channels.on_job)?),
                download: typed(bridge.channel(&channels.on_download)?),
                resources: typed(bridge.channel(&channels.on_resources)?),
                project: typed(bridge.channel(&channels.on_project)?),
            };
            json(editor.subscribe(subscription).await?)
        }
        "get_project" => json(editor.project_info().await),
        "get_pages" => json(editor.pages().await?),
        "get_page" => json(editor.active_page().await?),
        "list_projects" => json(editor.list_projects()?),
        "create_project" => {
            let Name { name } = decode(command, args)?;
            editor.create_project(&name).await?;
            done()
        }
        "open_project" => {
            let Name { name } = decode(command, args)?;
            editor.open_project(&name).await?;
            done()
        }
        "delete_project" => {
            let Name { name } = decode(command, args)?;
            editor.delete_project(&name).await?;
            done()
        }
        "close_project" => {
            editor.close_project().await?;
            done()
        }
        "import" => {
            let Source { source } = decode(command, args)?;
            if editor.busy() {
                bail!("pages cannot be imported while processing is running");
            }
            let Some(picked) = bridge
                .pick_import(source, &Editor::import_extensions())
                .await?
            else {
                return done();
            };
            let files = match source {
                PageImportSource::Files => picked,
                PageImportSource::Folder => picked
                    .iter()
                    .flat_map(|folder| Editor::importable_files(folder))
                    .collect(),
            };
            editor.import_files(files).await?;
            done()
        }
        "select_page" => {
            let PageArg { page } = decode(command, args)?;
            json(editor.select_page(page).await?)
        }
        "rename_page" => {
            let RenamePage { page, label } = decode(command, args)?;
            editor.rename_page(page, label).await?;
            done()
        }
        "delete_pages" => {
            let Pages { pages } = decode(command, args)?;
            editor.delete_pages(pages).await?;
            done()
        }
        "move_page" => {
            let MovePage { page, index } = decode(command, args)?;
            editor.move_page(page, index as usize).await?;
            done()
        }
        "set_source_text" => {
            let SourceText { layer, text } = decode(command, args)?;
            editor.set_source_text(layer, text).await?;
            done()
        }
        "set_translation" => {
            let Translation { layer, text } = decode(command, args)?;
            editor.set_translation(layer, text).await?;
            done()
        }
        "set_typography" => {
            let Updates { updates }: Updates<TypographyUpdate> = decode(command, args)?;
            editor.set_typography(updates).await?;
            done()
        }
        "set_geometry" => {
            let Updates { updates }: Updates<GeometryUpdate> = decode(command, args)?;
            editor.set_geometry(updates).await?;
            done()
        }
        "set_visibility" => {
            let Visibility {
                layers,
                visible,
                opacity,
            } = decode(command, args)?;
            editor.set_visibility(layers, visible, opacity).await?;
            done()
        }
        "delete_layers" => {
            let Layers { layers } = decode(command, args)?;
            editor.delete_layers(layers).await?;
            done()
        }
        "move_layer" => {
            let MoveLayer {
                layer,
                parent,
                index,
            } = decode(command, args)?;
            json(editor.move_layer(layer, parent, index as usize).await?)
        }
        "undo" => {
            editor.undo().await?;
            done()
        }
        "redo" => {
            editor.redo().await?;
            done()
        }
        "process" => {
            let Process { scope, operation } = decode(command, args)?;
            json(editor.process(scope, operation).await?)
        }
        "stop_job" => {
            let Job { job } = decode(command, args)?;
            editor.stop_job(job)?;
            done()
        }
        "export" => {
            let Export { format } = decode(command, args)?;
            let project = editor.project_name().await?;
            if editor.pages().await?.is_empty() {
                bail!("there are no pages to export");
            }
            let Some(destination) = bridge.pick_export(format, &project).await? else {
                return done();
            };
            editor.export(format, destination).await?;
            done()
        }
        "get_thumbnail" => {
            let PageArg { page } = decode(command, args)?;
            Ok(Reply::Bytes(editor.thumbnail(page).await?))
        }
        "get_page_result" => {
            let PageArg { page } = decode(command, args)?;
            json(editor.page_result(page).await?)
        }
        "get_page_source_sha256" => {
            let PageArg { page } = decode(command, args)?;
            json(editor.page_source_sha256(page).await?)
        }
        "get_fonts" => json(editor.fonts().await?),
        "get_font_preview" => {
            let FontPreview { family_name } = decode(command, args)?;
            Ok(Reply::Bytes(editor.font_preview(&family_name).await?))
        }
        "save_preferences" => {
            let SavePreferences {
                pipeline,
                providers,
                typesetting,
            } = decode(command, args)?;
            json(editor.save_preferences(pipeline, providers, typesetting)?)
        }
        "get_preferences" => json(editor.preferences()?),
        "get_translation_models" => json(editor.translation_models().await?),
        "get_canvas_manifest" => {
            let Generation { generation } = decode(command, args)?;
            Ok(Reply::Bytes(editor.canvas_manifest(generation)?))
        }
        "get_canvas_resource" => {
            let GenerationResource {
                generation,
                resource,
            } = decode(command, args)?;
            Ok(Reply::Bytes(editor.canvas_resource(generation, &resource)?))
        }
        "prepare_canvas_page" => {
            let PageArg { page } = decode(command, args)?;
            json(editor.prepare_canvas_page(page).await?)
        }
        "get_canvas_page_manifest" => {
            let PageRevision { page, revision } = decode(command, args)?;
            Ok(Reply::Bytes(editor.canvas_page_manifest(page, revision)?))
        }
        "get_canvas_page_resource" => {
            let PageRevisionResource {
                page,
                revision,
                resource,
            } = decode(command, args)?;
            Ok(Reply::Bytes(
                editor.canvas_page_resource(page, revision, &resource)?,
            ))
        }
        "add_point_text" => {
            let PointArg { point } = decode(command, args)?;
            json(editor.add_point_text(None, point).await?)
        }
        "add_text_box" => {
            let FrameArg { frame } = decode(command, args)?;
            json(editor.add_text_box(None, frame).await?)
        }
        "commit_paint" => {
            let Paint {
                expected_revision,
                layer,
                points,
                brush,
            } = decode(command, args)?;
            json(
                editor
                    .commit_paint(expected_revision, layer, points, brush)
                    .await?,
            )
        }
        "commit_erase" => {
            let Erase {
                expected_revision,
                layer,
                points,
                diameter,
            } = decode(command, args)?;
            json(
                editor
                    .commit_erase(expected_revision, layer, points, diameter)
                    .await?,
            )
        }
        "commit_transform" => {
            let Transform {
                expected_revision,
                elements,
            } = decode(command, args)?;
            json(editor.commit_transform(expected_revision, elements).await?)
        }
        "commit_inpaint" => {
            let Inpaint {
                expected_revision,
                points,
                diameter,
            } = decode(command, args)?;
            json(
                editor
                    .commit_inpaint(expected_revision, points, diameter)
                    .await?,
            )
        }
        _ => bail!("unknown Koharu command: {command}"),
    }
}

/// The client channel id of an IPC token (`__CHANNEL__:<id>`).
pub fn channel_id(token: &str) -> Result<u64> {
    token
        .strip_prefix("__CHANNEL__:")
        .and_then(|id| id.parse().ok())
        .with_context(|| format!("{token:?} is not a channel"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn channel_tokens_carry_their_id() {
        assert_eq!(channel_id("__CHANNEL__:42").unwrap(), 42);
        assert!(channel_id("42").is_err());
        assert!(channel_id("__CHANNEL__:x").is_err());
    }

    #[test]
    fn commands_are_unique() {
        let mut names = COMMANDS.to_vec();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), COMMANDS.len());
    }
}
