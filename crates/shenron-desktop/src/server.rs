// SPDX-License-Identifier: Apache-2.0
//! The local Shenron server behind the desktop window.
//!
//! Resolution order:
//! 1. `SHENRON_DESKTOP_URL`: an already running server (for example `bun run dev`).
//! 2. The `shenron-server` binary installed beside this executable (bundled sidecar),
//!    or `SHENRON_SERVER_BIN`, started on a free loopback port.
//!
//! The server inherits only the variables it needs plus loopback defaults; no
//! production configuration is read or required. Its data and cache live in the
//! app data directory.

use std::{
    net::{Ipv4Addr, SocketAddrV4, TcpListener},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Manager as _};

/// Child process of the bundled server, stopped with the window.
#[derive(Default)]
pub struct LocalServer {
    child: Mutex<Option<Child>>,
    url: Mutex<Option<String>>,
}

impl LocalServer {
    /// Stop the bundled server if this process started it.
    pub fn stop(&self) {
        let mut child = self.child.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(mut child) = child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn server_binary() -> Option<PathBuf> {
    if let Some(explicit) = std::env::var_os("SHENRON_SERVER_BIN") {
        return Some(PathBuf::from(explicit)).filter(|path| path.is_file());
    }
    let name = if cfg!(windows) { "shenron-server.exe" } else { "shenron-server" };
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    [dir.join(name), dir.join("binaries").join(name)].into_iter().find(|path| path.is_file())
}

fn free_port() -> std::io::Result<u16> {
    let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))?;
    Ok(listener.local_addr()?.port())
}

async fn wait_healthy(base: &str, timeout: Duration) -> Result<(), String> {
    let client = reqwest_lite::Client::new();
    let deadline = Instant::now() + timeout;
    // robots.txt is served without the editorial database, by the binary and by `next dev`.
    let health = format!("{base}/robots.txt");
    loop {
        if client.get_ok(&health).await {
            return Ok(());
        }
        if Instant::now() > deadline {
            return Err(format!("{health} did not answer within {}s", timeout.as_secs()));
        }
        tokio::time::sleep(Duration::from_millis(150)).await;
    }
}

/// Start (or locate) the local server and return the desktop start page once it is healthy.
pub async fn start(app: &AppHandle) -> Result<String, String> {
    if let Ok(url) = std::env::var("SHENRON_DESKTOP_URL") {
        let url = url.trim_end_matches('/').to_owned();
        wait_healthy(&url, Duration::from_secs(60)).await?;
        *app.state::<LocalServer>().url.lock().map_err(|e| e.to_string())? = Some(url.clone());
        return Ok(url);
    }
    let binary = server_binary().ok_or("shenron-server is not installed beside the desktop app")?;
    let port = free_port().map_err(|error| format!("no free loopback port: {error}"))?;
    let data = app.path().app_data_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&data).map_err(|error| error.to_string())?;
    let started = Instant::now();
    let mut command = Command::new(&binary);
    command
        .args(["serve", "site"])
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("SHENRON_HOME", &data)
        .env("SHENRON_PROFILE", "desktop")
        .env("NODE_ENV", "production")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::inherit());
    // The installer's resources (`llama/` runtime, `models/` adapter of the local chat model):
    // beside the executable on Windows, under `/usr/lib/<product>` on Linux.
    if let Ok(resources) = app.path().resource_dir() {
        command.env("SHENRON_RESOURCE_DIR", resources);
    }
    // The server is a console executable: started from the GUI app it would open its own
    // console window unless told not to (CREATE_NO_WINDOW).
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut command, 0x0800_0000);
    let child =
        command.spawn().map_err(|error| format!("cannot start {}: {error}", binary.display()))?;
    let state = app.state::<LocalServer>();
    *state.child.lock().map_err(|e| e.to_string())? = Some(child);
    let url = format!("http://127.0.0.1:{port}");
    wait_healthy(&url, Duration::from_secs(90)).await?;
    log::info!("local Shenron server ready on {url} in {} ms", started.elapsed().as_millis());
    *state.url.lock().map_err(|e| e.to_string())? = Some(url.clone());
    Ok(url)
}

/// Desktop facts for the front app: version and local server URL.
#[tauri::command]
pub fn shenron_desktop_info(state: tauri::State<'_, LocalServer>) -> serde_json::Value {
    let url = state.url.lock().ok().and_then(|url| url.clone());
    serde_json::json!({
        "desktop": true,
        "version": env!("CARGO_PKG_VERSION"),
        "server": url,
        "koharu": cfg!(feature = "koharu"),
    })
}

/// Minimal loopback HTTP probe (the health check needs no TLS or HTTP client stack).
mod reqwest_lite {
    use tokio::{
        io::{AsyncReadExt as _, AsyncWriteExt as _},
        net::TcpStream,
    };

    pub struct Client;

    impl Client {
        pub const fn new() -> Self {
            Self
        }

        /// `true` when `GET url` on a loopback `http://host:port/path` answers 2xx.
        pub async fn get_ok(&self, url: &str) -> bool {
            let Some(rest) = url.strip_prefix("http://") else { return false };
            let (authority, path) =
                rest.split_once('/').map_or((rest, "/".to_owned()), |(a, p)| (a, format!("/{p}")));
            let Ok(Ok(mut stream)) = tokio::time::timeout(
                std::time::Duration::from_secs(2),
                TcpStream::connect(authority),
            )
            .await
            else {
                return false;
            };
            let request =
                format!("GET {path} HTTP/1.1\r\nHost: {authority}\r\nConnection: close\r\n\r\n");
            if stream.write_all(request.as_bytes()).await.is_err() {
                return false;
            }
            let mut head = [0_u8; 16];
            let Ok(Ok(read)) =
                tokio::time::timeout(std::time::Duration::from_secs(5), stream.read(&mut head))
                    .await
            else {
                return false;
            };
            let status = std::str::from_utf8(&head[..read]).unwrap_or("");
            status.starts_with("HTTP/1.1 2") || status.starts_with("HTTP/1.0 2")
        }
    }
}
