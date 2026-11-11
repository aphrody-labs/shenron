// SPDX-License-Identifier: Apache-2.0
//! Streaming CRIWARE CPK reader, position-aware CRI XOR decryption, and multi-threaded
//! positioned extraction for Dragon Ball Xenoverse 2 (DBXV2) archives.
//!
//! Unlike [`crate::fs::cpk::CpkArchive`], which parses in-memory buffers, [`CpkStreamReader`]
//! never loads multi-gigabyte archives (`data.cpk` ~9 GiB) into memory: it reads only the
//! `@UTF` header and TOC ranges on open, descrambling `@UTF` tables (`0x5F` / `0x15` progressive
//! XOR) and position-based CRI XOR blocks (CRC32 filename key derivation) on the fly, and
//! extracts entries via bounded positioned reads (`Seek + Read` or HTTP/S3 byte ranges).

use crate::error::{ReError, Result};
use crate::fs::cpk::{CPK_MAGIC, CpkEntry, UTF_MAGIC};
use crate::fs::crilayla::decompress_crilayla;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
#[cfg(not(target_arch = "wasm32"))]
use std::fs::{self, File, OpenOptions};
#[cfg(not(target_arch = "wasm32"))]
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
#[cfg(not(target_arch = "wasm32"))]
use std::sync::{
    Mutex,
    atomic::{AtomicUsize, Ordering},
};

const UTF_BASE: usize = 0x08;
const UTF_MIN_TOTAL: usize = 0x20;
const FLAG_HAS_NAME: u8 = 0x10;
const FLAG_HAS_DEFAULT: u8 = 0x20;
const FLAG_ROW_STORAGE: u8 = 0x40;
const CRC32_POLY: u32 = 0xEDB8_8320;
const MAX_METADATA_BYTES: usize = 64 * 1024 * 1024;

/// Fixed Viola CRI key (`0x1717E18E`) for packed `cfg.bin` tables; exposed for explicit callers
/// of [`decrypt_cri_block`]. File-level CPK encryption uses [`cri_key_from_filename`].
pub const CRI_VIOLA_FIXED_KEY: u32 = 0x1717_E18E;

const fn build_crc32_table() -> [u32; 256] {
    let mut table = [0u32; 256];
    let mut i = 0u32;
    while i < 256 {
        let mut crc = i;
        let mut j = 0;
        while j < 8 {
            crc = if crc & 1 == 1 { (crc >> 1) ^ CRC32_POLY } else { crc >> 1 };
            j += 1;
        }
        table[i as usize] = crc;
        i += 1;
    }
    table
}

const CRC32_TABLE: [u32; 256] = build_crc32_table();

/// Derives a CRI CPK position-XOR decryption key from the archive basename via standard CRC32.
#[must_use]
pub fn cri_key_from_filename(name: &str) -> u32 {
    let mut crc = 0xFFFF_FFFFu32;
    for b in name.bytes() {
        let idx = ((crc ^ u32::from(b)) & 0xFF) as usize;
        crc = (crc >> 8) ^ CRC32_TABLE[idx];
    }
    !crc
}

fn update_crc_state(seed: u32, key_bytes: [u8; 4]) -> u32 {
    let mut crc = !seed;
    let mut i = 0;
    while i < 4 {
        let idx = ((crc & 0xFF) as u8 ^ key_bytes[i]) as usize;
        crc = (crc >> 8) ^ CRC32_TABLE[idx];
        i += 1;
    }
    !crc
}

fn compute_xor_byte(crc: u32, position: u32) -> u8 {
    let base_shift = position * 2;
    let mut r8 = (crc >> (base_shift + 8)) & 3;
    r8 |= (((crc >> base_shift) & 0xFF) << 2) & 0xFF;
    r8 = ((r8 << 2) & 0xFF) | ((crc >> (base_shift + 16)) & 3);
    r8 = ((r8 << 2) & 0xFF) | ((crc >> (base_shift + 24)) & 3);
    r8 as u8
}

