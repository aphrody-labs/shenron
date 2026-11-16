// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Shenron contributors

//! Typed errors for the RAG store, embedding, and search pipeline.

use std::path::PathBuf;

use thiserror::Error;

/// Result type alias for RAG operations.
pub type Result<T, E = RagError> = std::result::Result<T, E>;

/// Errors produced by the RAG pipeline.
#[derive(Debug, Error)]
pub enum RagError {
    /// SQLite database error.
    #[error("SQLite database error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    /// I/O error during filesystem indexing or reading.
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    /// HTTP request error (embedder or reranker endpoints).
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    /// JSON serialization/deserialization error.
    #[error("JSON error: {0}")]
    Serde(#[from] serde_json::Error),

    /// Embedding computation failed.
    #[error("embedding generation failed: {0}")]
    EmbeddingFailed(String),

    /// Reranking failed.
    #[error("reranker failed: {0}")]
    RerankFailed(String),

    /// Vector dimension mismatch against active model.
    #[error("vector dimension mismatch: expected {expected}, found {found}")]
    DimensionMismatch {
        /// Expected dimension of the active embedding space.
        expected: usize,
        /// Observed vector dimension.
        found: usize,
    },

    /// Model space mismatch: attempt to mix vectors from different embedding models.
    #[error("embedding model mismatch: database has `{expected}`, query used `{found}`")]
    ModelMismatch {
        /// Active model in index.
        expected: String,
        /// Model requested by caller.
        found: String,
    },

    /// Document not found in store.
    #[error("document not found: `{0}`")]
    DocumentNotFound(String),

    /// Indexing failure for a path.
    #[error("indexing failed for `{path}`: {message}")]
    IndexFailed {
        /// Target path.
        path: PathBuf,
        /// Failure explanation.
        message: String,
    },

    /// Other unexpected pipeline error.
    #[error("RAG error: {0}")]
    Other(String),
}
