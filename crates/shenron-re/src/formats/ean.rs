// SPDX-License-Identifier: Apache-2.0
//! Dragon Ball Xenoverse 2 (DBXV2) animation (`.ean`) parser and sampler.
//!
//! Header (little-endian): `#EAN`, `u16 0xFFFE`, `u16 header_size`, `u32 version`, `u32`,
//! `u8 is_camera`, `u8`, `u16 animation_count`, `u32 skeleton`, `u32 animation_table`,
//! `u32 name_table`. The skeleton block has the `.esk` layout. Each animation:
//! `u16, u8 index_size (0: u8, 1: u16), u8 float_size (1: f16, 2: f32), u32 frame_count,
//! u32 node_count, u32 node_table` (offsets relative to the animation). Each node:
//! `u16 bone, u16 component_count, u32 component_table` (relative to the node). Each
//! component: `u8 kind (0 translation, 1 rotation, 2 scale), u8, u16, u32 keyframe_count,
//! u32 frames, u32 values` (relative to the component); values are four floats per key.

use crate::error::{ReError, Result};
use crate::formats::esk::{EskBone, c_string_at, f32_at, parse_skeleton, u16_at, u32_at};
use serde::{Deserialize, Serialize};

/// Signature magic for DBXV2 EAN animation files (`#EAN`).
pub const EAN_MAGIC: &[u8; 4] = b"#EAN";

/// The transform channel a component animates.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EanChannel {
    Translation,
    Rotation,
    Scale,
    Other(u8),
}

/// One animated channel: sorted key frames and four values per key.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EanComponent {
    pub channel: EanChannel,
    pub frames: Vec<u16>,
    pub values: Vec<[f32; 4]>,
}

/// Animated channels for one skeleton bone.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EanNode {
    pub bone_index: usize,
    pub components: Vec<EanComponent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EanAnimation {
    pub index: usize,
    pub name: String,
    pub frame_count: u32,
    pub nodes: Vec<EanNode>,
}

/// Parsed DBXV2 `.ean` file. Null animation slots are skipped; `index` keeps the slot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EanFile {
    pub is_camera: bool,
    pub skeleton: Vec<EskBone>,
    pub animations: Vec<EanAnimation>,
}

/// A bone's local pose: translation, rotation quaternion `[x, y, z, w]` and scale.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct LocalPose {
    pub translation: [f32; 3],
    pub rotation: [f32; 4],
    pub scale: [f32; 3],
}

/// IEEE 754 binary16 to f32.
pub(crate) fn f16_to_f32(bits: u16) -> f32 {
    let sign = if bits & 0x8000 != 0 { -1.0 } else { 1.0 };
    let exponent = (bits >> 10) & 0x1F;
    let mantissa = (bits & 0x3FF) as f32;
    sign * match exponent {
        0 => mantissa * 2f32.powi(-24),
        0x1F if mantissa == 0.0 => f32::INFINITY,
        0x1F => f32::NAN,
        e => (1.0 + mantissa / 1024.0) * 2f32.powi(e as i32 - 15),
    }
}

fn parse_component(
    buffer: &[u8],
    at: usize,
    wide_index: bool,
    float_size: u8,
) -> Result<EanComponent> {
    let channel = match buffer.get(at).copied() {
        Some(0) => EanChannel::Translation,
        Some(1) => EanChannel::Rotation,
        Some(2) => EanChannel::Scale,
        Some(k) => EanChannel::Other(k),
        None => return Err(ReError::BufferTooSmall { required: at + 1, available: buffer.len() }),
    };
    let count = u32_at(buffer, at + 4)? as usize;
    let frames_at = at + u32_at(buffer, at + 8)? as usize;
    let values_at = at + u32_at(buffer, at + 12)? as usize;
    if count > u16::MAX as usize + 1 {
        return Err(ReError::ParseError { context: "ean", details: format!("{count} keys") });
    }
    let mut frames = Vec::with_capacity(count);
    let mut values = Vec::with_capacity(count);
    for k in 0..count {
        frames.push(if wide_index {
            u16_at(buffer, frames_at + k * 2)?
        } else {
            *buffer.get(frames_at + k).ok_or(ReError::BufferTooSmall {
                required: frames_at + k + 1,
                available: buffer.len(),
            })? as u16
        });
        let mut value = [0.0; 4];
        for (c, slot) in value.iter_mut().enumerate() {
            *slot = match float_size {
                1 => f16_to_f32(u16_at(buffer, values_at + (k * 4 + c) * 2)?),
                2 => f32_at(buffer, values_at + (k * 4 + c) * 4)?,
                other => {
                    return Err(ReError::ParseError {
                        context: "ean",
                        details: format!("float size {other}"),
                    });
                },
            };
        }
        values.push(value);
    }
    Ok(EanComponent { channel, frames, values })
}

