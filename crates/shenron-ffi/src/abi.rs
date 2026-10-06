// SPDX-License-Identifier: Apache-2.0
//! The C ABI table: the one declaration of every export's signature.
//!
//! [`SYMBOLS`] lists each `shenron_*` export with its arguments and return value as
//! [`FfiKind`]s. The table macro checks every entry against the real function at compile time
//! (a `const` coercion to the declared `unsafe extern "C" fn` type), and `tests/typescript.rs`
//! generates the `bun:ffi` `dlopen` table of `@shenron/native` from it: a signature drift fails
//! the build or the generation check, never the process.

/// ABI revision of the `shenron_*` symbol set (`SHENRON_FFI_ABI` in `@shenron/native`).
///
/// - 1: commands, RAG search, stats and chunking, local corpus, persona, auth presence.
/// - 2: adds cancellable jobs (`shenron_job_new`, `shenron_cancel`, `shenron_job_release`,
///   `shenron_job_count`, the `*_job` exports) and `shenron_build_info`. Every revision-1
///   symbol keeps its signature, ownership and JSON shape.
/// - 3: adds the persistent chat memory (`shenron_memory_add`, `shenron_memory_search`,
///   `shenron_memory_delete`, `shenron_memory_clear`) over Aphrody's `aphrody-memory`. Every
///   revision-2 symbol is unchanged.
/// - 4: adds the local chat models (`shenron_llama_provision_job`, `shenron_llama_progress`,
///   `shenron_llama_router_start`, `shenron_llama_router_stop`, `shenron_llama_daemon`) over
///   Aphrody's `aphrody-llama-server`. Every revision-3 symbol is unchanged.
pub const ABI_VERSION: u32 = 4;

/// Status codes set by the boundary: `JobOutcome.status`, and the `code` of a captured result
/// when the call fails before the command runs. A wrapped command may return any exit code.
#[repr(i32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    /// The job produced its value.
    Ok = 0,
    /// The operation ran and failed (command error, unreachable service, invalid answer).
    Failed = 1,
    /// Malformed request: invalid argv, JSON, UTF-8, or an unknown or reused job id (EX_USAGE).
    Usage = 64,
    /// Internal error: a caught Rust panic (EX_SOFTWARE).
    Software = 70,
    /// Cancelled by `shenron_cancel` or `shenron_job_release` before producing a value (ECANCELED).
    Cancelled = 125,
}

impl Status {
    /// Every status, in code order.
    pub const ALL: [Self; 5] =
        [Self::Ok, Self::Failed, Self::Usage, Self::Software, Self::Cancelled];

    /// Wire code.
    #[must_use]
    pub const fn code(self) -> i32 {
        self as i32
    }

    /// Lower-case name used by the generated TypeScript constants.
    #[must_use]
    pub const fn name(self) -> &'static str {
        match self {
            Self::Ok => "ok",
            Self::Failed => "failed",
            Self::Usage => "usage",
            Self::Software => "software",
            Self::Cancelled => "cancelled",
        }
    }
}

/// How one value crosses the boundary: exactly one Rust type and one `bun:ffi` type per kind.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FfiKind {
    /// No value (`()`).
    Void,
    /// `bool` (one byte).
    Bool,
    /// `c_int`.
    I32,
    /// `u32`.
    U32,
    /// `u64` (job ids: below 2^53, returned to JS as a number).
    U64,
    /// `f32`.
    F32,
    /// Borrowed NUL-terminated UTF-8 input (`*const c_char`), read only during the call.
    CStr,
    /// Borrowed argv array (`*const *const c_char`), read only during the call.
    Argv,
    /// Owned string (`*mut c_char`): returned to the caller, freed once with
    /// `shenron_string_free`; as an argument, the string being freed.
    OwnedStr,
    /// String owned by the library for the life of the process (`*const c_char`); never freed.
    StaticStr,
    /// Thread-local string (`*const c_char`, may be NULL): valid until the next call on the
    /// calling thread; never freed.
    ThreadStr,
}

impl FfiKind {
    /// `FFIType` member for an argument of this kind.
    #[must_use]
    pub const fn bun_arg(self) -> &'static str {
        match self {
            Self::Void => "void",
            Self::Bool => "bool",
            Self::I32 => "i32",
            Self::U32 => "u32",
            Self::U64 => "u64",
            Self::F32 => "f32",
            Self::CStr => "cstring",
            Self::Argv | Self::OwnedStr | Self::StaticStr | Self::ThreadStr => "ptr",
        }
    }

    /// `FFIType` member for a return value of this kind.
    #[must_use]
    pub const fn bun_return(self) -> &'static str {
        match self {
            // Job ids stay below 2^53: a number, never a BigInt.
            Self::U64 => "u64_fast",
            // A static string is read in place; owned and thread-local ones stay pointers so the
            // caller can copy then free (owned) or test NULL (thread-local).
            Self::StaticStr => "cstring",
            other => other.bun_arg(),
        }
    }
}

