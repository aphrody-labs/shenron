// SPDX-License-Identifier: Apache-2.0
//! Shenron Dragon Ball knowledge.
//!
//! - [`dragonball`]: corpus paths, the offline in-memory index, the single-bot
//!   persona and the grounded local answer behind the `dragonball.*` MCP tools,
//!   the studio and the C ABI.
//! - [`corpus`]: the Shenron corpus format and its ingestion into Aphrody's
//!   SQLite RAG store.

pub mod corpus;
pub mod dragonball;

pub use corpus::{
    ShenronCorpusDoc, ShenronIngestOptions, ShenronIngestStats, ingest_shenron_docs,
    load_shenron_corpus,
};
pub use dragonball::{LocalCorpus, LocalHit, LocalSearchOptions};
