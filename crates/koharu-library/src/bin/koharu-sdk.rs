// SPDX-License-Identifier: MIT OR Apache-2.0
//! `koharu-sdk`: the Koharu engine over JSON Lines on stdin/stdout, for Bun and every
//! non-Tauri host (`shenron-server` relays `/api/local/koharu` to it).
//!
//! Two request forms share the one [`Editor`] of the process:
//!
//! - editor commands, as the generated `@shenron/koharu/protocol` names them:
//!   `{"id": 1, "command": "get_project", "args": {}}`, answered concurrently. A byte result
//!   is `{"id": 1, "result": {"$bytes": "<base64>"}}`. Channel arguments are IPC tokens
//!   (`"__CHANNEL__:7"`); their values come as `{"channel": 7, "message": ...}` and their end
//!   as `{"channel": 7, "end": true}`.
//! - headless methods ([`Service`], `@shenron/koharu/native`):
//!   `{"id": 1, "method": "project.list", "params": {}}`, answered in order; their events are
//!   `{"event": "pipeline" | "agent" | "agent_login", ...}`.
//!
//! Every answer is `{"id": ..., "result": ...}` or `{"id": ..., "error": "..."}`.

use std::{path::PathBuf, sync::Arc, time::Duration};

use anyhow::{Context as _, Result};
use async_trait::async_trait;
use base64::{Engine as _, engine::general_purpose::STANDARD};
use clap::Parser;
use koharu_library::{
    Editor, Service,
    editor::{
        ExportFormat, PageImportSource, Sink,
        dispatch::{Bridge, Reply, channel_id, dispatch},
        knowledge::ShenronKnowledge,
    },
    home::Roots,
    project::ProjectLibrary,
};
use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt as _, AsyncWriteExt as _, BufReader},
    sync::mpsc,
};

#[derive(Parser)]
#[command(version, about = "Koharu engine over stdio JSON Lines")]
struct Arguments {
    /// Absolute project directory (no upstream fallback). Defaults to the projects of
    /// Shenron's home (`SHENRON_HOME`, `data/koharu/projects`).
    #[arg(long)]
    root: Option<PathBuf>,

    /// Run the models on the CPU.
    #[arg(long)]
    cpu: bool,

    /// Base URL of the local Shenron server whose corpus the agent may search
    /// (`http://127.0.0.1:<port>`); the canonical lexicon is always offered.
    #[arg(long, env = "KOHARU_SHENRON_URL")]
    shenron_url: Option<String>,
}

/// Output of the process: one JSON value per line.
#[derive(Clone)]
struct Output(mpsc::UnboundedSender<Value>);

impl Output {
    fn send(&self, value: Value) -> bool {
        self.0.send(value).is_ok()
    }
}

/// Signals the end of a client channel once its last receiver is dropped.
struct ChannelEnd {
    id: u64,
    output: Output,
}

impl Drop for ChannelEnd {
    fn drop(&mut self) {
        self.output.send(json!({"channel": self.id, "end": true}));
    }
}

struct StdioBridge {
    output: Output,
}

#[async_trait]
impl Bridge for StdioBridge {
    fn channel(&self, token: &str) -> Result<Sink<Value>> {
        let id = channel_id(token)?;
        let end = ChannelEnd { id, output: self.output.clone() };
        Ok(Arc::new(move |message: Value| {
            open_verification_page(&message);
            end.output.send(json!({"channel": end.id, "message": message}))
        }))
    }

    async fn pick_import(
        &self,
        source: PageImportSource,
        extensions: &[&'static str],
    ) -> Result<Option<Vec<PathBuf>>> {
        pickers::import(source, extensions).await
    }

    async fn pick_export(&self, format: ExportFormat, project: &str) -> Result<Option<PathBuf>> {
        pickers::export(format, project).await
    }
}

/// The Codex device sign-in page opens on this machine, as in the desktop app.
fn open_verification_page(message: &Value) {
    #[cfg(feature = "desktop")]
    if message.get("type").and_then(Value::as_str) == Some("device_code")
        && let Some(url) = message.get("verification_url").and_then(Value::as_str)
        && let Err(error) = open::that(url)
    {
        tracing::warn!(%error, "failed to open the Codex device sign-in page");
    }
    #[cfg(not(feature = "desktop"))]
    let _ = message;
}

#[cfg(feature = "desktop")]
mod pickers {
    use std::path::PathBuf;

    use anyhow::Result;
    use koharu_library::editor::{ExportFormat, PageImportSource};

