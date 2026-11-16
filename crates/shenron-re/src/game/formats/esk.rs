// SPDX-License-Identifier: Apache-2.0
//! Dragon Ball Xenoverse 2 (DBXV2) skeleton (`.esk`) parser.
//!
//! An `.esk` file stores one skeleton: the bone hierarchy, each bone's local rest transform
//! (translation, rotation quaternion, scale) and, when present, its absolute bind matrix.
//! The same skeleton block is embedded in `.ean` animation files.
//!
//! Layout, little-endian, offsets of the skeleton block relative to its own start:
//! `u16 bone_count, u16 flag, u32 hierarchy, u32 names, u32 local_transforms,
//! u32 absolute_matrices, u32 ik, u32 extra, u64 skeleton_id`.

use crate::game::error::{ReError, Result};
use serde::{Deserialize, Serialize};

/// Signature magic for DBXV2 ESK skeleton files (`#ESK`).
pub const ESK_MAGIC: &[u8; 4] = b"#ESK";

const IDENTITY: [[f32; 4]; 4] =
    [[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0], [0.0, 0.0, 1.0, 0.0], [0.0, 0.0, 0.0, 1.0]];

/// Individual bone in a character skeleton.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EskBone {
    pub index: usize,
    pub name: String,
    pub parent_index: Option<usize>,
    pub translation: [f32; 3],
    pub rotation: [f32; 4], // Quaternion [x, y, z, w]
    pub scale: [f32; 3],
    /// Absolute bind matrix as stored (row-major); identity when the file has none.
    pub inverse_bind_matrix: [[f32; 4]; 4],
}

impl Default for EskBone {
    fn default() -> Self {
        Self {
            index: 0,
            name: "root".into(),
            parent_index: None,
            translation: [0.0, 0.0, 0.0],
            rotation: [0.0, 0.0, 0.0, 1.0],
            scale: [1.0, 1.0, 1.0],
            inverse_bind_matrix: IDENTITY,
        }
    }
}

/// Parsed DBXV2 `.esk` Skeleton file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EskFile {
    pub name: String,
    pub bones: Vec<EskBone>,
}

pub(crate) fn u16_at(buffer: &[u8], offset: usize) -> Result<u16> {
    buffer
        .get(offset..offset + 2)
        .map(|b| u16::from_le_bytes([b[0], b[1]]))
        .ok_or(ReError::BufferTooSmall { required: offset + 2, available: buffer.len() })
}

pub(crate) fn u32_at(buffer: &[u8], offset: usize) -> Result<u32> {
    buffer
        .get(offset..offset + 4)
        .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
        .ok_or(ReError::BufferTooSmall { required: offset + 4, available: buffer.len() })
}

pub(crate) fn f32_at(buffer: &[u8], offset: usize) -> Result<f32> {
    u32_at(buffer, offset).map(f32::from_bits)
}

pub(crate) fn c_string_at(buffer: &[u8], offset: usize) -> Result<String> {
    let tail = buffer
        .get(offset..)
        .ok_or(ReError::BufferTooSmall { required: offset, available: buffer.len() })?;
    let end = tail.iter().position(|&b| b == 0).unwrap_or(tail.len());
    Ok(String::from_utf8_lossy(&tail[..end]).into_owned())
}

/// Parses a skeleton block starting at `base` (shared by `.esk` and `.ean`).
pub(crate) fn parse_skeleton(buffer: &[u8], base: usize) -> Result<Vec<EskBone>> {
    let count = u16_at(buffer, base)? as usize;
    let hierarchy = u32_at(buffer, base + 4)? as usize;
    let names = u32_at(buffer, base + 8)? as usize;
    let locals = u32_at(buffer, base + 12)? as usize;
    let absolutes = u32_at(buffer, base + 16)? as usize;
    if hierarchy == 0 || names == 0 {
        return Err(ReError::CorruptHeader("skeleton without hierarchy or names".into()));
    }
    let mut bones = Vec::with_capacity(count);
    for index in 0..count {
        let entry = base + hierarchy + index * 8;
        let parent = u16_at(buffer, entry)?;
        let name = c_string_at(buffer, base + u32_at(buffer, base + names + index * 4)? as usize)?;
        let mut bone = EskBone {
            index,
            name,
            parent_index: (parent != u16::MAX).then_some(parent as usize),
            ..Default::default()
        };
        if let Some(p) = bone.parent_index
            && p >= count
        {
            return Err(ReError::ParseError {
                context: "esk",
                details: format!("bone {index} has parent {p} out of {count}"),
            });
        }
        if locals != 0 {
            let t = base + locals + index * 48;
            let v = |k: usize| f32_at(buffer, t + k * 4);
            bone.translation = [v(0)?, v(1)?, v(2)?];
            bone.rotation = [v(4)?, v(5)?, v(6)?, v(7)?];
            bone.scale = [v(8)?, v(9)?, v(10)?];
        }
        if absolutes != 0 {
            let m = base + absolutes + index * 64;
            for (row, values) in bone.inverse_bind_matrix.iter_mut().enumerate() {
                for (col, value) in values.iter_mut().enumerate() {
                    *value = f32_at(buffer, m + (row * 4 + col) * 4)?;
                }
            }
        }
        bones.push(bone);
    }
    Ok(bones)
}

impl EskFile {
    /// Total bone count in the skeleton.
    pub fn len(&self) -> usize {
        self.bones.len()
    }

