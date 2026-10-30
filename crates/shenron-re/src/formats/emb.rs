// SPDX-License-Identifier: Apache-2.0
//! Dragon Ball Xenoverse 2 (DBXV2) texture package (`.emb`) reader and DDS decoder.
//!
//! The container layout lives in [`super::emb_archive`]; each entry is a DirectDraw Surface.
//! Character textures use DXT1 (BC1) and DXT5 (BC3); BC2, BC4, BC5 and uncompressed 32-bit
//! surfaces are decoded too. The top mip level is decoded to RGBA8.

use crate::error::{ReError, Result};
use crate::formats::emb_archive::EmbArchive;
use serde::{Deserialize, Serialize};

/// Signature magic for DBXV2 EMB files (`#EMB`).
pub const EMB_MAGIC: &[u8; 4] = b"#EMB";
/// DirectDraw Surface signature magic (`DDS `).
pub const DDS_MAGIC: &[u8; 4] = b"DDS ";

/// Pixel format of an embedded texture.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum TexturePixelFormat {
    Dxt1,
    Dxt3,
    Dxt5,
    Bc4,
    Bc5,
    Bc7,
    Rgba8,
    Bgra8,
    Unknown,
}

/// Decoded RGBA8 raster texture suitable for WebGPU and canvas surfaces.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbRgbaTexture {
    pub width: u32,
    pub height: u32,
    pub format: TexturePixelFormat,
    pub rgba: Vec<u8>,
}

/// Metadata and payload of a texture entry inside an EMB archive.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbTextureEntry {
    pub index: usize,
    pub name: Option<String>,
    pub offset: u32,
    pub size: u32,
    pub width: u32,
    pub height: u32,
    pub mipmap_count: u32,
    pub format: TexturePixelFormat,
    #[serde(skip)]
    pub data: Vec<u8>,
}

/// Parsed DBXV2 `.emb` Texture Package file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbFile {
    pub count: usize,
    pub textures: Vec<EmbTextureEntry>,
}

const MAX_DIMENSION: u32 = 8192;

fn err(details: String) -> ReError {
    ReError::ParseError { context: "dds", details }
}

/// Reads a DDS header: `(width, height, mip_count, format, payload_offset)`.
pub fn inspect_dds(data: &[u8]) -> Result<(u32, u32, u32, TexturePixelFormat, usize)> {
    if data.len() < 128 || &data[0..4] != DDS_MAGIC {
        return Err(err("missing DDS header".into()));
    }
    let u32_at = |o: usize| u32::from_le_bytes([data[o], data[o + 1], data[o + 2], data[o + 3]]);
    let (height, width, mips) = (u32_at(12), u32_at(16), u32_at(28).max(1));
    if width == 0 || height == 0 || width > MAX_DIMENSION || height > MAX_DIMENSION {
        return Err(err(format!("invalid size {width}x{height}")));
    }
    if mips > 32 {
        return Err(err("DDS mip count exceeds 32".into()));
    }
    let flags = u32_at(80);
    let fourcc = &data[84..88];
    let mut payload = 128;
    let format = if flags & 0x4 != 0 {
        match fourcc {
            b"DXT1" => TexturePixelFormat::Dxt1,
            b"DXT2" | b"DXT3" => TexturePixelFormat::Dxt3,
            b"DXT4" | b"DXT5" => TexturePixelFormat::Dxt5,
            b"ATI1" | b"BC4U" => TexturePixelFormat::Bc4,
            b"ATI2" | b"BC5U" => TexturePixelFormat::Bc5,
            b"DX10" if data.len() >= 148 => {
                payload = 148;
                match u32_at(128) {
                    71 | 72 => TexturePixelFormat::Dxt1,
                    74 | 75 => TexturePixelFormat::Dxt3,
                    77 | 78 => TexturePixelFormat::Dxt5,
                    80 => TexturePixelFormat::Bc4,
                    83 => TexturePixelFormat::Bc5,
                    98 | 99 => TexturePixelFormat::Bc7,
                    28 | 29 => TexturePixelFormat::Rgba8,
                    87 | 91 => TexturePixelFormat::Bgra8,
                    _ => TexturePixelFormat::Unknown,
                }
            },
            _ => TexturePixelFormat::Unknown,
        }
    } else if flags & 0x40 != 0 && u32_at(88) == 32 {
        // Uncompressed 32-bit: the red mask tells RGBA from BGRA.
        if u32_at(92) == 0xFF { TexturePixelFormat::Rgba8 } else { TexturePixelFormat::Bgra8 }
    } else {
        TexturePixelFormat::Unknown
    };
    Ok((width, height, mips, format, payload))
}

