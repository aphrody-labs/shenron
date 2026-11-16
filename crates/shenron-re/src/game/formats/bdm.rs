// SPDX-License-Identifier: Apache-2.0
//! BDM (Battle Damage Matrix) parser.
//!
//! A `.bdm` file lists the damage reactions BAC hitboxes refer to. Layout (little-endian):
//! `#BDM`, `u16 0xFFFE`, `u16`, `u32 entry_count`, `u32 entry_table`. In the current XV2
//! layout each entry is 1284 bytes: `u32 id` then ten 128-byte variants, one per hitbox
//! state. Variant field offsets follow LazyBone's XV2-Tools (`Xv2CoreLib/BDM/Parser.cs`,
//! MIT): damage type +0, amount +4, ACB type/cue +12/+14, pushback strength/acceleration
//! +40/+44, user/victim stun +48/+50, knockback duration/recovery/ground impact +52/+54/+56,
//! knockback strength xyz +60, drag +72, gravity time +78, victim invincibility +80,
//! stumble +100, camera shake type/time +104/+106, user/victim animation time +116/+118 and
//! speed +120/+124. Older 1084- and 756-byte layouts are rejected.

use crate::game::error::{ReError, Result};
use crate::game::formats::esk::{f32_at, u16_at, u32_at};
use serde::{Deserialize, Serialize};

pub const BDM_MAGIC: &[u8; 4] = b"#BDM";

const ENTRY_SIZE: usize = 1284;
const VARIANT_SIZE: usize = 128;
const VARIANTS: usize = 10;

/// Victim reaction of a damage variant, as numbered by the game.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DamageType {
    None,
    Block,
    GuardBreak,
    Standard,
    Heavy,
    Knockback,
    Grab,
    Electric,
    Dazed,
    Paralysis,
    Freeze,
    StaminaBreak,
    Other(u16),
}

impl From<u16> for DamageType {
    fn from(val: u16) -> Self {
        match val {
            0 => Self::None,
            1 => Self::Block,
            2 => Self::GuardBreak,
            3 => Self::Standard,
            4 => Self::Heavy,
            5..=9 | 13 | 25..=28 => Self::Knockback,
            10 => Self::Grab,
            14 => Self::Electric,
            15 => Self::Dazed,
            16 => Self::Paralysis,
            17 => Self::Freeze,
            20 | 21 => Self::StaminaBreak,
            other => Self::Other(other),
        }
    }
}

/// One damage variant (128 bytes).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BdmVariant {
    pub damage_type: u16,
    pub damage_amount: u16,
    pub acb_type: u16,
    pub cue_id: i16,
    pub pushback_strength: f32,
    pub pushback_acceleration: f32,
    pub user_stun: u16,
    pub victim_stun: u16,
    pub knockback_duration: u16,
    pub knockback_recovery: u16,
    pub knockback_ground_impact: u16,
    pub knockback_strength: [f32; 3],
    pub knockback_drag_y: f32,
    pub knockback_gravity_time: u16,
    pub victim_invincibility: i16,
    pub stumble_type: u16,
    pub camera_shake_type: i8,
    pub camera_shake_time: u16,
    pub user_animation_time: u16,
    pub victim_animation_time: u16,
    pub user_animation_speed: f32,
    pub victim_animation_speed: f32,
}

/// A damage entry. The flat fields summarise variant 0; XV2 stores no stamina damage nor
/// blockstun, which stay 0.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BdmEntry {
    pub id: u32,
    pub damage_type: DamageType,
    pub base_damage: u32,
    pub stamina_damage: u16,
    pub hitstun_frames: u16,
    pub blockstun_frames: u16,
    pub knockback_type: u16,
    pub knockback_strength: f32,
    pub pushback_distance: f32,
    pub camera_shake: u16,
    #[serde(default)]
    pub variants: Vec<BdmVariant>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BdmFile {
    pub entries: Vec<BdmEntry>,
}

fn variant(buffer: &[u8], at: usize) -> Result<BdmVariant> {
    let u = |o: usize| u16_at(buffer, at + o);
    let f = |o: usize| f32_at(buffer, at + o);
    Ok(BdmVariant {
        damage_type: u(0)?,
        damage_amount: u(4)?,
        acb_type: u(12)?,
        cue_id: u(14)? as i16,
        pushback_strength: f(40)?,
        pushback_acceleration: f(44)?,
        user_stun: u(48)?,
        victim_stun: u(50)?,
        knockback_duration: u(52)?,
        knockback_recovery: u(54)?,
        knockback_ground_impact: u(56)?,
        knockback_strength: [f(60)?, f(64)?, f(68)?],
        knockback_drag_y: f(72)?,
        knockback_gravity_time: u(78)?,
        victim_invincibility: u(80)? as i16,
        stumble_type: u(100)?,
        camera_shake_type: buffer[at + 104] as i8,
        camera_shake_time: u(106)?,
        user_animation_time: u(116)?,
        victim_animation_time: u(118)?,
        user_animation_speed: f(120)?,
        victim_animation_speed: f(124)?,
    })
}

