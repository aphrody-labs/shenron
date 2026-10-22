// SPDX-License-Identifier: Apache-2.0
//! BAC (Battle Action Code) parser.
//!
//! A `.bac` file holds the action timelines of a character: each entry is one action (move,
//! reaction, movement) made of typed blocks of fixed-size records that start at a frame and
//! last a number of frames.
//!
//! Layout (little-endian): `#BAC`, `u16 0xFFFE`, `u16`, `u32 entry_count`, `u32`,
//! `u32 entry_table`. Entry (16 bytes): `u32 flags` (bit 31: empty slot), `u16 block_count`,
//! `u16`, `u32 block_table`, `u32`. Block (16 bytes): `u16 type, u16 record_count, u32,
//! u32 records, u32`. Every record starts with `u16 start_frame, u16 duration, u16,
//! u16 character_flags`. Observed record sizes by type: animation 0 → 36, hitbox 1 → 64,
//! movement 2 → 36, invulnerability 3 → 12, motion adjust 4 → 12, opponent knockback 5 →
//! 16, transparency 6 → 16, bone link 7 → 12, effect 8 → 48, projectile 9 → 64, camera
//! 10 → 76, sound 11 → 16, targeting 12 → 12, part set 13 → 12, part invisibility 14 → 12,
//! animation modification 15 → 32, transformation 16 → 32, screen effect 17 → 32,
//! throw 18 → 32, physics part 19 → 16.

use crate::error::{ReError, Result};
use crate::formats::esk::{f32_at, u16_at, u32_at};
use serde::{Deserialize, Serialize};

pub const BAC_MAGIC: &[u8; 4] = b"#BAC";

/// Record sizes per block type; types beyond the table are not decoded.
pub const RECORD_SIZES: [usize; 20] =
    [36, 64, 36, 12, 12, 16, 16, 12, 48, 64, 76, 16, 12, 12, 12, 32, 32, 32, 32, 16];

/// A hitbox record (block type 1).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacHitbox {
    pub start_frame: u16,
    pub end_frame: u16,
    pub damage: u32,
    pub bdm_entry_id: u16,
    /// Hitbox flags as stored.
    pub knockback_type: u16,
    pub damage_when_blocked: u16,
    pub position: [f32; 3],
    pub size: f32,
    pub min_bounds: [f32; 3],
    pub max_bounds: [f32; 3],
}

/// An animation record (block type 0): which EAN plays and how.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacAnimation {
    pub start_frame: u16,
    pub duration: u16,
    /// Source animation set: 0 common (`CMN.ean`), 5 the character's own `.ean`, others
    /// face, tail or skill sets.
    pub ean_type: u16,
    pub ean_index: u16,
    pub flags: u16,
    pub frame_start: u16,
    /// `u16::MAX` plays to the animation's end.
    pub frame_end: u16,
    pub loop_start: u16,
    pub time_scale: f32,
    pub blend_in: f32,
    pub blend_out: f32,
}

/// One typed block of an action and its record count.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct BacBlock {
    pub kind: u16,
    pub records: u16,
}

/// One action timeline (`move_id` is the entry slot).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacMove {
    pub move_id: u32,
    pub total_frames: u16,
    pub startup_frames: u16,
    pub recovery_frames: u16,
    pub hitboxes: Vec<BacHitbox>,
    #[serde(default)]
    pub animations: Vec<BacAnimation>,
    #[serde(default)]
    pub blocks: Vec<BacBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BacFile {
    pub moves: Vec<BacMove>,
}

fn record_end(buffer: &[u8], at: usize) -> Result<u16> {
    Ok(u16_at(buffer, at)?.saturating_add(u16_at(buffer, at + 2)?))
}

fn vec3(buffer: &[u8], at: usize) -> Result<[f32; 3]> {
    Ok([f32_at(buffer, at)?, f32_at(buffer, at + 4)?, f32_at(buffer, at + 8)?])
}

