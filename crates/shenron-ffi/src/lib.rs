// SPDX-License-Identifier: Apache-2.0
//! C ABI of Shenron for `bun:ffi` (`@shenron/native`) and any C host.
//!
//! - `shenron_*`: the `shenron` command in process (inherited or captured stdio),
//!   RAG search, statistics and chunking, the local corpus, persona and auth presence.
//!
//! Owned strings are released with `shenron_string_free`; `shenron_last_error` returns the last
//! error recorded on the calling thread.
//! Every export catches panics; none unwinds across the C boundary.

#![allow(
    clippy::missing_safety_doc,
    reason = "every unsafe export documents its contract in a # Safety section"
)]

#[cfg(not(target_arch = "wasm32"))]
pub use native::*;

#[cfg(not(target_arch = "wasm32"))]
mod native {
    use std::{
        cell::RefCell,
        ffi::{CStr, CString, OsString, c_char, c_int},
        panic::catch_unwind,
        ptr,
        sync::{Mutex, OnceLock},
    };

    use aphrody_stdio_capture::with_captured_stdio;

    /// ABI revision of the `shenron_*` symbol set (`EXPECTED_SHENRON_ABI_VERSION` in `@shenron/native`).
    pub(crate) const ABI_VERSION: u32 = 1;

    /// Status codes the boundary itself injects; a wrapped command may return any other exit code.
    #[repr(i32)]
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub(crate) enum Status {
        /// Malformed request: invalid argv, JSON or UTF-8 (sysexits EX_USAGE).
        Usage = 64,
        /// Internal error: a caught Rust panic (sysexits EX_SOFTWARE).
        Software = 70,
    }

    thread_local! {
        /// Last error recorded on this thread (the C ABI has no Result channel).
        static LAST_ERROR: RefCell<Option<CString>> = const { RefCell::new(None) };
    }

    fn set_last_error<M: Into<Vec<u8>>>(msg: M) {
        let value = CString::new(msg)
            .unwrap_or_else(|_| c"error message contained an interior NUL byte".to_owned());
        LAST_ERROR.with(|cell| *cell.borrow_mut() = Some(value));
    }

    /// Last error recorded on this thread, or NULL. Valid until the next call on this thread; do not free.
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

    /// Serialise stdout/stderr capture: the redirect swaps process-global descriptors.
    fn capture_lock() -> std::sync::MutexGuard<'static, ()> {
        static CAPTURE_LOCK: Mutex<()> = Mutex::new(());
        CAPTURE_LOCK.lock().unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn panic_message(payload: &(dyn std::any::Any + Send)) -> &str {
        payload
            .downcast_ref::<&str>()
            .copied()
            .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
            .unwrap_or("unknown panic")
    }