    pub async fn import(
        source: PageImportSource,
        extensions: &[&'static str],
    ) -> Result<Option<Vec<PathBuf>>> {
        let dialog =
            rfd::AsyncFileDialog::new().add_filter("Images, archives, and PDF", extensions);
        Ok(match source {
            PageImportSource::Files => dialog
                .pick_files()
                .await
                .map(|files| files.into_iter().map(|file| file.path().to_owned()).collect()),
            PageImportSource::Folder => {
                dialog.pick_folder().await.map(|folder| vec![folder.path().to_owned()])
            },
        })
    }

    pub async fn export(format: ExportFormat, project: &str) -> Result<Option<PathBuf>> {
        let dialog = rfd::AsyncFileDialog::new();
        let picked = match format {
            ExportFormat::Png | ExportFormat::Psd => dialog.pick_folder().await,
            ExportFormat::Cbz => {
                dialog
                    .add_filter("Comic Book Archive", &["cbz"])
                    .set_file_name(format!("{project}.cbz"))
                    .save_file()
                    .await
            },
        };
        Ok(picked.map(|picked| picked.path().to_owned()))
    }
}

#[cfg(not(feature = "desktop"))]
mod pickers {
    use std::path::PathBuf;

    use anyhow::{Result, bail};
    use koharu_library::editor::{ExportFormat, PageImportSource};

    pub async fn import(
        _source: PageImportSource,
        _extensions: &[&'static str],
    ) -> Result<Option<Vec<PathBuf>>> {
        bail!("this koharu-sdk has no file pickers (build it with the `desktop` feature)")
    }

    pub async fn export(_format: ExportFormat, _project: &str) -> Result<Option<PathBuf>> {
        bail!("this koharu-sdk has no file pickers (build it with the `desktop` feature)")
    }
}

/// The editor command of `request` against the shared editor, answered on `output`.
async fn command(editor: Editor, bridge: Arc<StdioBridge>, id: Value, request: Value) {
    let name = request.get("command").and_then(Value::as_str).unwrap_or("");
    let args = request.get("args").cloned().unwrap_or(Value::Null);
    let response = match dispatch(&editor, bridge.as_ref(), name, args).await {
        Ok(Reply::Json(result)) => json!({"id": id, "result": result}),
        Ok(Reply::Bytes(bytes)) => {
            json!({"id": id, "result": {"$bytes": STANDARD.encode(bytes)}})
        },
        Err(error) => json!({"id": id, "error": format!("{error:#}")}),
    };
    bridge.output.send(response);
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Arguments::parse();
    let (sender, mut outgoing) = mpsc::unbounded_channel::<Value>();
    let output = Output(sender);
    let writer = tokio::spawn(async move {
        let mut stdout = tokio::io::stdout();
        while let Some(value) = outgoing.recv().await {
            stdout.write_all(serde_json::to_string(&value)?.as_bytes()).await?;
            stdout.write_all(b"\n").await?;
            stdout.flush().await?;
        }
        Ok::<(), anyhow::Error>(())
    });

    let editor = match args.root {
        Some(root) => Editor::new(ProjectLibrary::at(root)?, args.cpu)?,
        None => Editor::from_roots(&Roots::from_env()?, args.cpu)?,
    };
    editor.set_toolbox(Some(Arc::new(ShenronKnowledge::new(args.shenron_url))));
    let bridge = Arc::new(StdioBridge { output: output.clone() });
    let mut service = Service::new(editor.clone(), output.0.clone());

    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    while let Some(line) = lines.next_line().await? {
        if line.trim().is_empty() {
            continue;
        }
        let incoming = serde_json::from_str::<Value>(&line);
        let id = incoming
            .as_ref()
            .ok()
            .and_then(|value| value.get("id"))
            .cloned()
            .unwrap_or(Value::Null);
        let request = match incoming {
            Ok(request) => request,
            Err(error) => {
                output.send(json!({"id": id, "error": format!("invalid JSON: {error}")}));
                continue;
            },
        };
        if request.get("command").is_some_and(Value::is_string) {
            tokio::spawn(command(editor.clone(), Arc::clone(&bridge), id, request));
            continue;
        }
        let response = match request.get("method").and_then(Value::as_str) {
            Some(method) => match service
                .call(method, request.get("params").cloned().unwrap_or_else(|| json!({})))
                .await
            {
                Ok(result) => json!({"id": id, "result": result}),
                Err(error) => json!({"id": id, "error": format!("{error:#}")}),
            },
            None => json!({"id": id, "error": "method or command must be a string"}),
        };
        output.send(response);
    }

    service.shutdown();
    drop(service);
    drop(bridge);
    drop(editor);
    drop(output);
    // Running commands may still hold the output; their answers no longer have a reader.
    match tokio::time::timeout(Duration::from_secs(2), writer).await {
        Ok(written) => written.context("the output writer stopped")?,
        Err(_) => Ok(()),
    }
}
