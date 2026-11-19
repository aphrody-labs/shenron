// SPDX-License-Identifier: Apache-2.0
//! Auto-learn: `memory.learn` and `memory.recall` over the `shenron-memory` SQLite store.
//!
//! A fact is stored with its source URL and the time it was learned; the same fact (compared
//! after whitespace and case folding) updates its record instead of duplicating it. Dragon Ball
//! factual context keeps coming from the `dragonball.*` tools: this store holds what a session
//! learned on top of them.

use std::sync::Arc;

use rmcp::schemars::{self, JsonSchema};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use shenron_memory::{MemoryQuery, MemoryRecord, SqliteLocalProvider};

use crate::{admin::Runtime, admin_sql};

/// Longest accepted fact, in characters.
pub const MAX_FACT_CHARS: usize = 4000;

/// Most records `memory.recall` returns.
pub const MAX_RECALL: usize = 50;

/// Arguments of `memory.learn`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct LearnInput {
    /// The fact, one self-contained statement (at most 4000 characters).
    pub fact: String,
    /// Where the fact comes from (an http or https URL): a page, a manga plate, a commit.
    pub source_url: String,
    /// Labels for recall filters.
    pub tags: Option<Vec<String>>,
    /// Kind of fact (for example `dragonball`, `schema`, `ops`).
    pub kind: Option<String>,
}

/// Arguments of `memory.recall`.
#[derive(Debug, Clone, Default, Serialize, Deserialize, JsonSchema)]
pub struct RecallInput {
    /// Text the fact must contain (case-insensitive).
    pub query: Option<String>,
    /// Tags every returned fact must carry.
    pub tags: Option<Vec<String>>,
    /// Maximum facts (default 10, at most 50).
    pub limit: Option<usize>,
}

