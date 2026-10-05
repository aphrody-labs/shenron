// SPDX-License-Identifier: MIT OR Apache-2.0
//! Shenron knowledge for the editor's agent ([`Toolbox`]):
//!
//! - `search_dragon_ball`: the local Dragon Ball corpus of the Shenron server (wiki, canon
//!   reference, databooks, manga), `GET /api/local/rag/search` on the loopback server;
//! - `lookup_lexicon`: Shenron's canonical Japanese → French lexicon
//!   (`data/lexique-db-canonique.json`, embedded; `SHENRON_LEXIQUE` overrides it).
//!
//! The agent checks names, facts and attested French forms with them before translating.

use std::{sync::OnceLock, time::Duration};

use anyhow::{Context as _, Result, bail};
use async_trait::async_trait;
use koharu_agent::{Control, Invocation, Tool, ToolCall, Toolbox};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::agent_tools::{arguments, definition};

/// Path of the local corpus search on the Shenron server.
pub const SEARCH_PATH: &str = "/api/local/rag/search";
/// Environment variable naming another lexicon file (same JSON shape).
pub const LEXICON_ENV: &str = "SHENRON_LEXIQUE";

const EMBEDDED_LEXICON: &str = include_str!("../../../../data/lexique-db-canonique.json");
const MAX_LEXICON_ENTRIES: usize = 20;

/// One attested term of the lexicon.
#[derive(Clone, Debug, Deserialize, PartialEq, Eq, Serialize)]
pub struct LexiconEntry {
    pub ja: String,
    pub fr: String,
    #[serde(default)]
    pub kind: Option<String>,
}

/// The knowledge tools; without a server only the lexicon answers.
pub struct ShenronKnowledge {
    server: Option<String>,
}

impl ShenronKnowledge {
    /// `server`: base URL of the local Shenron server (`http://127.0.0.1:<port>`).
    #[must_use]
    pub fn new(server: Option<String>) -> Self {
        Self {
            server: server
                .map(|base| base.trim().trim_end_matches('/').to_owned())
                .filter(|base| !base.is_empty()),
        }
    }

    async fn search(&self, request: SearchDragonBall) -> Result<Value> {
        let Some(server) = &self.server else {
            bail!("the local Shenron server is not running: no corpus to search");
        };
        let query = request.query.trim();
        if query.is_empty() || query.chars().count() > 600 {
            bail!("query must contain between 1 and 600 characters");
        }
        let limit = request.limit.unwrap_or(8).clamp(1, 20).to_string();
        let mut parameters = vec![("q", query), ("limit", limit.as_str())];
        if let Some(kind) = request.kind.as_deref().map(str::trim).filter(|kind| !kind.is_empty()) {
            parameters.push(("kind", kind));
        }
        let response = koharu_runtime::http_client()?
            .get(format!("{server}{SEARCH_PATH}"))
            .query(&parameters)
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .context("the local Shenron server did not answer")?;
        let status = response.status();
        let value: Value = response
            .json()
            .await
            .context("the local Shenron search returned no JSON")?;
        if !status.is_success() {
            bail!(
                "the local Shenron search failed ({status}): {}",
                value.get("error").and_then(Value::as_str).unwrap_or("no reason")
            );
        }
        Ok(value)
    }
}

#[derive(Deserialize, JsonSchema)]
struct SearchDragonBall {
    /// Words to look for (a name, a technique, a place, a Japanese term).
    query: String,
    /// Optional corpus filter: `wiki`, `canon`, `databook`, `manga`.
    kind: Option<String>,
    /// Number of passages, 1 to 20 (8 by default).
    limit: Option<u32>,
}

#[derive(Deserialize, JsonSchema)]
struct LookupLexicon {
    /// Japanese or French form to look up.
    term: String,
}

#[async_trait]
impl Toolbox for ShenronKnowledge {
    fn tools(&self) -> Vec<Tool> {
        let mut tools = vec![definition::<LookupLexicon>(
            "lookup_lexicon",
            "Look up Shenron's canonical Dragon Ball lexicon (Japanese → attested French forms of names, techniques, places). Use these French forms in translations.",
        )];
        if self.server.is_some() {
            tools.push(definition::<SearchDragonBall>(
                "search_dragon_ball",
                "Search Shenron's local Dragon Ball knowledge (wiki, canon reference, databooks, manga) to check a name, a fact or a term. Manga, scans and Akira Toriyama's statements prevail. Cite the returned URLs.",
            ));
        }
        tools
    }