/// Position-aware involutive CRI XOR block cipher (`file_offset` is the absolute byte offset in
/// the CPK archive, allowing random-access range decryption).
pub fn decrypt_cri_block(buffer: &mut [u8], file_offset: u64, key: u32) {
    if buffer.is_empty() {
        return;
    }
    let key_bytes = key.to_le_bytes();
    let length = buffer.len();
    let mut i = 0usize;

    let align_offset = file_offset & 3;
    if align_offset != 0 {
        let current_crc = update_crc_state((file_offset & !3u64) as u32, key_bytes);
        let align_count = ((4 - align_offset) as usize).min(length);
        for _ in 0..align_count {
            let pos = ((file_offset + i as u64) & 3) as u32;
            buffer[i] ^= compute_xor_byte(current_crc, pos);
            i += 1;
        }
    }

    let mut base_offset = file_offset + i as u64;
    while i + 4 <= length {
        let crc = update_crc_state(base_offset as u32, key_bytes);
        buffer[i] ^= compute_xor_byte(crc, 0);
        buffer[i + 1] ^= compute_xor_byte(crc, 1);
        buffer[i + 2] ^= compute_xor_byte(crc, 2);
        buffer[i + 3] ^= compute_xor_byte(crc, 3);
        i += 4;
        base_offset += 4;
    }

    if i < length {
        let crc = update_crc_state(base_offset as u32, key_bytes);
        let mut pos = 0u32;
        while i < length {
            buffer[i] ^= compute_xor_byte(crc, pos);
            i += 1;
            pos += 1;
        }
    }
}

