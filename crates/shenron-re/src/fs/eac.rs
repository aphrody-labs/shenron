// SPDX-License-Identifier: Apache-2.0
//! Easy Anti-Cheat (EAC) signature scanner, payload chain-cipher inspection, and
//! `GameBootstrapper.ini` / `EasyAntiCheat` installation diagnostics.
//!
//! Consolidates:
//! 1. Read-only EAC runtime check-site signature detection (`EAC_PATTERN_1..3` from
//!    `aphrody-nie-launcher/src/eac.rs`, reusing [`crate::live::aob`]-compatible wildcard syntax).
//! 2. Pure-Rust EAC module payload chain-cipher decryption & encryption (`decrypt_eac_payload` /
//!    `encrypt_eac_payload` ported from `aphrody-dev/EAC-Extractor-Utility/CryptoUtils.cpp`).
//! 3. `GameBootstrapper.ini` and `EasyAntiCheat/Settings.json` read-only installation inspection
//!    for DBXV2 (`DBXV2.exe` / `start_protected_game.exe`) and CRIWARE titles.

use crate::error::{ReError, Result};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

/// Canonical AOB pattern 1 recovered from `EACLauncher.exe` (`@0x140015440`).
pub const EAC_PATTERN_1: &str = "85 * * * 80 3D * * * * 00 74 * B2 01 E8 * * * * * 8B * FF";
/// Patch byte offset relative to the start of pattern 1 match (index of `0x74`).
pub const EAC_PATCH_OFFSET_1: usize = 11;

/// Canonical AOB pattern 2 recovered from `EACLauncher.exe` (`@0x140015480`).
pub const EAC_PATTERN_2: &str = "80 3D * * * * 00 74 * B2 01 B9 * * * * E8 * * * * * 8B * 24";
/// Patch byte offset relative to the start of pattern 2 match (index of `0x74`).
pub const EAC_PATCH_OFFSET_2: usize = 7;

/// Canonical AOB pattern 3 recovered from `EACLauncher.exe` (`@0x1400154C0`).
pub const EAC_PATTERN_3: &str =
    "80 3D * * * * 00 74 * BA 01 00 00 00 * 8D * * * * * * * * * * * E8 * * * * F7 * B2 * * * E8";
/// Patch byte offset relative to the start of pattern 3 match (index of `0x74`).
pub const EAC_PATCH_OFFSET_3: usize = 7;

/// Upstream Epic Games EAC module CDN base URL (`EAC-Extractor-Utility/games.json`).
pub const EAC_MODULES_CDN_BASE_URL: &str = "https://modules-cdn.eac-prod.on.epicgames.com/modules";

/// Supported target platform identifiers in the EAC module CDN.
pub const EAC_PLATFORMS: &[&str] = &[
    "win64",
    "win64_wow64",
    "linux64",
    "linux32",
    "mac64",
    "mac_arm64",
];

/// Parsed token of an EAC check-site signature.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EacPatternToken {
    Exact(u8),
    Wildcard,
}

/// Compiled EAC signature pattern with a designated conditional jump byte (`0x74` / `0xEB`).
#[derive(Debug, Clone)]
pub struct EacCompiledPattern {
    pub name: &'static str,
    pub tokens: Vec<EacPatternToken>,
    pub patch_offset: usize,
}

impl EacCompiledPattern {
    /// Compiles a whitespace-separated hex signature where `*`, `?`, or `??` are wildcards.
    pub fn parse(name: &'static str, pattern: &str, patch_offset: usize) -> Result<Self> {
        let mut tokens = Vec::new();
        for piece in pattern.split_whitespace() {
            if piece == "*" || piece == "?" || piece == "??" {
                tokens.push(EacPatternToken::Wildcard);
            } else {
                let byte = u8::from_str_radix(piece, 16).map_err(|e| ReError::ParseError {
                    context: "eac_pattern",
                    details: format!("invalid hex byte '{piece}' in pattern: {e}"),
                })?;
                tokens.push(EacPatternToken::Exact(byte));
            }
        }
        if patch_offset >= tokens.len() {
            return Err(ReError::ParseError {
                context: "eac_pattern",
                details: format!(
                    "patch offset {patch_offset} exceeds pattern length {}",
                    tokens.len()
                ),
            });
        }
        Ok(Self { name, tokens, patch_offset })
    }

