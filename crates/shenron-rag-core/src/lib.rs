// SPDX-License-Identifier: Apache-2.0
//! `shenron-rag-core` — the pure, `wasm32-unknown-unknown`-safe heart of the
//! shenron RAG layer (`docs/plans/codex-oss.md` phases P8/P9).
//!
//! Three independent pieces, all free of I/O, threads, and SQLite:
//!
//! 1. **Chunkers** ([`chunk`], plus one module per source kind): split a file into retrieval-sized,
//!    line-addressed [`chunk::Chunk`]s. Pick one by path via [`chunk::chunker_for_path`], or
//!    construct a specific [`chunk::Chunker`] directly.
//! 2. **Fusion** ([`fusion`]): Reciprocal Rank Fusion, source-weighted re-ranking with a
//!    guaranteed-quota promotion pass, Maximal Marginal Relevance diversification, and the small
//!    vector kernels (dot, cosine, int8 quantization, bounded-heap exact top-k) a retrieval
//!    pipeline needs around them.
//! 3. **Eval** ([`eval`]): a bit-for-bit port of shenron's retrieval eval harness
//!    (`apps/bot/src/lib/rag-eval.ts` + `apps/bot/scripts/ rag-eval.ts`), so shenron's RAG can be
//!    benchmarked against shenron's production numbers on the same gold set and the same metric
//!    definitions.
//!
//! ## wasm32 support
//!
//! Every chunker, [`fusion`] and [`eval`] compile for `wasm32-unknown-unknown`; JS/TS sources use
//! [`structural_chunker::StructuralChunker`].
//!
//! ## Example
//!
//! ```
//! use shenron_rag_core::{ChunkOptions, chunker_for_path};
//!
//! let source = "fn greet() {\n    println!(\"hi\");\n}\n";
//! let chunks =
//!     chunker_for_path("src/lib.rs").chunk("src/lib.rs", source, &ChunkOptions::default());
//! assert_eq!(chunks.len(), 1);
//! assert_eq!(chunks[0].symbol.as_deref(), Some("greet"));
//! ```

#![forbid(unsafe_code)]

pub mod api;
mod chunk;
mod markdown_chunker;
mod prose_chunker;
mod rust_chunker;
mod structural_chunker;
pub mod text;
pub mod vectors_f32;
pub mod vectors_f64;

pub mod eval;
pub mod fusion;

pub use chunk::{
    Chunk, ChunkKind, ChunkOptions, Chunker, Language, LengthUnit, chunker_for_path,
    detect_language,
};
pub use markdown_chunker::MarkdownChunker;
pub use prose_chunker::ProseChunker;
pub use rust_chunker::RustChunker;
pub use structural_chunker::StructuralChunker;
