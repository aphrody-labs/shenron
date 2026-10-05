use koharu_library::{
    Editor,
    editor::JobId,
    project::{GeometryUpdate, Page, TypographyUpdate},
};
use koharu_scene::EntityId;
use tauri::State;

use super::Result;

#[tauri::command]
#[specta::specta]
pub(crate) async fn rename_page(
    page: EntityId,
    label: String,
    editor: State<'_, Editor>,
) -> Result<()> {
    editor.rename_page(page, label).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn delete_pages(pages: Vec<EntityId>, editor: State<'_, Editor>) -> Result<()> {
    editor.delete_pages(pages).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn move_page(page: EntityId, index: u32, editor: State<'_, Editor>) -> Result<()> {
    editor.move_page(page, index as usize).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn set_source_text(
    layer: EntityId,
    text: String,
    editor: State<'_, Editor>,
) -> Result<()> {
    editor.set_source_text(layer, text).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn set_translation(
    layer: EntityId,
    text: Option<String>,
    editor: State<'_, Editor>,
) -> Result<()> {
    editor.set_translation(layer, text).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn set_typography(
    updates: Vec<TypographyUpdate>,
    editor: State<'_, Editor>,
) -> Result<()> {
    editor.set_typography(updates).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn set_geometry(
    updates: Vec<GeometryUpdate>,
    editor: State<'_, Editor>,
) -> Result<()> {
    editor.set_geometry(updates).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn set_visibility(
    layers: Vec<EntityId>,
    visible: Option<bool>,
    opacity: Option<f32>,
    editor: State<'_, Editor>,
) -> Result<()> {
    editor.set_visibility(layers, visible, opacity).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn delete_layers(layers: Vec<EntityId>, editor: State<'_, Editor>) -> Result<()> {
    editor.delete_layers(layers).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn move_layer(
    layer: EntityId,
    parent: EntityId,
    index: u32,
    editor: State<'_, Editor>,
) -> Result<Page> {
    Ok(editor.move_layer(layer, parent, index as usize).await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn undo(editor: State<'_, Editor>) -> Result<()> {
    editor.undo().await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn redo(editor: State<'_, Editor>) -> Result<()> {
    editor.redo().await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn process(
    scope: koharu_pipeline::Scope,
    operation: koharu_pipeline::Operation,
    editor: State<'_, Editor>,
) -> Result<JobId> {
    Ok(editor.process(scope, operation).await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn stop_job(job: JobId, editor: State<'_, Editor>) -> Result<()> {
    Ok(editor.stop_job(job)?)
}