    /// Finds all matches in `data`, matching either original `0x74` (`je`) or patched `0xEB` (`jmp`)
    /// at `patch_offset`.
    #[must_use]
    pub fn find_matches(&self, data: &[u8]) -> Vec<usize> {
        let pattern_len = self.tokens.len();
        if data.len() < pattern_len {
            return Vec::new();
        }
        let mut matches = Vec::new();
        'outer: for i in 0..=data.len() - pattern_len {
            for (j, token) in self.tokens.iter().enumerate() {
                let byte = data[i + j];
                match token {
                    EacPatternToken::Wildcard => {},
                    EacPatternToken::Exact(expected) => {
                        if j == self.patch_offset {
                            if byte != *expected && byte != 0xEB {
                                continue 'outer;
                            }
                        } else if byte != *expected {
                            continue 'outer;
                        }
                    },
                }
            }
            matches.push(i);
        }
        matches
    }
}

/// Returns the three standard EAC check-site patterns.
pub fn standard_eac_patterns() -> Result<Vec<EacCompiledPattern>> {
    Ok(vec![
        EacCompiledPattern::parse("EAC_CHECK_1", EAC_PATTERN_1, EAC_PATCH_OFFSET_1)?,
        EacCompiledPattern::parse("EAC_CHECK_2", EAC_PATTERN_2, EAC_PATCH_OFFSET_2)?,
        EacCompiledPattern::parse("EAC_CHECK_3", EAC_PATTERN_3, EAC_PATCH_OFFSET_3)?,
    ])
}

/// Identified EAC check site in a binary buffer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EacCheckSite {
    pub pattern_name: String,
    pub match_offset: usize,
    pub patch_offset: usize,
    pub current_byte: u8,
    pub is_patched: bool,
}

/// Summary report of an EAC binary scan.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EacScanReport {
    pub total_sites_found: usize,
    pub unpatched_count: usize,
    pub patched_count: usize,
    pub sites: Vec<EacCheckSite>,
}

/// Scans a byte slice for EAC check sites without modifying it.
pub fn scan_eac_sites(data: &[u8]) -> Result<EacScanReport> {
    let patterns = standard_eac_patterns()?;
    let mut sites = Vec::new();
    let mut unpatched = 0;
    let mut patched = 0;

    for pat in &patterns {
        for m in pat.find_matches(data) {
            let p_off = m + pat.patch_offset;
            let cur = data[p_off];
            let is_p = cur == 0xEB;
            if is_p {
                patched += 1;
            } else if cur == 0x74 {
                unpatched += 1;
            }
            sites.push(EacCheckSite {
                pattern_name: pat.name.to_owned(),
                match_offset: m,
                patch_offset: p_off,
                current_byte: cur,
                is_patched: is_p,
            });
        }
    }

    Ok(EacScanReport {
        total_sites_found: sites.len(),
        unpatched_count: unpatched,
        patched_count: patched,
        sites,
    })
}