impl BacFile {
    pub fn parse(buffer: &[u8]) -> Result<Self> {
        if buffer.len() < 0x14 {
            return Err(ReError::BufferTooSmall { required: 0x14, available: buffer.len() });
        }
        if &buffer[0..4] != BAC_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: BAC_MAGIC.to_vec(),
                found: buffer[0..4].to_vec(),
            });
        }
        let count = u32_at(buffer, 8)? as usize;
        let table = u32_at(buffer, 0x10)? as usize;
        if count > 100_000 {
            return Err(ReError::ParseError {
                context: "bac",
                details: format!("{count} entries"),
            });
        }
        let mut moves = Vec::new();
        for index in 0..count {
            let entry = table + index * 16;
            let flags = u32_at(buffer, entry)?;
            let block_count = u16_at(buffer, entry + 4)? as usize;
            let blocks_at = u32_at(buffer, entry + 8)? as usize;
            if flags & 0x8000_0000 != 0 || block_count == 0 || blocks_at == 0 {
                continue;
            }
            let mut action = BacMove {
                move_id: index as u32,
                total_frames: 0,
                startup_frames: 0,
                recovery_frames: 0,
                hitboxes: Vec::new(),
                animations: Vec::new(),
                blocks: Vec::with_capacity(block_count),
            };
            for b in 0..block_count {
                let block = blocks_at + b * 16;
                let kind = u16_at(buffer, block)?;
                let records = u16_at(buffer, block + 2)?;
                let records_at = u32_at(buffer, block + 8)? as usize;
                action.blocks.push(BacBlock { kind, records });
                let Some(&size) = RECORD_SIZES.get(kind as usize) else { continue };
                if records_at == 0 {
                    continue;
                }
                for r in 0..records as usize {
                    let at = records_at + r * size;
                    if at + size > buffer.len() {
                        return Err(ReError::BufferTooSmall {
                            required: at + size,
                            available: buffer.len(),
                        });
                    }
                    let end = record_end(buffer, at)?;
                    // 0xFF-long records span the whole action; they do not set its length.
                    if u16_at(buffer, at + 2)? < 0xFF {
                        action.total_frames = action.total_frames.max(end);
                    }
                    match kind {
                        0 => action.animations.push(BacAnimation {
                            start_frame: u16_at(buffer, at)?,
                            duration: u16_at(buffer, at + 2)?,
                            ean_type: u16_at(buffer, at + 8)?,
                            ean_index: u16_at(buffer, at + 10)?,
                            flags: u16_at(buffer, at + 12)?,
                            frame_start: u16_at(buffer, at + 16)?,
                            frame_end: u16_at(buffer, at + 18)?,
                            loop_start: u16_at(buffer, at + 20)?,
                            time_scale: f32_at(buffer, at + 24)?,
                            blend_in: f32_at(buffer, at + 28)?,
                            blend_out: f32_at(buffer, at + 32)?,
                        }),
                        1 => action.hitboxes.push(BacHitbox {
                            start_frame: u16_at(buffer, at)?,
                            end_frame: end,
                            bdm_entry_id: u16_at(buffer, at + 8)?,
                            knockback_type: u16_at(buffer, at + 10)?,
                            damage: u16_at(buffer, at + 12)? as u32,
                            damage_when_blocked: u16_at(buffer, at + 14)?,
                            position: vec3(buffer, at + 24)?,
                            size: f32_at(buffer, at + 36)?,
                            min_bounds: vec3(buffer, at + 40)?,
                            max_bounds: vec3(buffer, at + 52)?,
                        }),
                        _ => {},
                    }
                }
            }
            if let (Some(first), Some(last)) = (
                action.hitboxes.iter().map(|h| h.start_frame).min(),
                action.hitboxes.iter().map(|h| h.end_frame).max(),
            ) {
                action.startup_frames = first;
                action.recovery_frames = action.total_frames.saturating_sub(last);
            }
            moves.push(action);
        }
        Ok(Self { moves })
    }

    pub fn find(&self, move_id: u32) -> Option<&BacMove> {
        self.moves.iter().find(|m| m.move_id == move_id)
    }
}

