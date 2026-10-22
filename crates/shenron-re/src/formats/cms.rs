// SPDX-License-Identifier: Apache-2.0
//! CMS (Character Model Spec) roster parser.
//!
//! `data/system/char_model_spec.cms` is the game's single character roster: one entry per
//! playable/NPC character code (`GOK` Goku, `VGT` Vegeta, `FRI` Frieza, …), each identified
//! by a persistent id (not necessarily its position — the id space has gaps from removed
//! characters).
//!
//! Layout (little-endian): `#CMS`, `u16 0xFFFE`, `u16`, `u32 entry_count`, `u32 entry_table`.
//! Each entry is 84 bytes: `u32 id`, then a short ASCII code in a reserved name slot starting
//! at offset 4 (observed up to 4 significant characters, NUL-terminated). The remaining bytes
//! of the entry are not yet decoded and are kept as raw data rather than invented fields.
//! Validated against the real 184-entry roster file.

use crate::error::{ReError, Result};
use crate::formats::esk::{c_string_at, u32_at};
use serde::{Deserialize, Serialize};

pub const CMS_MAGIC: &[u8; 4] = b"#CMS";

/// Bytes per roster entry, and the offset of its name slot.
const ENTRY_SIZE: usize = 84;
const NAME_OFFSET: usize = 4;
/// Reserved width of the name slot; real codes observed are 2-4 characters.
const NAME_SLOT: usize = 12;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CmsEntry {
    /// Persistent character id; not necessarily the entry's position in the file.
    pub id: u32,
    /// Short character code (e.g. `GOK`, `VGT`, `FRI`).
    pub short_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CmsFile {
    pub entries: Vec<CmsEntry>,
}

impl CmsFile {
    pub fn parse(buffer: &[u8]) -> Result<Self> {
        if buffer.len() < 16 {
            return Err(ReError::BufferTooSmall { required: 16, available: buffer.len() });
        }
        if &buffer[0..4] != CMS_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: CMS_MAGIC.to_vec(),
                found: buffer[0..4].to_vec(),
            });
        }
        let count = u32_at(buffer, 8)? as usize;
        let table = u32_at(buffer, 12)? as usize;
        if count > 100_000 {
            return Err(ReError::ParseError {
                context: "cms",
                details: format!("{count} entries"),
            });
        }
        let mut entries = Vec::with_capacity(count);
        for i in 0..count {
            let at = table + i * ENTRY_SIZE;
            if at + ENTRY_SIZE > buffer.len() {
                return Err(ReError::BufferTooSmall {
                    required: at + ENTRY_SIZE,
                    available: buffer.len(),
                });
            }
            let name = c_string_at(buffer, at + NAME_OFFSET)?;
            let name = name.chars().take(NAME_SLOT - 1).collect();
            entries.push(CmsEntry { id: u32_at(buffer, at)?, short_name: name });
        }
        Ok(Self { entries })
    }

    pub fn find(&self, short_name: &str) -> Option<&CmsEntry> {
        self.entries.iter().find(|e| e.short_name == short_name)
    }
}

/// Writes a `.cms` roster of `(id, short_name)` pairs, for tests and tools.
pub fn encode_cms(entries: &[(u32, &str)]) -> Vec<u8> {
    let mut out = vec![0u8; 16];
    out[0..4].copy_from_slice(CMS_MAGIC);
    out[4..6].copy_from_slice(&0xFFFEu16.to_le_bytes());
    out[8..12].copy_from_slice(&(entries.len() as u32).to_le_bytes());
    out[12..16].copy_from_slice(&16u32.to_le_bytes());
    for (id, name) in entries {
        let mut entry = vec![0u8; ENTRY_SIZE];
        entry[0..4].copy_from_slice(&id.to_le_bytes());
        entry[NAME_OFFSET..NAME_OFFSET + name.len()].copy_from_slice(name.as_bytes());
        out.extend(entry);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_a_sparse_roster() {
        let cms = CmsFile::parse(&encode_cms(&[(0, "GOK"), (16, "VGT"), (999, "FRI")])).unwrap();
        assert_eq!(cms.entries.len(), 3);
        assert_eq!(cms.find("VGT").unwrap().id, 16);
        assert_eq!(cms.find("FRI").unwrap().id, 999);
        assert!(cms.find("XXX").is_none());
    }

    #[test]
    fn test_invalid_magic() {
        let mut bytes = encode_cms(&[(0, "GOK")]);
        bytes[0] = b'X';
        assert!(CmsFile::parse(&bytes).is_err());
    }

    #[test]
    fn rejects_truncated_table() {
        let mut bytes = encode_cms(&[(0, "GOK"), (1, "VGT")]);
        bytes.truncate(bytes.len() - 10);
        assert!(CmsFile::parse(&bytes).is_err());
    }

    /// `SHENRON_REAL_CMS=<path to char_model_spec.cms>` checks the real roster: 184 entries,
    /// Goku present at id 0, and every code non-empty uppercase ASCII.
    #[test]
    fn parses_real_roster_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_CMS") else { return };
        let cms = CmsFile::parse(&std::fs::read(path).unwrap()).expect("parse real CMS");
        assert_eq!(cms.entries.len(), 184);
        assert_eq!(cms.find("GOK").unwrap().id, 0);
        assert!(cms.find("VGT").is_some());
        for entry in &cms.entries {
            assert!(!entry.short_name.is_empty(), "entry {} has an empty code", entry.id);
            assert!(
                entry.short_name.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()),
                "{:?} is not an uppercase code",
                entry.short_name
            );
        }
    }
}
