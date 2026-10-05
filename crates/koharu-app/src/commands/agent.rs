use std::sync::Arc;

use koharu_agent::{Config, Event, LoginEvent, RunId};
use koharu_library::{Editor, editor::AgentStatus};
use tauri::{State, ipc::Channel};

use super::{Result, sink};

#[tauri::command]
#[specta::specta]
pub(crate) async fn get_agent_status(editor: State<'_, Editor>) -> Result<AgentStatus> {
    Ok(editor.agent_status().await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn login_agent(
    editor: State<'_, Editor>,
    on_event: Channel<LoginEvent>,
) -> Result<AgentStatus> {
    let channel = sink(on_event);
    let on_event = Arc::new(move |event: LoginEvent| {
        if let LoginEvent::DeviceCode {
            verification_url, ..
        } = &event
            && let Err(error) = open::that(verification_url)
        {
            tracing::warn!(%error, "failed to open the Codex device sign-in page");
        }
        channel(event)
    });
    Ok(editor.login_agent(on_event).await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn logout_agent(editor: State<'_, Editor>) -> Result<AgentStatus> {
    Ok(editor.logout_agent().await?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn save_agent_config(config: Config, editor: State<'_, Editor>) -> Result<Config> {
    Ok(editor.save_agent_config(config)?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn run_agent(
    prompt: String,
    on_event: Channel<Event>,
    editor: State<'_, Editor>,
) -> Result<RunId> {
    Ok(editor.run_agent(&prompt, sink(on_event))?)
}

#[tauri::command]
#[specta::specta]
pub(crate) async fn cancel_agent(run: RunId, editor: State<'_, Editor>) -> Result<()> {
    Ok(editor.cancel_agent(run)?)
}
