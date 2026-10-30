// SPDX-License-Identifier: Apache-2.0
//! Dragon Ball Xenoverse 2 (DBXV2) model (`.emd`) parser.
//!
//! Layout (little-endian). Header: `#EMD`, `u16 0xFFFE`, `u16 header_size`, `u32 version`,
//! `u32`, `u16`, `u16 model_count`, `u32 model_table`, `u32 model_names`. Model:
//! `u16, u16 mesh_count, u32 mesh_table` (relative to the model). Mesh: 48-byte AABB
//! (center, min, max as vec4), `u32 name, u16, u16 submesh_count, u32 submesh_table`
//! (relative to the mesh). Submesh: 48-byte AABB, `u32 vertex_flags, u32 vertex_size,
//! u32 vertex_count, u32 vertices, u32 name, u8, u8 sampler_count, u16 triangle_list_count,
//! u32 samplers, u32 triangle_lists` (relative to the submesh). Triangle list:
//! `u32 index_count, u32 bone_count, u32 indices, u32 bone_names` (relative to the list).
//! Samplers are 12 bytes: `u8, u8 texture_index, u8 addressing, u8 filtering, f32 scale_u,
//! f32 scale_v`.
//!
//! Vertex attributes, in order, according to `vertex_flags`: position (3 × f32), normal,
//! uv, uv2, tangent, color (4 × u8), blend indices (4 × u8) and weights. When
//! [`FLAG_COMPRESSED`] is set, normals and tangents are 3 × f16 plus two padding bytes, uvs 2 × f16 and weights
//! 4 × f16; otherwise 3 × f32, 3 × f32, 2 × f32 and 3 × f32. Only three weights are stored:
//! the fourth is `1 - (w0 + w1 + w2)`. Blend indices address the triangle list's bone names.

use crate::error::{ReError, Result};
use crate::formats::ean::f16_to_f32;
use crate::formats::esk::{c_string_at, f32_at, u16_at, u32_at};
use serde::{Deserialize, Serialize};

/// Signature magic for DBXV2 EMD files (`#EMD`).
pub const EMD_MAGIC: &[u8; 4] = b"#EMD";

pub const FLAG_POSITION: u32 = 0x1;
pub const FLAG_NORMAL: u32 = 0x2;
pub const FLAG_UV: u32 = 0x4;
pub const FLAG_UV2: u32 = 0x8;
pub const FLAG_COLOR: u32 = 0x40;
pub const FLAG_TANGENT: u32 = 0x80;
pub const FLAG_BLEND: u32 = 0x200;
pub const FLAG_COMPRESSED: u32 = 0x8000;

/// Vertex attribute layout and data in a DBXV2 submesh.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmdVertex {
    pub position: [f32; 3],
    pub normal: [f32; 3],
    pub tangent: Option<[f32; 4]>,
    pub uv: [f32; 2],
    pub color: Option<[f32; 4]>,
    /// Indices into the owning submesh's `bone_names`.
    pub bone_indices: Option<[u16; 4]>,
    pub bone_weights: Option<[f32; 4]>,
}

impl Default for EmdVertex {
    fn default() -> Self {
        Self {
            position: [0.0, 0.0, 0.0],
            normal: [0.0, 1.0, 0.0],
            tangent: None,
            uv: [0.0, 0.0],
            color: None,
            bone_indices: None,
            bone_weights: None,
        }
    }
}

/// A texture sampler definition of a submesh.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct EmdSampler {
    pub texture_index: u8,
    pub addressing: u8,
    pub filtering: u8,
    pub scale: [f32; 2],
}

/// A submesh part within a mesh, mapped to a specific material name.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmdSubmesh {
    pub name: String,
    /// The EMM material shares the submesh name.
    pub material_name: String,
    pub vertex_flags: u32,
    pub vertices: Vec<EmdVertex>,
    pub indices: Vec<u32>,
    /// Union of the triangle lists' bone palettes, addressed by `bone_indices`.
    pub bone_names: Vec<String>,
    pub samplers: Vec<EmdSampler>,
    pub aabb_min: [f32; 3],
    pub aabb_max: [f32; 3],
}

/// A mesh containing one or more submeshes (LODs or material parts).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmdMesh {
    pub name: String,
    pub submeshes: Vec<EmdSubmesh>,
    pub aabb_min: [f32; 3],
    pub aabb_max: [f32; 3],
}