fn parse_animation(buffer: &[u8], at: usize, index: usize, name: String) -> Result<EanAnimation> {
    let wide_index = *buffer.get(at + 2).unwrap_or(&0) != 0;
    let float_size = *buffer.get(at + 3).unwrap_or(&0);
    let frame_count = u32_at(buffer, at + 4)?;
    let node_count = u32_at(buffer, at + 8)? as usize;
    let table = at + u32_at(buffer, at + 12)? as usize;
    let mut nodes = Vec::with_capacity(node_count.min(4096));
    for n in 0..node_count {
        let node = at + u32_at(buffer, table + n * 4)? as usize;
        let bone_index = u16_at(buffer, node)? as usize;
        let count = u16_at(buffer, node + 2)? as usize;
        let components_at = node + u32_at(buffer, node + 4)? as usize;
        let components = (0..count)
            .map(|c| {
                let offset = u32_at(buffer, components_at + c * 4)? as usize;
                parse_component(buffer, node + offset, wide_index, float_size)
            })
            .collect::<Result<_>>()?;
        nodes.push(EanNode { bone_index, components });
    }
    Ok(EanAnimation { index, name, frame_count, nodes })
}

impl EanFile {
    pub fn parse(buffer: &[u8]) -> Result<Self> {
        if buffer.len() < 0x20 {
            return Err(ReError::BufferTooSmall { required: 0x20, available: buffer.len() });
        }
        if &buffer[0..4] != EAN_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: EAN_MAGIC.to_vec(),
                found: buffer[0..4].to_vec(),
            });
        }
        let is_camera = buffer[0x10] == 1;
        let count = u16_at(buffer, 0x12)? as usize;
        let skeleton_at = u32_at(buffer, 0x14)? as usize;
        let table = u32_at(buffer, 0x18)? as usize;
        let names = u32_at(buffer, 0x1C)? as usize;
        let skeleton =
            if skeleton_at == 0 { Vec::new() } else { parse_skeleton(buffer, skeleton_at)? };
        let mut animations = Vec::with_capacity(count);
        for index in 0..count {
            let at = u32_at(buffer, table + index * 4)? as usize;
            if at == 0 {
                continue;
            }
            let name = if names == 0 {
                String::new()
            } else {
                c_string_at(buffer, u32_at(buffer, names + index * 4)? as usize)?
            };
            let animation = parse_animation(buffer, at, index, name)?;
            if let Some(node) = animation.nodes.iter().find(|n| n.bone_index >= skeleton.len())
                && !skeleton.is_empty()
            {
                return Err(ReError::ParseError {
                    context: "ean",
                    details: format!("{} animates bone {}", animation.name, node.bone_index),
                });
            }
            animations.push(animation);
        }
        Ok(Self { is_camera, skeleton, animations })
    }

    pub fn find(&self, name: &str) -> Option<&EanAnimation> {
        self.animations.iter().find(|a| a.name == name)
    }
}

fn lerp4(a: [f32; 4], b: [f32; 4], t: f32) -> [f32; 4] {
    std::array::from_fn(|i| a[i] + (b[i] - a[i]) * t)
}

fn nlerp(a: [f32; 4], mut b: [f32; 4], t: f32) -> [f32; 4] {
    if a.iter().zip(b).map(|(x, y)| x * y).sum::<f32>() < 0.0 {
        b = b.map(|v| -v);
    }
    let q = lerp4(a, b, t);
    let len = q.iter().map(|v| v * v).sum::<f32>().sqrt();
    if len > f32::EPSILON { q.map(|v| v / len) } else { [0.0, 0.0, 0.0, 1.0] }
}

impl EanComponent {
    /// Value at `frame` (fractional): held before the first and after the last key.
    pub fn sample(&self, frame: f32) -> Option<[f32; 4]> {
        let first = *self.values.first()?;
        let next = self.frames.partition_point(|&f| (f as f32) <= frame);
        if next == 0 {
            return Some(first);
        }
        if next >= self.frames.len() {
            return self.values.last().copied();
        }
        let (f0, f1) = (self.frames[next - 1] as f32, self.frames[next] as f32);
        let t = if f1 > f0 { (frame - f0) / (f1 - f0) } else { 0.0 };
        let (a, b) = (self.values[next - 1], self.values[next]);
        Some(if self.channel == EanChannel::Rotation { nlerp(a, b, t) } else { lerp4(a, b, t) })
    }
}

