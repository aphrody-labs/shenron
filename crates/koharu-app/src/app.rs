use std::{path::PathBuf, sync::Arc};

use anyhow::Result;
use koharu_library::{Editor, editor::Toolbox, home::Roots};
use tauri::{Manager as _, WindowEvent};

/// How a host app mounts the editor.
#[derive(Default)]
pub struct Options {
    /// Shenron's home (projects and package store); `SHENRON_HOME` or the platform data
    /// directory when `None`.
    pub home: Option<PathBuf>,
    /// Extra agent tools (Shenron knowledge); [`Editor::set_toolbox`] changes them later.
    pub toolbox: Option<Arc<dyn Toolbox>>,
}

/// Manage the Koharu [`Editor`] on `application` and start its model runtime in the
/// background. The commands of [`crate::bindings`] run on it; the returned handle is the
/// same editor.
pub fn setup<R: tauri::Runtime>(application: &mut tauri::App<R>, options: Options) -> Result<Editor> {
    let roots = match options.home {
        Some(home) => Roots::in_home(home),
        None => Roots::from_env()?,
    };
    let editor = Editor::from_roots(&roots, false)?;
    editor.set_toolbox(options.toolbox);
    application.manage(editor.clone());
    let warm = editor.clone();
    drop(tauri::async_runtime::spawn(async move {
        if let Err(error) = warm.warm_up().await {
            tracing::error!(error = %format!("{error:#}"), "the Koharu runtime did not start");
        }
    }));
    Ok(editor)
}

/// Stop Koharu's jobs and agent work when the window closes.
pub fn on_window_event<R: tauri::Runtime>(window: &tauri::Window<R>, event: &WindowEvent) {
    if matches!(
        event,
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
    ) && let Some(editor) = window.try_state::<Editor>()
    {
        editor.cancel_work();
    }
}
