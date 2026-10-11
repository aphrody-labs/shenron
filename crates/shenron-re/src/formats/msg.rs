// SPDX-License-Identifier: Apache-2.0
//! MSG (Message) binary format parser.
//!
//! Stores official strings, names, character dialogue lines, quest text, and skill descriptions.

use serde::{Deserialize, Serialize};
use crate::error::{ReError, Result};

pub const MSG_MAGIC: &[u8; 4] = b"#MSG";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MsgEntry {
    pub id: u32,
    pub name_id: String,
    pub lines: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MsgFile {
    pub entries: Vec<MsgEntry>,
}

impl MsgFile {
    pub fn parse(buffer: &[u8]) -> Result<Self> {
        if buffer.len() < 16 {
            return Err(ReError::BufferTooSmall {
                required: 16,
                available: buffer.len(),
            });
        }

        if &buffer[0..4] != MSG_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: MSG_MAGIC.to_vec(),
                found: buffer[0..4].to_vec(),
            });
        }

        let entry_count = u32::from_le_bytes(buffer[8..12].try_into().unwrap()) as usize;
        let mut entries = Vec::with_capacity(entry_count);

        // Simple string extractor fallback for robust indexing
        let mut offset = 16;
        for i in 0..entry_count {
            if offset >= buffer.len() {
                break;
            }
            // Read until null terminator (UTF-8 or ASCII)
            let mut end = offset;
            while end < buffer.len() && buffer[end] != 0 {
                end += 1;
            }

            let text = String::from_utf8_lossy(&buffer[offset..end]).trim().to_string();
            if !text.is_empty() {
                entries.push(MsgEntry {
                    id: i as u32,
                    name_id: format!("MSG_{i}"),
                    lines: vec![text],
                });
            }
            offset = end + 1;
        }

        Ok(Self { entries })
    }
}