/// Descrambles an obfuscated `@UTF` table in place (`0x5F` seed multiplied by `0x15` mod 256).
pub fn decrypt_utf_table(data: &mut [u8]) {
    let mut xor_val: u8 = 0x5F;
    for byte in data.iter_mut() {
        *byte ^= xor_val;
        xor_val = xor_val.wrapping_mul(0x15);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum UtfColType {
    U8,
    I8,
    U16,
    I16,
    U32,
    I32,
    U64,
    I64,
    F32,
    F64,
    String,
    Bytes,
    Guid,
}

impl UtfColType {
    fn from_nibble(nibble: u8) -> Result<Self> {
        Ok(match nibble {
            0 => Self::U8,
            1 => Self::I8,
            2 => Self::U16,
            3 => Self::I16,
            4 => Self::U32,
            5 => Self::I32,
            6 => Self::U64,
            7 => Self::I64,
            8 => Self::F32,
            9 => Self::F64,
            10 => Self::String,
            11 => Self::Bytes,
            12 => Self::Guid,
            other => {
                return Err(ReError::ParseError {
                    context: "cpk_utf",
                    details: format!("unknown @UTF column type {other}"),
                });
            },
        })
    }

    const fn wire_size(self) -> usize {
        match self {
            Self::U8 | Self::I8 => 1,
            Self::U16 | Self::I16 => 2,
            Self::U32 | Self::I32 | Self::F32 | Self::String => 4,
            Self::U64 | Self::I64 | Self::F64 | Self::Bytes => 8,
            Self::Guid => 16,
        }
    }
}

#[derive(Debug, Clone)]
enum UtfCell {
    Int(i64),
    Str(String),
    Other,
}

impl UtfCell {
    fn as_i64(&self) -> Option<i64> {
        match self {
            Self::Int(v) => Some(*v),
            Self::Str(s) => s.parse::<i64>().ok(),
            Self::Other => None,
        }
    }

    fn as_str(&self) -> Option<&str> {
        match self {
            Self::Str(s) => Some(s.as_str()),
            _ => None,
        }
    }
}

struct StreamUtfTable {
    columns: Vec<String>,
    rows: Vec<Vec<UtfCell>>,
}

impl StreamUtfTable {
    fn col_idx(&self, name: &str) -> Option<usize> {
        self.columns.iter().position(|c| c == name)
    }

    fn get_i64(&self, row: usize, col: &str) -> Option<i64> {
        let idx = self.col_idx(col)?;
        self.rows.get(row)?.get(idx)?.as_i64()
    }

    fn get_str(&self, row: usize, col: &str) -> Option<&str> {
        let idx = self.col_idx(col)?;
        self.rows.get(row)?.get(idx)?.as_str()
    }
}

fn checked_slice(data: &[u8], offset: usize, size: usize) -> Result<&[u8]> {
    let end = offset.checked_add(size).ok_or_else(|| ReError::ParseError {
        context: "cpk_utf",
        details: "offset overflow".into(),
    })?;
    data.get(offset..end)
        .ok_or(ReError::BufferTooSmall { required: end, available: data.len() })
}

fn be_u16(data: &[u8], off: usize) -> Result<u16> {
    let s = checked_slice(data, off, 2)?;
    Ok(u16::from_be_bytes([s[0], s[1]]))
}

fn be_u32(data: &[u8], off: usize) -> Result<u32> {
    let s = checked_slice(data, off, 4)?;
    Ok(u32::from_be_bytes([s[0], s[1], s[2], s[3]]))
}

fn be_u64(data: &[u8], off: usize) -> Result<u64> {
    let s = checked_slice(data, off, 8)?;
    Ok(u64::from_be_bytes([s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7]]))
}

fn utf_cstr(data: &[u8], pool_base: usize, pool_off: usize) -> Result<String> {
    let start = pool_base.checked_add(pool_off).ok_or_else(|| ReError::ParseError {
        context: "cpk_utf",
        details: "string pool offset overflow".into(),
    })?;
    let tail = data
        .get(start..)
        .ok_or(ReError::BufferTooSmall { required: start + 1, available: data.len() })?;
    let nul = tail.iter().position(|&b| b == 0).unwrap_or(tail.len());
    Ok(String::from_utf8_lossy(&tail[..nul]).into_owned())
}

fn read_utf_cell(data: &[u8], off: usize, kind: UtfColType, string_pool: usize) -> Result<UtfCell> {
    Ok(match kind {
        UtfColType::U8 => UtfCell::Int(i64::from(checked_slice(data, off, 1)?[0])),
        UtfColType::I8 => UtfCell::Int(i64::from(checked_slice(data, off, 1)?[0] as i8)),
        UtfColType::U16 => UtfCell::Int(i64::from(be_u16(data, off)?)),
        UtfColType::I16 => UtfCell::Int(i64::from(be_u16(data, off)? as i16)),
        UtfColType::U32 => UtfCell::Int(i64::from(be_u32(data, off)?)),
        UtfColType::I32 => UtfCell::Int(i64::from(be_u32(data, off)? as i32)),
        UtfColType::U64 => UtfCell::Int(be_u64(data, off)? as i64),
        UtfColType::I64 => UtfCell::Int(be_u64(data, off)? as i64),
        UtfColType::String => {
            let pool_off = be_u32(data, off)? as usize;
            UtfCell::Str(utf_cstr(data, string_pool, pool_off)?)
        },
        UtfColType::F32 | UtfColType::F64 | UtfColType::Bytes | UtfColType::Guid => {
            let _ = checked_slice(data, off, kind.wire_size())?;
            UtfCell::Other
        },
    })
}

fn parse_canonical_utf(data: &[u8]) -> Result<StreamUtfTable> {
    if data.len() < UTF_MIN_TOTAL {
        return Err(ReError::BufferTooSmall { required: UTF_MIN_TOTAL, available: data.len() });
    }
    if &data[..4] != UTF_MAGIC {
        return Err(ReError::InvalidMagic {
            expected: UTF_MAGIC.to_vec(),
            found: data[..4].to_vec(),
        });
    }
    let rows_offset = (be_u32(data, UTF_BASE)? as usize).saturating_add(UTF_BASE);
    let string_pool = (be_u32(data, UTF_BASE + 4)? as usize).saturating_add(UTF_BASE);
    let col_count = be_u16(data, UTF_BASE + 16)? as usize;
    let row_stride = be_u16(data, UTF_BASE + 18)? as usize;
    let row_count = be_u32(data, UTF_BASE + 20)? as usize;

    if string_pool > data.len() {
        return Err(ReError::BufferTooSmall { required: string_pool, available: data.len() });
    }

    struct ColSpec {
        kind: UtfColType,
        flags: u8,
        name: String,
        default_val: Option<UtfCell>,
    }

    let mut specs = Vec::with_capacity(col_count);
    let mut col_off = 0x20usize;
    for i in 0..col_count {
        let flags = checked_slice(data, col_off, 1)?[0];
        col_off += 1;
        let kind = UtfColType::from_nibble(flags & 0x0F)?;
        let name = if (flags & FLAG_HAS_NAME) != 0 {
            let name_off = be_u32(data, col_off)? as usize;
            col_off += 4;
            utf_cstr(data, string_pool, name_off).unwrap_or_else(|_| format!("col_{i}"))
        } else {
            format!("col_{i}")
        };
        let default_val = if (flags & FLAG_HAS_DEFAULT) != 0 {
            let cell = read_utf_cell(data, col_off, kind, string_pool)?;
            col_off += kind.wire_size();
            Some(cell)
        } else {
            None
        };
        specs.push(ColSpec { kind, flags, name, default_val });
    }

    let rows_end = rows_offset.saturating_add(row_stride.saturating_mul(row_count));
    let effective_rows = if row_count > 0 && rows_end > string_pool {
        string_pool.saturating_sub(row_stride.saturating_mul(row_count))
    } else {
        rows_offset
    };

    let mut rows = Vec::with_capacity(row_count);
    for r in 0..row_count {
        let mut cursor = effective_rows + r * row_stride;
        let mut row = Vec::with_capacity(col_count);
        for spec in &specs {
            let cell = if (spec.flags & FLAG_HAS_DEFAULT) != 0 {
                spec.default_val.clone().unwrap_or(UtfCell::Other)
            } else if (spec.flags & FLAG_ROW_STORAGE) != 0 {
                let c = read_utf_cell(data, cursor, spec.kind, string_pool)?;
                cursor += spec.kind.wire_size();
                c
            } else {
                match spec.kind {
                    UtfColType::String => UtfCell::Str(String::new()),
                    _ => UtfCell::Int(0),
                }
            };
            row.push(cell);
        }
        rows.push(row);
    }

    let columns = specs.into_iter().map(|s| s.name).collect();
    Ok(StreamUtfTable { columns, rows })
}

fn parse_cri_container_utf(container: &[u8]) -> Result<StreamUtfTable> {
    let hdr = checked_slice(container, 0, 16)?;
    let declared_size = u32::from_le_bytes([hdr[8], hdr[9], hdr[10], hdr[11]]) as usize;
    let body = if declared_size > 0 && 16 + declared_size <= container.len() {
        &container[16..16 + declared_size]
    } else if container.len() > 16 {
        &container[16..]
    } else {
        return Err(ReError::BufferTooSmall { required: 32, available: container.len() });
    };
    let mut table = body.to_vec();
    if table.len() >= 4 && &table[..4] != UTF_MAGIC {
        decrypt_utf_table(&mut table);
    }
    parse_canonical_utf(&table)
}

/// Streaming CPK archive reader operating on arbitrary byte-range providers (`(offset, size)`).
#[derive(Debug, Clone)]
pub struct CpkStreamReader {
    pub entries: Vec<CpkEntry>,
    pub file_key: Option<u32>,
    pub is_encrypted: bool,
}

impl CpkStreamReader {
    /// Parses only the CPK header and TOC via a positioned byte-range callback `read(offset, size)`.
    pub fn from_reader<F>(filename: &str, mut read: F) -> Result<Self>
    where
        F: FnMut(u64, usize) -> Result<Vec<u8>>,
    {
        let probe = read(0, 16)?;
        if probe.len() < 16 {
            return Err(ReError::BufferTooSmall { required: 16, available: probe.len() });
        }

        let mut is_encrypted = false;
        let mut file_key = None;
        if &probe[..4] != CPK_MAGIC {
            let key_appid = cri_key_from_filename(&format!("002AB8F4-{filename}"));
            let key_plain = cri_key_from_filename(filename);
            let try_key = |k: u32| -> bool {
                let mut test = [probe[0], probe[1], probe[2], probe[3]];
                decrypt_cri_block(&mut test, 0, k);
                &test == CPK_MAGIC
            };
            if try_key(key_appid) {
                is_encrypted = true;
                file_key = Some(key_appid);
            } else if try_key(key_plain) {
                is_encrypted = true;
                file_key = Some(key_plain);
            } else {
                return Err(ReError::InvalidMagic {
                    expected: CPK_MAGIC.to_vec(),
                    found: probe[..4].to_vec(),
                });
            }
        }

        let mut read_region = |offset: u64, size: usize| -> Result<Vec<u8>> {
            if size > MAX_METADATA_BYTES {
                return Err(ReError::ParseError {
                    context: "cpk_stream",
                    details: format!("metadata size {size} exceeds 64 MiB limit"),
                });
            }
            let mut region = read(offset, size)?;
            if region.len() != size {
                return Err(ReError::BufferTooSmall { required: size, available: region.len() });
            }
            if is_encrypted
                && let Some(k) = file_key
            {
                decrypt_cri_block(&mut region, offset, k);
            }
            Ok(region)
        };

        let header_prefix = read_region(0, 24)?;
        let container_len =
            u32::from_le_bytes([header_prefix[8], header_prefix[9], header_prefix[10], header_prefix[11]])
                as usize;
        // Support both CRI 16-byte LE container (`size` at +8) and direct `@UTF` at +16 (`size` BE at +20).
        let header_body_size = if container_len > 0 && container_len <= MAX_METADATA_BYTES {
            container_len
        } else {
            let utf_be =
                u32::from_be_bytes([header_prefix[20], header_prefix[21], header_prefix[22], header_prefix[23]])
                    as usize;
            utf_be.saturating_add(8)
        };
        let header_data = read_region(0, 16usize.saturating_add(header_body_size))?;
        let header_utf = parse_cri_container_utf(&header_data)?;

        let toc_offset = header_utf.get_i64(0, "TocOffset").unwrap_or(-1);
        if toc_offset < 0 {
            return Err(ReError::ParseError {
                context: "cpk_stream",
                details: "missing TocOffset in CPK header".into(),
            });
        }
        let mut content_offset = header_utf.get_i64(0, "ContentOffset").unwrap_or(-1);
        if content_offset < 0 || toc_offset < content_offset {
            content_offset = toc_offset;
        }

        let toc_pos = toc_offset as u64;
        let toc_prefix = read_region(toc_pos, 24)?;
        let toc_container_len =
            u32::from_le_bytes([toc_prefix[8], toc_prefix[9], toc_prefix[10], toc_prefix[11]])
                as usize;
        let (toc_start, toc_total) = if &toc_prefix[..4] == b"TOC " && toc_container_len > 0 {
            (toc_pos, 16usize.saturating_add(toc_container_len))
        } else if &toc_prefix[..4] == UTF_MAGIC {
            let utf_len =
                u32::from_be_bytes([toc_prefix[4], toc_prefix[5], toc_prefix[6], toc_prefix[7]])
                    as usize;
            (toc_pos, 8usize.saturating_add(utf_len))
        } else {
            (toc_pos, 16usize.saturating_add(toc_container_len))
        };

        let toc_raw = read_region(toc_start, toc_total)?;
        let toc_utf = if toc_raw.starts_with(UTF_MAGIC) {
            parse_canonical_utf(&toc_raw)?
        } else {
            parse_cri_container_utf(&toc_raw)?
        };

        let mut entries = Vec::with_capacity(toc_utf.rows.len());
        for i in 0..toc_utf.rows.len() {
            let name = toc_utf
                .get_str(i, "FileName")
                .map(str::to_owned)
                .unwrap_or_else(|| format!("file_{i}"));
            let dir = toc_utf
                .get_str(i, "DirName")
                .filter(|d| !d.is_empty())
                .map(str::to_owned);
            let rel_off = toc_utf.get_i64(i, "FileOffset").unwrap_or(0);
            let file_size = toc_utf.get_i64(i, "FileSize").unwrap_or(0).max(0) as u64;
            let extract_size = toc_utf
                .get_i64(i, "ExtractSize")
                .map(|v| v.max(0) as u64)
                .unwrap_or(file_size);
            let id = toc_utf.get_i64(i, "ID").map(|v| v as u32).unwrap_or(i as u32);
            let file_offset = rel_off
                .checked_add(content_offset)
                .and_then(|v| u64::try_from(v).ok())
                .ok_or_else(|| ReError::ParseError {
                    context: "cpk_stream",
                    details: format!("invalid FileOffset for {name}"),
                })?;
            entries.push(CpkEntry {
                id,
                name,
                dir_name: dir,
                file_size,
                extract_size,
                file_offset,
                is_compressed: extract_size > file_size && file_size > 0,
            });
        }

        Ok(Self { entries, file_key, is_encrypted })
    }

    /// Finds an entry by virtual path (`chara/GOK/GOK.emd`) or basename (`GOK.emd`), case-insensitively.
    #[must_use]
    pub fn find_file(&self, path: &str) -> Option<&CpkEntry> {
        let normalized = path.trim_matches(['/', '\\']).replace('\\', "/");
        let basename = normalized.rsplit('/').next().unwrap_or(&normalized);
        let full_path = |e: &CpkEntry| match e.dir_name.as_deref() {
            Some(d) if !d.is_empty() => format!("{}/{}", d.trim_matches(['/', '\\']), e.name),
            _ => e.name.clone(),
        };
        self.entries
            .iter()
            .find(|e| full_path(e) == normalized)
            .or_else(|| self.entries.iter().find(|e| full_path(e).eq_ignore_ascii_case(&normalized)))
            .or_else(|| self.entries.iter().find(|e| e.name == basename))
            .or_else(|| self.entries.iter().find(|e| e.name.eq_ignore_ascii_case(basename)))
    }

    /// Reads, decrypts, and (if CRILAYLA) decompresses a single entry from `read(offset, size)`.
    pub fn extract_from_reader<F>(&self, entry: &CpkEntry, mut read: F) -> Result<Vec<u8>>
    where
        F: FnMut(u64, usize) -> Result<Vec<u8>>,
    {
        if entry.file_size == 0 {
            return Ok(Vec::new());
        }
        let size = usize::try_from(entry.file_size).map_err(|_| ReError::ParseError {
            context: "cpk_stream",
            details: format!("entry {} size exceeds address space", entry.name),
        })?;
        let mut raw = read(entry.file_offset, size)?;
        if raw.len() != size {
            return Err(ReError::BufferTooSmall { required: size, available: raw.len() });
        }
        if self.is_encrypted
            && let Some(k) = self.file_key
        {
            decrypt_cri_block(&mut raw, entry.file_offset, k);
        }
        if entry.is_compressed && raw.starts_with(b"CRILAYLA") {
            decompress_crilayla(&raw)
        } else {
            Ok(raw)
        }
    }
}

fn is_safe_component(component: &str) -> bool {
    !component.is_empty()
        && component != "."
        && component != ".."
        && !component.contains(':')
        && !component.chars().any(char::is_control)
}

/// Validates and builds the relative output path (`DirName/FileName`) of a [`CpkEntry`],
/// rejecting path traversal (`..`), drive prefixes (`C:`), and control characters.
#[must_use]
pub fn entry_output_path(entry: &CpkEntry) -> Option<PathBuf> {
    let mut output = PathBuf::new();
    if let Some(dir) = &entry.dir_name {
        for component in dir.split(['/', '\\']).filter(|v| !v.is_empty()) {
            if !is_safe_component(component) {
                return None;
            }
            output.push(component);
        }
    }
    if !is_safe_component(&entry.name) || entry.name.contains(['/', '\\']) {
        return None;
    }
    output.push(&entry.name);
    Some(output)
}

/// One extracted file of a CPK manifest.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpkFileRecord {
    pub id: usize,
    pub file: String,
    pub size_bytes: u64,
}

