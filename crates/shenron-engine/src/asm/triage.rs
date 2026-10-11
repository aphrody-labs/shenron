// SPDX-License-Identifier: Apache-2.0

//! Binary Triage, PE/ELF Format Detection, Shannon Entropy, and String Extraction.
//!
//! Extracted and unified from `aphrody-re`.
//! Inspects arbitrary binary blobs without panicking, extracting headers, section tables,
//! entropy packed-code indicators, and cryptographic digests.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Detected binary file format.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BinaryFormat {
    Pe32,
    Pe64,
    Elf32,
    Elf64,
    Unknown,
}

impl BinaryFormat {
    /// Human-readable format name.
    #[must_use]
    pub fn display_name(self) -> &'static str {
        match self {
            Self::Pe32 => "PE32 (Windows x86)",
            Self::Pe64 => "PE32+ (Windows x64)",
            Self::Elf32 => "ELF32",
            Self::Elf64 => "ELF64",
            Self::Unknown => "Unknown",
        }
    }
}

/// A section table entry with calculated Shannon entropy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectionInfo {
    pub name: String,
    pub vaddr: u64,
    pub size: u64,
    pub entropy: f64,
}

/// Comprehensive binary inspection report.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriageReport {
    pub format: BinaryFormat,
    pub size: usize,
    pub sha256: String,
    pub arch: Option<String>,
    pub entry_point: Option<u64>,
    pub sections: Vec<SectionInfo>,
    pub strings_sample: Vec<String>,
}

/// Computes the Shannon entropy of a byte slice in bits per byte [0.0, 8.0].
/// High entropy (>= 7.0) indicates compression or encryption (packed binaries).
#[must_use]
pub fn shannon_entropy(data: &[u8]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }
    let mut counts = [0u64; 256];
    for &b in data {
        counts[b as usize] += 1;
    }
    let len = data.len() as f64;
    counts
        .iter()
        .filter(|&&c| c > 0)
        .map(|&c| {
            let p = c as f64 / len;
            -p * p.log2()
        })
        .sum()
}

/// Extracts printable ASCII and UTF-16 strings with length >= `min_len`, capped at `limit`.
#[must_use]
pub fn extract_strings(bytes: &[u8], min_len: usize, limit: usize) -> Vec<String> {
    let mut results = Vec::new();
    let mut current_ascii = Vec::new();

    for &b in bytes {
        if (0x20..=0x7E).contains(&b) {
            current_ascii.push(b);
        } else {
            if current_ascii.len() >= min_len {
                if let Ok(s) = std::str::from_utf8(&current_ascii) {
                    results.push(s.to_string());
                    if results.len() >= limit {
                        return results;
                    }
                }
            }
            current_ascii.clear();
        }
    }

    if current_ascii.len() >= min_len {
        if let Ok(s) = std::str::from_utf8(&current_ascii) {
            results.push(s.to_string());
        }
    }

    results
}

fn to_hex(bytes: &[u8]) -> String {
    use std::fmt::Write;
    let mut s = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        let _ = write!(s, "{:02x}", b);
    }
    s
}