/// A character submodel part (e.g., `Bust`, `Hair`, `Face`, `Pants`, `Boots`).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmdModelPart {
    pub name: String,
    pub meshes: Vec<EmdMesh>,
}

/// A complete parsed DBXV2 `.emd` 3D Model file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmdFile {
    pub name: String,
    pub parts: Vec<EmdModelPart>,
}

const MAX_VERTICES: usize = 1 << 20;
const MAX_INDICES: usize = 3 << 20;

fn err(details: String) -> ReError {
    ReError::ParseError { context: "emd", details }
}

fn aabb(buffer: &[u8], at: usize) -> Result<([f32; 3], [f32; 3])> {
    let v = |k: usize| f32_at(buffer, at + k * 4);
    Ok(([v(4)?, v(5)?, v(6)?], [v(8)?, v(9)?, v(10)?]))
}

/// Byte size of one vertex for `flags`, as the game lays it out.
pub fn vertex_size(flags: u32) -> usize {
    let compressed = flags & FLAG_COMPRESSED != 0;
    let mut size = 0;
    if flags & FLAG_POSITION != 0 {
        size += 12;
    }
    if flags & FLAG_NORMAL != 0 {
        size += if compressed { 8 } else { 12 };
    }
    if flags & FLAG_TANGENT != 0 {
        size += if compressed { 8 } else { 12 };
    }
    for flag in [FLAG_UV, FLAG_UV2] {
        if flags & flag != 0 {
            size += if compressed { 4 } else { 8 };
        }
    }
    if flags & FLAG_COLOR != 0 {
        size += 4;
    }
    if flags & FLAG_BLEND != 0 {
        size += 4 + if compressed { 8 } else { 12 };
    }
    size
}

fn read_vertex(buffer: &[u8], at: usize, flags: u32) -> Result<EmdVertex> {
    let compressed = flags & FLAG_COMPRESSED != 0;
    let mut cursor = at;
    let mut floats = |n: usize, half: bool| -> Result<[f32; 4]> {
        let mut out = [0.0; 4];
        for (k, slot) in out.iter_mut().enumerate().take(n) {
            *slot = if half {
                f16_to_f32(u16_at(buffer, cursor + k * 2)?)
            } else {
                f32_at(buffer, cursor + k * 4)?
            };
        }
        cursor += if half { n.next_multiple_of(2).max(2) * 2 } else { n * 4 };
        Ok(out)
    };
    let mut vertex = EmdVertex::default();
    if flags & FLAG_POSITION != 0 {
        let p = floats(3, false)?;
        vertex.position = [p[0], p[1], p[2]];
    }
    if flags & FLAG_NORMAL != 0 {
        let n = floats(3, compressed)?;
        vertex.normal = [n[0], n[1], n[2]];
    }
    if flags & FLAG_UV != 0 {
        let uv = floats(2, compressed)?;
        vertex.uv = [uv[0], uv[1]];
    }
    if flags & FLAG_UV2 != 0 {
        floats(2, compressed)?;
    }
    if flags & FLAG_TANGENT != 0 {
        vertex.tangent = Some(floats(3, compressed)?);
    }
    let bytes4 = |at: usize| -> Result<[u8; 4]> {
        buffer
            .get(at..at + 4)
            .map(|b| [b[0], b[1], b[2], b[3]])
            .ok_or(ReError::BufferTooSmall { required: at + 4, available: buffer.len() })
    };
    if flags & FLAG_COLOR != 0 {
        vertex.color = Some(bytes4(cursor)?.map(|c| c as f32 / 255.0));
        cursor += 4;
    }
    if flags & FLAG_BLEND != 0 {
        vertex.bone_indices = Some(bytes4(cursor)?.map(u16::from));
        cursor += 4;
        let w = if compressed {
            let mut w = [0.0; 3];
            for (k, slot) in w.iter_mut().enumerate() {
                *slot = f16_to_f32(u16_at(buffer, cursor + k * 2)?);
            }
            w
        } else {
            [f32_at(buffer, cursor)?, f32_at(buffer, cursor + 4)?, f32_at(buffer, cursor + 8)?]
        };
        vertex.bone_weights = Some([w[0], w[1], w[2], (1.0 - w[0] - w[1] - w[2]).max(0.0)]);
    }
    Ok(vertex)
}

