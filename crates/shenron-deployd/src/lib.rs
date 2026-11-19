// SPDX-License-Identifier: Apache-2.0
//! shenron-deployd: deploy without SSH or git on the servers (ADR 0009, step 1).
//!
//! Builder side: [`publish::publish`] hashes artifacts, writes a release manifest, signs it with
//! ed25519 and uploads everything to an artifact store ([`store::Store`]).
//! Host side: [`agent::Agent`] polls the manifest channel of each managed service, verifies the
//! signature against pinned public keys, downloads and verifies artifacts, swaps the `current`
//! symlink atomically, restarts the systemd unit, probes health and rolls back on failure.
//! [`api`] exposes a small mTLS status and trigger API.

pub mod agent;
pub mod api;
pub mod config;
pub mod health;
pub mod manifest;
pub mod publish;
pub mod release;
pub mod restart;
pub mod store;
pub mod util;
