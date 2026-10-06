// SPDX-License-Identifier: Apache-2.0
//! Persistent chat memory: Aphrody's `aphrody-memory` [`SqliteLocalProvider`], one provider per
//! database file for the life of the process.
//!
//! Shenron stores nothing of its own here: records, ids, schema and search are the provider's.
//! This module only validates the JSON requests of the `shenron_memory_*` exports, scopes every
//! read and deletion to one agent id, and maps records onto [`MemoryEntry`].

use std::{
    collections::{BTreeMap, HashMap},
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock, PoisonError},
};

use aphrody_memory::{
    MemoryProvider, SqliteLocalProvider,
    types::{MemoryQuery, MemoryRecord},
};
use serde::Deserialize;
use serde_json::Value;

use crate::types::MemoryEntry;

/// Default number of records a search returns.
pub const DEFAULT_LIMIT: u32 = 100;
/// Largest number of records a search returns.
pub const MAX_LIMIT: u32 = 1000;
/// Longest stored memory, in characters.
pub const MAX_CONTENT_CHARS: usize = 4000;
/// Longest agent id, in bytes.
const MAX_AGENT_BYTES: usize = 256;
/// Records deleted per search round of [`clear`].
const CLEAR_BATCH: u32 = 500;

/// Request of `shenron_memory_add`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemoryAdd {
    /// Owner of the record (agent home id: `discord:<user_id>`, `local`).
    pub agent_id: String,
    /// The remembered fact.
    pub content: String,
    /// Labels (`fact`, `preference`, `remember`, …): `[a-z0-9:_-]`, 1–32 bytes each.
    #[serde(default)]
    pub tags: Vec<String>,
    /// String metadata (conversation, persona, source).
    #[serde(default)]
    pub metadata: BTreeMap<String, String>,
}

/// Request of `shenron_memory_search`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemorySearch {
    /// Owner whose records are searched.
    pub agent_id: String,
    /// Substring the content must contain (case-insensitive on ASCII); absent or empty: all.
    #[serde(default)]
    pub q: Option<String>,
    /// Tags every record must carry.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Maximum records, newest first (default [`DEFAULT_LIMIT`], at most [`MAX_LIMIT`]).
    #[serde(default)]
    pub limit: Option<u32>,
}

fn providers() -> &'static Mutex<HashMap<PathBuf, Arc<SqliteLocalProvider>>> {
    static PROVIDERS: OnceLock<Mutex<HashMap<PathBuf, Arc<SqliteLocalProvider>>>> = OnceLock::new();
    PROVIDERS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// The provider of the database at `path`, opened (and created, private to the user) on first use.
///
/// # Errors
/// An empty path, an uncreatable directory or a database the provider cannot open.
pub fn provider(path: &str) -> Result<Arc<SqliteLocalProvider>, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("memory database path is empty".into());
    }
    let path = PathBuf::from(path);
    let mut open = providers().lock().unwrap_or_else(PoisonError::into_inner);
    if let Some(provider) = open.get(&path) {
        return Ok(Arc::clone(provider));
    }
    if let Some(parent) = path.parent().filter(|parent| !parent.as_os_str().is_empty()) {
        std::fs::create_dir_all(parent).map_err(|error| format!("memory directory: {error}"))?;
    }
    let provider = Arc::new(
        SqliteLocalProvider::open(&path).map_err(|error| format!("memory database: {error}"))?,
    );
    restrict(&path);
    open.insert(path, Arc::clone(&provider));
    Ok(provider)
}

/// The memory holds personal facts: the file is readable by its owner only.
#[cfg(unix)]
fn restrict(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict(_path: &Path) {}

fn check_agent(agent_id: &str) -> Result<(), String> {
    if agent_id.trim().is_empty() || agent_id.len() > MAX_AGENT_BYTES {
        return Err(format!("agentId must hold 1 to {MAX_AGENT_BYTES} bytes"));
    }
    Ok(())
}

fn check_tags(tags: &[String]) -> Result<(), String> {
    let valid = |tag: &String| {
        (1..=32).contains(&tag.len())
            && tag
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b":_-".contains(&b))
    };
    if tags.len() > 16 || !tags.iter().all(valid) {
        return Err("tags: at most 16, each 1 to 32 bytes of [a-z0-9:_-]".into());
    }
    Ok(())
}

/// Store one memory and return it with its id.
///
/// # Errors
/// An invalid request or a provider failure.
pub async fn add(provider: &SqliteLocalProvider, input: MemoryAdd) -> Result<MemoryEntry, String> {
    check_agent(&input.agent_id)?;
    check_tags(&input.tags)?;
    let content = input.content.trim();
    if content.is_empty() || content.chars().count() > MAX_CONTENT_CHARS {
        return Err(format!("content must hold 1 to {MAX_CONTENT_CHARS} characters"));
    }
    let metadata: serde_json::Map<String, Value> =
        input.metadata.into_iter().map(|(key, value)| (key, Value::String(value))).collect();
    let mut record = MemoryRecord::new("", input.agent_id, content)
        .with_tags(input.tags)
        .with_metadata(Value::Object(metadata));
    record.id = provider.add(record.clone()).await.map_err(|error| error.to_string())?;
    Ok(MemoryEntry::from(record))
}

