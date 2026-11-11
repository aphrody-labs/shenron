// SPDX-License-Identifier: Apache-2.0
//! # `shenron-re`
//!
//! Pure Rust reverse engineering engine and binary parsers for Dragon Ball Xenoverse 2 (DBXV2),
//! CRIWARE CPK archives, live memory inspection, and game data ingestion for the Shenron ecosystem.

pub mod catalog;
pub mod error;
pub mod ffi;
pub mod formats;
pub mod fs;
pub mod inventory;
pub mod live;
pub mod steam;
pub mod text;
pub mod unified;
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
    ean::{EanAnimation, EanFile, LocalPose},
    ema::{EmaAnimation, EmaCommand, EmaFile, EmaKeyframe, EmaKind},
    emb::{EmbFile, EmbRgbaTexture, EmbTextureEntry, TexturePixelFormat},
    emd::{EmdFile, EmdMesh, EmdModelPart, EmdSubmesh, EmdVertex},
    emm::{EmmFile, EmmMaterial, EmmParameter},
    emo::{EmgMesh, EmgSampler, EmgSubmesh, EmoFile, EmoNode, EmoPart},
    esk::{EskBone, EskFile},
    model_assemble::{AssembledCharacterModel, ModelPrimitive},
    moveset::{CharacterMoveset, MoveFrameData},
    msg::{MsgEntry, MsgFile},
    pup::{PupEntry, PupFile},
    sav::{Dxbv2Cac, Dxbv2Save},
};
pub use fs::{
    cpk::{CpkArchive, CpkEntry},
    cpk_stream::{
        CRI_VIOLA_FIXED_KEY, CpkExtraction, CpkFileRecord, CpkStreamReader, cri_key_from_filename,
        dbxv2_cpk_rank, decrypt_cri_block, decrypt_utf_table, entry_output_path,
    },
    crilayla::{compress_crilayla_mock, decompress_crilayla, decompress_crilayla_raw},
    eac::{
        EAC_MODULES_CDN_BASE_URL, EAC_PLATFORMS, EacCheckSite, EacCompiledPattern,
        EacGameModuleConfig, EacInstallInspection, EacScanReport, decrypt_eac_payload,
        encrypt_eac_payload, inspect_eac_install, is_eac_payload_encrypted, parse_bootstrapper_ini,
        scan_eac_sites,
    },
    vfs::{CacheCpkStats, XenoverseVfs, XenoverseVfsEntry},
};
#[cfg(not(target_arch = "wasm32"))]
pub use fs::cpk_stream::{extract_cpk_stream, open_cpk_stream};
pub use live::aob::AobPattern;
pub use steam::{
    Dbxv2Install, STEAM_APP_ID_DB_FIGHTERZ, STEAM_APP_ID_DB_KAKAROT, STEAM_APP_ID_DB_SPARKING_ZERO,
    STEAM_APP_ID_DBXV1, STEAM_APP_ID_DBXV2, SteamDepotRecord, SteamGameInstall,
    SteamPlanningLimits, inspect_dbxv2_install, scan_dragon_ball_installs,
};
pub use unified::{
    BinaryFunctionEntry, BinaryReOverview, Dbxv2UnifiedState, LiveWineOverview, ResolvedSkill,
    SaveOverview, UnifiedCharacterProfile,
};
pub use world::xenoverse3::{Xenoverse3Map, xenoverse3_prototype_map};

/// Version of the shenron-re reverse engineering engine.
pub const VERSION: &str = env!("CARGO_PKG_VERSION");
