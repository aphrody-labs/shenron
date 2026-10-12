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
//!
//! Lifetime: on Windows the server joins a job object that kills it and every process it
//! started (Next, llama-server, shenron-mcp, koharu-sdk) when the app exits, crashes or is
//! killed, so no orphan survives. On every platform `<data>/run/server.json` records the URL
//! and process id of the running server (for local tools); a server left by a previous run is
//! stopped before a new one starts.

use std::{
    net::{Ipv4Addr, SocketAddrV4, TcpListener},
    path::{Path, PathBuf},
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
    run_file: Mutex<Option<PathBuf>>,
    #[cfg(windows)]
    job: Mutex<Option<job::Job>>,
}

impl LocalServer {
    /// Stop the bundled server (and, on Windows, every process it started) if this process
    /// started it.
    pub fn stop(&self) {
        #[cfg(windows)]
        if let Some(job) = self.job.lock().unwrap_or_else(std::sync::PoisonError::into_inner).take()
        {
            job.terminate();
        }
        let mut child = self.child.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some(mut child) = child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        if let Some(path) =
            self.run_file.lock().unwrap_or_else(std::sync::PoisonError::into_inner).take()
        {
            let _ = std::fs::remove_file(path);
        }
    }
}

/// `<data>/run/server.json`: URL and process id of the server this app started.
fn run_file(data: &Path) -> PathBuf {
    data.join("run").join("server.json")
}

/// Stop a server recorded by a previous run that did not exit cleanly (the job object already
/// covers Windows; this also covers Linux and a server started by an older version).
fn stop_previous(data: &Path) {
    let path = run_file(data);
    let Ok(text) = std::fs::read_to_string(&path) else { return };
    let _ = std::fs::remove_file(&path);
    let Some(pid) = serde_json::from_str::<serde_json::Value>(&text)
        .ok()
        .and_then(|value| value.get("pid").and_then(serde_json::Value::as_u64))
        .and_then(|pid| u32::try_from(pid).ok())
    else {
        return;
    };
    if pid == std::process::id() {
        return;
    }
    log::info!("stopping the local server left by a previous run (pid {pid})");
    kill_pid(pid);
}

