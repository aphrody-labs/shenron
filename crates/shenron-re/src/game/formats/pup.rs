// SPDX-License-Identifier: Apache-2.0
//! PUP (Power-Up Parameters) binary format parser.
//!
//! `data/system/powerup_parameter.pup` lists the game's power-up/transformation stat
//! multiplier presets. Layout (little-endian): `#PUP`, `u16 0xFFFE`, `u16 header_size`
//! (`16`), `u32 entry_count`, `u32 reserved`. Entries start right at `header_size` and are
//! 152 bytes each: `i32 id`, three `i32` references (`CMN_Effect_ID`, two talisman ids,
//! `-1` when unused), then 34 `f32` stat fields. Field names and offsets are cross-checked
//! against LazyBone's MIT `Xv2CoreLib/PUP/PUP_File.cs` (XV2-Tools) and verified against the
//! real file: count (8), stride (152) and a plausible `Duration=800` both match exactly.

use crate::game::error::{ReError, Result};
use crate::game::formats::esk::{f32_at, u32_at};
use serde::{Deserialize, Serialize};

pub const PUP_MAGIC: &[u8; 4] = b"#PUP";

const ENTRY_SIZE: usize = 152;

/// One power-up/transformation preset. Stat fields are multipliers or additive bonuses as
/// the game applies them (e.g. `atk_damage` subtracts from damage taken); fields the
/// reference leaves unnamed keep their byte offset (`f_104`..`f_148`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PupEntry {
    pub id: i32,
    pub cmn_effect_id: i32,
    pub talisman_id_1: i32,
    pub talisman_id_2: i32,
    pub health: f32,
    pub f_20: f32,
    pub ki: f32,
    pub ki_recovery: f32,
    pub stamina: f32,
    pub stamina_recovery: f32,
    pub enemy_stamina_eraser: f32,
    pub stamina_eraser: f32,
    pub f_48: f32,
    pub attack: f32,
    pub ki_blast: f32,
    pub strike: f32,
    pub blast: f32,
    pub attack_damage: f32,
    pub ki_blast_damage: f32,
    pub strike_damage: f32,
    pub blast_damage: f32,
    pub ground_speed: f32,
    pub air_speed: f32,
    pub boosting_speed: f32,
    pub dash_speed: f32,
    pub duration: f32,
    pub f_104: f32,
    pub f_108: f32,
    pub f_112: f32,
    pub f_116: f32,
    pub f_120: f32,
    pub f_124: f32,
    pub f_128: f32,
    pub f_132: f32,
    pub f_136: f32,
    pub f_140: f32,
    pub f_144: f32,
    pub f_148: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PupFile {
    pub entries: Vec<PupEntry>,
}

fn i32_at(buffer: &[u8], offset: usize) -> Result<i32> {
    u32_at(buffer, offset).map(|v| v as i32)
}