fn rgb565(c: u16) -> [u8; 3] {
    let r = ((c >> 11) & 0x1F) as u32;
    let g = ((c >> 5) & 0x3F) as u32;
    let b = (c & 0x1F) as u32;
    [((r * 527 + 23) >> 6) as u8, ((g * 259 + 33) >> 6) as u8, ((b * 527 + 23) >> 6) as u8]
}

/// Decodes a BC1 color block into 16 RGBA pixels. `opaque` forces four-color mode (BC2/BC3).
fn bc1_block(block: &[u8], opaque: bool, out: &mut [[u8; 4]; 16]) {
    let c0 = u16::from_le_bytes([block[0], block[1]]);
    let c1 = u16::from_le_bytes([block[2], block[3]]);
    let (a, b) = (rgb565(c0), rgb565(c1));
    let mix = |wa: u32, wb: u32, d: u32| -> [u8; 4] {
        let m = |i: usize| ((a[i] as u32 * wa + b[i] as u32 * wb) / d) as u8;
        [m(0), m(1), m(2), 255]
    };
    let palette = if c0 > c1 || opaque {
        [[a[0], a[1], a[2], 255], [b[0], b[1], b[2], 255], mix(2, 1, 3), mix(1, 2, 3)]
    } else {
        [[a[0], a[1], a[2], 255], [b[0], b[1], b[2], 255], mix(1, 1, 2), [0, 0, 0, 0]]
    };
    let bits = u32::from_le_bytes([block[4], block[5], block[6], block[7]]);
    for (i, px) in out.iter_mut().enumerate() {
        *px = palette[((bits >> (i * 2)) & 3) as usize];
    }
}

/// Decodes a BC4 channel block (8 bytes) into 16 values.
fn bc4_block(block: &[u8]) -> [u8; 16] {
    let (a0, a1) = (block[0] as u32, block[1] as u32);
    let mut palette = [0u8; 8];
    palette[0] = a0 as u8;
    palette[1] = a1 as u8;
    if a0 > a1 {
        for i in 1..7 {
            palette[i + 1] = (((7 - i as u32) * a0 + i as u32 * a1) / 7) as u8;
        }
    } else {
        for i in 1..5 {
            palette[i + 1] = (((5 - i as u32) * a0 + i as u32 * a1) / 5) as u8;
        }
        palette[6] = 0;
        palette[7] = 255;
    }
    let mut bits = 0u64;
    for (k, byte) in block[2..8].iter().enumerate() {
        bits |= (*byte as u64) << (8 * k);
    }
    std::array::from_fn(|i| palette[((bits >> (i * 3)) & 7) as usize])
}

/// Decodes the top mip of a DDS surface to RGBA8.
pub fn decode_dds(data: &[u8]) -> Result<EmbRgbaTexture> {
    decode_dds_mip(data, 0)
}

/// Validates every declared original level before returning a selected mip byte range.
fn dds_mip_range(
    data: &[u8],
    level: usize,
) -> Result<(u32, u32, TexturePixelFormat, std::ops::Range<usize>)> {
    let (width, height, count, format, mut offset) = inspect_dds(data)?;
    if level >= count as usize {
        return Err(err("DDS mip level outside declared chain".into()));
    }
    let block_bytes = match format {
        TexturePixelFormat::Dxt1 | TexturePixelFormat::Bc4 => 8usize,
        TexturePixelFormat::Dxt3
        | TexturePixelFormat::Dxt5
        | TexturePixelFormat::Bc5
        | TexturePixelFormat::Bc7 => 16,
        TexturePixelFormat::Rgba8 | TexturePixelFormat::Bgra8 => 0,
        other => return Err(err(format!("unsupported format {other:?}"))),
    };
    let mut selected = None;
    for current in 0..count as usize {
        let w = (width >> current).max(1);
        let h = (height >> current).max(1);
        let size = if block_bytes == 0 {
            (w as usize).checked_mul(h as usize).and_then(|pixels| pixels.checked_mul(4))
        } else {
            (w as usize)
                .div_ceil(4)
                .checked_mul((h as usize).div_ceil(4))
                .and_then(|blocks| blocks.checked_mul(block_bytes))
        }
        .ok_or_else(|| err("DDS mip size overflow".into()))?;
        let end = offset.checked_add(size).ok_or_else(|| err("DDS mip offset overflow".into()))?;
        data.get(offset..end).ok_or_else(|| err(format!("truncated DDS mip {current}")))?;
        if current == level {
            selected = Some((w, h, format, offset..end));
        }
        offset = end;
    }
    selected.ok_or_else(|| err("DDS mip level missing".into()))
}

