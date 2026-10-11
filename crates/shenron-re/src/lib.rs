// SPDX-License-Identifier: Apache-2.0
//! # `shenron-re`
//!
//! Pure Rust reverse engineering engine and binary parsers for Dragon Ball Xenoverse 2 (DBXV2),
//! CRIWARE CPK archives, live memory inspection, and game data ingestion for the Shenron ecosystem.

pub mod error;
pub mod formats;
pub mod fs;
pub mod live;

pub use error::{ReError, Result};
pub use formats::{
    bac::{BacFile, BacHitbox, BacMove},
    cms::{CmsEntry, CmsFile},
    cus::{CusFile, CusSkill, SkillCategory},
    msg::{MsgEntry, MsgFile},
    pup::{PupEntry, PupFile},
};
pub use fs::{
    cpk::{CpkArchive, CpkEntry},
    crilayla::decompress_crilayla,
};
pub use live::aob::AobPattern;

/// Version of the shenron-re reverse engineering engine.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