    /// Run `shenron <args…>` on the persistent runtime.
    fn run_argv(args: Vec<String>) -> i32 {
        let mut argv: Vec<OsString> = Vec::with_capacity(args.len() + 1);
        argv.push(OsString::from("shenron"));
        argv.extend(args.into_iter().map(OsString::from));
        runtime().block_on(shenron_cli::run_async(argv))
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

    fn json_result(code: i32, stdout: &str, stderr: &str) -> String {
        serde_json::json!({ "code": code, "stdout": stdout, "stderr": stderr }).to_string()
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

    /// Search the local Shenron corpus in process (embedded canon, guide, configured corpus and
    /// local RAG store). Returns `{"query","mode","results":[...]}` JSON; free with `shenron_string_free`.
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
        let outcome = catch_unwind(|| {
            if query.is_null() {
                return json_result(Status::Usage as i32, "", "query pointer is null");
            }
            // SAFETY: forwarded contract.
            let Ok(query) = unsafe { CStr::from_ptr(query) }.to_str() else {
                return json_result(Status::Usage as i32, "", "query is not valid UTF-8");
            };
            let kind = if kind.is_null() {
                None
            } else {
                // SAFETY: forwarded contract.
                unsafe { CStr::from_ptr(kind) }
                    .to_str()
                    .ok()
                    .filter(|k| !k.is_empty())
                    .map(str::to_owned)
            };
            let options = shenron_rag::LocalSearchOptions {
                limit: usize::try_from(limit.max(1)).ok(),
                lang: None,
                entity: None,
                kind,
            };
            local_corpus().search_json(query, &options).to_string()
        });
        let json = outcome.unwrap_or_else(|payload| {
            let message = format!("shenron_local_search panicked: {}", panic_message(&*payload));
            set_last_error(message.clone());
            json_result(Status::Software as i32, "", &message)
        });
        string_to_c(json)
    }

    /// The local corpus, loaded once per process from the environment.
    fn local_corpus() -> &'static shenron_rag::LocalCorpus {
        static CORPUS: OnceLock<shenron_rag::LocalCorpus> = OnceLock::new();
        CORPUS.get_or_init(|| {
            shenron_rag::LocalCorpus::load_with(&shenron_rag::dragonball::process_env)
        })
    }

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
        let outcome = catch_unwind(|| match unsafe { collect_args(argc, argv) } {
            Some(args) => run_argv(args),
            None => {
                set_last_error("invalid argv: null pointer or negative argc");
                Status::Usage as c_int
            },
        });
        outcome.unwrap_or_else(|payload| {
            set_last_error(format!("shenron panicked: {}", panic_message(&*payload)));
            Status::Software as c_int
        })
    }

    /// Run any Shenron command from a JSON array of arguments with inherited stdio.
    ///
    /// # Safety
    /// `args_json` must be null or a valid NUL-terminated UTF-8 C string.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_run_json(args_json: *const c_char) -> c_int {
        let outcome = catch_unwind(|| match unsafe { parse_json_args(args_json) } {
            Ok(args) => run_argv(args),
            Err(message) => {
                set_last_error(message);
                Status::Usage as c_int
            },
        });
        outcome.unwrap_or_else(|payload| {
            set_last_error(format!("shenron panicked: {}", panic_message(&*payload)));
            Status::Software as c_int
        })
    }

    /// Run any Shenron command with captured stdio, returning `{"code":0,"stdout":"...","stderr":"..."}` JSON.
    ///
    /// # Safety
    /// `args_json` must be null or a valid NUL-terminated UTF-8 C string. A
    /// non-null result must be released with `shenron_string_free`.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_run_captured(args_json: *const c_char) -> *mut c_char {
        let outcome = catch_unwind(|| match unsafe { parse_json_args(args_json) } {
            Ok(args) => {
                let _guard = capture_lock();
                let (code, out, err) = with_captured_stdio(|| run_argv(args));
                json_result(code, &out, &err)
            },
            Err(message) => json_result(Status::Usage as i32, "", &message),
        });
        let json = outcome.unwrap_or_else(|payload| {
            let message = format!("shenron panicked: {}", panic_message(&*payload));
            set_last_error(message.clone());
            json_result(Status::Software as i32, "", &message)
        });
        string_to_c(json)
    }

    /// Perform a high-speed RAG search on the Shenron index in-process.
    /// Returns a JSON string of results. Must be freed with `shenron_string_free`.
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
        let outcome = catch_unwind(|| {
            if query.is_null() {
                return json_result(Status::Usage as i32, "", "query pointer is null");
            }
            let q_str = match unsafe { CStr::from_ptr(query) }.to_str() {
                Ok(s) => s.to_string(),
                Err(_) => {
                    return json_result(Status::Usage as i32, "", "query is not valid UTF-8");
                },
            };
            let mut args = vec![
                "rag".to_string(),
                "search".to_string(),
                q_str,
                "--limit".to_string(),
                limit.max(1).to_string(),
                "--json".to_string(),
            ];
            if !kind.is_null()
                && let Ok(k_str) = unsafe { CStr::from_ptr(kind) }.to_str()
                && !k_str.is_empty()
            {
                args.push("--kind".to_string());
                args.push(k_str.to_string());
            }
            let _guard = capture_lock();
            let (code, out, err) = with_captured_stdio(|| run_argv(args));
            json_result(code, &out, &err)
        });
        let json = outcome.unwrap_or_else(|payload| {
            let message = format!("shenron_rag_search panicked: {}", panic_message(&*payload));
            set_last_error(message.clone());
            json_result(Status::Software as i32, "", &message)
        });
        string_to_c(json)
    }

    /// Retrieve Shenron RAG index statistics as a JSON string.
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_rag_stats() -> *mut c_char {
        let outcome = catch_unwind(|| {
            let args = vec!["rag".to_string(), "stats".to_string(), "--json".to_string()];
            let _guard = capture_lock();
            let (code, out, err) = with_captured_stdio(|| run_argv(args));
            json_result(code, &out, &err)
        });
        let json = outcome.unwrap_or_else(|payload| {
            let message = format!("shenron_rag_stats panicked: {}", panic_message(&*payload));
            set_last_error(message.clone());
            json_result(Status::Software as i32, "", &message)
        });
        string_to_c(json)
    }

    /// Chunk Shenron Markdown with Aphrody's canonical RAG implementation.
    /// Returns a JSON array of `{content, section}` objects. Free the returned
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

        let outcome = catch_unwind(|| {
            if markdown.is_null() {
                return "{\"error\":\"markdown pointer is null\"}".to_owned();
            }
            let source = match unsafe { CStr::from_ptr(markdown) }.to_str() {
                Ok(source) => source,
                Err(_) => return "{\"error\":\"markdown is not valid UTF-8\"}".to_owned(),
            };
            let mut options = aphrody_rag_core::ChunkOptions::shenron_parity();
            options.max_chars = usize::try_from(max_chars.max(1)).unwrap_or(1);
            options.overlap_pct = overlap_pct.clamp(0.0, 1.0);
            let chunks = aphrody_rag_core::MarkdownChunker.chunk(source, source, &options);
            serde_json::to_string(
                &chunks
                    .into_iter()
                    .map(|chunk| {
                        serde_json::json!({
                            "content": chunk.text,
                            "section": chunk.symbol.unwrap_or_default(),
                        })
                    })
                    .collect::<Vec<_>>(),
            )
            .unwrap_or_else(|error| {
                format!(
                    "{{\"error\":{}}}",
                    serde_json::to_string(&error.to_string()).unwrap_or_default()
                )
            })
        });
        let json = outcome.unwrap_or_else(|payload| {
            format!(
                "{{\"error\":{}}}",
                serde_json::to_string(&format!(
                    "shenron_rag_chunk panicked: {}",
                    panic_message(&*payload)
                ))
                .unwrap_or_default()
            )
        });
        string_to_c(json)
    }

    /// Retrieve only whether local admin credentials are configured.
    ///
    /// The CLI JSON contract is deliberately sanitized and must never include
    /// credential values, cookies, tokens, scopes, or account identifiers.
    #[unsafe(no_mangle)]
    #[must_use]
    pub extern "C" fn shenron_auth_status() -> *mut c_char {
        let outcome = catch_unwind(|| {
            let args = vec!["auth".to_string(), "status".to_string(), "--json".to_string()];
            let _guard = capture_lock();
            let (code, out, err) = with_captured_stdio(|| run_argv(args));
            json_result(code, &out, &err)
        });
        let json = outcome.unwrap_or_else(|payload| {
            let message = format!("shenron_auth_status panicked: {}", panic_message(&*payload));
            set_last_error(message.clone());
            json_result(Status::Software as i32, "", &message)
        });
        string_to_c(json)
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

    /// Query the sovereign Akira Toriyama / Shenron persona directly.
    ///
    /// # Safety
    /// `question` must be a valid NUL-terminated C string. A non-null result
    /// must be released with `shenron_string_free` exactly once.
    #[unsafe(no_mangle)]
    #[must_use]
    pub unsafe extern "C" fn shenron_persona_ask(question: *const c_char) -> *mut c_char {
        let outcome = catch_unwind(|| {
            if question.is_null() {
                return json_result(Status::Usage as i32, "", "question pointer is null");
            }
            let q_str = match unsafe { CStr::from_ptr(question) }.to_str() {
                Ok(s) => s.to_string(),
                Err(_) => {
                    return json_result(Status::Usage as i32, "", "question is not valid UTF-8");
                },
            };
            let args = vec!["persona".to_string(), "ask".to_string(), q_str];
            let _guard = capture_lock();
            let (code, out, err) = with_captured_stdio(|| run_argv(args));
            json_result(code, &out, &err)
        });
        let json = outcome.unwrap_or_else(|payload| {
            let message = format!("shenron_persona_ask panicked: {}", panic_message(&*payload));
            set_last_error(message.clone());
            json_result(Status::Software as i32, "", &message)
        });
        string_to_c(json)
    }
}