/// Decodes one stored original mip directly, without decoding or resizing another level.
pub fn decode_dds_mip(data: &[u8], level: usize) -> Result<EmbRgbaTexture> {
    let (width, height, format, range) = dds_mip_range(data, level)?;
    let data = &data[range];
    let payload = 0;
    let (w, h) = (width as usize, height as usize);
    let mut rgba = vec![0u8; w * h * 4];
    let block_bytes = match format {
        TexturePixelFormat::Dxt1 | TexturePixelFormat::Bc4 => 8,
        TexturePixelFormat::Dxt3 | TexturePixelFormat::Dxt5 | TexturePixelFormat::Bc5 => 16,
        TexturePixelFormat::Rgba8 | TexturePixelFormat::Bgra8 => {
            let src = data
                .get(payload..payload + w * h * 4)
                .ok_or_else(|| err("truncated 32-bit surface".into()))?;
            rgba.copy_from_slice(src);
            if format == TexturePixelFormat::Bgra8 {
                rgba.as_chunks_mut::<4>().0.iter_mut().for_each(|p| p.swap(0, 2));
            }
            return Ok(EmbRgbaTexture { width, height, format, rgba });
        },
        other => return Err(err(format!("unsupported format {other:?}"))),
    };
    let (bw, bh) = (w.div_ceil(4), h.div_ceil(4));
    let blocks = data
        .get(payload..payload + bw * bh * block_bytes)
        .ok_or_else(|| err("truncated block data".into()))?;
    let mut pixels = [[0u8; 4]; 16];
    for by in 0..bh {
        for bx in 0..bw {
            let block = &blocks[(by * bw + bx) * block_bytes..][..block_bytes];
            match format {
                TexturePixelFormat::Dxt1 => bc1_block(block, false, &mut pixels),
                TexturePixelFormat::Dxt3 => {
                    bc1_block(&block[8..], true, &mut pixels);
                    for (i, px) in pixels.iter_mut().enumerate() {
                        px[3] = ((block[i / 2] >> ((i % 2) * 4)) & 0xF) * 17;
                    }
                },
                TexturePixelFormat::Dxt5 => {
                    bc1_block(&block[8..], true, &mut pixels);
                    for (px, a) in pixels.iter_mut().zip(bc4_block(&block[..8])) {
                        px[3] = a;
                    }
                },
                TexturePixelFormat::Bc4 => {
                    for (px, r) in pixels.iter_mut().zip(bc4_block(block)) {
                        *px = [r, r, r, 255];
                    }
                },
                TexturePixelFormat::Bc5 => {
                    let (r, g) = (bc4_block(&block[..8]), bc4_block(&block[8..]));
                    for (i, px) in pixels.iter_mut().enumerate() {
                        *px = [r[i], g[i], 0, 255];
                    }
                },
                _ => unreachable!(),
            }
            for (i, px) in pixels.iter().enumerate() {
                let (x, y) = (bx * 4 + i % 4, by * 4 + i / 4);
                if x < w && y < h {
                    rgba[(y * w + x) * 4..][..4].copy_from_slice(px);
                }
            }
        }
    }
    Ok(EmbRgbaTexture { width, height, format, rgba })
}

