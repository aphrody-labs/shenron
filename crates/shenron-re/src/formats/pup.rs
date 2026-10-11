// SPDX-License-Identifier: Apache-2.0
//! PUP (Power-Up Parameters) binary format parser.
//!
//! Stores exact transformation and power-up stat multipliers:
//! Attack, Ki Blast, Strike, Defense, Movement Speeds, and Ki/Stamina drain rates.

use serde::{Deserialize, Serialize};
use crate::error::{ReError, Result};

pub const PUP_MAGIC: &[u8; 4] = b"#PUP";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PupEntry {
    pub id: u32,
    pub basic_attack_mult: f32,
    pub basic_ki_mult: f32,
    pub strike_mult: f32,
    pub ki_blast_mult: f32,
    pub damage_taken_mult: f32,
    pub speed_ground_mult: f32,
    pub speed_air_mult: f32,
    pub speed_boost_mult: f32,
    pub ki_drain_rate: f32,
    pub stamina_drain_rate: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PupFile {
    pub entries: Vec<PupEntry>,
}

impl PupFile {
    pub fn parse(buffer: &[u8]) -> Result<Self> {
        if buffer.len() < 16 {
            return Err(ReError::BufferTooSmall {
                required: 16,
                available: buffer.len(),
            });
        }

        if &buffer[0..4] != PUP_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: PUP_MAGIC.to_vec(),
                found: buffer[0..4].to_vec(),
            });
        }

        let count = u32::from_le_bytes(buffer[8..12].try_into().unwrap()) as usize;
        let offset = u32::from_le_bytes(buffer[12..16].try_into().unwrap()) as usize;

        let entry_size = 64; // Standard PUP entry byte stride
        let mut entries = Vec::with_capacity(count);

        for i in 0..count {
            let start = offset + (i * entry_size);
            if start + entry_size > buffer.len() {
                break;
            }
            let slice = &buffer[start..start + entry_size];

            let id = u32::from_le_bytes(slice[0..4].try_into().unwrap());
            let basic_attack_mult = f32::from_le_bytes(slice[4..8].try_into().unwrap());
            let basic_ki_mult = f32::from_le_bytes(slice[8..12].try_into().unwrap());
            let strike_mult = f32::from_le_bytes(slice[12..16].try_into().unwrap());
            let ki_blast_mult = f32::from_le_bytes(slice[16..20].try_into().unwrap());
            let damage_taken_mult = f32::from_le_bytes(slice[20..24].try_into().unwrap());
            let speed_ground_mult = f32::from_le_bytes(slice[24..28].try_into().unwrap());
            let speed_air_mult = f32::from_le_bytes(slice[28..32].try_into().unwrap());
            let speed_boost_mult = f32::from_le_bytes(slice[32..36].try_into().unwrap());
            let ki_drain_rate = f32::from_le_bytes(slice[36..40].try_into().unwrap());
            let stamina_drain_rate = f32::from_le_bytes(slice[40..44].try_into().unwrap());

            entries.push(PupEntry {
                id,
                basic_attack_mult,
                basic_ki_mult,
                strike_mult,
                ki_blast_mult,
                damage_taken_mult,
                speed_ground_mult,
                speed_air_mult,
                speed_boost_mult,
                ki_drain_rate,
                stamina_drain_rate,
            });
        }

        Ok(Self { entries })
    }
}