#[cfg(windows)]
fn kill_pid(pid: u32) {
    // `/T` takes the children too; only a process still named shenron-server is stopped.
    let mut command = Command::new("taskkill");
    command
        .args(["/F", "/T", "/FI", "IMAGENAME eq shenron-server.exe", "/PID", &pid.to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    std::os::windows::process::CommandExt::creation_flags(&mut command, 0x0800_0000);
    let _ = command.status();
}

#[cfg(not(windows))]
fn kill_pid(pid: u32) {
    let comm = std::fs::read_to_string(format!("/proc/{pid}/comm")).unwrap_or_default();
    if comm.trim().starts_with("shenron-server") {
        let _ = Command::new("kill").arg(pid.to_string()).status();
    }
}

/// Windows job object: every process of the job dies when its last handle closes.
#[cfg(windows)]
mod job {
    use std::{ffi::c_void, os::windows::io::AsRawHandle as _, process::Child};

    type Handle = *mut c_void;

    #[repr(C)]
    #[derive(Default)]
    struct IoCounters {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }

    #[repr(C)]
    #[derive(Default)]
    struct BasicLimitInformation {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }

    #[repr(C)]
    #[derive(Default)]
    struct ExtendedLimitInformation {
        basic: BasicLimitInformation,
        io: IoCounters,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }

    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x2000;
    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION: i32 = 9;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn CreateJobObjectW(attributes: *const c_void, name: *const u16) -> Handle;
        fn SetInformationJobObject(job: Handle, class: i32, info: *const c_void, len: u32) -> i32;
        fn AssignProcessToJobObject(job: Handle, process: Handle) -> i32;
        fn TerminateJobObject(job: Handle, exit_code: u32) -> i32;
        fn CloseHandle(handle: Handle) -> i32;
    }

    pub struct Job(Handle);

    // SAFETY: a job handle may be used and closed from any thread.
    unsafe impl Send for Job {}
    // SAFETY: the job API is thread-safe; the handle is only read after creation.
    unsafe impl Sync for Job {}

    impl Job {
        /// A kill-on-close job holding `child` (and the processes it starts from now on).
        pub fn attach(child: &Child) -> std::io::Result<Self> {
            // SAFETY: plain Win32 calls on handles we own; `info` outlives the call.
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle.is_null() {
                    return Err(std::io::Error::last_os_error());
                }
                let job = Self(handle);
                let mut info = ExtendedLimitInformation::default();
                info.basic.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let size = u32::try_from(std::mem::size_of::<ExtendedLimitInformation>())
                    .unwrap_or(u32::MAX);
                if SetInformationJobObject(
                    job.0,
                    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                    (&raw const info).cast(),
                    size,
                ) == 0
                    || AssignProcessToJobObject(job.0, child.as_raw_handle().cast()) == 0
                {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(job)
            }
        }

        pub fn terminate(&self) {
            // SAFETY: the handle is a live job handle owned by `self`.
            unsafe {
                TerminateJobObject(self.0, 1);
            }
        }
    }

    impl Drop for Job {
        fn drop(&mut self) {
            // SAFETY: closing the handle we own exactly once.
            unsafe {
                CloseHandle(self.0);
            }
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

/// Probe of an external dev URL (`next dev`): robots.txt needs no editorial database.
const DEV_PROBE: &str = "/robots.txt";
/// Probe of the bundled server: its front answers `/api/local/health` as soon as it listens,
/// before Next is ready (pages show a self-reloading loading page meanwhile).
const FRONT_PROBE: &str = "/api/local/health";

async fn wait_healthy(base: &str, probe: &str, timeout: Duration) -> Result<(), String> {
    let client = reqwest_lite::Client::new();
    let deadline = Instant::now() + timeout;
    let health = format!("{base}{probe}");
    loop {
        // The bundled front answers 503 on its health until Next is ready: answering is enough.
        let healthy = if probe == FRONT_PROBE {
            client.get_answers(&health).await
        } else {
            client.get_ok(&health).await
        };
        if healthy {
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
        wait_healthy(&url, DEV_PROBE, Duration::from_secs(60)).await?;
        *app.state::<LocalServer>().url.lock().map_err(|e| e.to_string())? = Some(url.clone());
        return Ok(url);
    }
    let binary = server_binary().ok_or("shenron-server is not installed beside the desktop app")?;
    let port = free_port().map_err(|error| format!("no free loopback port: {error}"))?;
    let data = app.path().app_data_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&data).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(data.join("data")).map_err(|error| error.to_string())?;
    stop_previous(&data);
    let started = Instant::now();
    let mut command = Command::new(&binary);
    let local_token = local_admin_token();
    // The desktop package carries the bot API as a local sidecar.  It keeps the
    // administration surface available without Discord OAuth; the server remains
    // loopback-only and the bot inherits the desktop profile.  A server-only developer
    // package remains supported when the optional bot sidecar is deliberately omitted.
    let bot_name = if cfg!(windows) { "shenron-bot.exe" } else { "shenron-bot" };
    let has_bot = binary.parent().is_some_and(|dir| dir.join(bot_name).is_file());
    command
        .args(if has_bot { ["serve", "all"] } else { ["serve", "site"] })
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("SHENRON_HOME", &data)
        .env("SHENRON_SERVER_BIN", &binary)
        .env("SHENRON_PROFILE", "desktop")
        .env("SHENRON_DESKTOP_LOCAL", "true")
        .env("API_ADMIN_TOKEN", &local_token)
        .env("SHENRON_ADMIN_TOKEN", &local_token)
        .env("SHENRON_API_URL", "http://127.0.0.1:5006")
        .env("DATABASE_PATH", data.join("data").join("bot.db"))
        // The local API does not use Discord identities, but the bot schema keeps these
        // required production fields for migrations and owner-policy compatibility.
        .env("GUILD_ID", "100000000000000001")
        .env("OWNER_ID", "100000000000000002")
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
    #[cfg(windows)]
    match job::Job::attach(&child) {
        Ok(job) => *state.job.lock().map_err(|e| e.to_string())? = Some(job),
        Err(error) => log::warn!("the local server runs outside a job object: {error}"),
    }
    let pid = child.id();
    *state.child.lock().map_err(|e| e.to_string())? = Some(child);
    let url = format!("http://127.0.0.1:{port}");
    let record = run_file(&data);
    if let Some(dir) = record.parent()
        && std::fs::create_dir_all(dir).is_ok()
    {
        let body = serde_json::json!({ "url": url, "pid": pid, "port": port });
        if std::fs::write(&record, body.to_string()).is_ok() {
            *state.run_file.lock().map_err(|e| e.to_string())? = Some(record);
        }
    }
    wait_healthy(&url, FRONT_PROBE, Duration::from_secs(90)).await?;
    log::info!("local Shenron server ready on {url} in {} ms", started.elapsed().as_millis());
    *state.url.lock().map_err(|e| e.to_string())? = Some(url.clone());
    Ok(url)
}

/// Per-launch bearer shared by the local Next proxy and the bot sidecar. It never leaves the
/// process environment or the loopback server and is invalidated when Desktop exits.
fn local_admin_token() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |duration| duration.as_nanos());
    format!("shenron-desktop-{}-{now:x}", std::process::id())
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
            self.get_status(url).await.is_some_and(|status| (200..300).contains(&status))
        }

        /// Whether the server answers at all (any HTTP status, a 503 "starting" included).
        pub async fn get_answers(&self, url: &str) -> bool {
            self.get_status(url).await.is_some()
        }

        async fn get_status(&self, url: &str) -> Option<u16> {
            let rest = url.strip_prefix("http://")?;
            let (authority, path) =
                rest.split_once('/').map_or((rest, "/".to_owned()), |(a, p)| (a, format!("/{p}")));
            let Ok(Ok(mut stream)) = tokio::time::timeout(
                std::time::Duration::from_secs(2),
                TcpStream::connect(authority),
            )
            .await
            else {
                return None;
            };
            let request =
                format!("GET {path} HTTP/1.1\r\nHost: {authority}\r\nConnection: close\r\n\r\n");
            if stream.write_all(request.as_bytes()).await.is_err() {
                return None;
            }
            let mut head = [0_u8; 16];
            let Ok(Ok(read)) =
                tokio::time::timeout(std::time::Duration::from_secs(5), stream.read(&mut head))
                    .await
            else {
                return None;
            };
            let status = std::str::from_utf8(&head[..read]).unwrap_or("");
            let code =
                status.strip_prefix("HTTP/1.1 ").or_else(|| status.strip_prefix("HTTP/1.0 "))?;
            code.get(..3)?.parse().ok()
        }
    }
}