/// Summary of one streaming CPK archive extraction.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CpkExtraction {
    pub archive: String,
    pub entry_count: usize,
    pub total_bytes: u64,
    pub files: Vec<CpkFileRecord>,
}

#[cfg(not(target_arch = "wasm32"))]
fn read_file_range(file: &mut File, offset: u64, size: usize) -> Result<Vec<u8>> {
    let mut buffer = vec![0u8; size];
    file.seek(SeekFrom::Start(offset))?;
    file.read_exact(&mut buffer).map_err(|e| {
        if e.kind() == std::io::ErrorKind::UnexpectedEof {
            ReError::BufferTooSmall { required: size, available: 0 }
        } else {
            ReError::Io(e)
        }
    })?;
    Ok(buffer)
}

/// Opens a CPK file on disk and reads only its header and TOC.
#[cfg(not(target_arch = "wasm32"))]
pub fn open_cpk_stream(path: &Path) -> Result<CpkStreamReader> {
    let mut file = File::open(path)?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    CpkStreamReader::from_reader(&name, |offset, size| read_file_range(&mut file, offset, size))
}

/// Extracts every entry of `archive` below `destination` using `threads` worker handles with
/// positioned reads (never mapping or buffering the full CPK).
#[cfg(not(target_arch = "wasm32"))]
pub fn extract_cpk_stream(
    archive: &Path,
    destination: &Path,
    create_new: bool,
    threads: usize,
) -> Result<CpkExtraction> {
    let reader = open_cpk_stream(archive)?;
    let mut paths = Vec::with_capacity(reader.entries.len());
    let mut unique = HashSet::with_capacity(reader.entries.len());
    for entry in &reader.entries {
        let path = entry_output_path(entry).ok_or_else(|| ReError::ParseError {
            context: "cpk_stream",
            details: format!(
                "unsafe CPK path: {}/{}",
                entry.dir_name.as_deref().unwrap_or(""),
                entry.name
            ),
        })?;
        let key = path.to_string_lossy().replace('\\', "/").to_ascii_lowercase();
        if !unique.insert(key) {
            return Err(ReError::ParseError {
                context: "cpk_stream",
                details: format!("duplicate CPK output path: {}", path.display()),
            });
        }
        paths.push(path);
    }

    fs::create_dir_all(destination)?;
    let next = AtomicUsize::new(0);
    let failure: Mutex<Option<ReError>> = Mutex::new(None);
    let sizes: Vec<AtomicUsize> = (0..paths.len()).map(|_| AtomicUsize::new(0)).collect();
    std::thread::scope(|scope| {
        for _ in 0..threads.clamp(1, 32) {
            scope.spawn(|| {
                let mut file = match File::open(archive) {
                    Ok(f) => f,
                    Err(err) => {
                        if let Ok(mut guard) = failure.lock() {
                            guard.get_or_insert_with(|| err.into());
                        }
                        return;
                    },
                };
                loop {
                    let index = next.fetch_add(1, Ordering::Relaxed);
                    if index >= paths.len() {
                        return;
                    }
                    if failure.lock().ok().is_some_and(|g| g.is_some()) {
                        return;
                    }
                    let entry = &reader.entries[index];
                    let res = reader
                        .extract_from_reader(entry, |offset, size| {
                            read_file_range(&mut file, offset, size)
                        })
                        .and_then(|bytes| {
                            let output = destination.join(&paths[index]);
                            if let Some(parent) = output.parent() {
                                fs::create_dir_all(parent)?;
                            }
                            let mut options = OpenOptions::new();
                            options.write(true);
                            if create_new {
                                options.create_new(true);
                            } else {
                                options.create(true).truncate(true);
                            }
                            options.open(&output)?.write_all(&bytes)?;
                            sizes[index].store(bytes.len(), Ordering::Relaxed);
                            Ok(())
                        });
                    if let Err(err) = res {
                        if let Ok(mut guard) = failure.lock() {
                            guard.get_or_insert(err);
                        }
                        return;
                    }
                }
            });
        }
    });
    if let Ok(mut guard) = failure.lock()
        && let Some(err) = guard.take()
    {
        return Err(err);
    }

    let mut total_bytes = 0u64;
    let files: Vec<CpkFileRecord> = paths
        .iter()
        .zip(&sizes)
        .enumerate()
        .map(|(id, (path, size))| {
            let size_bytes = size.load(Ordering::Relaxed) as u64;
            total_bytes += size_bytes;
            CpkFileRecord { id, file: path.to_string_lossy().replace('\\', "/"), size_bytes }
        })
        .collect();

    Ok(CpkExtraction {
        archive: archive.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        entry_count: files.len(),
        total_bytes,
        files,
    })
}