impl BdmFile {
    /// Parses a BDM binary file.
    pub fn parse(buffer: &[u8]) -> Result<Self> {
        if buffer.len() < 16 {
            return Err(ReError::BufferTooSmall { required: 16, available: buffer.len() });
        }
        if &buffer[0..4] != BDM_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: BDM_MAGIC.to_vec(),
                found: buffer[0..4].to_vec(),
            });
        }
        let count = u32_at(buffer, 8)? as usize;
        let table = u32_at(buffer, 12)? as usize;
        if count == 0 {
            return Ok(Self { entries: Vec::new() });
        }
        let size = buffer.len().saturating_sub(table) / count;
        if size != ENTRY_SIZE {
            return Err(ReError::ParseError {
                context: "bdm",
                details: format!("unsupported entry size {size} (expected {ENTRY_SIZE})"),
            });
        }
        let mut entries = Vec::with_capacity(count);
        for i in 0..count {
            let at = table + i * ENTRY_SIZE;
            let variants = (0..VARIANTS)
                .map(|v| variant(buffer, at + 4 + v * VARIANT_SIZE))
                .collect::<Result<Vec<_>>>()?;
            let first = &variants[0];
            let k = first.knockback_strength;
            entries.push(BdmEntry {
                id: u32_at(buffer, at)?,
                damage_type: DamageType::from(first.damage_type),
                base_damage: first.damage_amount as u32,
                stamina_damage: 0,
                hitstun_frames: first.victim_stun,
                blockstun_frames: 0,
                knockback_type: first.stumble_type,
                knockback_strength: (k[0] * k[0] + k[1] * k[1] + k[2] * k[2]).sqrt(),
                pushback_distance: first.pushback_strength,
                camera_shake: first.camera_shake_time,
                variants,
            });
        }
        Ok(Self { entries })
    }

    pub fn find(&self, id: u32) -> Option<&BdmEntry> {
        self.entries.iter().find(|e| e.id == id)
    }
}

/// Writes a BDM whose entries carry `(id, damage_type, amount, victim_stun)` in every
/// variant, for tests and tools.
pub fn encode_bdm(entries: &[(u32, u16, u16, u16)]) -> Vec<u8> {
    let mut out = vec![0u8; 16];
    out[0..4].copy_from_slice(BDM_MAGIC);
    out[4..6].copy_from_slice(&0xFFFEu16.to_le_bytes());
    out[8..12].copy_from_slice(&(entries.len() as u32).to_le_bytes());
    out[12..16].copy_from_slice(&16u32.to_le_bytes());
    for (id, kind, amount, stun) in entries {
        let mut entry = vec![0u8; ENTRY_SIZE];
        entry[0..4].copy_from_slice(&id.to_le_bytes());
        for v in 0..VARIANTS {
            let at = 4 + v * VARIANT_SIZE;
            entry[at..at + 2].copy_from_slice(&kind.to_le_bytes());
            entry[at + 4..at + 6].copy_from_slice(&amount.to_le_bytes());
            entry[at + 40..at + 44].copy_from_slice(&0.2f32.to_le_bytes());
            entry[at + 50..at + 52].copy_from_slice(&stun.to_le_bytes());
            entry[at + 120..at + 124].copy_from_slice(&1f32.to_le_bytes());
        }
        out.extend(entry);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_entries_and_variants() {
        let bdm = BdmFile::parse(&encode_bdm(&[(0, 3, 100, 30), (5, 8, 250, 42)])).unwrap();
        assert_eq!(bdm.entries.len(), 2);
        let e = bdm.find(5).unwrap();
        assert_eq!(e.variants.len(), 10);
        assert_eq!(e.damage_type, DamageType::Knockback);
        assert_eq!((e.base_damage, e.hitstun_frames), (250, 42));
        assert_eq!(e.pushback_distance, 0.2);
        assert_eq!(bdm.find(0).unwrap().damage_type, DamageType::Standard);
    }

    #[test]
    fn test_invalid_magic() {
        let mut bytes = encode_bdm(&[(0, 3, 1, 1)]);
        bytes[0] = b'X';
        assert!(BdmFile::parse(&bytes).is_err());
    }

    #[test]
    fn rejects_other_layouts() {
        let mut bytes = encode_bdm(&[(0, 3, 1, 1)]);
        bytes.truncate(16 + 1084);
        assert!(BdmFile::parse(&bytes).is_err());
    }

    /// `SHENRON_REAL_BDM=<path to a game .bdm>` checks a real damage file.
    #[test]
    fn parses_real_damage_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_BDM") else { return };
        let bdm = BdmFile::parse(&std::fs::read(path).unwrap()).expect("parse real BDM");
        assert!(!bdm.entries.is_empty());
        for e in &bdm.entries {
            assert_eq!(e.variants.len(), 10);
            for v in &e.variants {
                assert!(v.pushback_strength.is_finite() && v.user_animation_speed.is_finite());
            }
        }
    }
}
