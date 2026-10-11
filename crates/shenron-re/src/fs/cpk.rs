// SPDX-License-Identifier: Apache-2.0
//! CRIWARE CPK Archive Parser & Virtual File System.

use std::collections::HashMap;
use crate::error::{ReError, Result};
use crate::fs::crilayla::decompress_crilayla;

pub const CPK_MAGIC: &[u8; 4] = b"CPK ";
pub const UTF_MAGIC: &[u8; 4] = b"@UTF";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct CpkEntry {
    pub id: u32,
    pub name: String,
    pub dir_name: Option<String>,
    pub file_size: u64,
    pub extract_size: u64,
    pub file_offset: u64,
    pub is_compressed: bool,
}

#[derive(Debug, Clone)]
pub struct CpkArchive {
    pub entries: Vec<CpkEntry>,
    file_map: HashMap<String, usize>,
}

impl CpkArchive {
    /// Parses a CPK archive from an in-memory buffer.
    pub fn parse(buffer: &[u8]) -> Result<Self> {
        if buffer.len() < 16 {
            return Err(ReError::BufferTooSmall {
                required: 16,
                available: buffer.len(),
            });
        }

        if &buffer[0..4] != CPK_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: CPK_MAGIC.to_vec(),
                found: buffer[0..4].to_vec(),
            });
        }

        // Basic scan for file tables (@UTF)
        let mut entries = Vec::new();
        let mut file_map = HashMap::new();

        // If CPK header has @UTF table embedded
        if buffer.len() > 16 && &buffer[16..20] == UTF_MAGIC {
            // Simplified table inspection
            let entry = CpkEntry {
                id: 0,
                name: "root_table".into(),
                dir_name: None,
                file_size: buffer.len() as u64,
                extract_size: buffer.len() as u64,
                file_offset: 16,
                is_compressed: false,
            };
            file_map.insert(entry.name.clone(), 0);
            entries.push(entry);
        }

        Ok(Self { entries, file_map })
    }

    /// Extract a file by its internal path/name.
    pub fn extract<'a>(&self, buffer: &'a [u8], file_name: &str) -> Result<Vec<u8>> {
        let &idx = self.file_map.get(file_name).ok_or_else(|| {
            ReError::ParseError {
                context: "cpk_extract",
                details: format!("File `{file_name}` not found in archive"),
            }
        })?;

        let entry = &self.entries[idx];
        let start = entry.file_offset as usize;
        let end = start + (entry.file_size as usize);

        if end > buffer.len() {
            return Err(ReError::BufferTooSmall {
                required: end,
                available: buffer.len(),
            });
        }

        let slice = &buffer[start..end];
        if entry.is_compressed || (slice.len() >= 8 && &slice[0..8] == b"CRILAYLA") {
            decompress_crilayla(slice)
        } else {
            Ok(slice.to_vec())
        }
    }
}
