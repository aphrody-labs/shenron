// SPDX-License-Identifier: Apache-2.0
//! Shenron Dragon Ball knowledge.
//!
//! - [`dragonball`]: corpus paths, the offline in-memory index, the single-bot
//!   persona and the grounded local answer behind the `dragonball.*` MCP tools,
//!   the studio and the C ABI.
//! - [`corpus`]: the Shenron corpus format and its ingestion into the SQLite RAG [`store`]
//!   (FTS5 lexical index plus optional dense vectors from an [`embedder`]).

pub mod ai_env;
pub mod corpus;
pub mod dragonball;
pub mod embedder;
pub mod error;
pub mod jev;
pub mod store;

pub use corpus::{
    ShenronCorpusDoc, ShenronIngestOptions, ShenronIngestStats, ingest_shenron_docs,
    load_shenron_corpus,
};
pub use dragonball::{LocalCorpus, LocalHit, LocalSearchOptions};
pub use embedder::{Embedder, OpenAiCompatEmbedder, StubEmbedder};
pub use error::{RagError, Result};
pub use store::{ChunkRecord, DocRecord, RagStats, RagStore, ScoredChunk};
