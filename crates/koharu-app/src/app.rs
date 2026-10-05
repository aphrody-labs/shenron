use anyhow::{Context as _, Result};
use koharu_library::project::ProjectLibrary;
use tauri::{AppHandle, Manager as _, WindowEvent};

use tokio::sync::Mutex;

use crate::commands::{
    agent::AgentState,
    canvas::CanvasChannel,
    lifecycle::{
        Download, DownloadChannel, DownloadState, Initialization, ModelResources, ProjectChannel,
        ResourceChannel,
    },
    processing::{JobChannel, Processing},
    project::CurrentProject,
};

#[tracing::instrument(
    target = "koharu_metrics",
    name = "app_started",
    skip_all,
    fields(phase = "initialization")
)]
pub(crate) async fn initialize<R: tauri::Runtime>(handle: AppHandle<R>) -> Result<()> {
    koharu_ml::init()
        .await
        .context("failed to initialize the ML runtime")?;
    let device = koharu_ml::device(false);
    koharu_metrics::context(serde_json::json!({
        "compute_backend": device.backend.to_string().to_ascii_lowercase(),
        "device_type": format!("{:?}", device.device_type).to_ascii_lowercase(),
        "gpu_model": device.description.clone(),
        "vram_bytes": device.memory_total,
    }));
    let pipeline = koharu_pipeline::Pipeline::load(device)?;
    handle.manage(pipeline.clone());

    let mut resources = pipeline.subscribe_resources();
    let resource_handle = handle.clone();
    drop(tauri::async_runtime::spawn(async move {
        while resources.changed().await.is_ok() {
            let snapshot = resources.borrow_and_update().clone();
            let resources = resource_handle.state::<ResourceChannel>();
            let mut channel = resources.channel.lock();
            if let Some(current) = channel.as_ref()
                && current.send(ModelResources::from(snapshot)).is_err()
            {
                channel.take();
            }
        }
    }));

    let project = handle
        .state::<CurrentProject>()
        .project
        .lock()
        .await
        .as_ref()
        .map(|project| (project.snapshot(), project.active_page()));
    let desktop = handle.state::<koharu_desktop::Desktop>();
    if let Some((snapshot, page)) = project {
        desktop.show_page(&snapshot, page).await?;
    } else {
        desktop.clear().await;
    }
    Ok(())
}

/// Manage Koharu's state, start the ML runtime and relay downloads on `application`.
/// The Koharu desktop app creates its own main window; a host (the Aphrody app) passes `false`.
pub fn setup<R: tauri::Runtime>(application: &mut tauri::App<R>, create_main_window: bool) -> Result<()> {
    #[cfg(all(target_os = "windows", not(debug_assertions)))]
    koharu_runtime::Store::configure(
        application
            .path()
            .resource_dir()
            .context("failed to locate Koharu's installation directory")?
            .join("store"),
    )?;

    application.manage(CurrentProject {
        project: Mutex::new(None),
    });
    application.manage(ProjectLibrary::new()?);
    application.manage(Processing::default());
    application.manage(CanvasChannel::default());
    application.manage(JobChannel::default());
    application.manage(DownloadChannel::default());
    application.manage(ResourceChannel::default());
    application.manage(ProjectChannel::default());
    application.manage(Initialization::default());

    let handle = application.handle().clone();
    application.manage(koharu_desktop::Desktop::new()?);
    application.manage(AgentState::new(handle.clone())?);

    if create_main_window {
        let window_config = application
            .config()
            .app
            .windows
            .iter()
            .find(|window| window.label == "main")
            .context("the main Tauri window configuration is unavailable")?;
        let window = tauri::WebviewWindowBuilder::from_config(application, window_config)?
            .build()
            .context("failed to create the main window")?;
        window.show().context("failed to show the main window")?;
        window
            .set_focus()
            .context("failed to focus the main window")?;
    }
    let initialization_handle = handle.clone();
    drop(tauri::async_runtime::spawn(async move {
        initialize(initialization_handle.clone())
            .await
            .expect("failed to initialize the desktop runtime");
        initialization_handle.state::<Initialization>().ready();
    }));

    let mut downloads = koharu_runtime::download::subscribe();
    let download_handle = handle.clone();
    drop(tauri::async_runtime::spawn(async move {
        loop {
            match downloads.recv().await {
                Ok(event) => {
                    let download = match event {
                        koharu_runtime::download::Event::Started { id, name } => {
                            tracing::info!(
                                target: "koharu_metrics",
                                metric = "download_start",
                                resource = "runtime",
                            );
                            Download {
                                id,
                                state: DownloadState::Running,
                                name: Some(name),
                                completed: 0,
                                total: 0,
                                error: None,
                            }
                        }
                        koharu_runtime::download::Event::Progress {
                            id,
                            name,
                            completed,
                            total,
                        } => {
                            tracing::info!(
                                target: "koharu_metrics",
                                metric = "download_progress",
                                resource = "runtime",
                                used_bytes = completed,
                                total_bytes = total,
                            );
                            Download {
                                id,
                                state: DownloadState::Running,
                                name: Some(name),
                                completed,
                                total,
                                error: None,
                            }
                        }
                        koharu_runtime::download::Event::Finished { id } => {
                            tracing::info!(
                                target: "koharu_metrics",
                                metric = "download_result",
                                resource = "runtime",
                                outcome = "completed",
                            );
                            Download {
                                id,
                                state: DownloadState::Finished,
                                name: None,
                                completed: 0,
                                total: 0,
                                error: None,
                            }
                        }
                        koharu_runtime::download::Event::Failed { id, name, error } => {
                            tracing::info!(
                                target: "koharu_metrics",
                                metric = "download_result",
                                resource = "runtime",
                                outcome = "failed",
                            );
                            Download {
                                id,
                                state: DownloadState::Failed,
                                name: Some(name),
                                completed: 0,
                                total: 0,
                                error: Some(error),
                            }
                        }
                    };
                    let downloads = download_handle.state::<DownloadChannel>();
                    let mut channel = downloads.channel.lock();
                    if let Some(current) = channel.as_ref()
                        && current.send(download).is_err()
                    {
                        channel.take();
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "download channel fell behind");
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    }));

    Ok(())
}

/// Stop Koharu's jobs and agent runs when a window closes; flush metrics on destroy.
pub fn on_window_event<R: tauri::Runtime>(window: &tauri::Window<R>, event: &WindowEvent) {
    if matches!(
        event,
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
    ) {
        let processing = window.state::<Processing>();
        for stop in processing.stops.lock().values() {
            stop.stop();
        }
        processing.stops.lock().clear();
        processing.jobs.lock().clear();
        window.state::<AgentState<R>>().cancel_all();
    }
    if matches!(event, WindowEvent::Destroyed) {
        tracing::info!(
            target: "koharu_metrics",
            metric = "app_closed",
            phase = "shutdown",
        );
        koharu_metrics::shutdown();
    }
}