impl EmbFile {
    /// Parses an EMB texture package from binary data.
    pub fn parse(buffer: &[u8]) -> Result<Self> {
        let archive = EmbArchive::parse(buffer)?;
        let mut textures = Vec::with_capacity(archive.entries.len());
        for (index, entry) in archive.entries.iter().enumerate() {
            let data = archive.entry_bytes(buffer, index)?.to_vec();
            let (width, height, mipmap_count, format) = match inspect_dds(&data) {
                Ok((w, h, m, f, _)) => (w, h, m, f),
                Err(_) => (0, 0, 0, TexturePixelFormat::Unknown),
            };
            textures.push(EmbTextureEntry {
                index,
                name: Some(entry.name.clone()),
                offset: entry.offset as u32,
                size: entry.size_bytes as u32,
                width,
                height,
                mipmap_count,
                format,
                data,
            });
        }
        Ok(Self { count: textures.len(), textures })
    }

    /// Checks the full original DDS mip chain and returns the requested stored dimensions.
    pub fn mip_dimensions(&self, index: usize, level: usize) -> Result<(u32, u32)> {
        let entry =
            self.textures.get(index).ok_or_else(|| err("texture index outside EMB".into()))?;
        let (width, height, _, _) = dds_mip_range(&entry.data, level)?;
        Ok((width, height))
    }

    /// Decodes an original DDS mip with validated bounds and no resampling.
    pub fn decode_rgba_mip(&self, index: usize, level: usize) -> Result<EmbRgbaTexture> {
        let entry =
            self.textures.get(index).ok_or_else(|| err("texture index outside EMB".into()))?;
        decode_dds_mip(&entry.data, level)
    }

    /// Extracts and decodes the texture at the specified index into RGBA8 raster pixels.
    pub fn decode_rgba(&self, index: usize) -> Result<EmbRgbaTexture> {
        let entry = self.textures.get(index).ok_or_else(|| ReError::ParseError {
            context: "emb_decode_rgba",
            details: format!("Texture index {index} out of bounds (count {})", self.textures.len()),
        })?;
        decode_dds_mip(&entry.data, 0)
    }
}

/// Writes an uncompressed RGBA8 DDS surface, for tests and tools.
pub fn encode_dds_rgba(width: u32, height: u32, rgba: &[u8]) -> Vec<u8> {
    let mut out = vec![0u8; 128];
    out[0..4].copy_from_slice(DDS_MAGIC);
    let mut put = |at: usize, v: u32| out[at..at + 4].copy_from_slice(&v.to_le_bytes());
    put(4, 124);
    put(8, 0x100F);
    put(12, height);
    put(16, width);
    put(28, 1);
    put(76, 32);
    put(80, 0x41);
    put(88, 32);
    put(92, 0xFF);
    put(96, 0xFF00);
    put(100, 0xFF_0000);
    put(104, 0xFF00_0000);
    out.extend_from_slice(rgba);
    out
}

