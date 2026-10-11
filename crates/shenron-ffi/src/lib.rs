// SPDX-License-Identifier: Apache-2.0
//! C ABI of Shenron for `bun:ffi` (`@aphrody/shenron-native`) and any C host.
//!
//! - ABI 1: the `shenron` command in process (inherited or captured stdio), RAG search,
//!   statistics and chunking, the local corpus, persona and auth presence.
//! - ABI 2 ([`abi::ABI_VERSION`]) keeps every ABI 1 symbol unchanged and adds cancellable jobs
//!   (`shenron_job_new`, `shenron_cancel`, `shenron_job_release`, `shenron_job_count` and the
//!   `*_job` variants of the long calls, which answer a [`types::JobOutcome`]) and the library
//!   identity (`shenron_build_info`).
//! - ABI 3 keeps every ABI 2 symbol unchanged and adds the persistent chat memory
//!   (`shenron_memory_{add,search,delete,clear}`), Aphrody's `aphrody-memory` SQLite provider
//!   ([`memory`]), each answering a [`types::JobOutcome`].
//! - ABI 4 keeps every ABI 3 symbol unchanged and adds the local chat models
//!   (`shenron_llama_{provision_job,progress,router_start,router_stop,daemon}`), Aphrody's
//!   `aphrody-llama-server` local chat in process ([`llama`]).
//! - ABI 5 keeps every ABI 4 symbol unchanged and adds the source-attributed Xenoverse 3
//!   prototype map from `shenron-re`.
//!
//! Memory: an owned string is allocated here by the Rust global allocator and released by the
//! caller, exactly once, with `shenron_string_free` (from any thread); static strings are never
//! freed; `shenron_last_error` belongs to the calling thread and lives until that thread's next
//! call. Input strings are borrowed for the duration of the call only.
//!
//! Threads: every export may be called from any thread; long ones block their caller (run them
//! on a worker thread) while async work runs on one process-wide tokio runtime. Captured
//! commands redirect the process-wide stdout/stderr and are serialised by one lock.
//!
//! Every export catches panics; none unwinds across the C boundary. [`abi::SYMBOLS`] and
//! [`types`] generate `packages/native/src/generated/{symbols,types}.ts` (`tests/typescript.rs`).

#![allow(
    clippy::missing_safety_doc,
    reason = "every unsafe export documents its contract in a # Safety section"
)]

#[cfg(not(target_arch = "wasm32"))]
pub mod abi;
#[cfg(not(target_arch = "wasm32"))]
mod jobs;
#[cfg(not(target_arch = "wasm32"))]
pub mod llama;
#[cfg(not(target_arch = "wasm32"))]
pub mod memory;
#[cfg(not(target_arch = "wasm32"))]
pub mod types;

#[cfg(not(target_arch = "wasm32"))]
pub use native::*;

#[cfg(not(target_arch = "wasm32"))]
mod native {
    use std::{
        cell::RefCell,
        ffi::{CStr, CString, OsString, c_char, c_int},
        panic::{AssertUnwindSafe, catch_unwind},
        ptr,
        sync::OnceLock,
        time::Duration,
    };

    use aphrody_backend::stdio_capture::with_captured_stdio;
    use serde::Serialize;
    use serde_json::Value;

    use crate::{
        abi::{ABI_VERSION, Status},
        jobs::{self, Job, JobError},
        types::{
            AuthStatus, BuildInfo, CapturedResult, FfiError, LocalHit, LocalSearchResponse,
            RagChunk, RagHit, RagSearchResponse, RagSourceStats, RagStats,
        },
    };

    thread_local! {
        /// Last error recorded on this thread (the C ABI has no Result channel).
        static LAST_ERROR: RefCell<Option<CString>> = const { RefCell::new(None) };
    }

    pub(crate) fn set_last_error<M: Into<Vec<u8>>>(msg: M) {
        let value = CString::new(msg)
            .unwrap_or_else(|_| c"error message contained an interior NUL byte".to_owned());
        LAST_ERROR.with(|cell| *cell.borrow_mut() = Some(value));
    }

    /// Last error recorded on this thread, or NULL. Valid until the next call on this thread; do
    /// not free. Read it on the thread that made the failing call.
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_last_error() -> *const c_char {
        LAST_ERROR.with(|cell| match cell.borrow().as_ref() {
            Some(value) => value.as_ptr(),
            None => ptr::null(),
        })
    }

