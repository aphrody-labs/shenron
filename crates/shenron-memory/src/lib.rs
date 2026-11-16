// SPDX-License-Identifier: Apache-2.0
//! Persistent agent memory in one SQLite file: a flat `memory_records` table with JSON-encoded
//! tags and metadata. Tags filter through `LIKE '%"tag"%'`, which holds up to about 100k rows.
//! The schema is stable: databases written by earlier releases open unchanged.

use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use thiserror::Error;
use tokio::sync::Mutex;
use uuid::Uuid;

const SCHEMA_SQL: &str = "
CREATE TABLE IF NOT EXISTS memory_records (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    content TEXT NOT NULL,
    tags_json TEXT NOT NULL DEFAULT '[]',
    created_at_unix_ms INTEGER NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_agent ON memory_records(agent_id);
CREATE INDEX IF NOT EXISTS idx_created ON memory_records(created_at_unix_ms DESC);
";

/// Failures of the memory store.
#[derive(Debug, Error)]
pub enum MemoryError {
    /// SQLite failure.
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    /// Filesystem failure.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    /// A stored JSON column does not parse.
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

/// One memory entry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MemoryRecord {
    /// Stable identifier (UUID v4 when left empty at `add`).
    pub id: String,
    /// Logical owner.
    pub agent_id: String,
    /// Content body.
    pub content: String,
    /// Labels for filtering.
    #[serde(default)]
    pub tags: Vec<String>,
    /// Creation time, epoch milliseconds.
    pub created_at_unix_ms: u64,
    /// Open-ended metadata.
    #[serde(default = "empty_object")]
    pub metadata: Value,
}

fn empty_object() -> Value {
    json!({})
}

impl MemoryRecord {
    /// A record created now.
    #[must_use]
    pub fn new(
        id: impl Into<String>,
        agent_id: impl Into<String>,
        content: impl Into<String>,
    ) -> Self {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_millis());
        Self {
            id: id.into(),
            agent_id: agent_id.into(),
            content: content.into(),
            tags: Vec::new(),
            created_at_unix_ms: u64::try_from(now).unwrap_or(u64::MAX),
            metadata: empty_object(),
        }
    }

    /// Set the tags.
    #[must_use]
    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        self.tags = tags;
        self
    }

    /// Set the metadata.
    #[must_use]
    pub fn with_metadata(mut self, metadata: Value) -> Self {
        self.metadata = metadata;
        self
    }
}

/// Search filter: one agent, optional substring, tags every record must carry, newest first.
#[derive(Debug, Clone, Default)]
pub struct MemoryQuery {
    /// Owner whose records are searched.
    pub agent_id: String,
    /// Substring the content must contain (ASCII case-insensitive).
    pub q: Option<String>,
    /// Tags every record must carry.
    pub tags: Vec<String>,
    /// Maximum number of records.
    pub limit: Option<u32>,
}

impl MemoryQuery {
    /// Every record of `agent_id`.
    #[must_use]
    pub fn for_agent(agent_id: impl Into<String>) -> Self {
        Self { agent_id: agent_id.into(), ..Self::default() }
    }
}

/// SQLite-backed memory store.
pub struct SqliteLocalProvider {
    conn: Mutex<Connection>,
}

impl std::fmt::Debug for SqliteLocalProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SqliteLocalProvider").finish_non_exhaustive()
    }
}

fn configure(conn: &Connection) -> Result<(), MemoryError> {
    conn.busy_timeout(std::time::Duration::from_millis(5000))?;
    conn.execute_batch(
        "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA temp_store = MEMORY;",
    )?;
    conn.execute_batch(SCHEMA_SQL)?;
    Ok(())
}

fn record_of(row: &rusqlite::Row<'_>) -> Result<MemoryRecord, MemoryError> {
    let tags_json: String = row.get(3)?;
    let created: i64 = row.get(4)?;
    let metadata_json: String = row.get(5)?;
    Ok(MemoryRecord {
        id: row.get(0)?,
        agent_id: row.get(1)?,
        content: row.get(2)?,
        tags: serde_json::from_str(&tags_json)?,
        created_at_unix_ms: u64::try_from(created).unwrap_or(0),
        metadata: serde_json::from_str(&metadata_json)?,
    })
}

