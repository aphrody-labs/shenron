pub mod cpk;
pub mod cpk_extract;
pub mod cpk_stream;
pub mod crilayla;
pub mod eac;
pub mod vfs;

pub use cpk::{CpkArchive, CpkEntry};
pub use cpk_stream::{
    CRI_VIOLA_FIXED_KEY, CpkExtraction, CpkFileRecord, CpkStreamReader, cri_key_from_filename,
    dbxv2_cpk_rank, decrypt_cri_block, decrypt_utf_table, entry_output_path,
};
#[cfg(not(target_arch = "wasm32"))]
pub use cpk_stream::{extract_cpk_stream, open_cpk_stream};
pub use crilayla::decompress_crilayla;
pub use eac::{
    EAC_MODULES_CDN_BASE_URL, EAC_PLATFORMS, EacCheckSite, EacCompiledPattern, EacGameModuleConfig,
    EacInstallInspection, EacScanReport, decrypt_eac_payload, encrypt_eac_payload,
    inspect_eac_install, is_eac_payload_encrypted, parse_bootstrapper_ini, scan_eac_sites,
};
pub use vfs::{CacheCpkStats, XenoverseVfs, XenoverseVfsEntry};