impl EanAnimation {
    /// Local pose of every bone at `frame`, starting from the skeleton's rest pose.
    pub fn sample(&self, skeleton: &[EskBone], frame: f32) -> Vec<LocalPose> {
        let mut pose: Vec<LocalPose> = skeleton
            .iter()
            .map(|b| LocalPose { translation: b.translation, rotation: b.rotation, scale: b.scale })
            .collect();
        for node in &self.nodes {
            let Some(local) = pose.get_mut(node.bone_index) else { continue };
            for component in &node.components {
                let Some(v) = component.sample(frame) else { continue };
                match component.channel {
                    EanChannel::Translation => local.translation = [v[0], v[1], v[2]],
                    EanChannel::Rotation => local.rotation = v,
                    EanChannel::Scale => local.scale = [v[0], v[1], v[2]],
                    EanChannel::Other(_) => {},
                }
            }
        }
        pose
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::formats::esk::encode_skeleton;

    fn component(kind: u8, frames: &[u8], values: &[[f32; 4]]) -> Vec<u8> {
        let mut out = vec![kind, 7, 0, 0];
        out.extend((frames.len() as u32).to_le_bytes());
        out.extend(16u32.to_le_bytes());
        let values_at = (16 + frames.len()).next_multiple_of(4);
        out.extend((values_at as u32).to_le_bytes());
        out.extend(frames);
        out.resize(values_at, 0);
        for v in values.iter().flatten() {
            out.extend(v.to_le_bytes());
        }
        out
    }

    fn sample_file() -> Vec<u8> {
        let skeleton = encode_skeleton(
            &[
                EskBone { name: "b_C_Base".into(), ..Default::default() },
                EskBone {
                    index: 1,
                    name: "b_C_Pelvis".into(),
                    parent_index: Some(0),
                    ..Default::default()
                },
            ],
            false,
        );
        let translation = component(0, &[0, 10], &[[0.0, 0.0, 0.0, 1.0], [0.0, 1.0, 0.0, 1.0]]);
        let rotation = component(
            1,
            &[0, 10],
            &[
                [0.0, 0.0, 0.0, 1.0],
                [0.0, 0.0, std::f32::consts::FRAC_1_SQRT_2, std::f32::consts::FRAC_1_SQRT_2],
            ],
        );
        // Animation: header(16) + node table(4) + node(8) + component table(8) + components.
        let mut anim = vec![0, 0, 0, 2];
        anim.extend(11u32.to_le_bytes());
        anim.extend(1u32.to_le_bytes());
        anim.extend(16u32.to_le_bytes());
        anim.extend(20u32.to_le_bytes());
        anim.extend(1u16.to_le_bytes());
        anim.extend(2u16.to_le_bytes());
        anim.extend(8u32.to_le_bytes());
        anim.extend(16u32.to_le_bytes());
        anim.extend((16 + translation.len() as u32).to_le_bytes());
        anim.extend(&translation);
        anim.extend(&rotation);

        let skeleton_at = 0x20;
        let table = skeleton_at + skeleton.len();
        let names = table + 8;
        let anim_at = (names + 8 + 8).next_multiple_of(16);
        let mut out = Vec::new();
        out.extend(EAN_MAGIC);
        out.extend(0xFFFEu16.to_le_bytes());
        out.extend(0x20u16.to_le_bytes());
        out.extend([0; 8]);
        out.extend([0, 4]);
        out.extend(2u16.to_le_bytes());
        for v in [skeleton_at, table, names] {
            out.extend((v as u32).to_le_bytes());
        }
        out.extend(&skeleton);
        out.extend((anim_at as u32).to_le_bytes());
        out.extend(0u32.to_le_bytes());
        out.extend(((names + 8) as u32).to_le_bytes());
        out.extend(0u32.to_le_bytes());
        out.extend(b"WALK\0");
        out.resize(anim_at, 0);
        out.extend(anim);
        out
    }

    #[test]
    fn parses_and_samples_animation() {
        let ean = EanFile::parse(&sample_file()).expect("parse EAN");
        assert_eq!(ean.skeleton.len(), 2);
        assert_eq!(ean.animations.len(), 1);
        let walk = ean.find("WALK").unwrap();
        assert_eq!(walk.frame_count, 11);
        let pose = walk.sample(&ean.skeleton, 5.0);
        assert!((pose[1].translation[1] - 0.5).abs() < 1e-6);
        let half = (std::f32::consts::FRAC_PI_8).sin();
        assert!((pose[1].rotation[2] - half).abs() < 1e-5);
        assert_eq!(pose[0].rotation, [0.0, 0.0, 0.0, 1.0]);
        assert_eq!(walk.sample(&ean.skeleton, 99.0)[1].translation, [0.0, 1.0, 0.0]);
    }

    #[test]
    fn decodes_half_floats() {
        assert_eq!(f16_to_f32(0x3C00), 1.0);
        assert_eq!(f16_to_f32(0xC000), -2.0);
        assert_eq!(f16_to_f32(0x3800), 0.5);
        assert_eq!(f16_to_f32(0), 0.0);
    }

    /// `SHENRON_REAL_EAN=<path to a game .ean>` checks a real animation set.
    #[test]
    fn parses_real_animations_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_EAN") else { return };
        let ean = EanFile::parse(&std::fs::read(path).unwrap()).expect("parse real EAN");
        assert!(!ean.animations.is_empty());
        let first = &ean.animations[0];
        let pose = first.sample(&ean.skeleton, first.frame_count as f32 / 2.0);
        for p in pose {
            let len = p.rotation.iter().map(|v| v * v).sum::<f32>().sqrt();
            assert!((len - 1.0).abs() < 0.02, "rotation not unit: {:?}", p.rotation);
        }
    }
}