const COLUMNS: &str = "id, agent_id, content, tags_json, created_at_unix_ms, metadata_json";

impl SqliteLocalProvider {
    /// Open or create the database at `path`.
    ///
    /// # Errors
    /// The file cannot be opened or migrated.
    pub fn open(path: impl AsRef<Path>) -> Result<Self, MemoryError> {
        let conn = Connection::open(path)?;
        configure(&conn)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    /// Open a transient in-memory database.
    ///
    /// # Errors
    /// The schema cannot be created.
    pub fn open_in_memory() -> Result<Self, MemoryError> {
        let conn = Connection::open_in_memory()?;
        configure(&conn)?;
        Ok(Self { conn: Mutex::new(conn) })
    }

    /// Store `record` (replacing one with the same id) and return its id.
    ///
    /// # Errors
    /// Serialization or SQLite failure.
    pub async fn add(&self, mut record: MemoryRecord) -> Result<String, MemoryError> {
        if record.id.is_empty() {
            record.id = Uuid::new_v4().to_string();
        }
        let created = i64::try_from(record.created_at_unix_ms).unwrap_or(i64::MAX);
        let conn = self.conn.lock().await;
        conn.execute(
            &format!(
                "INSERT OR REPLACE INTO memory_records ({COLUMNS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
            ),
            params![
                record.id,
                record.agent_id,
                record.content,
                serde_json::to_string(&record.tags)?,
                created,
                serde_json::to_string(&record.metadata)?,
            ],
        )?;
        Ok(record.id)
    }

    /// The record `id`, if any.
    ///
    /// # Errors
    /// SQLite failure.
    pub async fn get(&self, id: &str) -> Result<Option<MemoryRecord>, MemoryError> {
        let conn = self.conn.lock().await;
        let mut stmt =
            conn.prepare(&format!("SELECT {COLUMNS} FROM memory_records WHERE id = ?1"))?;
        let mut rows = stmt.query(params![id])?;
        rows.next()?.map(record_of).transpose()
    }

    /// Records matching `query`, newest first.
    ///
    /// # Errors
    /// SQLite failure.
    pub async fn search(&self, query: MemoryQuery) -> Result<Vec<MemoryRecord>, MemoryError> {
        let mut sql = format!("SELECT {COLUMNS} FROM memory_records WHERE agent_id = ?1");
        let mut binds: Vec<Box<dyn rusqlite::ToSql + Send>> =
            vec![Box::new(query.agent_id.clone())];
        if let Some(needle) = &query.q {
            binds.push(Box::new(format!("%{needle}%")));
            sql.push_str(&format!(" AND content LIKE ?{}", binds.len()));
        }
        for tag in &query.tags {
            binds.push(Box::new(format!("%\"{tag}\"%")));
            sql.push_str(&format!(" AND tags_json LIKE ?{}", binds.len()));
        }
        sql.push_str(" ORDER BY created_at_unix_ms DESC");
        if let Some(limit) = query.limit {
            binds.push(Box::new(i64::from(limit)));
            sql.push_str(&format!(" LIMIT ?{}", binds.len()));
        }
        let conn = self.conn.lock().await;
        let mut stmt = conn.prepare(&sql)?;
        let refs: Vec<&dyn rusqlite::ToSql> =
            binds.iter().map(|b| b.as_ref() as &dyn rusqlite::ToSql).collect();
        let mut rows = stmt.query(refs.as_slice())?;
        let mut out = Vec::new();
        while let Some(row) = rows.next()? {
            out.push(record_of(row)?);
        }
        Ok(out)
    }

    /// Delete the record `id` (no error when absent).
    ///
    /// # Errors
    /// SQLite failure.
    pub async fn delete(&self, id: &str) -> Result<(), MemoryError> {
        let conn = self.conn.lock().await;
        conn.execute("DELETE FROM memory_records WHERE id = ?1", params![id])?;
        Ok(())
    }
}