fn rfc3339(unix_ms: u64) -> String {
    i64::try_from(unix_ms)
        .ok()
        .and_then(chrono::DateTime::from_timestamp_millis)
        .map_or_else(String::new, |at| at.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}

/// A fact reduced to what identifies it: lowercase words separated by single spaces.
#[must_use]
pub fn normalize(fact: &str) -> String {
    fact.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// Stable record id of a fact under `agent`.
#[must_use]
pub fn fact_id(agent: &str, fact: &str) -> String {
    let hash = blake3::hash(format!("{agent}\n{}", normalize(fact)).as_bytes()).to_hex();
    format!("fact-{}", &hash.as_str()[..24])
}

/// A validated http(s) source URL.
///
/// # Errors
/// The text is not an absolute http or https URL.
pub fn source(url: &str) -> Result<String, String> {
    let parsed = url::Url::parse(url.trim()).map_err(|error| format!("invalid source_url: {error}"))?;
    if matches!(parsed.scheme(), "http" | "https") && parsed.host_str().is_some() {
        Ok(parsed.to_string())
    } else {
        Err("source_url must be an absolute http or https URL".to_owned())
    }
}

async fn store(runtime: &Runtime) -> Result<&Arc<SqliteLocalProvider>, String> {
    runtime
        .memory
        .get_or_try_init(|| async {
            let path = runtime.config.memory_path.clone();
            if let Some(parent) = path.parent().filter(|parent| !parent.as_os_str().is_empty()) {
                std::fs::create_dir_all(parent)
                    .map_err(|error| format!("memory store directory {}: {error}", parent.display()))?;
            }
            SqliteLocalProvider::open(&path)
                .map(Arc::new)
                .map_err(|error| format!("memory store {}: {error}", path.display()))
        })
        .await
}

fn present(record: &MemoryRecord) -> Value {
    json!({
        "id": record.id,
        "fact": record.content,
        "source_url": record.metadata.get("source_url"),
        "kind": record.metadata.get("kind"),
        "tags": record.tags,
        "learned_at": rfc3339(record.created_at_unix_ms),
        "first_learned_at": record.metadata.get("first_learned_at"),
        "learned_by": record.metadata.get("learned_by"),
        "times_confirmed": record.metadata.get("times_confirmed"),
    })
}

/// `memory.learn`.
pub async fn learn(runtime: &Runtime, input: LearnInput, caller: &str) -> Result<Value, String> {
    let fact = input.fact.trim();
    if fact.is_empty() {
        return Err("fact is empty".to_owned());
    }
    if fact.chars().count() > MAX_FACT_CHARS {
        return Err(format!("fact is longer than {MAX_FACT_CHARS} characters"));
    }
    let source_url = source(&input.source_url)?;
    let agent = runtime.config.memory_agent.clone();
    let provider = store(runtime).await?;
    let id = fact_id(&agent, fact);
    let existing = provider.get(&id).await.map_err(|error| error.to_string())?;
    let (first_learned, confirmed) = existing.as_ref().map_or_else(
        || (None, 1),
        |record| {
            (
                record.metadata.get("first_learned_at").and_then(Value::as_str).map(str::to_owned),
                record.metadata.get("times_confirmed").and_then(Value::as_u64).unwrap_or(1) + 1,
            )
        },
    );
    let mut tags: Vec<String> = input
        .tags
        .unwrap_or_default()
        .into_iter()
        .map(|tag| tag.trim().to_owned())
        .filter(|tag| !tag.is_empty() && tag.len() <= 64 && !tag.contains('"'))
        .collect();
    tags.push("learned".to_owned());
    tags.sort();
    tags.dedup();
    let record = MemoryRecord::new(id.clone(), agent, fact.to_owned());
    let learned_at = rfc3339(record.created_at_unix_ms);
    let record = record.with_tags(tags).with_metadata(json!({
        "source_url": source_url,
        "kind": input.kind.as_deref().map(str::trim).filter(|kind| !kind.is_empty()),
        "learned_by": caller,
        "first_learned_at": first_learned.unwrap_or_else(|| learned_at.clone()),
        "times_confirmed": confirmed,
    }));
    provider.add(record).await.map_err(|error| error.to_string())?;
    Ok(json!({
        "id": id,
        "stored": true,
        "updated": existing.is_some(),
        "learned_at": learned_at,
        "source_url": source_url,
    }))
}

/// `memory.recall`.
pub async fn recall(runtime: &Runtime, input: RecallInput) -> Result<Value, String> {
    let provider = store(runtime).await?;
    let limit = input.limit.unwrap_or(10).clamp(1, MAX_RECALL);
    let mut query = MemoryQuery::for_agent(runtime.config.memory_agent.clone());
    query.q = input.query.as_deref().map(str::trim).filter(|text| !text.is_empty()).map(str::to_owned);
    query.tags = input
        .tags
        .unwrap_or_default()
        .into_iter()
        .map(|tag| tag.trim().to_owned())
        .filter(|tag| !tag.is_empty() && !tag.contains('"'))
        .collect();
    query.limit = Some(u32::try_from(limit).unwrap_or(10));
    let records = provider.search(query).await.map_err(|error| error.to_string())?;
    let facts: Vec<Value> = records.iter().map(present).collect();
    let (facts, truncated) = crate::admin::fit_rows(facts, limit, runtime.config.max_bytes);
    Ok(json!({ "facts": facts, "count": facts.len(), "truncated": truncated }))
}

/// A short audit summary of a learn call (the source, never the fact text).
#[must_use]
pub fn learn_summary(input: &LearnInput) -> String {
    admin_sql::clip(&input.source_url, 200)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::admin::Config;

    fn runtime(dir: &tempfile::TempDir) -> Runtime {
        let path = dir.path().join("memory.sqlite").to_string_lossy().into_owned();
        Runtime::new(Config::from_environment(move |name| {
            (name == "SHENRON_MCP_MEMORY_PATH").then(|| path.clone())
        }))
    }

    fn learn_input(fact: &str, url: &str) -> LearnInput {
        LearnInput { fact: fact.to_owned(), source_url: url.to_owned(), ..Default::default() }
    }

    #[tokio::test]
    async fn a_learned_fact_is_recalled_with_source_and_time() {
        let dir = tempfile::tempdir().expect("tempdir");
        let runtime = runtime(&dir);
        let stored = learn(
            &runtime,
            LearnInput {
                tags: Some(vec!["saga".into(), "bad\"tag".into()]),
                kind: Some("dragonball".into()),
                ..learn_input("Goku fights Vegeta on the wasteland.", "https://dragonballfr.com/wiki/vegeta")
            },
            "token:abc",
        )
        .await
        .expect("learn");
        assert_eq!(stored["stored"], true);
        assert_eq!(stored["updated"], false);
        let recalled = recall(
            &runtime,
            RecallInput { query: Some("vegeta".into()), tags: Some(vec!["saga".into()]), limit: None },
        )
        .await
        .expect("recall");
        assert_eq!(recalled["count"], 1);
        let fact = &recalled["facts"][0];
        assert_eq!(fact["source_url"], "https://dragonballfr.com/wiki/vegeta");
        assert_eq!(fact["learned_by"], "token:abc");
        assert_eq!(fact["kind"], "dragonball");
        assert!(fact["learned_at"].as_str().expect("time").ends_with('Z'));
        assert!(fact["tags"].as_array().expect("tags").iter().any(|tag| tag == "learned"));
    }

    #[tokio::test]
    async fn the_same_fact_updates_its_record() {
        let dir = tempfile::tempdir().expect("tempdir");
        let runtime = runtime(&dir);
        let first = learn(&runtime, learn_input("Piccolo  is Namekian", "https://example.com/a"), "stdio")
            .await
            .expect("first");
        let second = learn(&runtime, learn_input("piccolo is NAMEKIAN", "https://example.com/b"), "stdio")
            .await
            .expect("second");
        assert_eq!(first["id"], second["id"]);
        assert_eq!(second["updated"], true);
        let all = recall(&runtime, RecallInput::default()).await.expect("recall");
        assert_eq!(all["count"], 1);
        assert_eq!(all["facts"][0]["times_confirmed"], 2);
        assert_eq!(all["facts"][0]["source_url"], "https://example.com/b");
    }

    #[tokio::test]
    async fn invalid_facts_and_sources_are_refused() {
        let dir = tempfile::tempdir().expect("tempdir");
        let runtime = runtime(&dir);
        for (fact, url) in [
            ("", "https://example.com"),
            ("ok", "not a url"),
            ("ok", "file:///etc/passwd"),
            ("ok", "javascript:alert(1)"),
            ("ok", ""),
        ] {
            assert!(learn(&runtime, learn_input(fact, url), "stdio").await.is_err(), "{fact:?} {url:?}");
        }
        let long = "x".repeat(MAX_FACT_CHARS + 1);
        assert!(learn(&runtime, learn_input(&long, "https://example.com"), "stdio").await.is_err());
    }

    #[test]
    fn fact_ids_ignore_case_and_spacing_but_not_the_owner() {
        assert_eq!(fact_id("a", "Hello   World"), fact_id("a", "hello world"));
        assert_ne!(fact_id("a", "hello"), fact_id("b", "hello"));
        assert!(fact_id("a", "x").starts_with("fact-"));
    }
}