/// Writes an `.emb` container around payloads, for tests and tools.
pub fn encode_emb(payloads: &[Vec<u8>]) -> Vec<u8> {
    let mut out = vec![0u8; 32];
    out[0..4].copy_from_slice(EMB_MAGIC);
    out[4..8].copy_from_slice(&[0xFE, 0xFF, 0x20, 0]);
    out[12..16].copy_from_slice(&(payloads.len() as u32).to_le_bytes());
    out[24..28].copy_from_slice(&32u32.to_le_bytes());
    let mut data_at = (32 + payloads.len() * 8).next_multiple_of(16);
    let mut table = Vec::new();
    for (i, payload) in payloads.iter().enumerate() {
        let record = 32 + i * 8;
        table.extend(((data_at - record) as u32).to_le_bytes());
        table.extend((payload.len() as u32).to_le_bytes());
        data_at = (data_at + payload.len()).next_multiple_of(16);
    }
    out.extend(table);
    for payload in payloads {
        out.resize(out.len().next_multiple_of(16), 0);
        out.extend(payload);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_uncompressed_surface_in_container() {
        let pixels: Vec<u8> = (0..16u8).flat_map(|i| [i, 255 - i, 7, 255]).collect();
        let emb = EmbFile::parse(&encode_emb(&[encode_dds_rgba(4, 4, &pixels)])).unwrap();
        assert_eq!(emb.count, 1);
        assert_eq!(emb.textures[0].format, TexturePixelFormat::Rgba8);
        let tex = emb.decode_rgba(0).unwrap();
        assert_eq!((tex.width, tex.height), (4, 4));
        assert_eq!(tex.rgba, pixels);
    }

    #[test]
    fn decodes_bc1_and_bc3_blocks() {
        // BC1: c0 = pure red, c1 = pure blue, every pixel index 0 except the last (index 1).
        let block = [0x00, 0xF8, 0x1F, 0x00, 0, 0, 0, 0x40];
        let mut px = [[0u8; 4]; 16];
        bc1_block(&block, false, &mut px);
        assert_eq!(px[0], [255, 0, 0, 255]);
        assert_eq!(px[15], [0, 0, 255, 255]);
        // BC4 alpha: a0 = 255, a1 = 0, all indices 1 → 0.
        assert_eq!(bc4_block(&[255, 0, 0x49, 0x92, 0x24, 0x49, 0x92, 0x24]), [0; 16]);
    }

    #[test]
    fn decodes_original_mip_color_without_resampling_top_level() {
        let mut dds = encode_dds_rgba(2, 2, &[255, 0, 0, 255].repeat(4));
        dds[28..32].copy_from_slice(&2u32.to_le_bytes());
        dds.extend_from_slice(&[0, 255, 0, 255]);
        let emb = EmbFile::parse(&encode_emb(&[dds])).unwrap();
        assert_eq!(emb.mip_dimensions(0, 1).unwrap(), (1, 1));
        assert_eq!(emb.decode_rgba_mip(0, 1).unwrap().rgba, [0, 255, 0, 255]);
        assert_eq!(&emb.decode_rgba(0).unwrap().rgba[..4], &[255, 0, 0, 255]);
        assert!(emb.mip_dimensions(0, 2).is_err());
        assert!(emb.mip_dimensions(1, 0).is_err());
    }

    #[test]
    fn validates_whole_chain_and_minimum_bc_block_before_allocation() {
        let mut dds = encode_dds_rgba(4, 4, &[]);
        dds[28..32].copy_from_slice(&3u32.to_le_bytes());
        dds[80..84].copy_from_slice(&4u32.to_le_bytes());
        dds[84..88].copy_from_slice(b"DXT1");
        for block in
            [[0, 248, 0, 0, 0, 0, 0, 0], [224, 7, 0, 0, 0, 0, 0, 0], [31, 0, 0, 0, 0, 0, 0, 0]]
        {
            dds.extend_from_slice(&block);
        }
        let emb = EmbFile::parse(&encode_emb(&[dds.clone()])).unwrap();
        assert_eq!(emb.mip_dimensions(0, 1).unwrap(), (2, 2));
        assert_eq!(emb.decode_rgba_mip(0, 2).unwrap().rgba, [0, 0, 255, 255]);
        dds.pop();
        let truncated = EmbFile::parse(&encode_emb(&[dds.clone()])).unwrap();
        assert!(truncated.mip_dimensions(0, 0).is_err());
        assert!(truncated.decode_rgba_mip(0, 1).is_err());
        dds[28..32].copy_from_slice(&33u32.to_le_bytes());
        assert!(decode_dds_mip(&dds, 0).is_err());
    }

    #[test]
    fn rejects_truncated_surface() {
        let mut dds = encode_dds_rgba(64, 64, &[0; 16]);
        dds.truncate(140);
        assert!(decode_dds(&dds).is_err());
    }

    /// `SHENRON_REAL_EMB=<path to a game .emb>` decodes every texture of a real package.
    #[test]
    fn decodes_real_package_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_EMB") else { return };
        let emb = EmbFile::parse(&std::fs::read(path).unwrap()).expect("parse real EMB");
        assert!(emb.count > 0);
        for i in 0..emb.count {
            let count = emb.textures[i].mipmap_count as usize;
            assert!((1..=32).contains(&count));
            for level in 0..count {
                let (width, height) =
                    emb.mip_dimensions(i, level).expect("real original mip bounds");
                assert_eq!(width, (emb.textures[i].width >> level).max(1));
                assert_eq!(height, (emb.textures[i].height >> level).max(1));
            }
            let smallest =
                emb.decode_rgba_mip(i, count - 1).expect("decode real final original mip");
            assert_eq!(smallest.rgba.len(), (smallest.width * smallest.height * 4) as usize);
            let tex = emb.decode_rgba(i).expect("decode real texture");
            assert_eq!(tex.rgba.len(), (tex.width * tex.height * 4) as usize);
            assert!(
                tex.rgba.as_chunks::<4>().0.iter().any(|p| p[0] != p[1] || p[1] != p[2]) || i > 0
            );
        }
    }
}