/// Writes a `.bac` with one action holding one animation and one hitbox, for tests and tools.
pub fn encode_bac(ean_index: u16, hitbox_start: u16, hitbox_duration: u16, damage: u16) -> Vec<u8> {
    let mut out = vec![0u8; 0x20];
    out[0..4].copy_from_slice(BAC_MAGIC);
    out[4..6].copy_from_slice(&0xFFFEu16.to_le_bytes());
    out[8..12].copy_from_slice(&2u32.to_le_bytes());
    out[0x10..0x14].copy_from_slice(&0x20u32.to_le_bytes());
    // Entry 0: empty slot; entry 1: two blocks.
    let blocks = 0x40u32;
    let mut entries = vec![0u8; 32];
    entries[0..4].copy_from_slice(&0x8000_0000u32.to_le_bytes());
    entries[20..22].copy_from_slice(&2u16.to_le_bytes());
    entries[24..28].copy_from_slice(&blocks.to_le_bytes());
    out.extend(entries);
    let animation_at = 0x60u32;
    let hitbox_at = animation_at + 36;
    let mut table = vec![0u8; 32];
    table[0..2].copy_from_slice(&0u16.to_le_bytes());
    table[2..4].copy_from_slice(&1u16.to_le_bytes());
    table[8..12].copy_from_slice(&animation_at.to_le_bytes());
    table[16..18].copy_from_slice(&1u16.to_le_bytes());
    table[18..20].copy_from_slice(&1u16.to_le_bytes());
    table[24..28].copy_from_slice(&hitbox_at.to_le_bytes());
    out.extend(table);
    let mut animation = vec![0u8; 36];
    animation[2..4].copy_from_slice(&30u16.to_le_bytes());
    animation[8..10].copy_from_slice(&5u16.to_le_bytes());
    animation[10..12].copy_from_slice(&ean_index.to_le_bytes());
    animation[18..20].copy_from_slice(&u16::MAX.to_le_bytes());
    animation[24..28].copy_from_slice(&1f32.to_le_bytes());
    out.extend(animation);
    let mut hitbox = vec![0u8; 64];
    hitbox[0..2].copy_from_slice(&hitbox_start.to_le_bytes());
    hitbox[2..4].copy_from_slice(&hitbox_duration.to_le_bytes());
    hitbox[8..10].copy_from_slice(&7u16.to_le_bytes());
    hitbox[12..14].copy_from_slice(&damage.to_le_bytes());
    hitbox[36..40].copy_from_slice(&0.3f32.to_le_bytes());
    out.extend(hitbox);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_animation_and_hitbox_timelines() {
        let bac = BacFile::parse(&encode_bac(4, 8, 4, 250)).unwrap();
        assert_eq!(bac.moves.len(), 1, "empty slots are skipped");
        let action = bac.find(1).unwrap();
        assert_eq!(action.blocks.len(), 2);
        assert_eq!(action.animations[0].ean_type, 5);
        assert_eq!(action.animations[0].ean_index, 4);
        assert_eq!(action.animations[0].frame_end, u16::MAX);
        let hit = &action.hitboxes[0];
        assert_eq!((hit.start_frame, hit.end_frame, hit.damage, hit.bdm_entry_id), (8, 12, 250, 7));
        assert_eq!(hit.size, 0.3);
        assert_eq!(action.total_frames, 30);
        assert_eq!((action.startup_frames, action.recovery_frames), (8, 18));
    }

    #[test]
    fn test_invalid_magic() {
        let mut bytes = encode_bac(0, 0, 1, 1);
        bytes[0] = b'X';
        assert!(BacFile::parse(&bytes).is_err());
    }

    #[test]
    fn rejects_truncated_records() {
        let mut bytes = encode_bac(0, 0, 1, 1);
        bytes.truncate(bytes.len() - 10);
        assert!(BacFile::parse(&bytes).is_err());
    }

    /// `SHENRON_REAL_BAC=<path to a game .bac>` checks a real action file.
    #[test]
    fn parses_real_actions_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_BAC") else { return };
        let bac = BacFile::parse(&std::fs::read(path).unwrap()).expect("parse real BAC");
        assert!(bac.moves.len() > 10);
        assert!(bac.moves.iter().any(|m| !m.animations.is_empty()));
        assert!(bac.moves.iter().any(|m| !m.hitboxes.is_empty()));
        for m in &bac.moves {
            for a in &m.animations {
                assert!(a.time_scale.is_finite() && a.blend_out.is_finite());
            }
        }
    }
}
