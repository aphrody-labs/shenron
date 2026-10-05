// SPDX-License-Identifier: Apache-2.0
//! Tauri commands of the Shenron studio, mounted by the Shenron desktop app.
//!
//! - [`studio`]: Shenron health, RAG, training, local corpus and local models.
//! - [`koharu`]: the in-process Koharu engine (`koharu_rpc`, `koharu_rpc_batch`).
//! - [`shenron`]: the public, read-only Shenron chat endpoint.
//!
//! Every command that reaches local state is restricted to the `main` window.

pub mod koharu;
pub mod shenron;
pub mod studio;