/// Computes the canonical DBXV2 mount precedence rank for an archive filename (`lower` wins).
#[must_use]
pub fn dbxv2_cpk_rank(archive_name: &str) -> usize {
    let lower = archive_name.trim_end_matches(".cpk").to_ascii_lowercase();
    match lower.as_str() {
        "data2" => 10,
        "data" => 20,
        s if s.starts_with("data_d") => 30,
        s if s.starts_with("data") => 40,
        s if s.starts_with("movie") => 50,
        _ => 100,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fs::cpk::CpkArchive;

    fn sample_entry(dir: Option<&str>, name: &str) -> CpkEntry {
        CpkEntry {
            id: 0,
            name: name.into(),
            dir_name: dir.map(str::to_owned),
            file_size: 0,
            extract_size: 0,
            file_offset: 0,
            is_compressed: false,
        }
    }

    #[test]
    fn output_paths_reject_traversal_and_drives() {
        assert!(entry_output_path(&sample_entry(Some("data/chara"), "GOK.cms")).is_some());
        assert!(entry_output_path(&sample_entry(Some("../x"), "a.bin")).is_none());
        assert!(entry_output_path(&sample_entry(Some("C:"), "a.bin")).is_none());
        assert!(entry_output_path(&sample_entry(Some("data"), "..")).is_none());
        assert!(entry_output_path(&sample_entry(None, "sub/evil.bin")).is_none());
    }

    #[test]
    fn cri_xor_cipher_is_position_independent_and_involutive() {
        let key = cri_key_from_filename("1d08dda99e8549431c6c7b459ed8deab.cpk");
        assert_eq!(key, 0xBD28_1847);

        let plaintext = b"CPK \x00\x00\x00\x00@UTF stream range verification payload!";
        let mut full = plaintext.to_vec();
        decrypt_cri_block(&mut full, 0, key);
        assert_ne!(&full[..], plaintext);

        // Decrypting a mid-stream slice at offset 7 produces identical plaintext bytes.
        let mut slice = full[7..29].to_vec();
        decrypt_cri_block(&mut slice, 7, key);
        assert_eq!(&slice[..], &plaintext[7..29]);
    }

    #[test]
    fn streams_encrypted_and_plain_cpk_via_range_callback() {
        let mock = CpkArchive::create_mock(&[
            ("GOK.cus", b"Kamehameha Skill Payload"),
            ("VEG.bac", b"Final Flash Moveset"),
        ]);

        // Encrypt the whole mock CPK with filename-derived CRI XOR key.
        let fname = "data2.cpk";
        let key = cri_key_from_filename(fname);
        let mut encrypted = mock.clone();
        decrypt_cri_block(&mut encrypted, 0, key);
        assert_ne!(&encrypted[..4], b"CPK ");

        let reader = CpkStreamReader::from_reader(fname, |off, len| {
            let start = off as usize;
            let end = (start + len).min(encrypted.len());
            // Pad trailing header probe if mock is smaller than heuristic probe
            let mut out = encrypted[start..end].to_vec();
            if out.len() < len {
                out.resize(len, 0);
            }
            Ok(out)
        })
        .expect("stream reader parses encrypted CPK");

        assert!(reader.is_encrypted);
        assert_eq!(reader.entries.len(), 2);
        let gok = reader.find_file("GOK.cus").expect("GOK.cus entry");
        let extracted = reader
            .extract_from_reader(gok, |off, len| {
                let s = off as usize;
                Ok(encrypted[s..s + len].to_vec())
            })
            .expect("extract GOK.cus");
        assert_eq!(extracted, b"Kamehameha Skill Payload");
    }
}
