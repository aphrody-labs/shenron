use koharu_desktop::{Frame, TransformFrame};
use koharu_library::{
    Editor,
    editor::{CanvasPagePreparation, JobId, LayerCommit, PaintBrush},
    project::Point,
};
use koharu_scene::{EntityId, Revision};
use serde::Deserialize;
use specta::Type;
use tauri::State;

use super::{CanvasBytes, Result};

#[derive(Clone, Copy, Deserialize, Type)]
#[specta(transparent)]
pub(crate) struct CanvasGeneration(#[specta(type = f64)] u64);

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_canvas_manifest(
    generation: CanvasGeneration,
    editor: State<'_, Editor>,
) -> Result<CanvasBytes> {
    Ok(CanvasBytes(editor.canvas_manifest(generation.0)?))
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_canvas_resource(
    generation: CanvasGeneration,
    resource: String,
    editor: State<'_, Editor>,
) -> Result<CanvasBytes> {
    Ok(CanvasBytes(editor.canvas_resource(generation.0, &resource)?))
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn prepare_canvas_page(
    page: EntityId,
    editor: State<'_, Editor>,
) -> Result<Option<CanvasPagePreparation>> {
    Ok(editor.prepare_canvas_page(page).await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_canvas_page_manifest(
    page: EntityId,
    revision: Revision,
    editor: State<'_, Editor>,
) -> Result<CanvasBytes> {
    Ok(CanvasBytes(editor.canvas_page_manifest(page, revision)?))
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_canvas_page_resource(
    page: EntityId,
    revision: Revision,
    resource: String,
    editor: State<'_, Editor>,
) -> Result<CanvasBytes> {
    Ok(CanvasBytes(editor.canvas_page_resource(page, revision, &resource)?))
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn add_point_text(point: Point, editor: State<'_, Editor>) -> Result<LayerCommit> {
    Ok(editor.add_point_text(None, point).await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn add_text_box(frame: Frame, editor: State<'_, Editor>) -> Result<LayerCommit> {
    Ok(editor.add_text_box(None, frame).await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn commit_paint(
    expected_revision: Revision,
    layer: Option<EntityId>,
    points: Vec<Point>,
    brush: PaintBrush,
    editor: State<'_, Editor>,
) -> Result<LayerCommit> {
    Ok(editor.commit_paint(expected_revision, layer, points, brush).await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn commit_erase(
    expected_revision: Revision,
    layer: EntityId,
    points: Vec<Point>,
    diameter: f32,
    editor: State<'_, Editor>,
) -> Result<LayerCommit> {
    Ok(editor.commit_erase(expected_revision, layer, points, diameter).await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn commit_transform(
    expected_revision: Revision,
    elements: Vec<TransformFrame>,
    editor: State<'_, Editor>,
) -> Result<Option<Revision>> {
    Ok(editor.commit_transform(expected_revision, elements).await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn commit_inpaint(
    expected_revision: Revision,
    points: Vec<Point>,
    diameter: f32,
    editor: State<'_, Editor>,
) -> Result<Option<JobId>> {
    Ok(editor.commit_inpaint(expected_revision, points, diameter).await?)
}
