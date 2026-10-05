use koharu_desktop::CanvasState;
use koharu_library::{
    Editor,
    editor::{
        Download, Job, ModelResources, PageImportSource, PageSelection, StartupState, Subscription,
    },
    project::{Page, PageSummary, ProjectInfo, ProjectSummary},
};
use tauri::{State, WebviewWindow, ipc::Channel};

use super::{Result, sink};

#[tauri::command]
#[specta::specta]
pub(crate) async fn subscribe(
    editor: State<'_, Editor>,
    on_canvas: Channel<CanvasState>,
    on_job: Channel<Job>,
    on_download: Channel<Download>,
    on_resources: Channel<ModelResources>,
    on_project: Channel<Option<ProjectInfo>>,
) -> Result<StartupState> {
    Ok(editor
        .subscribe(Subscription {
            canvas: sink(on_canvas),
            job: sink(on_job),
            download: sink(on_download),
            resources: sink(on_resources),
            project: sink(on_project),
        })
        .await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_project(editor: State<'_, Editor>) -> Result<Option<ProjectInfo>> {
    Ok(editor.project_info().await)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_pages(editor: State<'_, Editor>) -> Result<Vec<PageSummary>> {
    Ok(editor.pages().await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_page(editor: State<'_, Editor>) -> Result<Option<Page>> {
    Ok(editor.active_page().await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn list_projects(editor: State<'_, Editor>) -> Result<Vec<ProjectSummary>> {
    Ok(editor.list_projects()?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn create_project(name: String, editor: State<'_, Editor>) -> Result<()> {
    editor.create_project(&name).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn open_project(name: String, editor: State<'_, Editor>) -> Result<()> {
    editor.open_project(&name).await?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn close_project(editor: State<'_, Editor>) -> Result<()> {
    Ok(editor.close_project().await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn delete_project(name: String, editor: State<'_, Editor>) -> Result<()> {
    Ok(editor.delete_project(&name).await?)
}

/// Pick files or a folder in a native dialog, then import them.
#[tauri::command]
#[specta::specta]
pub(crate) async fn import<R: tauri::Runtime>(
    source: PageImportSource,
    window: WebviewWindow<R>,
    editor: State<'_, Editor>,
) -> Result<()> {
    if editor.busy() {
        return Err(anyhow::anyhow!("pages cannot be imported while processing is running").into());
    }
    let dialog = rfd::AsyncFileDialog::new()
        .add_filter("Images, archives, and PDF", &Editor::import_extensions())
        .set_parent(&window);
    let files = match source {
        PageImportSource::Files => dialog
            .pick_files()
            .await
            .map(|files| files.into_iter().map(|file| file.path().to_owned()).collect::<Vec<_>>()),
        PageImportSource::Folder => {
            dialog.pick_folder().await.map(|folder| Editor::importable_files(folder.path()))
        },
    };
    if let Some(files) = files {
        editor.import_files(files).await?;
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn select_page(
    page: koharu_scene::EntityId,
    editor: State<'_, Editor>,
) -> Result<PageSelection> {
    Ok(editor.select_page(page).await?)
}