    /// Returns true if empty.
    pub fn is_empty(&self) -> bool {
        self.bones.is_empty()
    }

    /// Finds a bone by name.
    pub fn find_bone(&self, name: &str) -> Option<&EskBone> {
        self.bones.iter().find(|b| b.name == name)
    }

    /// Parses an ESK skeleton from binary data.
    pub fn parse(buffer: &[u8]) -> Result<Self> {
        if buffer.len() < 0x20 {
            return Err(ReError::BufferTooSmall { required: 0x20, available: buffer.len() });
        }
        if &buffer[0..4] != ESK_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: ESK_MAGIC.to_vec(),
                found: buffer[0..4].to_vec(),
            });
        }
        let skeleton = u32_at(buffer, 0x10)? as usize;
        Ok(Self { name: "DBXV2_Skeleton".into(), bones: parse_skeleton(buffer, skeleton)? })
    }
}

/// Builds a skeleton block (as found in `.esk` and `.ean`) from bones, for tests and tools.
pub fn encode_skeleton(bones: &[EskBone], with_absolutes: bool) -> Vec<u8> {
    let count = bones.len();
    let hierarchy = 36;
    let names = hierarchy + count * 8;
    let strings = names + count * 4;
    let string_bytes: usize = bones.iter().map(|b| b.name.len() + 1).sum();
    let locals = (strings + string_bytes).next_multiple_of(16);
    let absolutes = if with_absolutes { locals + count * 48 } else { 0 };
    let mut out = vec![0u8; locals + count * 48 + if with_absolutes { count * 64 } else { 0 }];
    let put = |out: &mut Vec<u8>, at: usize, bytes: &[u8]| {
        out[at..at + bytes.len()].copy_from_slice(bytes)
    };
    put(&mut out, 0, &(count as u16).to_le_bytes());
    put(&mut out, 2, &1u16.to_le_bytes());
    for (k, off) in [hierarchy, names, locals, absolutes].into_iter().enumerate() {
        put(&mut out, 4 + k * 4, &(off as u32).to_le_bytes());
    }
    let mut cursor = strings;
    for (i, bone) in bones.iter().enumerate() {
        let parent = bone.parent_index.map_or(u16::MAX, |p| p as u16);
        put(&mut out, hierarchy + i * 8, &parent.to_le_bytes());
        put(&mut out, hierarchy + i * 8 + 2, &u16::MAX.to_le_bytes());
        put(&mut out, hierarchy + i * 8 + 4, &u16::MAX.to_le_bytes());
        put(&mut out, names + i * 4, &(cursor as u32).to_le_bytes());
        put(&mut out, cursor, bone.name.as_bytes());
        cursor += bone.name.len() + 1;
        let t = bone.translation;
        let s = bone.scale;
        let values =
            [t[0], t[1], t[2], 1.0].into_iter().chain(bone.rotation).chain([s[0], s[1], s[2], 1.0]);
        for (k, v) in values.enumerate() {
            put(&mut out, locals + i * 48 + k * 4, &v.to_le_bytes());
        }
        if with_absolutes {
            for (k, v) in bone.inverse_bind_matrix.iter().flatten().enumerate() {
                put(&mut out, absolutes + i * 64 + k * 4, &v.to_le_bytes());
            }
        }
    }
    out
}

/// Builds a complete `.esk` file around [`encode_skeleton`].
pub fn encode_esk(bones: &[EskBone]) -> Vec<u8> {
    let mut out = Vec::with_capacity(0x20);
    out.extend_from_slice(ESK_MAGIC);
    out.extend_from_slice(&0xFFFEu16.to_le_bytes());
    out.extend_from_slice(&0x1Cu16.to_le_bytes());
    out.extend_from_slice(&[0; 8]);
    out.extend_from_slice(&0x20u32.to_le_bytes());
    out.resize(0x20, 0);
    out.extend(encode_skeleton(bones, true));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bones() -> Vec<EskBone> {
        vec![
            EskBone { name: "b_C_Base".into(), ..Default::default() },
            EskBone {
                index: 1,
                name: "b_C_Pelvis".into(),
                parent_index: Some(0),
                translation: [0.0, 0.875, 0.0],
                rotation: [0.0, 0.0, 0.70710677, 0.70710677],
                ..Default::default()
            },
        ]
    }

    #[test]
    fn parses_hierarchy_names_and_transforms() {
        let esk = EskFile::parse(&encode_esk(&bones())).expect("parse ESK");
        assert_eq!(esk.len(), 2);
        assert_eq!(esk.bones[0].parent_index, None);
        assert_eq!(esk.bones[1].parent_index, Some(0));
        assert_eq!(esk.find_bone("b_C_Pelvis").unwrap().translation, [0.0, 0.875, 0.0]);
        assert_eq!(esk.bones[1].rotation[3], 0.70710677);
    }

    #[test]
    fn rejects_out_of_range_parent() {
        let mut list = bones();
        list[1].parent_index = Some(9);
        assert!(EskFile::parse(&encode_esk(&list)).is_err());
    }

    /// `SHENRON_REAL_ESK=<path to a game .esk>` checks a real skeleton.
    #[test]
    fn parses_real_skeleton_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_ESK") else { return };
        let esk = EskFile::parse(&std::fs::read(path).unwrap()).expect("parse real ESK");
        assert!(esk.len() > 1);
        assert_eq!(esk.bones[0].parent_index, None);
        assert!(esk.bones.iter().all(|b| !b.name.is_empty()));
    }
}