fn parse_submesh(buffer: &[u8], at: usize) -> Result<EmdSubmesh> {
    let (aabb_min, aabb_max) = aabb(buffer, at)?;
    let flags = u32_at(buffer, at + 0x30)?;
    let size = u32_at(buffer, at + 0x34)? as usize;
    let count = u32_at(buffer, at + 0x38)? as usize;
    let vertices_at = at + u32_at(buffer, at + 0x3C)? as usize;
    let name = c_string_at(buffer, at + u32_at(buffer, at + 0x40)? as usize)?;
    let sampler_count = *buffer.get(at + 0x45).unwrap_or(&0) as usize;
    let list_count = u16_at(buffer, at + 0x46)? as usize;
    let samplers_at = at + u32_at(buffer, at + 0x48)? as usize;
    let lists_at = at + u32_at(buffer, at + 0x4C)? as usize;
    if size != vertex_size(flags) {
        return Err(err(format!("{name}: vertex size {size} for flags {flags:#x}")));
    }
    if count > MAX_VERTICES {
        return Err(err(format!("{name}: {count} vertices")));
    }
    let mut vertices = (0..count)
        .map(|i| read_vertex(buffer, vertices_at + i * size, flags))
        .collect::<Result<Vec<_>>>()?;

    let samplers = (0..sampler_count)
        .map(|s| {
            let o = samplers_at + s * 12;
            let byte = |k| buffer.get(o + k).copied().unwrap_or(0);
            Ok(EmdSampler {
                texture_index: byte(1),
                addressing: byte(2),
                filtering: byte(3),
                scale: [f32_at(buffer, o + 4)?, f32_at(buffer, o + 8)?],
            })
        })
        .collect::<Result<Vec<_>>>()?;

    let mut indices = Vec::new();
    let mut bone_names: Vec<String> = Vec::new();
    let mut remapped = vec![false; count];
    let wide = count > u16::MAX as usize;
    for l in 0..list_count {
        let list = at + u32_at(buffer, lists_at + l * 4)? as usize;
        let index_count = u32_at(buffer, list)? as usize;
        let bone_count = u32_at(buffer, list + 4)? as usize;
        let faces = list + u32_at(buffer, list + 8)? as usize;
        let names = list + u32_at(buffer, list + 12)? as usize;
        if indices.len() + index_count > MAX_INDICES || bone_count > 1024 {
            return Err(err(format!("{name}: list {l} too large")));
        }
        let palette = (0..bone_count)
            .map(|b| {
                let bone = c_string_at(buffer, list + u32_at(buffer, names + b * 4)? as usize)?;
                Ok(match bone_names.iter().position(|n| *n == bone) {
                    Some(i) => i as u16,
                    None => {
                        bone_names.push(bone);
                        (bone_names.len() - 1) as u16
                    },
                })
            })
            .collect::<Result<Vec<u16>>>()?;
        for k in 0..index_count {
            let index = if wide {
                u32_at(buffer, faces + k * 4)?
            } else {
                u16_at(buffer, faces + k * 2)? as u32
            };
            let vertex = vertices
                .get_mut(index as usize)
                .ok_or_else(|| err(format!("{name}: index {index} of {count}")))?;
            if !remapped[index as usize] {
                remapped[index as usize] = true;
                if let Some(local) = vertex.bone_indices.as_mut() {
                    for slot in local.iter_mut() {
                        *slot = *palette.get(*slot as usize).unwrap_or(&0);
                    }
                }
            }
            indices.push(index);
        }
    }
    Ok(EmdSubmesh {
        material_name: name.clone(),
        name,
        vertex_flags: flags,
        vertices: std::mem::take(&mut vertices),
        indices,
        bone_names,
        samplers,
        aabb_min,
        aabb_max,
    })
}

fn parse_mesh(buffer: &[u8], at: usize) -> Result<EmdMesh> {
    let (aabb_min, aabb_max) = aabb(buffer, at)?;
    let name = c_string_at(buffer, at + u32_at(buffer, at + 0x30)? as usize)?;
    let count = u16_at(buffer, at + 0x36)? as usize;
    let table = at + u32_at(buffer, at + 0x38)? as usize;
    let submeshes = (0..count)
        .map(|s| parse_submesh(buffer, at + u32_at(buffer, table + s * 4)? as usize))
        .collect::<Result<_>>()?;
    Ok(EmdMesh { name, submeshes, aabb_min, aabb_max })
}

impl EmdFile {
    /// Total vertex count across all submeshes.
    pub fn total_vertices(&self) -> usize {
        self.submeshes().map(|s| s.vertices.len()).sum()
    }

