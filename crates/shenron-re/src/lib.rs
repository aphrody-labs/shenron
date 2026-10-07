// SPDX-License-Identifier: Apache-2.0
//! # `shenron-re`
//!
//! Pure Rust reverse engineering engine and binary parsers for Dragon Ball Xenoverse 2 (DBXV2),
//! CRIWARE CPK archives, live memory inspection, and game data ingestion for the Shenron ecosystem.

pub mod catalog;
pub mod error;
pub mod formats;
pub mod fs;
pub mod live;
pub mod steam;
pub mod world;

#[cfg(any(feature = "wasm", target_arch = "wasm32", test))]
pub mod wasm;

pub use catalog::{
    CANON_STATUS_DERIVED_GAME, DetectedGame, DragonBallGame, GameEngine, Platform, SaveLocation,
    filter_by_engine, filter_by_platform, find_game_by_android_package, find_game_by_id,
    find_game_by_steam_app_id, get_dragon_ball_catalog, scan_all_installed_games,
    scan_installed_android_packages, scan_installed_steam_games, search_catalog,
};
pub use error::{ReError, Result};
pub use formats::{
    bac::{BacFile, BacHitbox, BacMove},
    bdm::{BdmEntry, BdmFile, DamageType},
    cms::{CmsEntry, CmsFile},
    cus::{CusFile, CusSkill, SkillCategory},
    msg::{MsgEntry, MsgFile},
    pup::{PupEntry, PupFile},
};
pub use fs::{
    cpk::{CpkArchive, CpkEntry},
    crilayla::{compress_crilayla_mock, decompress_crilayla, decompress_crilayla_raw},
};
pub use live::aob::AobPattern;
pub use steam::{SteamGameInstall, scan_dragon_ball_installs};
pub use world::xenoverse3::{Xenoverse3Map, xenoverse3_prototype_map};

/// Version of the shenron-re reverse engineering engine.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
