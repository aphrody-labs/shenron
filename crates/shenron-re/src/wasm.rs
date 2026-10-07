// SPDX-License-Identifier: Apache-2.0
//! WebAssembly bindings for `shenron-re`.
//!
//! Exposes CPK archive triage, CRILAYLA decompression, CUS skill decoding,
//! AOB memory scanning, and Dragon Ball game catalog discovery to JS/WASM runtimes.

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};
use crate::catalog::get_dragon_ball_catalog;
use crate::formats::{
    bac::BacFile,
    bdm::BdmFile,
    cus::CusFile,
    msg::MsgFile,
    pup::PupFile,
};
use crate::fs::cpk::{CpkArchive, CpkEntry};
use crate::fs::crilayla::{decompress_crilayla, decompress_crilayla_raw};
use crate::live::aob::AobPattern;

/// Summary of a CPK archive inspection in WebAssembly.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpkTriageSummary {
    pub valid: bool,
    pub total_files: usize,
    pub total_file_size: u64,
    pub has_utf_table: bool,
    pub compression_detected: bool,
    pub entries: Vec<CpkEntry>,
}

fn to_js_err(err: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&err.to_string())
}

/// Analyze a CRIWARE CPK archive in-memory and return its file table and metadata.
#[wasm_bindgen]
pub fn wasm_triage_cpk(bytes: &[u8]) -> Result<JsValue, JsValue> {
    let archive = CpkArchive::parse(bytes).map_err(to_js_err)?;
    let total_file_size = archive.entries.iter().map(|e| e.file_size).sum();
    let compression_detected = archive.entries.iter().any(|e| e.is_compressed);
    let summary = CpkTriageSummary {
        valid: true,
        total_files: archive.entries.len(),
        total_file_size,
        has_utf_table: archive.has_utf_table(),
        compression_detected,
        entries: archive.entries,
    };
    serde_wasm_bindgen::to_value(&summary).map_err(to_js_err)
}

/// Extract a single file from a CPK archive by name (transparently decompressing CRILAYLA if needed).
#[wasm_bindgen]
pub fn wasm_extract_cpk_file(archive_bytes: &[u8], filename: &str) -> Result<Vec<u8>, JsValue> {
    let archive = CpkArchive::parse(archive_bytes).map_err(to_js_err)?;
    archive.extract(archive_bytes, filename).map_err(to_js_err)
}

/// Decompress a CRILAYLA compressed buffer into raw uncompressed bytes.
#[wasm_bindgen]
pub fn wasm_decompress_crilayla(compressed: &[u8], uncompressed_size: usize) -> Result<Vec<u8>, JsValue> {
    if compressed.starts_with(b"CRILAYLA") {
        decompress_crilayla(compressed).map_err(to_js_err)
    } else if uncompressed_size > 0 {
        decompress_crilayla_raw(compressed, uncompressed_size).map_err(to_js_err)
    } else {
        Err(JsValue::from_str("Invalid CRILAYLA input: missing CRILAYLA magic and uncompressed_size is 0"))
    }
}

/// Parse a DBXV2 CUS (Character Ultimate Skill) binary file and return all skills.
#[wasm_bindgen]
pub fn wasm_parse_cus(cus_bytes: &[u8]) -> Result<JsValue, JsValue> {
    let cus = CusFile::parse(cus_bytes).map_err(to_js_err)?;
    serde_wasm_bindgen::to_value(&cus).map_err(to_js_err)
}

/// Parse a DBXV2 BAC (Battle Action Code) moveset binary file and return all moves.
#[wasm_bindgen]
pub fn wasm_parse_bac(bac_bytes: &[u8]) -> Result<JsValue, JsValue> {
    let bac = BacFile::parse(bac_bytes).map_err(to_js_err)?;
    serde_wasm_bindgen::to_value(&bac).map_err(to_js_err)
}

/// Parse a DBXV2 BDM (Battle Damage Matrix) binary file and return all damage definitions.
#[wasm_bindgen]
pub fn wasm_parse_bdm(bdm_bytes: &[u8]) -> Result<JsValue, JsValue> {
    let bdm = BdmFile::parse(bdm_bytes).map_err(to_js_err)?;
    serde_wasm_bindgen::to_value(&bdm).map_err(to_js_err)
}

/// Parse a DBXV2 PUP (Power-Up Parameters) binary file and return transformation multipliers.
#[wasm_bindgen]
pub fn wasm_parse_pup(pup_bytes: &[u8]) -> Result<JsValue, JsValue> {
    let pup = PupFile::parse(pup_bytes).map_err(to_js_err)?;
    serde_wasm_bindgen::to_value(&pup).map_err(to_js_err)
}

/// Parse a DBXV2 MSG (Message) binary file and return localized text strings.
#[wasm_bindgen]
pub fn wasm_parse_msg(msg_bytes: &[u8]) -> Result<JsValue, JsValue> {
    let msg = MsgFile::parse(msg_bytes).map_err(to_js_err)?;
    serde_wasm_bindgen::to_value(&msg).map_err(to_js_err)
}

/// Scan a buffer for an Array-of-Bytes (AOB) pattern with wildcards (e.g. "48 89 5C 24 ??").
#[wasm_bindgen]
pub fn wasm_scan_aob(data: &[u8], pattern: &str) -> Result<Vec<usize>, JsValue> {
    let aob = AobPattern::parse(pattern).map_err(to_js_err)?;
    Ok(aob.scan_all(data, usize::MAX))
}

/// Retrieve the full Dragon Ball game catalog (Steam + Android) as a JavaScript object.
#[wasm_bindgen]
pub fn wasm_get_dragon_ball_catalog() -> Result<JsValue, JsValue> {
    let catalog = get_dragon_ball_catalog();
    serde_wasm_bindgen::to_value(&catalog).map_err(to_js_err)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wasm_scan_aob_direct() {
        let buffer = [0x90, 0x48, 0x89, 0x5C, 0x24, 0x20, 0xC3];
        let offsets = wasm_scan_aob(&buffer, "48 89 ?? 24").unwrap();
        assert_eq!(offsets, vec![1]);
    }

    #[test]
    fn test_wasm_catalog_direct() {
        let cat = get_dragon_ball_catalog();
        assert!(cat.len() >= 10);
    }

    #[test]
    fn test_wasm_parse_bdm_direct() {
        let mock = BdmFile::create_mock(5);
        let parsed = BdmFile::parse(&mock).unwrap();
        assert_eq!(parsed.entries.len(), 5);
        assert_eq!(parsed.entries[0].id, 100);
    }
}