    /// Total triangle count across all submeshes.
    pub fn total_triangles(&self) -> usize {
        self.submeshes().map(|s| s.indices.len() / 3).sum()
    }

    pub fn submeshes(&self) -> impl Iterator<Item = &EmdSubmesh> {
        self.parts.iter().flat_map(|p| &p.meshes).flat_map(|m| &m.submeshes)
    }

    /// Parses an EMD model file from binary data.
    pub fn parse(buffer: &[u8]) -> Result<Self> {
        if buffer.len() < 0x1C {
            return Err(ReError::BufferTooSmall { required: 0x1C, available: buffer.len() });
        }
        if &buffer[0..4] != EMD_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: EMD_MAGIC.to_vec(),
                found: buffer[0..4].to_vec(),
            });
        }
        let count = u16_at(buffer, 0x12)? as usize;
        let table = u32_at(buffer, 0x14)? as usize;
        let names = u32_at(buffer, 0x18)? as usize;
        let mut parts = Vec::with_capacity(count.min(256));
        for m in 0..count {
            let model = u32_at(buffer, table + m * 4)? as usize;
            if model == 0 {
                continue;
            }
            let name = if names == 0 {
                format!("Part_{m}")
            } else {
                c_string_at(buffer, u32_at(buffer, names + m * 4)? as usize)?
            };
            let mesh_count = u16_at(buffer, model + 2)? as usize;
            let mesh_table = model + u32_at(buffer, model + 4)? as usize;
            let meshes = (0..mesh_count)
                .map(|i| parse_mesh(buffer, model + u32_at(buffer, mesh_table + i * 4)? as usize))
                .collect::<Result<_>>()?;
            parts.push(EmdModelPart { name, meshes });
        }
        Ok(Self { name: "DBXV2_Model".into(), parts })
    }
}

