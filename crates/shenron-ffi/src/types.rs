// SPDX-License-Identifier: Apache-2.0
//! JSON payloads of the C ABI, the one definition of their shape.
//!
//! Every owned string an export returns is one of these values serialised with `serde_json`;
//! `tests/typescript.rs` generates `packages/native/src/generated/types.ts` from them (specta,
//! serde-aware), so the Bun binding never declares a payload by hand. Only `Serialize` is
//! derived: these are outputs, built by the library itself.

use serde::Serialize;
use specta::Type;

/// Result of a command run with captured stdio (`shenron_run_captured`, `shenron_rag_search`,
/// `shenron_rag_stats`, `shenron_auth_status`, `shenron_persona_ask` and the captured jobs).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct CapturedResult {
    /// Exit code of the command; the boundary itself sets `64` (usage) or `70` (panic).
    pub code: i32,
    /// Standard output (the JSON document of a `--json` command).
    pub stdout: String,
    /// Standard error (the diagnostic of a failed command).
    pub stderr: String,
}

/// Envelope of every `*_job` export.
///
/// `status` is `0` with a `value`, otherwise one of `1` (the operation failed), `64` (malformed
/// request or unknown job), `70` (caught panic) or `125` (cancelled) with an `error`.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct JobOutcome<T> {
    /// `Status` code of the job.
    pub status: i32,
    /// The job's result, present only when `status` is `0`.
    pub value: Option<T>,
    /// Why the job produced no value.
    pub error: Option<String>,
}

/// One passage of the local corpus (`shenron_local_search`).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LocalHit {
    /// Document id.
    pub rowid: String,
    /// Document kind (`databook`, `wiki`, `canon`, …).
    pub kind: String,
    /// Title.
    pub title: String,
    /// Absolute URL.
    pub url: String,
    /// Bounded passage.
    pub snippet: String,
    /// Score in `[0, 1]`, comparable within one answer only.
    pub score: f64,
    /// Language.
    pub lang: String,
    /// Origin corpus.
    pub origin_source_id: String,
    /// Entity tag, `null` when the document has none (ABI 1 omitted the key).
    pub entity: Option<String>,
}

impl From<shenron_rag::LocalHit> for LocalHit {
    fn from(hit: shenron_rag::LocalHit) -> Self {
        Self {
            rowid: hit.rowid,
            kind: hit.kind,
            title: hit.title,
            url: hit.url,
            snippet: hit.snippet,
            score: hit.score,
            lang: hit.lang,
            origin_source_id: hit.origin_source_id,
            entity: hit.entity,
        }
    }
}

/// Answer of the local corpus search (`shenron_local_search`, `shenron_local_search_job`).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct LocalSearchResponse {
    /// The query as received.
    pub q: String,
    /// Search mode (`aphrody_local_naive`).
    pub mode: String,
    /// Number of `results`.
    pub total: u32,
    /// Hits, best first.
    pub results: Vec<LocalHit>,
}

/// One hit of the serving RAG (`shenron_rag_search_job`): the bot's `/api/public/rag/search`
/// or Aphrody's `/api/v1/shenron/rag/search`, normalised by the library.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RagHit {
    /// Title (empty when the backend gave none).
    pub title: String,
    /// Source URL.
    pub url: String,
    /// Bounded passage.
    pub snippet: String,
    /// Backend score (scale of the backend; `0` when absent).
    pub score: f64,
    /// Document kind (`document` when absent).
    pub kind: String,
    /// Source id.
    pub source_id: Option<String>,
    /// Origin corpus.
    pub origin_source_id: Option<String>,
    /// Entity tag.
    pub entity: Option<String>,
    /// Language.
    pub lang: Option<String>,
    /// Full passage when the backend returns it.
    pub content: Option<String>,
}

/// Answer of the serving RAG search (`shenron_rag_search_job`).
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
pub struct RagSearchResponse {
    /// The query echoed by the backend.
    pub q: String,
    /// Retrieval mode reported by the backend.
    pub mode: Option<String>,
    /// Hits, best first.
    pub results: Vec<RagHit>,
}

/// One source of the RAG statistics.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RagSourceStats {
    /// Source id.
    pub source_id: String,
    /// Document kind.
    pub kind: String,
    /// Passages of this source.
    pub count: u32,
    /// Vectors of this source, when reported.
    pub vectors: Option<u32>,
}

/// Statistics of the serving RAG (`shenron_rag_stats_job`), normalised over both backends.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RagStats {
    /// Serving backend: `local` (the bot) or `aphrody`.
    pub backend: String,
    /// Indexed passages.
    pub chunks: u32,
    /// Embedded vectors.
    pub vectors: u32,
    /// Vectors actually stored, when the backend distinguishes them.
    pub vectors_stored: Option<u32>,
    /// Retrieval mode of the bot index.
    pub mode: Option<String>,
    /// Build date of the bot index.
    pub built_at: Option<String>,
    /// Whether the bot reports its RAG as ready.
    pub rag_ready: Option<bool>,
    /// Per-source counts (Aphrody backend).
    pub sources: Vec<RagSourceStats>,
}

/// One Markdown chunk (`shenron_rag_chunk`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct RagChunk {
    /// Chunk text.
    pub content: String,
    /// Heading path of the chunk (empty at top level).
    pub section: String,
}

/// Failure of an export that returns a bare value (`shenron_rag_chunk`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct FfiError {
    /// Why the call failed.
    pub error: String,
}

/// Presence of local admin credentials (`shenron auth status --json`); never a value.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct AuthStatus {
    /// A local configuration or credential file exists.
    pub configured: bool,
    /// The admin credential file exists (its content is never read).
    pub admin_credentials_present: bool,
}

impl From<shenron_cli::config::ShenronAuthPresence> for AuthStatus {
    fn from(presence: shenron_cli::config::ShenronAuthPresence) -> Self {
        Self {
            configured: presence.configured,
            admin_credentials_present: presence.admin_credentials_present,
        }
    }
}

/// Identity of the loaded library (`shenron_build_info`), checked by `@shenron/native` before use.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Type)]
pub struct BuildInfo {
    /// Version of the `shenron-ffi` crate (the workspace version).
    pub version: String,
    /// ABI revision (`shenron_abi_version`).
    pub abi: u32,
    /// Target triple (`x86_64-unknown-linux-gnu`, `x86_64-pc-windows-msvc`, …).
    pub target: String,
    /// Operating system (`std::env::consts::OS`: `linux`, `windows`, `macos`).
    pub os: String,
    /// CPU architecture (`std::env::consts::ARCH`: `x86_64`, `aarch64`).
    pub arch: String,
    /// Cargo profile (`debug` or `release`).
    pub profile: String,
    /// Enabled Cargo features of the crate, sorted.
    pub features: Vec<String>,
    /// `rustc --version` of the compiler that built the library.
    pub rustc: String,
}

/// One memory of the persistent chat memory (`shenron_memory_*`, ABI 3): a record of Aphrody's
/// `aphrody-memory` SQLite provider.
#[derive(Debug, Clone, PartialEq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEntry {
    /// Provider id (UUID v4).
    pub id: String,
    /// Owner of the record (`shenron/<owner>`).
    pub agent_id: String,
    /// The remembered fact.
    pub content: String,
    /// Labels (`fact`, `preference`, `remember`, …).
    pub tags: Vec<String>,
    /// Creation time, epoch milliseconds (UTC).
    pub created_at_ms: f64,
    /// String metadata (conversation, persona, source).
    pub metadata: std::collections::BTreeMap<String, String>,
}
