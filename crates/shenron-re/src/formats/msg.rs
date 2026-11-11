// SPDX-License-Identifier: Apache-2.0
//! MSG (Message) binary format parser.
//!
//! Stores official strings, names, character dialogue lines, quest text, and skill descriptions.
//! Uses the 0x20-byte header and absolute string/table offsets of the canonical
//! Shenron RE MSG reader (`crates/shenron-re/src/formats/msg.rs`). The flags at
//! 0x04/0x06 select Unicode names/values; they are not an endian marker/version.
//! Unknown encodings, malformed strings and out-of-range tables are rejected.

use crate::error::{ReError, Result};
use serde::{Deserialize, Serialize};

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

fn corrupt(details: impl Into<String>) -> ReError {
    ReError::ParseError { context: "msg", details: details.into() }
}

fn range(buffer: &[u8], offset: usize, count: usize, stride: usize) -> Result<&[u8]> {
    let length = count.checked_mul(stride).ok_or_else(|| corrupt("table size overflow"))?;
    let end = offset.checked_add(length).ok_or_else(|| corrupt("table offset overflow"))?;
    buffer.get(offset..end).ok_or_else(|| corrupt("table or string is outside the file"))
}

fn u32_at(buffer: &[u8], offset: usize) -> Result<u32> {
    let bytes = range(buffer, offset, 1, 4)?;
    Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}

fn string_at(buffer: &[u8], slot: usize, unicode: bool) -> Result<String> {
    range(buffer, slot, 1, 16)?;
    let offset = u32_at(buffer, slot)? as usize;
    let chars = u32_at(buffer, slot + 4)? as usize;
    let bytes = u32_at(buffer, slot + 8)? as usize;
    let width = if unicode { 2 } else { 1 };
    let expected = chars.checked_add(1).and_then(|n| n.checked_mul(width));
    if expected != Some(bytes) {
        return Err(corrupt("string byte length disagrees with its encoding and character count"));
    }
    let raw = range(buffer, offset, bytes, 1)?;
    if raw[bytes - width..].iter().any(|b| *b != 0) {
        return Err(corrupt("string terminator is missing"));
    }
    if unicode {
        let units = raw[..bytes - 2]
            .as_chunks::<2>()
            .0
            .iter()
            .map(|pair| u16::from_le_bytes(*pair))
            .collect::<Vec<_>>();
        String::from_utf16(&units).map_err(|_| corrupt("invalid UTF-16 string"))
    } else {
        String::from_utf8(raw[..bytes - 1].to_vec()).map_err(|_| corrupt("invalid UTF-8 string"))
    }
}