/// Writes a single-submesh `.emd` with uncompressed position/normal/uv/blend vertices, for
/// tests and tools. Every vertex uses bone 0 of `bones` with full weight.
pub fn encode_emd(name: &str, positions: &[[f32; 3]], indices: &[u16], bones: &[&str]) -> Vec<u8> {
    let flags = FLAG_POSITION | FLAG_NORMAL | FLAG_UV | FLAG_BLEND;
    let size = vertex_size(flags);
    let put = |out: &mut Vec<u8>, at: usize, bytes: &[u8]| {
        if out.len() < at + bytes.len() {
            out.resize(at + bytes.len(), 0);
        }
        out[at..at + bytes.len()].copy_from_slice(bytes);
    };
    let le = |v: u32| v.to_le_bytes();
    let mut out = Vec::new();
    put(&mut out, 0, EMD_MAGIC);
    put(&mut out, 4, &[0xFE, 0xFF, 0x1C, 0]);
    put(&mut out, 0x12, &1u16.to_le_bytes());
    put(&mut out, 0x14, &le(0x1C));
    put(&mut out, 0x18, &le(0x20));
    let model = 0x30;
    put(&mut out, 0x1C, &le(model as u32));
    put(&mut out, 0x20, &le(0x24));
    put(&mut out, 0x24, name.as_bytes());
    put(&mut out, model + 2, &1u16.to_le_bytes());
    put(&mut out, model + 4, &le(8));
    put(&mut out, model + 8, &le(16));
    let mesh = model + 16;
    put(&mut out, mesh + 0x30, &le(0x40));
    put(&mut out, mesh + 0x36, &1u16.to_le_bytes());
    put(&mut out, mesh + 0x38, &le(0x50));
    put(&mut out, mesh + 0x40, name.as_bytes());
    put(&mut out, mesh + 0x50, &le(0x60));
    let sub = mesh + 0x60;
    let names_at = 0x60;
    let samplers_at = 0x70;
    let lists_at = 0x80;
    let list = 0x90;
    let faces = 16;
    let bone_table = (faces + indices.len() * 2).next_multiple_of(4);
    let bone_strings = bone_table + bones.len() * 4;
    let bone_bytes: usize = bones.iter().map(|b| b.len() + 1).sum();
    let vertices_at = (list + bone_strings + bone_bytes).next_multiple_of(16);
    put(&mut out, sub + 0x30, &le(flags));
    put(&mut out, sub + 0x34, &le(size as u32));
    put(&mut out, sub + 0x38, &le(positions.len() as u32));
    put(&mut out, sub + 0x3C, &le(vertices_at as u32));
    put(&mut out, sub + 0x40, &le(names_at as u32));
    put(&mut out, sub + 0x44, &[0, 1]);
    put(&mut out, sub + 0x46, &1u16.to_le_bytes());
    put(&mut out, sub + 0x48, &le(samplers_at as u32));
    put(&mut out, sub + 0x4C, &le(lists_at as u32));
    put(&mut out, sub + names_at, name.as_bytes());
    put(&mut out, sub + samplers_at, &[0, 0, 0, 0x22]);
    put(&mut out, sub + samplers_at + 4, &1f32.to_le_bytes());
    put(&mut out, sub + samplers_at + 8, &1f32.to_le_bytes());
    put(&mut out, sub + lists_at, &le(list as u32));
    let l = sub + list;
    put(&mut out, l, &le(indices.len() as u32));
    put(&mut out, l + 4, &le(bones.len() as u32));
    put(&mut out, l + 8, &le(faces as u32));
    put(&mut out, l + 12, &le(bone_table as u32));
    for (k, i) in indices.iter().enumerate() {
        put(&mut out, l + faces + k * 2, &i.to_le_bytes());
    }
    let mut cursor = bone_strings;
    for (k, bone) in bones.iter().enumerate() {
        put(&mut out, l + bone_table + k * 4, &le(cursor as u32));
        put(&mut out, l + cursor, bone.as_bytes());
        cursor += bone.len() + 1;
    }
    for (k, p) in positions.iter().enumerate() {
        let v = sub + vertices_at + k * size;
        let values = [p[0], p[1], p[2], 0.0, 1.0, 0.0, p[0], p[1]];
        for (c, f) in values.iter().enumerate() {
            put(&mut out, v + c * 4, &f.to_le_bytes());
        }
        put(&mut out, v + 32, &[0, 0, 0, 0]);
        put(&mut out, v + 36, &[0; 12]);
    }
    out.resize(out.len().next_multiple_of(4), 0);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vertex_sizes_match_game_layouts() {
        assert_eq!(vertex_size(0x8207), 36);
        assert_eq!(vertex_size(FLAG_POSITION | FLAG_NORMAL | FLAG_UV | FLAG_BLEND), 48);
    }

    #[test]
    fn uv_sets_precede_tangents_and_compressed_padding_is_not_an_attribute() {
        let flags = FLAG_POSITION
            | FLAG_NORMAL
            | FLAG_UV
            | FLAG_UV2
            | FLAG_TANGENT
            | FLAG_COLOR
            | FLAG_BLEND;
        let mut compressed = Vec::new();
        for value in [1.0f32, 2.0, 3.0] {
            compressed.extend(value.to_le_bytes());
        }
        // Actual EMD order; 0xfc00 padding occurs in the real failing Conton vertices.
        for value in [0x3c00u16, 0, 0, 0xfc00, 0x3800, 0xb400, 0x3400, 0x3800, 0, 0x3c00, 0, 0xfc00]
        {
            compressed.extend(value.to_le_bytes());
        }
        compressed.extend([12, 34, 56, 255, 1, 2, 3, 4]);
        for value in [0x3800u16, 0x3400, 0x3000, 0xfc00] {
            compressed.extend(value.to_le_bytes());
        }
        assert_eq!(compressed.len(), vertex_size(flags | FLAG_COMPRESSED));
        let vertex = read_vertex(&compressed, 0, flags | FLAG_COMPRESSED).unwrap();
        assert_eq!(vertex.position, [1.0, 2.0, 3.0]);
        assert_eq!(vertex.normal, [1.0, 0.0, 0.0]);
        assert_eq!(vertex.uv, [0.5, -0.25]);
        assert_eq!(vertex.tangent, Some([0.0, 1.0, 0.0, 0.0]));
        assert_eq!(vertex.bone_indices, Some([1, 2, 3, 4]));
        assert_eq!(vertex.bone_weights, Some([0.5, 0.25, 0.125, 0.125]));
        let mut plain = Vec::new();
        for value in [1.0f32, 2.0, 3.0, 0.0, 1.0, 0.0, 0.5, -0.25, 0.25, 0.5, 1.0, 0.0, 0.0] {
            plain.extend(value.to_le_bytes());
        }
        plain.extend([12, 34, 56, 255, 1, 2, 3, 4]);
        for value in [0.5f32, 0.25, 0.125] {
            plain.extend(value.to_le_bytes());
        }
        assert_eq!(plain.len(), vertex_size(flags));
        let vertex = read_vertex(&plain, 0, flags).unwrap();
        assert_eq!(vertex.uv, [0.5, -0.25]);
        assert_eq!(vertex.tangent, Some([1.0, 0.0, 0.0, 0.0]));
        assert_eq!(vertex.bone_indices, Some([1, 2, 3, 4]));
        assert_eq!(vertex.bone_weights, Some([0.5, 0.25, 0.125, 0.125]));
    }

    /// Original LOD0 NSK dependencies, geometry only; no GPU or DDS decode is needed.
    #[test]
    fn real_conton_lod0_geometry_has_finite_attributes_when_provided() {
        let (Ok(root), Ok(map)) =
            (std::env::var("SHENRON_REAL_STAGE_NSK_ROOT"), std::env::var("SHENRON_REAL_BFLBN_FMP"))
        else {
            return;
        };
        let layout = crate::formats::fmp::FmpFile::parse(&std::fs::read(map).unwrap()).unwrap();
        let indices: std::collections::BTreeSet<usize> = layout
            .objects
            .iter()
            .flat_map(|object| &object.entities)
            .filter_map(|entity| entity.lods.first().and_then(|lod| lod.nsk))
            .collect();
        assert_eq!(indices.len(), 56);
        let mut primitives = 0;
        for index in indices {
            let name = layout.resources.nsk[index].replace('\\', "/");
            let path = std::path::Path::new(&root).join(&name);
            let nsk = crate::formats::nsk::NskFile::parse(&std::fs::read(&path).unwrap()).unwrap();
            let model = crate::formats::AssembledCharacterModel::assemble_nsk_primitives(
                &nsk.model,
                &nsk.skeleton,
                0,
            )
            .unwrap();
            for primitive in model {
                primitives += 1;
                for (vertex, position) in primitive.positions.iter().enumerate() {
                    assert!(
                        position.iter().all(|value| value.is_finite()),
                        "{name} {} position {vertex}: {position:?}",
                        primitive.name
                    );
                }
                for (vertex, normal) in primitive.normals.iter().enumerate() {
                    assert!(
                        normal.iter().all(|value| value.is_finite()),
                        "{name} {} normal {vertex}: {normal:?}",
                        primitive.name
                    );
                }
                for (vertex, uv) in primitive.uv.iter().enumerate() {
                    assert!(
                        uv.iter().all(|value| value.is_finite()),
                        "{name} {} uv {vertex}: {uv:?}",
                        primitive.name
                    );
                }
            }
        }
        assert_eq!(primitives, 899);
    }

    #[test]
    fn parses_encoded_submesh() {
        let bytes = encode_emd(
            "c000_Bust",
            &[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
            &[0, 1, 2],
            &["b_C_Chest"],
        );
        let emd = EmdFile::parse(&bytes).expect("parse EMD");
        assert_eq!(emd.parts[0].name, "c000_Bust");
        let sub = emd.submeshes().next().unwrap();
        assert_eq!(sub.indices, [0, 1, 2]);
        assert_eq!(sub.vertices[1].position, [1.0, 0.0, 0.0]);
        assert_eq!(sub.bone_names, ["b_C_Chest"]);
        assert_eq!(sub.vertices[2].bone_weights, Some([0.0, 0.0, 0.0, 1.0]));
        assert_eq!(emd.total_triangles(), 1);
    }

    #[test]
    fn rejects_out_of_range_index() {
        let bytes = encode_emd("x", &[[0.0; 3]; 3], &[0, 1, 7], &["b"]);
        assert!(EmdFile::parse(&bytes).is_err());
    }

    /// `SHENRON_REAL_EMD=<path to a game .emd>` checks a real model.
    #[test]
    fn parses_real_model_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_EMD") else { return };
        let emd = EmdFile::parse(&std::fs::read(path).unwrap()).expect("parse real EMD");
        assert!(emd.total_triangles() > 0);
        for sub in emd.submeshes() {
            assert!(!sub.bone_names.is_empty());
            for v in &sub.vertices {
                assert!(v.position.iter().all(|c| c.is_finite() && c.abs() < 100.0));
                let w = v.bone_weights.unwrap();
                assert!((w.iter().sum::<f32>() - 1.0).abs() < 0.01, "{w:?}");
                assert!(
                    v.bone_indices.unwrap().iter().all(|&b| (b as usize) < sub.bone_names.len())
                );
            }
        }
    }
}
