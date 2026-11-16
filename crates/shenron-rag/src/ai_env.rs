// SPDX-License-Identifier: Apache-2.0
//! The `SHENRON_AI_*` environment contract of the local chat endpoint.
//!
//! One place names the variables and their aliases; precedence is the canonical name, then each
//! alias in order. Blank values count as unset. The lookup is injected so tests never mutate the
//! process environment.

/// A canonical environment variable name plus the aliases a reader still honours.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CanonicalEnv {
    /// The name every writer emits.
    pub canonical: &'static str,
    /// Alternative names, tried in order.
    pub aliases: &'static [&'static str],
}

impl CanonicalEnv {
    /// Resolve from the process environment.
    #[must_use]
    pub fn resolve(&self) -> Option<String> {
        self.resolve_with(&|name| std::env::var(name).ok())
    }

    /// Resolve with an injected environment lookup.
    #[must_use]
    pub fn resolve_with(&self, env: &dyn Fn(&str) -> Option<String>) -> Option<String> {
        let read = |name: &str| env(name).filter(|value| !value.trim().is_empty());
        read(self.canonical).or_else(|| self.aliases.iter().find_map(|alias| read(alias)))
    }

    /// The name that supplied the resolved value, `None` when nothing is set.
    #[must_use]
    pub fn resolve_source_with(
        &self,
        env: &dyn Fn(&str) -> Option<String>,
    ) -> Option<&'static str> {
        let set = |name: &str| env(name).is_some_and(|value| !value.trim().is_empty());
        if set(self.canonical) {
            return Some(self.canonical);
        }
        self.aliases.iter().copied().find(|alias| set(alias))
    }
}

/// Base URL of the OpenAI-compatible chat endpoint.
pub const CHAT_BASE_URL: CanonicalEnv = CanonicalEnv {
    canonical: "SHENRON_AI_CHAT_BASE_URL",
    aliases: &["SHENRON_LLM_BASE_URL", "SHENRON_OSS_BASE_URL", "SHENRON_LOCAL_MODEL_URL"],
};

/// Model id served at [`CHAT_BASE_URL`].
pub const CHAT_MODEL: CanonicalEnv =
    CanonicalEnv { canonical: "SHENRON_AI_CHAT_MODEL", aliases: &["SHENRON_LLM_MODEL"] };

/// Base URL of the embeddings endpoint.
pub const EMBED_BASE_URL: CanonicalEnv =
    CanonicalEnv { canonical: "SHENRON_AI_EMBED_BASE_URL", aliases: &["SHENRON_EMBED_BASE_URL"] };

/// Embedding model id.
pub const EMBED_MODEL: CanonicalEnv =
    CanonicalEnv { canonical: "SHENRON_AI_EMBED_MODEL", aliases: &["SHENRON_EMBED_MODEL"] };

/// Embedding vector width.
pub const EMBED_DIMENSIONS: CanonicalEnv =
    CanonicalEnv { canonical: "SHENRON_AI_EMBED_DIMENSIONS", aliases: &["SHENRON_EMBED_DIM"] };

/// Base URL of the rerank endpoint.
pub const RERANK_BASE_URL: CanonicalEnv =
    CanonicalEnv { canonical: "SHENRON_AI_RERANK_BASE_URL", aliases: &["SHENRON_RERANK_BASE_URL"] };

/// Rerank model id.
pub const RERANK_MODEL: CanonicalEnv =
    CanonicalEnv { canonical: "SHENRON_AI_RERANK_MODEL", aliases: &["SHENRON_RERANK_MODEL"] };
