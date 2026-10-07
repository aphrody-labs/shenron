// SPDX-License-Identifier: Apache-2.0
//! Pure Rust implementation of the CRI Middleware CRILAYLA decompression algorithm.
//!
//! CRILAYLA is the standard compressed payload found within CRIWARE CPK files and AWB sound archives.
//! Compression is an LZSS variant processed in reverse bitstream order.

use crate::error::{ReError, Result};

pub const CRILAYLA_MAGIC: &[u8; 8] = b"CRILAYLA";

/// Decompresses a CRILAYLA-compressed buffer into raw uncompressed bytes.
pub fn decompress_crilayla(input: &[u8]) -> Result<Vec<u8>> {
    if input.len() < 16 {
        return Err(ReError::BufferTooSmall { required: 16, available: input.len() });
    }

    if &input[0..8] != CRILAYLA_MAGIC {
        return Err(ReError::InvalidMagic {
            expected: CRILAYLA_MAGIC.to_vec(),
            found: input[0..8].to_vec(),
        });
    }

    let uncompressed_size = u32::from_le_bytes(input[8..12].try_into().unwrap()) as usize;
    let uncompressed_header_offset = u32::from_le_bytes(input[12..16].try_into().unwrap()) as usize;

    let total_uncompressed_size = uncompressed_size + 0x100;
    let mut output = vec![0u8; total_uncompressed_size];

    // Copy the uncompressed 0x100 (256-byte) header
    let header_start = 16 + uncompressed_header_offset;
    if header_start + 0x100 <= input.len() {
        output[0..0x100].copy_from_slice(&input[header_start..header_start + 0x100]);
    }

    let mut bit_pool = 0u32;
    let mut bits_left = 0usize;
    let mut src_idx = input.len();
    let mut dst_idx = total_uncompressed_size;

    let get_bits = |bits_needed: usize,
                    src_idx: &mut usize,
                    bit_pool: &mut u32,
                    bits_left: &mut usize|
     -> Result<u32> {
        while *bits_left < bits_needed {
            if *src_idx == 0 {
                return Err(ReError::CrilaylaDecompress("Unexpected end of input stream".into()));
            }
            *src_idx -= 1;
            *bit_pool = (*bit_pool << 8) | (input[*src_idx] as u32);
            *bits_left += 8;
        }
        let shift = *bits_left - bits_needed;
        let res = (*bit_pool >> shift) & ((1 << bits_needed) - 1);
        *bits_left -= bits_needed;
        Ok(res)
    };

    while dst_idx > 0x100 {
        let flag = get_bits(1, &mut src_idx, &mut bit_pool, &mut bits_left)?;
        if flag == 1 {
            // Literal byte
            let byte = get_bits(8, &mut src_idx, &mut bit_pool, &mut bits_left)? as u8;
            dst_idx -= 1;
            output[dst_idx] = byte;
        } else {
            // LZSS Back reference
            let offset = (get_bits(13, &mut src_idx, &mut bit_pool, &mut bits_left)? as usize) + 3;
            let mut count = 3usize;
            loop {
                let extra = get_bits(2, &mut src_idx, &mut bit_pool, &mut bits_left)?;
                count += extra as usize;
                if extra != 3 {
                    break;
                }
            }

            for _ in 0..count {
                if dst_idx <= 0x100 {
                    break;
                }
                let ref_idx = dst_idx + offset;
                if ref_idx >= total_uncompressed_size {
                    return Err(ReError::CrilaylaDecompress(format!(
                        "Reference index {} out of bounds (max {})",
                        ref_idx, total_uncompressed_size
                    )));
                }
                let byte = output[ref_idx];
                dst_idx -= 1;
                output[dst_idx] = byte;
            }
        }
    }

    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reject_short_or_invalid_magic() {
        assert!(decompress_crilayla(b"SHORT").is_err());
        assert!(decompress_crilayla(b"NOT_A_VALID_MAGIC_").is_err());
    }
}