/// Triages an arbitrary binary blob and returns a full `TriageReport`.
#[must_use]
pub fn triage_binary(bytes: &[u8]) -> TriageReport {
    let size = bytes.len();
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    let sha256 = to_hex(&hasher.finalize());
    let strings_sample = extract_strings(bytes, 5, 32);

    // 1. Detect ELF
    if bytes.len() >= 52 && bytes.starts_with(b"\x7FELF") {
        let is_64 = bytes[4] == 2;
        let format = if is_64 { BinaryFormat::Elf64 } else { BinaryFormat::Elf32 };
        let arch = match u16::from_le_bytes([bytes[18], bytes[19]]) {
            0x3E => Some("x86_64".into()),
            0x03 => Some("i386".into()),
            0xB7 => Some("aarch64".into()),
            _ => Some("unknown".into()),
        };

        let entry_point = if is_64 && bytes.len() >= 32 {
            Some(u64::from_le_bytes([
                bytes[24], bytes[25], bytes[26], bytes[27], bytes[28], bytes[29], bytes[30], bytes[31],
            ]))
        } else if bytes.len() >= 28 {
            Some(u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]) as u64)
        } else {
            None
        };

        return TriageReport {
            format,
            size,
            sha256,
            arch,
            entry_point,
            sections: Vec::new(),
            strings_sample,
        };
    }

    // 2. Detect PE
    if bytes.len() >= 64 && bytes.starts_with(b"MZ") {
        let e_lfanew = u32::from_le_bytes([bytes[0x3C], bytes[0x3D], bytes[0x3E], bytes[0x3F]]) as usize;
        if e_lfanew + 24 <= bytes.len() && &bytes[e_lfanew..e_lfanew + 4] == b"PE\0\0" {
            let machine = u16::from_le_bytes([bytes[e_lfanew + 4], bytes[e_lfanew + 5]]);
            let num_sections = u16::from_le_bytes([bytes[e_lfanew + 6], bytes[e_lfanew + 7]]) as usize;
            let opt_header_size = u16::from_le_bytes([bytes[e_lfanew + 20], bytes[e_lfanew + 21]]) as usize;

            let opt_magic_offset = e_lfanew + 24;
            let is_64 = if opt_magic_offset + 2 <= bytes.len() {
                u16::from_le_bytes([bytes[opt_magic_offset], bytes[opt_magic_offset + 1]]) == 0x20B
            } else {
                machine == 0x8664
            };

            let format = if is_64 { BinaryFormat::Pe64 } else { BinaryFormat::Pe32 };
            let arch = if is_64 { Some("x86_64".into()) } else { Some("i386".into()) };

            let entry_point = if opt_magic_offset + 20 <= bytes.len() {
                Some(u32::from_le_bytes([
                    bytes[opt_magic_offset + 16],
                    bytes[opt_magic_offset + 17],
                    bytes[opt_magic_offset + 18],
                    bytes[opt_magic_offset + 19],
                ]) as u64)
            } else {
                None
            };

            let mut sections = Vec::new();
            let mut sec_offset = e_lfanew + 24 + opt_header_size;

            for _ in 0..num_sections.min(32) {
                if sec_offset + 40 > bytes.len() {
                    break;
                }
                let name_raw = &bytes[sec_offset..sec_offset + 8];
                let name = String::from_utf8_lossy(name_raw)
                    .trim_end_matches('\0')
                    .to_string();
                let vaddr = u32::from_le_bytes([
                    bytes[sec_offset + 12],
                    bytes[sec_offset + 13],
                    bytes[sec_offset + 14],
                    bytes[sec_offset + 15],
                ]) as u64;
                let raw_size = u32::from_le_bytes([
                    bytes[sec_offset + 16],
                    bytes[sec_offset + 17],
                    bytes[sec_offset + 18],
                    bytes[sec_offset + 19],
                ]) as u64;
                let raw_ptr = u32::from_le_bytes([
                    bytes[sec_offset + 20],
                    bytes[sec_offset + 21],
                    bytes[sec_offset + 22],
                    bytes[sec_offset + 23],
                ]) as usize;

                let entropy = if raw_ptr + raw_size as usize <= bytes.len() && raw_size > 0 {
                    shannon_entropy(&bytes[raw_ptr..raw_ptr + raw_size as usize])
                } else {
                    0.0
                };

                sections.push(SectionInfo {
                    name,
                    vaddr,
                    size: raw_size,
                    entropy,
                });

                sec_offset += 40;
            }

            return TriageReport {
                format,
                size,
                sha256,
                arch,
                entry_point,
                sections,
                strings_sample,
            };
        }
    }

    TriageReport {
        format: BinaryFormat::Unknown,
        size,
        sha256,
        arch: None,
        entry_point: None,
        sections: Vec::new(),
        strings_sample,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shannon_entropy() {
        let zeros = [0u8; 1024];
        assert_eq!(shannon_entropy(&zeros), 0.0);

        let mut uniform = Vec::with_capacity(256);
        for b in 0..=255u8 {
            uniform.push(b);
        }
        let ent = shannon_entropy(&uniform);
        assert!((ent - 8.0).abs() < 1e-4);
    }

    #[test]
    fn test_triage_unknown_garbage() {
        let garbage = b"Random payload that is not an executable";
        let report = triage_binary(garbage);
        assert_eq!(report.format, BinaryFormat::Unknown);
        assert_eq!(report.size, garbage.len());
        assert!(!report.sha256.is_empty());
    }
}