#[cfg(all(test, not(target_arch = "wasm32")))]
mod tests {
    use std::ffi::{CStr, CString};

    use super::native::*;

    #[test]
    fn shenron_abi_and_version_are_valid() {
        assert_eq!(shenron_abi_version(), 1);
        let ptr = shenron_version();
        assert!(!ptr.is_null());
        let text = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap();
        assert!(!text.is_empty());
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
                let res_ptr = unsafe { shenron_run_captured(json.as_ptr()) };
                assert!(!res_ptr.is_null());
                let text = unsafe { CStr::from_ptr(res_ptr) }.to_str().unwrap();
                assert!(text.contains("code"));
                unsafe { shenron_string_free(res_ptr) };
            })
            .expect("failed to spawn test thread")
            .join()
            .expect("test thread panicked");
    }

    #[test]
    fn local_search_answers_from_the_embedded_canon() {
        let query = CString::new("Son Goku").unwrap();
        let ptr = unsafe { shenron_local_search(query.as_ptr(), 3, std::ptr::null()) };
        assert!(!ptr.is_null());
        let text = unsafe { CStr::from_ptr(ptr) }.to_str().unwrap().to_owned();
        unsafe { shenron_string_free(ptr) };
        let value: serde_json::Value = serde_json::from_str(&text).unwrap();
        assert!(value["results"].as_array().is_some_and(|hits| !hits.is_empty()), "{text}");
    }
}