impl MsgFile {
    pub fn parse(buffer: &[u8]) -> Result<Self> {
        if buffer.len() < 32 {
            return Err(ReError::BufferTooSmall { required: 32, available: buffer.len() });
        }

        if &buffer[0..4] != MSG_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: MSG_MAGIC.to_vec(),
                found: buffer[0..4].to_vec(),
            });
        }

        let unicode_names = match u16::from_le_bytes([buffer[4], buffer[5]]) {
            0 => false,
            0x100 => true,
            _ => return Err(corrupt("unknown name encoding")),
        };
        let unicode_values = match u16::from_le_bytes([buffer[6], buffer[7]]) {
            0 => false,
            1 => true,
            _ => return Err(corrupt("unknown value encoding")),
        };
        let entry_count = u32_at(buffer, 8)? as usize;
        let keys = u32_at(buffer, 12)? as usize;
        let ids = u32_at(buffer, 16)? as usize;
        let lists = u32_at(buffer, 20)? as usize;
        let line_count = u32_at(buffer, 24)? as usize;
        let line_table = u32_at(buffer, 28)? as usize;
        range(buffer, keys, entry_count, 16)?;
        range(buffer, ids, entry_count, 4)?;
        range(buffer, lists, entry_count, 8)?;
        range(buffer, line_table, line_count, 16)?;
        let mut entries = Vec::with_capacity(entry_count);
        let mut consumed_lines = 0usize;
        for i in 0..entry_count {
            let count = u32_at(buffer, lists + i * 8)? as usize;
            let start = u32_at(buffer, lists + i * 8 + 4)? as usize;
            consumed_lines =
                consumed_lines.checked_add(count).ok_or_else(|| corrupt("line count overflow"))?;
            if consumed_lines > line_count {
                return Err(corrupt("entry line counts exceed the header count"));
            }
            let relative = start
                .checked_sub(line_table)
                .ok_or_else(|| corrupt("line reference precedes its table"))?;
            if !relative.is_multiple_of(16)
                || relative / 16 > line_count
                || count > line_count - relative / 16
            {
                return Err(corrupt("line reference is outside its table"));
            }
            let lines = (0..count)
                .map(|j| string_at(buffer, start + j * 16, unicode_values))
                .collect::<Result<Vec<_>>>()?;
            entries.push(MsgEntry {
                id: u32_at(buffer, ids + i * 4)?,
                name_id: string_at(buffer, keys + i * 16, unicode_names)?,
                lines,
            });
        }
        if consumed_lines != line_count {
            return Err(corrupt("entry line counts disagree with the header count"));
        }

        Ok(Self { entries })
    }

    /// Constructs a synthetic table-layout MSG with UTF-16 names and values.
    pub fn create_mock(lines: &[&str]) -> Vec<u8> {
        let count = lines.len();
        let keys = 32;
        let ids = keys + count * 16;
        let lists = ids + count * 4;
        let slots = lists + count * 8;
        let mut buffer = vec![0; slots + count * 16];
        buffer[..4].copy_from_slice(MSG_MAGIC);
        buffer[4..8].copy_from_slice(&[0, 1, 1, 0]);
        for (index, value) in [count, keys, ids, lists, count, slots].into_iter().enumerate() {
            buffer[8 + index * 4..12 + index * 4].copy_from_slice(&(value as u32).to_le_bytes());
        }
        for (i, line) in lines.iter().enumerate() {
            buffer[ids + i * 4..ids + i * 4 + 4].copy_from_slice(&(i as u32).to_le_bytes());
            buffer[lists + i * 8..lists + i * 8 + 4].copy_from_slice(&1u32.to_le_bytes());
            buffer[lists + i * 8 + 4..lists + i * 8 + 8]
                .copy_from_slice(&((slots + i * 16) as u32).to_le_bytes());
            for (slot, text) in
                [(keys + i * 16, format!("MSG_{i}")), (slots + i * 16, (*line).into())]
            {
                let units = text.encode_utf16().collect::<Vec<_>>();
                for (field, value) in
                    [buffer.len(), units.len(), (units.len() + 1) * 2].into_iter().enumerate()
                {
                    buffer[slot + field * 4..slot + field * 4 + 4]
                        .copy_from_slice(&(value as u32).to_le_bytes());
                }
                buffer
                    .extend(units.into_iter().chain(std::iter::once(0)).flat_map(u16::to_le_bytes));
            }
        }
        buffer
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_msg_mock() {
        let mock = MsgFile::create_mock(&["Kamehameha", "Super Saiyan", "Spirit Bomb"]);
        let parsed = MsgFile::parse(&mock).expect("Should parse MSG mock cleanly");

        assert_eq!(parsed.entries.len(), 3);
        assert_eq!(parsed.entries[0].lines[0], "Kamehameha");
        assert_eq!(parsed.entries[1].lines[0], "Super Saiyan");
        assert_eq!(parsed.entries[2].lines[0], "Spirit Bomb");
    }

    #[test]
    fn test_invalid_magic() {
        let mut mock = MsgFile::create_mock(&["test"]);
        mock[0] = b'?';
        assert!(MsgFile::parse(&mock).is_err());
    }

    #[test]
    fn preserves_unicode_empty_lines_whitespace_and_numeric_ids() {
        let mut bytes = MsgFile::create_mock(&["  日本語 🐉\n", ""]);
        let ids = u32_at(&bytes, 16).unwrap() as usize;
        let lists = u32_at(&bytes, 20).unwrap() as usize;
        // Keep both string slots as two lines of one entry with a non-sequential id.
        bytes[8..12].copy_from_slice(&1u32.to_le_bytes());
        bytes[ids..ids + 4].copy_from_slice(&42u32.to_le_bytes());
        bytes[lists..lists + 4].copy_from_slice(&2u32.to_le_bytes());
        let parsed = MsgFile::parse(&bytes).unwrap();
        assert_eq!(parsed.entries.len(), 1);
        assert_eq!(parsed.entries[0].id, 42);
        assert_eq!(parsed.entries[0].name_id, "MSG_0");
        assert_eq!(parsed.entries[0].lines, ["  日本語 🐉\n", ""]);
    }

    #[test]
    fn decodes_ascii_names_and_values() {
        let mut bytes = MsgFile::create_mock(&["test"]);
        bytes[4..8].fill(0);
        let keys = u32_at(&bytes, 12).unwrap() as usize;
        let lines = u32_at(&bytes, 28).unwrap() as usize;
        for (slot, text) in [(keys, "KEY"), (lines, "line")] {
            let offset = bytes.len() as u32;
            bytes[slot..slot + 4].copy_from_slice(&offset.to_le_bytes());
            bytes[slot + 4..slot + 8].copy_from_slice(&(text.len() as u32).to_le_bytes());
            bytes[slot + 8..slot + 12].copy_from_slice(&(text.len() as u32 + 1).to_le_bytes());
            bytes.extend_from_slice(text.as_bytes());
            bytes.push(0);
        }
        let parsed = MsgFile::parse(&bytes).unwrap();
        assert_eq!(parsed.entries[0].name_id, "KEY");
        assert_eq!(parsed.entries[0].lines, ["line"]);
    }

    #[test]
    fn rejects_truncation_malformed_tables_and_encodings_without_panicking() {
        let good = MsgFile::create_mock(&["test"]);
        for len in 0..good.len() {
            assert!(MsgFile::parse(&good[..len]).is_err(), "truncation at {len}");
        }
        for offset in [8, 12, 16, 20, 24, 28, 32, 36, 40] {
            let mut bytes = good.clone();
            bytes[offset..offset + 4].copy_from_slice(&u32::MAX.to_le_bytes());
            assert!(MsgFile::parse(&bytes).is_err(), "invalid field at {offset}");
        }
        let mut bytes = good.clone();
        bytes[4] = 2;
        assert!(MsgFile::parse(&bytes).is_err());
        let mut bytes = good.clone();
        *bytes.last_mut().unwrap() = 1;
        assert!(MsgFile::parse(&bytes).is_err());
        let slots = u32_at(&good, 28).unwrap() as usize;
        let text = u32_at(&good, slots).unwrap() as usize;
        let mut bytes = good;
        bytes[text..text + 2].copy_from_slice(&0xd800u16.to_le_bytes());
        assert!(MsgFile::parse(&bytes).is_err());
    }

    #[test]
    #[ignore = "Requires a private MSG file supplied through SHENRON_TEST_MSG"]
    fn parses_real_message_tables() {
        let path = std::env::var_os("SHENRON_TEST_MSG").expect("SHENRON_TEST_MSG is required");
        let bytes = std::fs::read(path).unwrap();
        let expected_entries = u32_at(&bytes, 8).unwrap() as usize;
        let expected_lines = u32_at(&bytes, 24).unwrap() as usize;
        let parsed = MsgFile::parse(&bytes).expect("real MSG must decode completely");
        assert!(expected_entries > 0);
        assert_eq!(parsed.entries.len(), expected_entries);
        assert_eq!(
            parsed.entries.iter().map(|entry| entry.lines.len()).sum::<usize>(),
            expected_lines
        );
        assert!(parsed.entries.iter().all(|entry| !entry.name_id.is_empty()));
    }
}