    async fn invoke(&self, call: &ToolCall, _control: &Control) -> Option<Result<Invocation>> {
        match call.name.as_str() {
            "lookup_lexicon" => Some(arguments::<LookupLexicon>(call).and_then(|request| {
                let entries = lookup(lexicon()?, &request.term);
                Invocation::read(json!({ "term": request.term, "entries": entries }))
            })),
            "search_dragon_ball" if self.server.is_some() => Some(
                match arguments::<SearchDragonBall>(call) {
                    Ok(request) => self.search(request).await.and_then(Invocation::read),
                    Err(error) => Err(error),
                },
            ),
            _ => None,
        }
    }
}

/// The lexicon: `SHENRON_LEXIQUE` when it names a readable file, else the embedded one.
fn lexicon() -> Result<&'static [LexiconEntry]> {
    static LEXICON: OnceLock<std::result::Result<Vec<LexiconEntry>, String>> = OnceLock::new();
    LEXICON
        .get_or_init(|| {
            let explicit = std::env::var_os(LEXICON_ENV)
                .filter(|path| !path.is_empty())
                .and_then(|path| std::fs::read_to_string(path).ok());
            serde_json::from_str(explicit.as_deref().unwrap_or(EMBEDDED_LEXICON))
                .map_err(|error| format!("the Shenron lexicon is not valid JSON: {error}"))
        })
        .as_deref()
        .map_err(|error| anyhow::anyhow!("{error}"))
}

/// Entries whose Japanese or French form contains `term` (or is contained in it), exact
/// matches first, then the shortest forms.
fn lookup<'a>(entries: &'a [LexiconEntry], term: &str) -> Vec<&'a LexiconEntry> {
    let term = term.trim().to_lowercase();
    if term.is_empty() {
        return Vec::new();
    }
    let mut found = entries
        .iter()
        .filter_map(|entry| {
            let fr = entry.fr.to_lowercase();
            let exact = entry.ja == term || fr == term;
            let partial = entry.ja.contains(&term)
                || fr.contains(&term)
                || (entry.ja.chars().count() >= 2 && term.contains(&entry.ja));
            (exact || partial).then_some((!exact, entry.ja.chars().count(), entry))
        })
        .collect::<Vec<_>>();
    found.sort_by_key(|(inexact, length, _)| (*inexact, *length));
    found
        .into_iter()
        .take(MAX_LEXICON_ENTRIES)
        .map(|(_, _, entry)| entry)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_embedded_lexicon_loads() {
        let entries: Vec<LexiconEntry> = serde_json::from_str(EMBEDDED_LEXICON).unwrap();
        assert!(entries.len() > 100);
    }

    #[test]
    fn lookup_prefers_exact_forms_and_matches_both_languages() {
        let entries = vec![
            LexiconEntry { ja: "孫悟空".into(), fr: "Son Goku".into(), kind: None },
            LexiconEntry { ja: "悟空".into(), fr: "Goku".into(), kind: None },
            LexiconEntry { ja: "界王拳".into(), fr: "Kaio-ken".into(), kind: None },
        ];
        let found = lookup(&entries, "goku");
        assert_eq!(found[0].ja, "悟空");
        assert_eq!(found.len(), 2);
        assert_eq!(lookup(&entries, "界王拳を使え")[0].fr, "Kaio-ken");
        assert!(lookup(&entries, "  ").is_empty());
    }

    #[test]
    fn without_a_server_only_the_lexicon_is_offered() {
        let names = |knowledge: ShenronKnowledge| {
            knowledge.tools().into_iter().map(|tool| tool.name).collect::<Vec<_>>()
        };
        assert_eq!(names(ShenronKnowledge::new(None)), ["lookup_lexicon"]);
        assert_eq!(
            names(ShenronKnowledge::new(Some("http://127.0.0.1:1/".into()))),
            ["lookup_lexicon", "search_dragon_ball"]
        );
    }
}