/// One named argument of an export.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Arg {
    /// Name in the Rust signature.
    pub name: &'static str,
    /// Boundary kind.
    pub kind: FfiKind,
}

/// One export of the C ABI.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Symbol {
    /// Exported (unmangled) name.
    pub name: &'static str,
    /// Contract summary (ownership, threads, cancellation), one entry per line.
    pub doc: &'static [&'static str],
    /// Arguments in order.
    pub args: &'static [Arg],
    /// Return value.
    pub returns: FfiKind,
    /// ABI revision that introduced the export.
    pub since: u32,
}

macro_rules! ffi_type {
    (void) => { () };
    (bool) => { bool };
    (i32) => { ::std::ffi::c_int };
    (u32) => { u32 };
    (u64) => { u64 };
    (f32) => { f32 };
    (cstr) => { *const ::std::ffi::c_char };
    (argv) => { *const *const ::std::ffi::c_char };
    (owned_str) => { *mut ::std::ffi::c_char };
    (static_str) => { *const ::std::ffi::c_char };
    (thread_str) => { *const ::std::ffi::c_char };
}

macro_rules! ffi_kind {
    (void) => {
        FfiKind::Void
    };
    (bool) => {
        FfiKind::Bool
    };
    (i32) => {
        FfiKind::I32
    };
    (u32) => {
        FfiKind::U32
    };
    (u64) => {
        FfiKind::U64
    };
    (f32) => {
        FfiKind::F32
    };
    (cstr) => {
        FfiKind::CStr
    };
    (argv) => {
        FfiKind::Argv
    };
    (owned_str) => {
        FfiKind::OwnedStr
    };
    (static_str) => {
        FfiKind::StaticStr
    };
    (thread_str) => {
        FfiKind::ThreadStr
    };
}