/// Decrypts an EAC module payload using the chain cipher from `EAC-Extractor-Utility/CryptoUtils.cpp`
/// (`CryptoUtils::DecryptPayload`).
///
/// Exact byte recurrence (modulo 256):
/// - `buf[n - 1] = buf[n - 1] + (3 - 3 * n)`
/// - for `i` from `n - 2` down to `1`: `buf[i] = buf[i] + (-3 * i - buf[i + 1])`
/// - `buf[0] = buf[0] - buf[1]`
#[must_use]
pub fn decrypt_eac_payload(encrypted: &[u8]) -> Vec<u8> {
    let mut out = encrypted.to_vec();
    let n = out.len();
    if n >= 2 {
        let last_delta = 3usize.wrapping_sub(3usize.wrapping_mul(n)) as u8;
        out[n - 1] = out[n - 1].wrapping_add(last_delta);

        for i in (1..=n - 2).rev() {
            let term = 0usize
                .wrapping_sub(3usize.wrapping_mul(i))
                .wrapping_sub(usize::from(out[i + 1])) as u8;
            out[i] = out[i].wrapping_add(term);
        }

        out[0] = out[0].wrapping_sub(out[1]);
    }
    out
}

/// Encrypts a raw EAC module buffer with the exact inverse chain cipher (`CryptoUtils::PackModule`
/// step 2). `decrypt_eac_payload(&encrypt_eac_payload(buf)) == buf` for every input.
#[must_use]
pub fn encrypt_eac_payload(plain: &[u8]) -> Vec<u8> {
    let mut out = plain.to_vec();
    let n = out.len();
    if n >= 2 {
        out[0] = out[0].wrapping_add(out[1]);

        for i in 1..n - 1 {
            let term = 0usize
                .wrapping_sub(3usize.wrapping_mul(i))
                .wrapping_sub(usize::from(out[i + 1])) as u8;
            out[i] = out[i].wrapping_sub(term);
        }

        let last_delta = 3usize.wrapping_sub(3usize.wrapping_mul(n)) as u8;
        out[n - 1] = out[n - 1].wrapping_sub(last_delta);
    }
    out
}

/// Checks whether an EAC payload buffer already carries the unencrypted Kraken `MZ` marker
/// (`0x5A4D` at byte offset 12, matching `CryptoUtils::UnpackModule`).
#[must_use]
pub fn is_eac_payload_encrypted(payload: &[u8]) -> bool {
    payload.get(12..14).map(|b| u16::from_le_bytes([b[0], b[1]]) != 0x5A4D).unwrap_or(true)
}

/// Entry in an EAC module configuration catalog (`games.json`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EacGameModuleConfig {
    pub name: String,
    pub product_id: String,
    pub deployment_id: String,
}

impl EacGameModuleConfig {
    /// Builds the CDN module download URL for `platform` (e.g. `"win64"` or `"linux64"`).
    #[must_use]
    pub fn module_url(&self, base_url: &str, platform: &str) -> String {
        let base = base_url.trim_end_matches('/');
        format!("{base}/{}/{}/{platform}", self.product_id, self.deployment_id)
    }
}

/// Parses `GameBootstrapper.ini` key-value lines (ignoring `#` / `;` comments and blank lines).
#[must_use]
pub fn parse_bootstrapper_ini(content: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    for raw_line in content.lines() {
        let line = raw_line.trim_end_matches('\r').trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if let Some((k, v)) = line.split_once('=') {
            map.insert(k.trim().to_owned(), v.trim().to_owned());
        }
    }
    map
}

/// Read-only inspection summary of EAC files inside a game installation directory (such as DBXV2).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EacInstallInspection {
    pub has_eac_dir: bool,
    pub has_start_protected_game: bool,
    pub has_eac_launcher: bool,
    pub has_bootstrapper_ini: bool,
    pub application_path: Option<String>,
    pub product_id: Option<String>,
    pub deployment_id: Option<String>,
}