/// Records of one agent, newest first.
///
/// # Errors
/// An invalid request or a provider failure.
pub async fn search(
    provider: &SqliteLocalProvider,
    input: MemorySearch,
) -> Result<Vec<MemoryEntry>, String> {
    check_agent(&input.agent_id)?;
    check_tags(&input.tags)?;
    let query = MemoryQuery {
        q: input.q.filter(|q| !q.trim().is_empty()),
        tags: input.tags,
        limit: Some(input.limit.unwrap_or(DEFAULT_LIMIT).clamp(1, MAX_LIMIT)),
        ..MemoryQuery::for_agent(input.agent_id)
    };
    let records = provider.search(query).await.map_err(|error| error.to_string())?;
    Ok(records.into_iter().map(MemoryEntry::from).collect())
}

/// Delete record `id` when it belongs to `agent_id`; `false` when there is no such record.
///
/// # Errors
/// An invalid agent id or a provider failure.
pub async fn delete(
    provider: &SqliteLocalProvider,
    agent_id: &str,
    id: &str,
) -> Result<bool, String> {
    check_agent(agent_id)?;
    match provider.get(id).await.map_err(|error| error.to_string())? {
        Some(record) if record.agent_id == agent_id => {
            provider.delete(id).await.map_err(|error| error.to_string())?;
            Ok(true)
        },
        _ => Ok(false),
    }
}

/// Delete every record of `agent_id`; returns how many were deleted.
///
/// # Errors
/// An invalid agent id or a provider failure.
pub async fn clear(provider: &SqliteLocalProvider, agent_id: &str) -> Result<u32, String> {
    check_agent(agent_id)?;
    let mut deleted = 0_u32;
    loop {
        let query = MemoryQuery { limit: Some(CLEAR_BATCH), ..MemoryQuery::for_agent(agent_id) };
        let batch = provider.search(query).await.map_err(|error| error.to_string())?;
        if batch.is_empty() {
            return Ok(deleted);
        }
        for record in batch {
            provider.delete(&record.id).await.map_err(|error| error.to_string())?;
            deleted = deleted.saturating_add(1);
        }
    }
}

impl From<MemoryRecord> for MemoryEntry {
    fn from(record: MemoryRecord) -> Self {
        let metadata = match record.metadata {
            Value::Object(map) => map
                .into_iter()
                .filter_map(|(key, value)| match value {
                    Value::String(text) => Some((key, text)),
                    _ => None,
                })
                .collect(),
            _ => BTreeMap::new(),
        };
        Self {
            id: record.id,
            agent_id: record.agent_id,
            content: record.content,
            tags: record.tags,
            // Epoch milliseconds stay below 2^53: exact as a JSON number.
            created_at_ms: record.created_at_unix_ms as f64,
            metadata,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn add_request(agent: &str, content: &str, tags: &[&str]) -> MemoryAdd {
        MemoryAdd {
            agent_id: agent.into(),
            content: content.into(),
            tags: tags.iter().map(|&tag| tag.to_owned()).collect(),
            metadata: BTreeMap::from([("source".to_owned(), "chat".to_owned())]),
        }
    }

    fn search_request(agent: &str, q: Option<&str>) -> MemorySearch {
        MemorySearch { agent_id: agent.into(), q: q.map(str::to_owned), tags: vec![], limit: None }
    }

    #[tokio::test]
    async fn records_are_scoped_to_their_agent_and_survive_a_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("data/memory.sqlite");
        let path = path.to_str().unwrap();
        let memory = provider(path).unwrap();
        let goku = add(
            &memory,
            add_request("shenron/a", "Mon personnage préféré est Goku", &["preference"]),
        )
        .await
        .unwrap();
        assert!(!goku.id.is_empty());
        assert_eq!(goku.metadata["source"], "chat");
        add(&memory, add_request("shenron/a", "Je m'appelle Bulma", &["fact"])).await.unwrap();
        add(&memory, add_request("shenron/b", "Je préfère Vegeta", &["preference"])).await.unwrap();
        assert!(Arc::ptr_eq(&memory, &provider(path).unwrap()), "one provider per file");

        let all = search(&memory, search_request("shenron/a", None)).await.unwrap();
        assert_eq!(all.len(), 2);
        let found = search(&memory, search_request("shenron/a", Some("goku"))).await.unwrap();
        assert_eq!(found.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(), [goku.id.as_str()]);

        assert!(!delete(&memory, "shenron/b", &goku.id).await.unwrap(), "another agent's record");
        assert!(delete(&memory, "shenron/a", &goku.id).await.unwrap());
        assert!(!delete(&memory, "shenron/a", &goku.id).await.unwrap());
        assert_eq!(clear(&memory, "shenron/a").await.unwrap(), 1);
        assert!(search(&memory, search_request("shenron/a", None)).await.unwrap().is_empty());

        let reopened = SqliteLocalProvider::open(path).unwrap();
        let kept = search(&reopened, search_request("shenron/b", None)).await.unwrap();
        assert_eq!(kept.len(), 1);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(path).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }
    }

    #[tokio::test]
    async fn invalid_requests_are_refused() {
        let memory = SqliteLocalProvider::open_in_memory().unwrap();
        assert!(add(&memory, add_request("", "x", &[])).await.is_err());
        assert!(add(&memory, add_request("a", "  ", &[])).await.is_err());
        assert!(add(&memory, add_request("a", "x", &["Bad Tag"])).await.is_err());
        assert!(add(&memory, add_request("a", "x", &["a%"])).await.is_err());
        assert!(provider(" ").is_err());
    }
}
