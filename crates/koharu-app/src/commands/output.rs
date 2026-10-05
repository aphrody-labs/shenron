use koharu_library::{
    Editor, PageResult,
    editor::{ExportFormat, FontFamily, Preferences, ProviderPreferences},
};
use koharu_pipeline::PipelineConfig;
use koharu_renderer::TypesettingConfig;
use koharu_scene::EntityId;
use tauri::{State, WebviewWindow};

use super::{FontPreviewBytes, Result, ThumbnailBytes};

/// Pick the destination in a native dialog, then export every page.
#[tauri::command]
#[specta::specta]
pub(crate) async fn export<R: tauri::Runtime>(
    window: WebviewWindow<R>,
    format: ExportFormat,
    editor: State<'_, Editor>,
) -> Result<()> {
    let name = editor.project_name().await?;
    if editor.pages().await?.is_empty() {
        return Err(anyhow::anyhow!("there are no pages to export").into());
    }
    let dialog = rfd::AsyncFileDialog::new().set_parent(&window);
    let destination = match format {
        ExportFormat::Png | ExportFormat::Psd => dialog.pick_folder().await,
        ExportFormat::Cbz => {
            dialog
                .add_filter("Comic Book Archive", &["cbz"])
                .set_file_name(format!("{name}.cbz"))
                .save_file()
                .await
        }
    };
    if let Some(destination) = destination {
        editor.export(format, destination.path().to_owned()).await?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_thumbnail(page: EntityId, editor: State<'_, Editor>) -> Result<ThumbnailBytes> {
    Ok(ThumbnailBytes(editor.thumbnail(page).await?))
}

/// Typed model output of a page (regions, texts, cleanup layer, provenance), as the Shenron
/// chain maps it into manga candidates.
#[tauri::command]
#[specta::specta]
pub(crate) async fn get_page_result(page: EntityId, editor: State<'_, Editor>) -> Result<PageResult> {
    Ok(editor.page_result(page).await?)
}

/// SHA-256 of the source image bytes stored for a page.
#[tauri::command]
#[specta::specta]
pub(crate) async fn get_page_source_sha256(
    page: EntityId,
    editor: State<'_, Editor>,
) -> Result<String> {
    Ok(editor.page_source_sha256(page).await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_fonts(editor: State<'_, Editor>) -> Result<Vec<FontFamily>> {
    Ok(editor.fonts().await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_font_preview(
    family_name: String,
    editor: State<'_, Editor>,
) -> Result<FontPreviewBytes> {
    Ok(FontPreviewBytes(editor.font_preview(&family_name).await?))
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn save_preferences(
    pipeline: PipelineConfig,
    providers: ProviderPreferences,
    typesetting: TypesettingConfig,
    editor: State<'_, Editor>,
) -> Result<Preferences> {
    Ok(editor.save_preferences(pipeline, providers, typesetting)?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_preferences(editor: State<'_, Editor>) -> Result<Preferences> {
    Ok(editor.preferences()?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_translation_models(
    editor: State<'_, Editor>,
) -> Result<Vec<koharu_translator::Model>> {
    Ok(editor.translation_models().await?)
}