/// Inspects a game directory (e.g. Dragon Ball Xenoverse 2) for `EasyAntiCheat/`,
/// `start_protected_game.exe`, `EACLauncher.exe`, `GameBootstrapper.ini`, and `Settings.json`.
#[must_use]
pub fn inspect_eac_install(game_dir: &Path) -> EacInstallInspection {
    let eac_dir = game_dir.join("EasyAntiCheat");
    let has_eac_dir = eac_dir.is_dir();
    let has_start_protected_game = game_dir.join("start_protected_game.exe").is_file();
    let has_eac_launcher = game_dir.join("EACLauncher.exe").is_file();

    let ini_path = game_dir.join("GameBootstrapper.ini");
    let has_bootstrapper_ini = ini_path.is_file();
    let application_path = std::fs::read_to_string(&ini_path)
        .ok()
        .and_then(|txt| parse_bootstrapper_ini(&txt).remove("ApplicationPath"));

    let settings_json = eac_dir
        .join("Settings.json")
        .is_file()
        .then(|| eac_dir.join("Settings.json"))
        .or_else(|| {
            let alt = eac_dir.join("settings.json");
            alt.is_file().then_some(alt)
        });

    let mut product_id = None;
    let mut deployment_id = None;
    if let Some(settings_path) = settings_json
        && let Ok(raw) = std::fs::read_to_string(settings_path)
        && let Ok(val) = serde_json::from_str::<serde_json::Value>(&raw)
    {
        product_id = val.get("productid").and_then(|v| v.as_str()).map(str::to_owned);
        deployment_id = val.get("deploymentid").and_then(|v| v.as_str()).map(str::to_owned);
    }

    EacInstallInspection {
        has_eac_dir,
        has_start_protected_game,
        has_eac_launcher,
        has_bootstrapper_ini,
        application_path,
        product_id,
        deployment_id,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scans_eac_check_sites_without_mutation() {
        let buffer = vec![
            0x90, 0x90, // NOPs
            0x85, 0x11, 0x22, 0x33, // 85 * * *
            0x80, 0x3D, 0xAA, 0xBB, 0xCC, 0xDD, 0x00, // 80 3D * * * * 00
            0x74, 0x18, // 74 *
            0xB2, 0x01, // B2 01
            0xE8, 0x55, 0x66, 0x77, 0x88, // E8 * * * *
            0x99, 0x8B, 0xAA, 0xFF, // * 8B * FF
            0xCC, 0xCC,
        ];

        let report = scan_eac_sites(&buffer).unwrap();
        assert_eq!(report.total_sites_found, 1);
        assert_eq!(report.unpatched_count, 1);
        assert_eq!(report.patched_count, 0);
        assert_eq!(report.sites[0].patch_offset, 2 + 11);
        assert_eq!(report.sites[0].current_byte, 0x74);
    }

    #[test]
    fn eac_chain_cipher_roundtrips_arbitrary_payloads() {
        let plain: Vec<u8> = (0u8..=255).cycle().take(1024).collect();
        let encrypted = encrypt_eac_payload(&plain);
        assert_ne!(encrypted, plain);
        let decrypted = decrypt_eac_payload(&encrypted);
        assert_eq!(decrypted, plain);

        // Edge cases: empty and 1-byte buffers
        assert_eq!(decrypt_eac_payload(&[]), Vec::<u8>::new());
        assert_eq!(decrypt_eac_payload(&[0x42]), vec![0x42]);
    }

    #[test]
    fn parses_bootstrapper_ini_and_module_urls() {
        let ini = "# comment\r\nApplicationPath=bin/DBXV2.exe\r\nWorkingDirectory=.\r\nWaitForExit=0\r\n";
        let parsed = parse_bootstrapper_ini(ini);
        assert_eq!(parsed.get("ApplicationPath").map(String::as_str), Some("bin/DBXV2.exe"));
        assert_eq!(parsed.get("WaitForExit").map(String::as_str), Some("0"));

        let cfg = EacGameModuleConfig {
            name: "Dragon Ball Xenoverse 2".into(),
            product_id: "prod123".into(),
            deployment_id: "dep456".into(),
        };
        assert_eq!(
            cfg.module_url(EAC_MODULES_CDN_BASE_URL, "win64"),
            "https://modules-cdn.eac-prod.on.epicgames.com/modules/prod123/dep456/win64"
        );
    }
}