    /// Process-wide runtime, created on first use.
    pub(crate) fn runtime() -> &'static tokio::runtime::Runtime {
        static RUNTIME: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
        RUNTIME.get_or_init(|| {
            shenron_cli::install_tls_provider();
            tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .thread_stack_size(8 * 1024 * 1024)
                .build()
                .expect("shenron-ffi: failed to build the tokio runtime")
        })
    }

    /// Serialises stdout/stderr capture: the redirect swaps process-global descriptors. An async
    /// mutex, so a cancelled job stops waiting for it.
    fn capture_lock() -> &'static tokio::sync::Mutex<()> {
        static CAPTURE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
        &CAPTURE_LOCK
    }

    pub(crate) fn panic_message(payload: &(dyn std::any::Any + Send)) -> &str {
        payload
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
            .unwrap_or("unknown panic")
    }

    fn shenron_argv(args: Vec<String>) -> Vec<OsString> {
        let mut argv: Vec<OsString> = Vec::with_capacity(args.len() + 1);
        argv.push(OsString::from("shenron"));
        argv.extend(args.into_iter().map(OsString::from));
        argv
    }

    /// Run `shenron <args…>` on the persistent runtime.
    fn run_argv(args: Vec<String>) -> i32 {
        runtime().block_on(shenron_cli::run_async(shenron_argv(args)))
    }

    /// Captured run on the caller's thread (ABI 1).
    fn run_captured(args: Vec<String>) -> CapturedResult {
        let _guard = capture_lock().blocking_lock();
        let (code, stdout, stderr) = with_captured_stdio(|| run_argv(args));
        CapturedResult { code, stdout, stderr }
    }

    /// Captured run as a job: waiting for the capture lock and the command are both cancellable.
    fn run_captured_job(job: &Job, args: Vec<String>) -> Result<CapturedResult, JobError> {
        let Some(_guard) = job.block_on(|| capture_lock().lock()) else {
            return Err(JobError::Cancelled);
        };
        let argv = shenron_argv(args);
        let mut cancelled = false;
        let (code, stdout, stderr) =
            with_captured_stdio(|| match job.block_on(|| shenron_cli::run_async(argv)) {
                Some(code) => code,
                None => {
                    cancelled = true;
                    Status::Cancelled.code()
                },
            });
        if cancelled {
            Err(JobError::Cancelled)
        } else {
            Ok(CapturedResult { code, stdout, stderr })
        }
    }

    /// # Safety
    /// `argv` must point to `argc` valid NUL-terminated strings (or be NULL iff `argc == 0`).
    unsafe fn collect_args(argc: c_int, argv: *const *const c_char) -> Option<Vec<String>> {
        let argc = usize::try_from(argc).ok()?;
        if argc == 0 {
            return Some(Vec::new());
        }
        if argv.is_null() {
            return None;
        }
        let mut out = Vec::with_capacity(argc);
        for i in 0..argc {
            // SAFETY: caller guarantees `argv` has `argc` valid entries.
            let entry = unsafe { *argv.add(i) };
            if entry.is_null() {
                return None;
            }
            // SAFETY: caller guarantees each entry is NUL-terminated.
            out.push(unsafe { CStr::from_ptr(entry) }.to_string_lossy().into_owned());
        }
        Some(out)
    }

    /// # Safety
    /// `ptr` must be a valid NUL-terminated string, or NULL (treated as `[]`).
    unsafe fn parse_json_args(ptr: *const c_char) -> Result<Vec<String>, String> {
        if ptr.is_null() {
            return Ok(Vec::new());
        }
        // SAFETY: caller guarantees a NUL-terminated string.
        let text = unsafe { CStr::from_ptr(ptr) }
            .to_str()
            .map_err(|_| "args_json is not valid UTF-8".to_string())?;
        let trimmed = text.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }
        serde_json::from_str::<Vec<String>>(trimmed)
            .map_err(|err| format!("args_json must be a JSON array of strings: {err}"))
    }

    /// # Safety
    /// `ptr` must be NULL or a valid NUL-terminated string, alive for `'a`.
    unsafe fn required_str<'a>(ptr: *const c_char, name: &str) -> Result<&'a str, String> {
        if ptr.is_null() {
            return Err(format!("{name} pointer is null"));
        }
        // SAFETY: forwarded contract.
        unsafe { CStr::from_ptr(ptr) }.to_str().map_err(|_| format!("{name} is not valid UTF-8"))
    }

    /// An optional filter: NULL, empty or invalid UTF-8 means absent.
    ///
    /// # Safety
    /// `ptr` must be NULL or a valid NUL-terminated string.
    unsafe fn optional_str(ptr: *const c_char) -> Option<String> {
        if ptr.is_null() {
            return None;
        }
        // SAFETY: forwarded contract.
        unsafe { CStr::from_ptr(ptr) }
            .to_str()
            .ok()
            .filter(|text| !text.is_empty())
            .map(str::to_owned)
    }

    fn to_json<T: Serialize>(value: &T) -> String {
        serde_json::to_string(value).unwrap_or_else(|error| {
            serde_json::json!({ "error": format!("unserialisable result: {error}") }).to_string()
        })
    }

    fn captured_json(code: i32, stdout: String, stderr: String) -> String {
        to_json(&CapturedResult { code, stdout, stderr })
    }

    fn usage_json(message: String) -> String {
        captured_json(Status::Usage.code(), String::new(), message)
    }

    /// A command result as `shenron <command> --json` prints it (pretty JSON or the report).
    fn command_json(result: Result<Value, String>) -> String {
        match result {
            Ok(value) => {
                let text = serde_json::to_string_pretty(&value).unwrap_or_default();
                captured_json(0, format!("{text}\n"), String::new())
            },
            Err(report) => {
                captured_json(Status::Failed.code(), String::new(), format!("{report}\n"))
            },
        }
    }

    fn string_to_c(text: String) -> *mut c_char {
        match CString::new(text) {
            Ok(value) => value.into_raw(),
            Err(_) => {
                set_last_error("result contained an interior NUL byte");
                ptr::null_mut()
            },
        }
    }

    /// Run an ABI 1 export body returning JSON; a panic becomes a `CapturedResult` with code 70.
    fn captured_export(operation: &str, body: impl FnOnce() -> String) -> *mut c_char {
        let json = catch_unwind(AssertUnwindSafe(body)).unwrap_or_else(|payload| {
            let message = format!("{operation} panicked: {}", panic_message(&*payload));
            set_last_error(message.clone());
            captured_json(Status::Software.code(), String::new(), message)
        });
        string_to_c(json)
    }

    // --- Operations: one implementation each, run blocking (ABI 1) or as a job (ABI 2). ---

    /// Mode reported by the local corpus search (`shenron_rag::LocalCorpus::search_json`).
    const LOCAL_MODE: &str = "aphrody_local_naive";

    /// The local corpus, loaded once per process from the environment.
    fn local_corpus() -> &'static shenron_rag::LocalCorpus {
        static CORPUS: OnceLock<shenron_rag::LocalCorpus> = OnceLock::new();
        CORPUS.get_or_init(|| {
            shenron_rag::LocalCorpus::load_with(&shenron_rag::dragonball::process_env)
        })
    }

    pub(crate) fn local_search(
        query: &str,
        limit: c_int,
        kind: Option<String>,
    ) -> LocalSearchResponse {
        let options = shenron_rag::LocalSearchOptions {
            limit: usize::try_from(limit.max(1)).ok(),
            lang: None,
            entity: None,
            kind,
        };
        let results: Vec<LocalHit> =
            local_corpus().search(query, &options).into_iter().map(LocalHit::from).collect();
        LocalSearchResponse {
            q: query.to_owned(),
            mode: LOCAL_MODE.to_owned(),
            total: u32::try_from(results.len()).unwrap_or(u32::MAX),
            results,
        }
    }

    async fn rag_search_value(
        query: String,
        limit: c_int,
        kind: Option<String>,
    ) -> Result<Value, String> {
        let limit = usize::try_from(limit.max(1)).unwrap_or(1);
        shenron_cli::shenron_cmd::rag_search_checked(&query, limit, kind.as_deref())
            .await
            .map_err(|report| format!("{report:?}"))
    }

    async fn rag_stats_value() -> Result<Value, String> {
        shenron_cli::shenron_cmd::rag_stats_report().await.map_err(|report| format!("{report:?}"))
    }

    fn text(value: &Value, key: &str) -> Option<String> {
        match value.get(key)? {
            Value::String(text) => Some(text.clone()),
            Value::Number(number) => Some(number.to_string()),
            _ => None,
        }
    }

    fn count(value: &Value, key: &str) -> Option<u32> {
        value.get(key)?.as_u64().map(|n| u32::try_from(n).unwrap_or(u32::MAX))
    }

    /// Normalise a backend RAG answer (`results` already checked by the command).
    pub(crate) fn rag_search_response(value: &Value) -> RagSearchResponse {
        let hit = |hit: &Value| RagHit {
            title: text(hit, "title").unwrap_or_default(),
            url: text(hit, "url").unwrap_or_default(),
            snippet: text(hit, "snippet").unwrap_or_default(),
            score: hit.get("score").and_then(Value::as_f64).unwrap_or(0.0),
            kind: text(hit, "kind")
                .filter(|kind| !kind.is_empty())
                .unwrap_or_else(|| "document".into()),
            source_id: text(hit, "sourceId"),
            origin_source_id: text(hit, "originSourceId"),
            entity: text(hit, "entity"),
            lang: text(hit, "lang"),
            content: text(hit, "content"),
        };
        RagSearchResponse {
            q: text(value, "q").unwrap_or_default(),
            mode: text(value, "mode"),
            results: value
                .get("results")
                .and_then(Value::as_array)
                .map(|hits| hits.iter().map(hit).collect())
                .unwrap_or_default(),
        }
    }

    /// Normalise the statistics of either backend (the bot's carry `backend: "local"`).
    pub(crate) fn rag_stats(value: &Value) -> RagStats {
        RagStats {
            backend: text(value, "backend").unwrap_or_else(|| "aphrody".to_owned()),
            chunks: count(value, "chunks").unwrap_or(0),
            vectors: count(value, "vectors").unwrap_or(0),
            vectors_stored: count(value, "vectorsStored"),
            mode: text(value, "mode"),
            built_at: text(value, "builtAt"),
            rag_ready: value.get("ragReady").and_then(Value::as_bool),
            sources: value
                .get("sources")
                .and_then(Value::as_array)
                .map(|sources| {
                    sources
                        .iter()
                        .map(|source| RagSourceStats {
                            source_id: text(source, "sourceId").unwrap_or_default(),
                            kind: text(source, "kind").unwrap_or_default(),
                            count: count(source, "count").unwrap_or(0),
                            vectors: count(source, "vectors"),
                        })
                        .collect()
                })
                .unwrap_or_default(),
        }
    }

    fn auth_status() -> AuthStatus {
        let home = shenron_cli::shenron_cmd::locate_home_shenron();
        shenron_cli::config::ShenronAuthPresence::from_home(&home).into()
    }

    pub(crate) fn build_info() -> BuildInfo {
        BuildInfo {
            version: env!("CARGO_PKG_VERSION").to_owned(),
            abi: ABI_VERSION,
            target: env!("SHENRON_FFI_TARGET").to_owned(),
            os: std::env::consts::OS.to_owned(),
            arch: std::env::consts::ARCH.to_owned(),
            profile: env!("SHENRON_FFI_PROFILE").to_owned(),
            features: env!("SHENRON_FFI_FEATURES")
                .split(',')
                .filter(|feature| !feature.is_empty())
                .map(str::to_owned)
                .collect(),
            rustc: env!("SHENRON_FFI_RUSTC").to_owned(),
        }
    }

    // --- ABI 1 ---

    /// Returns the Shenron ABI revision.
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_abi_version() -> u32 {
        ABI_VERSION
    }

    /// Returns the Shenron version as a static NUL-terminated UTF-8 string.
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_version() -> *const c_char {
        static VERSION: OnceLock<CString> = OnceLock::new();
        VERSION
            .get_or_init(|| {
                CString::new(env!("CARGO_PKG_VERSION")).expect("crate version has no NUL")
            })
            .as_ptr()
    }

    /// Free a string returned by any Shenron FFI function.
    ///
    /// # Safety
    /// `ptr` must be null or a live string returned by a Shenron FFI function,
    /// not previously freed.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn shenron_string_free(ptr: *mut c_char) {
        if ptr.is_null() {
            return;
        }
        // SAFETY: the caller guarantees `ptr` came from `CString::into_raw` here, freed once.
        drop(unsafe { CString::from_raw(ptr) });
    }

    /// Run any Shenron command with inherited stdio.
    ///
    /// # Safety
    /// `argv` must point to `argc` valid NUL-terminated C strings, or be null
    /// iff `argc == 0`; pointers are read only for this call.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_run(argc: c_int, argv: *const *const c_char) -> c_int {
        let outcome =
            catch_unwind(AssertUnwindSafe(|| match unsafe { collect_args(argc, argv) } {
                Some(args) => run_argv(args),
                None => {
                    set_last_error("invalid argv: null pointer or negative argc");
                    Status::Usage.code()
                },
            }));
        outcome.unwrap_or_else(|payload| {
            set_last_error(format!("shenron panicked: {}", panic_message(&*payload)));
            Status::Software.code()
        })
    }

    /// Run any Shenron command from a JSON array of arguments with inherited stdio.
    ///
    /// # Safety
    /// `args_json` must be null or a valid NUL-terminated UTF-8 C string.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_run_json(args_json: *const c_char) -> c_int {
        let outcome =
            catch_unwind(AssertUnwindSafe(|| match unsafe { parse_json_args(args_json) } {
                Ok(args) => run_argv(args),
                Err(message) => {
                    set_last_error(message);
                    Status::Usage.code()
                },
            }));
        outcome.unwrap_or_else(|payload| {
            set_last_error(format!("shenron panicked: {}", panic_message(&*payload)));
            Status::Software.code()
        })
    }

    /// Run any Shenron command with captured stdio, returning `CapturedResult` JSON.
    ///
    /// # Safety
    /// `args_json` must be null or a valid NUL-terminated UTF-8 C string. A
    /// non-null result must be released with `shenron_string_free`.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_run_captured(args_json: *const c_char) -> *mut c_char {
        captured_export("shenron_run_captured", || match unsafe { parse_json_args(args_json) } {
            Ok(args) => to_json(&run_captured(args)),
            Err(message) => usage_json(message),
        })
    }

    /// Search the serving RAG (the bot, or Aphrody with `RAG_BACKEND=aphrody`): `CapturedResult`
    /// JSON whose stdout is the backend answer, as `shenron rag search --json` prints it.
    ///
    /// # Safety
    /// `query` must be a valid NUL-terminated C string; `kind` may be null or a
    /// valid NUL-terminated C string. A non-null result must be freed once.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_rag_search(
        query: *const c_char,
        limit: c_int,
        kind: *const c_char,
    ) -> *mut c_char {
        captured_export("shenron_rag_search", || {
            let query = match unsafe { required_str(query, "query") } {
                Ok(query) => query.to_owned(),
                Err(message) => return usage_json(message),
            };
            let kind = unsafe { optional_str(kind) };
            command_json(runtime().block_on(rag_search_value(query, limit, kind)))
        })
    }

    /// Search the local Shenron corpus in process (embedded canon, guide, configured corpus and
    /// local RAG store): `LocalSearchResponse` JSON; free with `shenron_string_free`.
    ///
    /// # Safety
    /// `query` must be a valid NUL-terminated UTF-8 string; `kind` may be NULL or a valid
    /// NUL-terminated UTF-8 string. A non-null result must be freed exactly once.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_local_search(
        query: *const c_char,
        limit: c_int,
        kind: *const c_char,
    ) -> *mut c_char {
        captured_export("shenron_local_search", || {
            let query = match unsafe { required_str(query, "query") } {
                Ok(query) => query,
                Err(message) => return usage_json(message),
            };
            let kind = unsafe { optional_str(kind) };
            to_json(&local_search(query, limit, kind))
        })
    }

    /// Statistics of the serving RAG: `CapturedResult` JSON whose stdout is the backend answer.
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_rag_stats() -> *mut c_char {
        captured_export("shenron_rag_stats", || command_json(runtime().block_on(rag_stats_value())))
    }

    /// Chunk Shenron Markdown with Aphrody's canonical RAG implementation.
    /// Returns a JSON array of `RagChunk`, or `FfiError`. Free the returned
    /// string with `shenron_string_free`.
    ///
    /// # Safety
    /// `markdown` must be a valid NUL-terminated UTF-8 string; result must be
    /// freed exactly once.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_rag_chunk(
        markdown: *const c_char,
        max_chars: c_int,
        overlap_pct: f32,
    ) -> *mut c_char {
        use aphrody_rag_core::Chunker;

        let outcome = catch_unwind(AssertUnwindSafe(|| {
            let source = match unsafe { required_str(markdown, "markdown") } {
                Ok(source) => source,
                Err(error) => return to_json(&FfiError { error }),
            };
            let mut options = aphrody_rag_core::ChunkOptions::shenron_parity();
            options.max_chars = usize::try_from(max_chars.max(1)).unwrap_or(1);
            options.overlap_pct = overlap_pct.clamp(0.0, 1.0);
            let chunks: Vec<RagChunk> = aphrody_rag_core::MarkdownChunker
                .chunk(source, source, &options)
                .into_iter()
                .map(|chunk| RagChunk {
                    content: chunk.text,
                    section: chunk.symbol.unwrap_or_default(),
                })
                .collect();
            to_json(&chunks)
        }));
        let json = outcome.unwrap_or_else(|payload| {
            to_json(&FfiError {
                error: format!("shenron_rag_chunk panicked: {}", panic_message(&*payload)),
            })
        });
        string_to_c(json)
    }

    /// Retrieve only whether local admin credentials are configured: `CapturedResult` JSON
    /// whose stdout is `AuthStatus`.
    ///
    /// The JSON contract is deliberately sanitized and must never include
    /// credential values, cookies, tokens, scopes, or account identifiers.
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_auth_status() -> *mut c_char {
        captured_export("shenron_auth_status", || {
            let text = serde_json::to_string_pretty(&auth_status()).unwrap_or_default();
            captured_json(0, format!("{text}\n"), String::new())
        })
    }

    /// Retrieve the canonical Akira Toriyama (Tori-bot) x Shenron persona prompt.
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_persona_prompt() -> *const c_char {
        static SOUL: OnceLock<CString> = OnceLock::new();
        SOUL.get_or_init(|| {
            shenron_persona_from_state(aphrody_agent_home::paths::state_dir().ok().as_deref())
        })
        .as_ptr()
    }

    pub(crate) fn shenron_persona_from_state(state: Option<&std::path::Path>) -> CString {
        let text = state
            .map(|state| aphrody_agent_home::paths::named_profile_workspace(state, "dbfr"))
            .and_then(|root| aphrody_agent_home::SyncSnapshot::capture(root).ok())
            .and_then(|snapshot| {
                snapshot.documents.into_iter().find(|document| document.filename == "SOUL.md")
            })
            .map_or_else(
                || "Shenron x Akira Toriyama (Tori-bot) Canon Persona".to_owned(),
                |document| document.content,
            );
        CString::new(text).unwrap_or_else(|_| c"Shenron Persona".to_owned())
    }

    /// Query the sovereign Akira Toriyama / Shenron persona directly (captured `persona ask`).
    ///
    /// # Safety
    /// `question` must be a valid NUL-terminated C string. A non-null result
    /// must be released with `shenron_string_free` exactly once.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_persona_ask(question: *const c_char) -> *mut c_char {
        captured_export("shenron_persona_ask", || {
            match unsafe { required_str(question, "question") } {
                Ok(question) => {
                    to_json(&run_captured(vec!["persona".into(), "ask".into(), question.into()]))
                },
                Err(message) => usage_json(message),
            }
        })
    }

    // --- ABI 2 ---

    /// Identity of the library: `BuildInfo` JSON (version, ABI, target, profile, features,
    /// compiler). Free with `shenron_string_free`.
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_build_info() -> *mut c_char {
        let json = catch_unwind(|| to_json(&build_info())).unwrap_or_else(|payload| {
            let message = format!("shenron_build_info panicked: {}", panic_message(&*payload));
            set_last_error(message.clone());
            to_json(&serde_json::json!({ "error": message }))
        });
        string_to_c(json)
    }

    /// Return Shenron RE's original, source-attributed Xenoverse 3 prototype map as owned JSON.
    /// Its coordinates are schematic and do not claim to reproduce unpublished game geometry.
    /// Free with `shenron_string_free`.
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_re_xenoverse3_map() -> *mut c_char {
        let json =
            catch_unwind(|| to_json(&shenron_re::world::xenoverse3::xenoverse3_prototype_map()))
                .unwrap_or_else(|payload| {
                    let message =
                        format!("shenron_re_xenoverse3_map panicked: {}", panic_message(&*payload));
                    set_last_error(message.clone());
                    to_json(&serde_json::json!({ "error": message }))
                });
        string_to_c(json)
    }

    /// Register a cancellable job; returns its id (never 0; 0 reports an internal failure).
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_job_new() -> u64 {
        catch_unwind(jobs::create).unwrap_or_else(|payload| {
            set_last_error(format!("shenron_job_new panicked: {}", panic_message(&*payload)));
            0
        })
    }

    /// Cancel a registered job from any thread; true if it was registered (pending or running).
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_cancel(job: u64) -> bool {
        catch_unwind(|| jobs::cancel(job)).unwrap_or(false)
    }

    /// Cancel and forget a job that will not be passed to a `*_job` export.
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_job_release(job: u64) -> bool {
        catch_unwind(|| jobs::release(job)).unwrap_or(false)
    }

    /// Number of registered jobs, pending or running.
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_job_count() -> u32 {
        catch_unwind(jobs::count).map_or(u32::MAX, |n| u32::try_from(n).unwrap_or(u32::MAX))
    }

    /// `shenron_run_captured` as job `job`: `JobOutcome<CapturedResult>` JSON.
    ///
    /// # Safety
    /// `args_json` must be null or a valid NUL-terminated UTF-8 C string, read during the call.
    /// `job` comes from `shenron_job_new` and is consumed. Free the result once.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_run_captured_job(
        job: u64,
        args_json: *const c_char,
    ) -> *mut c_char {
        string_to_c(jobs::run(job, "shenron_run_captured_job", |job| {
            let args = unsafe { parse_json_args(args_json) }.map_err(JobError::Usage)?;
            run_captured_job(job, args)
        }))
    }

    /// Search the serving RAG as job `job`: `JobOutcome<RagSearchResponse>` JSON; a failed
    /// search (unreachable backend, out-of-range query) is status 1 with its report.
    ///
    /// # Safety
    /// As `shenron_rag_search`; `job` comes from `shenron_job_new` and is consumed.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_rag_search_job(
        job: u64,
        query: *const c_char,
        limit: c_int,
        kind: *const c_char,
    ) -> *mut c_char {
        string_to_c(jobs::run(job, "shenron_rag_search_job", |job| {
            let query = unsafe { required_str(query, "query") }.map_err(JobError::Usage)?;
            let kind = unsafe { optional_str(kind) };
            match job.block_on(|| rag_search_value(query.to_owned(), limit, kind)) {
                None => Err(JobError::Cancelled),
                Some(Ok(value)) => Ok(rag_search_response(&value)),
                Some(Err(report)) => Err(JobError::Failed(report)),
            }
        }))
    }

    /// Statistics of the serving RAG as job `job`: `JobOutcome<RagStats>` JSON.
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_rag_stats_job(job: u64) -> *mut c_char {
        string_to_c(jobs::run(job, "shenron_rag_stats_job", |job| {
            match job.block_on(rag_stats_value) {
                None => Err(JobError::Cancelled),
                Some(Ok(value)) => Ok(rag_stats(&value)),
                Some(Err(report)) => Err(JobError::Failed(report)),
            }
        }))
    }

    /// Search the local corpus as job `job`: `JobOutcome<LocalSearchResponse>` JSON. The search
    /// runs on the blocking pool; cancellation releases the caller at once.
    ///
    /// # Safety
    /// As `shenron_local_search`; `job` comes from `shenron_job_new` and is consumed.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_local_search_job(
        job: u64,
        query: *const c_char,
        limit: c_int,
        kind: *const c_char,
    ) -> *mut c_char {
        string_to_c(jobs::run(job, "shenron_local_search_job", |job| {
            let query =
                unsafe { required_str(query, "query") }.map_err(JobError::Usage)?.to_owned();
            let kind = unsafe { optional_str(kind) };
            job.blocking(move || local_search(&query, limit, kind))
        }))
    }

    /// Ask the persona as job `job`: `JobOutcome<CapturedResult>` JSON.
    ///
    /// # Safety
    /// As `shenron_persona_ask`; `job` comes from `shenron_job_new` and is consumed.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_persona_ask_job(
        job: u64,
        question: *const c_char,
    ) -> *mut c_char {
        string_to_c(jobs::run(job, "shenron_persona_ask_job", |job| {
            let question =
                unsafe { required_str(question, "question") }.map_err(JobError::Usage)?;
            run_captured_job(job, vec!["persona".into(), "ask".into(), question.into()])
        }))
    }

    // --- ABI 3: persistent chat memory ---

    /// Run one memory operation on the shared runtime: `JobOutcome<T>` JSON (an internal job,
    /// so the envelope, panic capture and status codes are those of the `*_job` exports).
    fn memory_call<T: Serialize, F: std::future::Future<Output = Result<T, String>>>(
        operation: &str,
        db_path: *const c_char,
        work: impl FnOnce(std::sync::Arc<aphrody_memory::SqliteLocalProvider>) -> Result<F, String>,
    ) -> *mut c_char {
        string_to_c(jobs::run(jobs::create(), operation, |job| {
            let path = unsafe { required_str(db_path, "db_path") }.map_err(JobError::Usage)?;
            let provider = crate::memory::provider(path).map_err(JobError::Failed)?;
            let future = work(provider).map_err(JobError::Usage)?;
            match job.block_on(|| future) {
                None => Err(JobError::Cancelled),
                Some(result) => result.map_err(JobError::Failed),
            }
        }))
    }

    /// # Safety
    /// `ptr` must be NULL or a valid NUL-terminated string.
    unsafe fn json_request<T: serde::de::DeserializeOwned>(
        ptr: *const c_char,
        name: &str,
    ) -> Result<T, String> {
        let text = unsafe { required_str(ptr, name) }?;
        serde_json::from_str(text).map_err(|error| format!("{name}: {error}"))
    }

    /// Store one memory in the database at `db_path` (created on first use, mode 600):
    /// `JobOutcome<MemoryEntry>` JSON. `request_json` is `{agentId, content, tags?, metadata?}`.
    ///
    /// # Safety
    /// Both arguments must be valid NUL-terminated UTF-8 strings, read during the call. Free the
    /// result once with `shenron_string_free`.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_memory_add(
        db_path: *const c_char,
        request_json: *const c_char,
    ) -> *mut c_char {
        memory_call("shenron_memory_add", db_path, |provider| {
            let request = unsafe { json_request(request_json, "request_json") }?;
            Ok(async move { crate::memory::add(&provider, request).await })
        })
    }

    /// Memories of one agent, newest first: `JobOutcome<MemoryEntry[]>` JSON. `request_json` is
    /// `{agentId, q?, tags?, limit?}` (`q`: substring of the content).
    ///
    /// # Safety
    /// As `shenron_memory_add`.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_memory_search(
        db_path: *const c_char,
        request_json: *const c_char,
    ) -> *mut c_char {
        memory_call("shenron_memory_search", db_path, |provider| {
            let request = unsafe { json_request(request_json, "request_json") }?;
            Ok(async move { crate::memory::search(&provider, request).await })
        })
    }

    /// Delete memory `id` of `agent_id`: `JobOutcome<boolean>` JSON (`false`: no such memory
    /// for this agent).
    ///
    /// # Safety
    /// Every argument must be a valid NUL-terminated UTF-8 string, read during the call. Free
    /// the result once.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_memory_delete(
        db_path: *const c_char,
        agent_id: *const c_char,
        id: *const c_char,
    ) -> *mut c_char {
        memory_call("shenron_memory_delete", db_path, |provider| {
            let agent = unsafe { required_str(agent_id, "agent_id") }?.to_owned();
            let id = unsafe { required_str(id, "id") }?.to_owned();
            Ok(async move { crate::memory::delete(&provider, &agent, &id).await })
        })
    }

    /// Delete every memory of `agent_id`: `JobOutcome<number>` JSON (the count deleted).
    ///
    /// # Safety
    /// As `shenron_memory_delete`.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_memory_clear(
        db_path: *const c_char,
        agent_id: *const c_char,
    ) -> *mut c_char {
        memory_call("shenron_memory_clear", db_path, |provider| {
            let agent = unsafe { required_str(agent_id, "agent_id") }?.to_owned();
            Ok(async move { crate::memory::clear(&provider, &agent).await })
        })
    }

    // --- ABI 4: local chat models ---

    /// Provision the chat model files of `request_json` (`{modelsDir, catalog?, model?, lora?,
    /// force?}`, each file `{spec, sha256?, scale?}`) as job `job`: `JobOutcome<LlamaProvisioned>`
    /// JSON. Blocks the caller for the whole transfer; `shenron_llama_progress(job)` reads its
    /// progress from another thread meanwhile. Cancelling stops at the next chunk (resumable).
    ///
    /// # Safety
    /// `request_json` must be a valid NUL-terminated UTF-8 string, read during the call. `job`
    /// comes from `shenron_job_new` and is consumed. Free the result once.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_llama_provision_job(
        job: u64,
        request_json: *const c_char,
    ) -> *mut c_char {
        string_to_c(jobs::run(job, "shenron_llama_provision_job", |job| {
            let request: crate::llama::ProvisionRequest =
                unsafe { json_request(request_json, "request_json") }.map_err(JobError::Usage)?;
            let request = request.to_aphrody().map_err(JobError::Usage)?;
            let id = job.id();
            match job.block_on(|| crate::llama::provision(id, request)) {
                None => Err(JobError::Cancelled),
                Some(result) => result.map_err(JobError::Failed),
            }
        }))
    }

    /// Latest progress of the running provisioning job `job`: owned `LlamaProgress` JSON, or
    /// `null` before the first byte and once the job ended. Any thread, never blocks.
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_llama_progress(job: u64) -> *mut c_char {
        let value = catch_unwind(|| crate::llama::progress(job)).ok().flatten();
        string_to_c(serde_json::to_string(&value).unwrap_or_else(|_| "null".to_owned()))
    }

    /// Serve the chat router of `request_json` (`{config, modelsDir, stateDir, llamaBin?,
    /// searchDirs?, bind?, daemon: {program, args?}}`) on the library's runtime, replacing the
    /// one this process already serves: `JobOutcome<LlamaRouterInfo>` JSON once it listens.
    ///
    /// # Safety
    /// As `shenron_memory_add` for `request_json`. Free the result once.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_llama_router_start(
        request_json: *const c_char,
    ) -> *mut c_char {
        string_to_c(jobs::run(jobs::create(), "shenron_llama_router_start", |job| {
            let request: crate::llama::RouterRequest =
                unsafe { json_request(request_json, "request_json") }.map_err(JobError::Usage)?;
            match job.block_on(|| crate::llama::start(request)) {
                None => Err(JobError::Cancelled),
                Some(result) => result.map_err(JobError::Failed),
            }
        }))
    }

    /// Stop the router of this process and the model server it started (at most 5 s for the
    /// open requests); `true` if one was serving. Blocks the caller.
    #[unsafe(no_mangle)]
    pub extern "C" fn shenron_llama_router_stop() -> bool {
        catch_unwind(|| runtime().block_on(crate::llama::stop())).unwrap_or(false)
    }

    /// Run the model supervisor's daemon with the JSON array `args_json` (the arguments after
    /// the host's own launcher arguments) until it exits; returns its exit code. For a host that
    /// re-executes itself as the daemon launcher of `shenron_llama_router_start`. Blocks.
    ///
    /// # Safety
    /// `args_json` must be a valid NUL-terminated UTF-8 string, read during the call.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_llama_daemon(args_json: *const c_char) -> c_int {
        let args = match unsafe { parse_json_args(args_json) } {
            Ok(args) => args,
            Err(message) => {
                set_last_error(message);
                return Status::Usage.code();
            },
        };
        catch_unwind(AssertUnwindSafe(|| crate::llama::daemon(args)))
            .unwrap_or(Status::Software.code())
    }

    /// Diagnostic: hold job `job` for `ms` milliseconds without I/O, then answer
    /// `JobOutcome<number>` (the duration). Measures the boundary and its cancellation; `0`
    /// yields once instead of arming a timer (whose resolution is 1 ms).
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_sleep_job(job: u64, ms: u32) -> *mut c_char {
        string_to_c(jobs::run(job, "shenron_sleep_job", |job| {
            let done = if ms == 0 {
                job.block_on(tokio::task::yield_now)
            } else {
                job.block_on(|| tokio::time::sleep(Duration::from_millis(u64::from(ms))))
            };
            done.map(|()| ms).ok_or(JobError::Cancelled)
        }))
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use std::ffi::{CStr, CString};

    use super::{abi, native::*};

    fn owned(ptr: *mut std::ffi::c_char) -> serde_json::Value {
        assert!(!ptr.is_null());
        let text = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_owned();
        unsafe { shenron_string_free(ptr) };
        serde_json::from_str(&text).unwrap()
    }

    #[test]
    fn shenron_abi_and_version_are_valid() {
        assert_eq!(shenron_abi_version(), abi::ABI_VERSION);
        assert_eq!(abi::ABI_VERSION, 5);
        let ptr = shenron_version();
        assert!(!ptr.is_null());
        let text = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap();
        assert_eq!(text, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn build_info_describes_this_build() {
        let info = owned(shenron_build_info());
        assert_eq!(info["version"], env!("CARGO_PKG_VERSION"));
        assert_eq!(info["abi"], abi::ABI_VERSION);
        assert_eq!(info["os"], std::env::consts::OS);
        assert_eq!(info["arch"], std::env::consts::ARCH);
        let target = info["target"].as_str().unwrap();
        assert!(target.starts_with(std::env::consts::ARCH), "{target}");
        assert!(["debug", "release"].contains(&info["profile"].as_str().unwrap()));
        assert!(info["features"].is_array());
        assert!(info["rustc"].as_str().unwrap().starts_with("rustc "), "{info}");
    }

    #[test]
    fn xenoverse3_prototype_map_is_owned_json_with_provenance() {
        let map = owned(shenron_re_xenoverse3_map());
        assert_eq!(map["schema_version"], 1);
        assert_eq!(map["status"], "original_prototype_schematic");
        assert_eq!(map["zones"].as_array().unwrap().len(), 6);
        assert_eq!(map["routes"].as_array().unwrap().len(), 7);
        assert!(map["caveat"].as_str().unwrap().contains("unreleased"));
        assert!(map["zones"][0]["source"].as_str().unwrap().starts_with("https://"));
    }

    #[test]
    fn every_export_is_in_the_abi_table_and_back() {
        let mut exported = Vec::new();
        for source in [include_str!("lib.rs"), include_str!("jobs.rs")] {
            let mut lines = source.lines().peekable();
            while let Some(line) = lines.next() {
                if line.trim() != "#[unsafe(no_mangle)]" {
                    continue;
                }
                let signature = lines.find(|line| line.contains("extern \"C\" fn ")).unwrap();
                let name = signature.split("fn ").nth(1).unwrap().split('(').next().unwrap();
                exported.push(name.to_owned());
            }
        }
        let mut declared: Vec<String> = abi::SYMBOLS.iter().map(|s| s.name.to_owned()).collect();
        exported.sort();
        declared.sort();
        assert_eq!(exported, declared, "abi::SYMBOLS must list exactly the exports");
        assert!(abi::SYMBOLS.iter().all(|s| s.since <= abi::ABI_VERSION && !s.doc.is_empty()));
    }

    #[test]
    fn jobs_answer_a_typed_envelope_and_leave_no_entry() {
        let job = shenron_job_new();
        assert!(job > 0);
        let outcome = owned(shenron_sleep_job(job, 1));
        assert_eq!(outcome, serde_json::json!({"status": 0, "value": 1, "error": null}));
        assert!(!shenron_cancel(job), "a finished job is unregistered");

        let job = shenron_job_new();
        assert!(shenron_job_release(job));
        assert_eq!(owned(shenron_sleep_job(job, 1))["status"], abi::Status::Usage.code());

        let job = shenron_job_new();
        assert!(shenron_cancel(job));
        assert_eq!(owned(shenron_sleep_job(job, 60_000))["status"], abi::Status::Cancelled.code());
    }

    #[test]
    fn memory_exports_round_trip_through_the_c_abi() {
        let dir = tempfile::tempdir().unwrap();
        let db = CString::new(dir.path().join("memory.sqlite").to_str().unwrap()).unwrap();
        let request = CString::new(
            r#"{"agentId":"shenron/local","content":"Je préfère Piccolo","tags":["preference"]}"#,
        )
        .unwrap();
        let added = owned(unsafe { shenron_memory_add(db.as_ptr(), request.as_ptr()) });
        assert_eq!(added["status"], 0, "{added}");
        let id = added["value"]["id"].as_str().unwrap().to_owned();
        assert_eq!(added["value"]["agentId"], "shenron/local");
        assert!(added["value"]["createdAtMs"].as_f64().unwrap() > 0.0);

        let query = CString::new(r#"{"agentId":"shenron/local","q":"piccolo"}"#).unwrap();
        let found = owned(unsafe { shenron_memory_search(db.as_ptr(), query.as_ptr()) });
        assert_eq!(found["value"][0]["id"], id.as_str(), "{found}");

        let agent = CString::new("shenron/local").unwrap();
        let other = CString::new("shenron/other").unwrap();
        let id_c = CString::new(id).unwrap();
        let refused =
            owned(unsafe { shenron_memory_delete(db.as_ptr(), other.as_ptr(), id_c.as_ptr()) });
        assert_eq!(refused["value"], false);
        let cleared = owned(unsafe { shenron_memory_clear(db.as_ptr(), agent.as_ptr()) });
        assert_eq!(cleared["value"], 1);

        let bad = CString::new("{not json").unwrap();
        let usage = owned(unsafe { shenron_memory_add(db.as_ptr(), bad.as_ptr()) });
        assert_eq!(usage["status"], abi::Status::Usage.code());
        let null = owned(unsafe { shenron_memory_clear(std::ptr::null(), agent.as_ptr()) });
        assert_eq!(null["error"], "db_path pointer is null");
    }

    #[test]
    fn local_search_job_matches_the_blocking_export() {
        let query = CString::new("Son Goku").unwrap();
        let blocking = owned(unsafe { shenron_local_search(query.as_ptr(), 3, std::ptr::null()) });
        let job = shenron_job_new();
        let outcome =
            owned(unsafe { shenron_local_search_job(job, query.as_ptr(), 3, std::ptr::null()) });
        assert_eq!(outcome["status"], 0, "{outcome}");
        assert_eq!(outcome["value"], blocking);
        let null = owned(unsafe {
            shenron_local_search_job(shenron_job_new(), std::ptr::null(), 3, std::ptr::null())
        });
        assert_eq!(null["status"], abi::Status::Usage.code());
        assert_eq!(null["error"], "query pointer is null");
    }

    #[test]
    fn shenron_persona_prompt_returns_canon() {
        let ptr = shenron_persona_prompt();
        assert!(!ptr.is_null());
        let text = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap();
        assert!(text.contains("Toriyama") || text.contains("Shenron"));
        assert_eq!(shenron_persona_prompt(), ptr, "the C pointer remains process-stable");
    }

    fn persona_fixture(state: &std::path::Path, profile: &str, soul: &str) -> std::path::PathBuf {
        let root = state.join("workspaces").join(profile);
        std::fs::create_dir_all(&root).unwrap();
        for file in aphrody_agent_home::sync_defaults().unwrap() {
            let content = if file.filename() == "SOUL.md" { soul } else { "# Synthetic fixture\n" };
            std::fs::write(root.join(file.filename()), content).unwrap();
        }
        root
    }

    #[test]
    fn shenron_persona_reads_the_dbfr_snapshot_instead_of_other_or_legacy_homes() {
        let state = tempfile::tempdir().unwrap();
        let soul = "---\ntone: précis\nbrevity: terse\n---\n\nShenron dbfr fixture.\n";
        let root = persona_fixture(state.path(), "dbfr", soul);
        persona_fixture(state.path(), "aphrody", "Aphrody unrelated persona.\n");
        let legacy = state.path().join("home/shenron");
        std::fs::create_dir_all(&legacy).unwrap();
        std::fs::write(legacy.join("SOUL.md"), "Legacy unrelated persona.\n").unwrap();
        let snapshot = aphrody_agent_home::SyncSnapshot::capture(&root).unwrap();
        let selected = snapshot.documents.iter().find(|doc| doc.filename == "SOUL.md").unwrap();
        assert_eq!(selected.content, soul);
        assert_eq!(shenron_persona_from_state(Some(state.path())).to_str().unwrap(), soul);
    }

    #[test]
    fn shenron_persona_retains_fallback_for_missing_or_incomplete_snapshots() {
        let state = tempfile::tempdir().unwrap();
        let fallback = "Shenron x Akira Toriyama (Tori-bot) Canon Persona";
        assert_eq!(shenron_persona_from_state(None).to_str().unwrap(), fallback);
        let root = persona_fixture(state.path(), "dbfr", "Shenron fixture.\n");
        std::fs::remove_file(root.join("BOOT.md")).unwrap();
        assert_eq!(shenron_persona_from_state(Some(state.path())).to_str().unwrap(), fallback);
    }

    #[test]
    fn shenron_persona_interior_nul_keeps_a_valid_c_string() {
        let state = tempfile::tempdir().unwrap();
        persona_fixture(state.path(), "dbfr", "Shenron fixture\0not a C string.\n");
        assert_eq!(shenron_persona_from_state(Some(state.path())).as_c_str(), c"Shenron Persona");
    }

    #[test]
    fn shenron_run_captured_runs_in_process() {
        std::thread::Builder::new()
            .stack_size(8 * 1024 * 1024)
            .spawn(|| {
                let json = CString::new(r#"["auth", "status", "--json"]"#).unwrap();
                let value = owned(unsafe { shenron_run_captured(json.as_ptr()) });
                assert_eq!(value["code"], 0, "{value}");
                let job = shenron_job_new();
                let outcome = owned(unsafe { shenron_run_captured_job(job, json.as_ptr()) });
                assert_eq!(outcome["status"], 0, "{outcome}");
                assert_eq!(outcome["value"]["code"], 0);
                // The test harness captures `println!` per thread before the descriptors, so
                // `stdout` is checked by the Bun suite (packages/native/test), not here.
                assert!(outcome["value"]["stdout"].is_string());
                assert!(outcome["value"]["stderr"].is_string());
            })
            .expect("failed to spawn test thread")
            .join()
            .expect("test thread panicked");
    }

    #[test]
    fn auth_status_is_sanitised_and_matches_the_command() {
        let value = owned(shenron_auth_status());
        assert_eq!(value["code"], 0);
        let status: serde_json::Value =
            serde_json::from_str(value["stdout"].as_str().unwrap()).unwrap();
        let mut keys: Vec<&str> = status.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["admin_credentials_present", "configured"]);
    }

    #[test]
    fn local_search_answers_from_the_embedded_canon_like_the_corpus_json() {
        let query = CString::new("Son Goku").unwrap();
        let value = owned(unsafe { shenron_local_search(query.as_ptr(), 3, std::ptr::null()) });
        assert!(value["results"].as_array().is_some_and(|hits| !hits.is_empty()), "{value}");
        // The typed answer is the corpus' own JSON envelope, except that a hit always carries
        // `entity` (`null` when absent, where the corpus omits the key).
        let mut typed = value.clone();
        for hit in typed["results"].as_array_mut().unwrap() {
            let hit = hit.as_object_mut().unwrap();
            assert!(hit.contains_key("entity"));
            if hit["entity"].is_null() {
                hit.remove("entity");
            }
        }
        let corpus = shenron_rag::LocalCorpus::load_with(&shenron_rag::dragonball::process_env);
        let options = shenron_rag::LocalSearchOptions {
            limit: Some(3),
            lang: None,
            entity: None,
            kind: None,
        };
        assert_eq!(typed, corpus.search_json("Son Goku", &options));
    }

    #[test]
    fn rag_answers_are_normalised_over_both_backends() {
        let local = rag_search_response(&serde_json::json!({
            "q": "Goku", "mode": "hybrid",
            "results": [{"rowid": 3, "title": "Goku", "url": "/wiki/goku", "snippet": "S",
                "score": 0.5, "kind": "wiki", "sourceId": "wiki", "lang": "fr"},
                {"snippet": "only"}]
        }));
        assert_eq!(local.q, "Goku");
        assert_eq!(local.mode.as_deref(), Some("hybrid"));
        assert_eq!(local.results[0].source_id.as_deref(), Some("wiki"));
        assert_eq!(local.results[1].kind, "document");
        assert!(local.results[1].score.abs() < f64::EPSILON);

        let bot = rag_stats(&serde_json::json!({"chunks": 12, "vectors": 10, "mode": "fts",
            "builtAt": "2026-10-01", "ragReady": true, "backend": "local"}));
        assert_eq!((bot.backend.as_str(), bot.chunks, bot.rag_ready), ("local", 12, Some(true)));
        let aphrody = rag_stats(&serde_json::json!({"chunks": 5, "vectors": 4,
            "vectorsStored": 4, "sources": [{"sourceId": "db", "kind": "databook", "count": 5}]}));
        assert_eq!(aphrody.backend, "aphrody");
        assert_eq!(aphrody.sources[0].count, 5);
        assert_eq!(aphrody.vectors_stored, Some(4));
    }
}
