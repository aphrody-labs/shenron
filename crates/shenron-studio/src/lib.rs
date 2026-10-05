// SPDX-License-Identifier: Apache-2.0
//! Tauri commands of the Shenron studio, mounted by the Shenron desktop app.
//!
//! - [`studio`]: Shenron health, RAG, training, local corpus and local models.
//! - [`shenron`]: the public, read-only Shenron chat endpoint.
//!
//! The Koharu editor has its own commands (`koharu-app`, generated protocol), on the engine
//! of `koharu-library`.
//!
//! Every command that reaches local state is restricted to the `main` window.

pub mod shenron;
pub mod studio;