macro_rules! ffi_table {
    ($(
        $(#[doc = $doc:literal])*
        [$since:literal] fn $name:ident($($arg:ident: $kind:ident),* $(,)?) -> $ret:ident;
    )*) => {
        // Compile-time check: each declared signature is exactly the exported function's.
        $(const _: unsafe extern "C" fn($(ffi_type!($kind)),*) -> ffi_type!($ret) = crate::$name;)*

        /// Every export of the library, in declaration order.
        pub const SYMBOLS: &[Symbol] = &[$(Symbol {
            name: stringify!($name),
            doc: &[$($doc),*],
            args: &[$(Arg { name: stringify!($arg), kind: ffi_kind!($kind) }),*],
            returns: ffi_kind!($ret),
            since: $since,
        }),*];
    };
}

ffi_table! {
    /// ABI revision of the library (`ABI_VERSION`).
    [1] fn shenron_abi_version() -> u32;
    /// Crate version, static string.
    [1] fn shenron_version() -> static_str;
    /// Last error recorded on the calling thread, or NULL; valid until that thread's next call.
    /// Read it on the thread that made the failing call.
    [1] fn shenron_last_error() -> thread_str;
    /// Free a string returned by any export, exactly once (NULL is ignored).
    [1] fn shenron_string_free(ptr: owned_str) -> void;
    /// Run `shenron <argv…>` with inherited stdio; returns the exit code. Blocks the caller.
    [1] fn shenron_run(argc: i32, argv: argv) -> i32;
    /// Run `shenron` from a JSON array of arguments with inherited stdio. Blocks the caller.
    [1] fn shenron_run_json(args_json: cstr) -> i32;
    /// Run `shenron` with captured stdio: owned `CapturedResult` JSON. Blocks the caller and
    /// redirects the process-wide stdout/stderr while the command runs.
    [1] fn shenron_run_captured(args_json: cstr) -> owned_str;
    /// Serving RAG search: owned `CapturedResult` JSON whose stdout is the backend answer.
    [1] fn shenron_rag_search(query: cstr, limit: i32, kind: cstr) -> owned_str;
    /// Local corpus search: owned `LocalSearchResponse` JSON (a usage error is a
    /// `CapturedResult` with code 64).
    [1] fn shenron_local_search(query: cstr, limit: i32, kind: cstr) -> owned_str;
    /// Serving RAG statistics: owned `CapturedResult` JSON whose stdout is the backend answer.
    [1] fn shenron_rag_stats() -> owned_str;
    /// Chunk Markdown: owned JSON array of `RagChunk`, or `FfiError`.
    [1] fn shenron_rag_chunk(markdown: cstr, max_chars: i32, overlap_pct: f32) -> owned_str;
    /// Local admin credential presence: owned `CapturedResult` JSON whose stdout is `AuthStatus`.
    [1] fn shenron_auth_status() -> owned_str;
    /// Persona prompt, static string.
    [1] fn shenron_persona_prompt() -> static_str;
    /// Ask the persona: owned `CapturedResult` JSON. Blocks the caller and redirects the
    /// process-wide stdout/stderr while the command runs.
    [1] fn shenron_persona_ask(question: cstr) -> owned_str;
    /// Library identity: owned `BuildInfo` JSON.
    [2] fn shenron_build_info() -> owned_str;
    /// Register a cancellable job and return its id (never 0). Pass it to one `*_job` export,
    /// which consumes it, or to `shenron_job_release`. Any thread.
    [2] fn shenron_job_new() -> u64;
    /// Cancel a registered job (pending or running) from any thread; true if it was registered.
    /// The `*_job` call returns status 125 promptly.
    [2] fn shenron_cancel(job: u64) -> bool;
    /// Cancel and forget a job that will never be passed to a `*_job` export; true if it was
    /// registered.
    [2] fn shenron_job_release(job: u64) -> bool;
    /// Number of registered jobs (pending or running), for leak checks.
    [2] fn shenron_job_count() -> u32;
    /// `shenron_run_captured` as a job: owned `JobOutcome<CapturedResult>` JSON.
    [2] fn shenron_run_captured_job(job: u64, args_json: cstr) -> owned_str;
    /// Serving RAG search as a job: owned `JobOutcome<RagSearchResponse>` JSON.
    [2] fn shenron_rag_search_job(job: u64, query: cstr, limit: i32, kind: cstr) -> owned_str;
    /// Serving RAG statistics as a job: owned `JobOutcome<RagStats>` JSON.
    [2] fn shenron_rag_stats_job(job: u64) -> owned_str;
    /// Local corpus search as a job: owned `JobOutcome<LocalSearchResponse>` JSON.
    [2] fn shenron_local_search_job(job: u64, query: cstr, limit: i32, kind: cstr) -> owned_str;
    /// Ask the persona as a job: owned `JobOutcome<CapturedResult>` JSON.
    [2] fn shenron_persona_ask_job(job: u64, question: cstr) -> owned_str;
    /// Diagnostic: hold a job for `ms` milliseconds without I/O: owned `JobOutcome<number>` JSON.
    [2] fn shenron_sleep_job(job: u64, ms: u32) -> owned_str;
    /// Store one memory in the SQLite memory at `db_path` (created on first use, mode 600):
    /// owned `JobOutcome<MemoryEntry>` JSON. `request_json`: `{agentId, content, tags?, metadata?}`.
    [3] fn shenron_memory_add(db_path: cstr, request_json: cstr) -> owned_str;
    /// Memories of one agent, newest first: owned `JobOutcome<MemoryEntry[]>` JSON.
    /// `request_json`: `{agentId, q?, tags?, limit?}`.
    [3] fn shenron_memory_search(db_path: cstr, request_json: cstr) -> owned_str;
    /// Delete one memory of `agent_id`: owned `JobOutcome<boolean>` JSON (`false`: none such).
    [3] fn shenron_memory_delete(db_path: cstr, agent_id: cstr, id: cstr) -> owned_str;
    /// Delete every memory of `agent_id`: owned `JobOutcome<number>` JSON (the count deleted).
    [3] fn shenron_memory_clear(db_path: cstr, agent_id: cstr) -> owned_str;
    /// Provision chat model files as job `job` (blocks for the transfer): owned
    /// `JobOutcome<LlamaProvisioned>` JSON. `request_json`: `{modelsDir, catalog?, model?, lora?,
    /// force?}`.
    [4] fn shenron_llama_provision_job(job: u64, request_json: cstr) -> owned_str;
    /// Latest progress of provisioning job `job`: owned `LlamaProgress` JSON or `null`. Any
    /// thread, never blocks.
    [4] fn shenron_llama_progress(job: u64) -> owned_str;
    /// Serve the chat router (one per process, replaced on restart): owned
    /// `JobOutcome<LlamaRouterInfo>` JSON once it listens.
    [4] fn shenron_llama_router_start(request_json: cstr) -> owned_str;
    /// Stop the router and the model server it started; true if one was serving. Blocks.
    [4] fn shenron_llama_router_stop() -> bool;
    /// Run the model supervisor daemon with a JSON array of arguments; returns its exit code.
    /// Blocks until the daemon exits (a process re-executed as the daemon launcher).
    [4] fn shenron_llama_daemon(args_json: cstr) -> i32;
}