impl PupFile {
    pub fn parse(buffer: &[u8]) -> Result<Self> {
        if buffer.len() < 16 {
            return Err(ReError::BufferTooSmall { required: 16, available: buffer.len() });
        }
        if &buffer[0..4] != PUP_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: PUP_MAGIC.to_vec(),
                found: buffer[0..4].to_vec(),
            });
        }
        let count = u32_at(buffer, 8)? as usize;
        if count > 100_000 {
            return Err(ReError::ParseError {
                context: "pup",
                details: format!("{count} entries"),
            });
        }
        let mut entries = Vec::with_capacity(count);
        for i in 0..count {
            let at = 16 + i * ENTRY_SIZE;
            if at + ENTRY_SIZE > buffer.len() {
                return Err(ReError::BufferTooSmall {
                    required: at + ENTRY_SIZE,
                    available: buffer.len(),
                });
            }
            let f = |o: usize| f32_at(buffer, at + o);
            entries.push(PupEntry {
                id: i32_at(buffer, at)?,
                cmn_effect_id: i32_at(buffer, at + 4)?,
                talisman_id_1: i32_at(buffer, at + 8)?,
                talisman_id_2: i32_at(buffer, at + 12)?,
                health: f(16)?,
                f_20: f(20)?,
                ki: f(24)?,
                ki_recovery: f(28)?,
                stamina: f(32)?,
                stamina_recovery: f(36)?,
                enemy_stamina_eraser: f(40)?,
                stamina_eraser: f(44)?,
                f_48: f(48)?,
                attack: f(52)?,
                ki_blast: f(56)?,
                strike: f(60)?,
                blast: f(64)?,
                attack_damage: f(68)?,
                ki_blast_damage: f(72)?,
                strike_damage: f(76)?,
                blast_damage: f(80)?,
                ground_speed: f(84)?,
                air_speed: f(88)?,
                boosting_speed: f(92)?,
                dash_speed: f(96)?,
                duration: f(100)?,
                f_104: f(104)?,
                f_108: f(108)?,
                f_112: f(112)?,
                f_116: f(116)?,
                f_120: f(120)?,
                f_124: f(124)?,
                f_128: f(128)?,
                f_132: f(132)?,
                f_136: f(136)?,
                f_140: f(140)?,
                f_144: f(144)?,
                f_148: f(148)?,
            });
        }
        Ok(Self { entries })
    }

    pub fn find(&self, id: i32) -> Option<&PupEntry> {
        self.entries.iter().find(|e| e.id == id)
    }
}

/// Writes a `.pup` file of `(id, health, duration)` presets, the rest zeroed, for tests.
pub fn encode_pup(entries: &[(i32, f32, f32)]) -> Vec<u8> {
    let mut out = vec![0u8; 16];
    out[0..4].copy_from_slice(PUP_MAGIC);
    out[4..6].copy_from_slice(&0xFFFEu16.to_le_bytes());
    out[6..8].copy_from_slice(&16u16.to_le_bytes());
    out[8..12].copy_from_slice(&(entries.len() as u32).to_le_bytes());
    for (id, health, duration) in entries {
        let mut entry = vec![0u8; ENTRY_SIZE];
        entry[0..4].copy_from_slice(&id.to_le_bytes());
        entry[4..16].copy_from_slice(&(-1i32).to_le_bytes().repeat(3));
        entry[16..20].copy_from_slice(&health.to_le_bytes());
        entry[100..104].copy_from_slice(&duration.to_le_bytes());
        out.extend(entry);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_entries_at_the_real_152_byte_stride() {
        let pup = PupFile::parse(&encode_pup(&[(1, 0.0, 800.0), (2, 1.5, 300.0)])).unwrap();
        assert_eq!(pup.entries.len(), 2);
        let e = pup.find(2).unwrap();
        assert_eq!((e.health, e.duration), (1.5, 300.0));
        assert_eq!(e.cmn_effect_id, -1);
    }

    #[test]
    fn test_invalid_magic() {
        let mut bytes = encode_pup(&[(1, 0.0, 0.0)]);
        bytes[0] = b'X';
        assert!(PupFile::parse(&bytes).is_err());
    }

    #[test]
    fn rejects_truncated_table() {
        let mut bytes = encode_pup(&[(1, 0.0, 0.0), (2, 0.0, 0.0)]);
        bytes.truncate(bytes.len() - 10);
        assert!(PupFile::parse(&bytes).is_err());
    }

    /// `SHENRON_REAL_PUP=<path to powerup_parameter.pup>` checks the real 77-entry file.
    #[test]
    fn parses_real_powerups_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_PUP") else { return };
        let pup = PupFile::parse(&std::fs::read(path).unwrap()).expect("parse real PUP");
        assert_eq!(pup.entries.len(), 77);
        assert!(pup.entries.iter().all(|e| e.duration.is_finite()));
        // Entry 1 (first real record): duration 800, matching the cross-checked hex trace.
        assert_eq!(pup.find(1).unwrap().duration, 800.0);
    }
}
