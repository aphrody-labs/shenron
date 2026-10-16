// SPDX-License-Identifier: Apache-2.0

//! Pure-Rust GLB (Binary glTF 2.0) Model Parser.
//!
//! Extracts geometry (positions, normals, texture coordinates, triangle indices)
//! and embedded textures (PNG/JPEG via the `image` crate) into a unified `Model`.
//! Adapted from `aphrody-nie-render3d::glb`.

use super::mesh::{Model, Primitive, Texture};
use serde_json::Value;
use thiserror::Error;

const GLTF_MAGIC: u32 = 0x4654_6C67; // "glTF"
const JSON_CHUNK: u32 = 0x4E4F_534A; // "JSON"
const BIN_CHUNK: u32 = 0x004E_4942; // "BIN\0"

/// Errors encountered while parsing a GLB file.
#[derive(Debug, Error)]
pub enum GlbError {
    #[error("Not a valid glTF 2.0 binary file (invalid magic or version)")]
    InvalidHeader,
    #[error("Corrupt chunk structure in GLB")]
    CorruptChunks,
    #[error("JSON metadata parsing failed: {0}")]
    JsonError(#[from] serde_json::Error),
    #[error("Missing required chunk: {0}")]
    MissingChunk(&'static str),
    #[error("Buffer out of bounds: {0}")]
    OutOfBounds(&'static str),
    #[error("Failed to decode embedded texture image: {0}")]
    ImageDecodeError(String),
}

fn rd_u32(b: &[u8], o: usize) -> Result<u32, GlbError> {
    if o + 4 <= b.len() {
        Ok(u32::from_le_bytes([b[o], b[o + 1], b[o + 2], b[o + 3]]))
    } else {
        Err(GlbError::OutOfBounds("u32 offset out of range"))
    }
}

/// Parses a binary GLB buffer into a unified `Model`.
pub fn parse_glb(data: &[u8]) -> Result<Model, GlbError> {
    if data.len() < 12 {
        return Err(GlbError::InvalidHeader);
    }
    let magic = rd_u32(data, 0)?;
    let version = rd_u32(data, 4)?;
    let total_len = rd_u32(data, 8)? as usize;

    if magic != GLTF_MAGIC || version != 2 || total_len > data.len() {
        return Err(GlbError::InvalidHeader);
    }

    let mut json_data: Option<&[u8]> = None;
    let mut bin_data: Option<&[u8]> = None;

    let mut offset = 12usize;
    while offset + 8 <= total_len {
        let chunk_len = rd_u32(data, offset)? as usize;
        let chunk_type = rd_u32(data, offset + 4)?;
        let start = offset + 8;
        let end = start + chunk_len;
        if end > data.len() {
            return Err(GlbError::CorruptChunks);
        }

        if chunk_type == JSON_CHUNK && json_data.is_none() {
            json_data = Some(&data[start..end]);
        } else if chunk_type == BIN_CHUNK && bin_data.is_none() {
            bin_data = Some(&data[start..end]);
        }

        // Align to 4-byte boundary
        let padded_len = (chunk_len + 3) & !3;
        offset = start + padded_len;
    }

    let json_bytes = json_data.ok_or(GlbError::MissingChunk("JSON chunk not found"))?;
    let bin_bytes = bin_data.unwrap_or(&[]);

    let json: Value = serde_json::from_slice(json_bytes)?;

    let mut model = Model::default();

    // 1. Decode textures / images if present
    if let Some(images) = json.get("images").and_then(Value::as_array) {
        for img_val in images {
            if let Some(bv_idx) = img_val.get("bufferView").and_then(Value::as_u64) {
                if let Some(img_bytes) = get_buffer_view_slice(&json, bin_bytes, bv_idx as usize) {
                    if let Ok(dyn_img) = image::load_from_memory(img_bytes) {
                        let rgba = dyn_img.to_rgba8();
                        model.textures.push(Texture::new(
                            rgba.width(),
                            rgba.height(),
                            rgba.into_raw(),
                        ));
                        continue;
                    }
                }
            }
            // Fallback placeholder texture
            model.textures.push(Texture::solid(255, 255, 255, 255));
        }
    }

    // 2. Parse meshes and primitives
    if let Some(meshes) = json.get("meshes").and_then(Value::as_array) {
        for mesh_val in meshes {
            if let Some(prims) = mesh_val.get("primitives").and_then(Value::as_array) {
                for prim_val in prims {
                    let mut positions = Vec::new();
                    let mut normals = Vec::new();
                    let mut uvs = Vec::new();
                    let mut indices = Vec::new();

                    if let Some(attrs) = prim_val.get("attributes") {
                        if let Some(pos_acc) = attrs.get("POSITION").and_then(Value::as_u64) {
                            positions = read_vec3_accessor(&json, bin_bytes, pos_acc as usize)?;
                        }
                        if let Some(norm_acc) = attrs.get("NORMAL").and_then(Value::as_u64) {
                            normals = read_vec3_accessor(&json, bin_bytes, norm_acc as usize)?;
                        }
                        if let Some(uv_acc) = attrs.get("TEXCOORD_0").and_then(Value::as_u64) {
                            uvs = read_vec2_accessor(&json, bin_bytes, uv_acc as usize)?;
                        }
                    }

                    if let Some(idx_acc) = prim_val.get("indices").and_then(Value::as_u64) {
                        indices = read_indices_accessor(&json, bin_bytes, idx_acc as usize)?;
                    }

                    // Resolve texture index from material
                    let mut tex_index = None;
                    if let Some(mat_idx) = prim_val.get("material").and_then(Value::as_u64) {
                        if let Some(materials) = json.get("materials").and_then(Value::as_array) {
                            if let Some(mat_val) = materials.get(mat_idx as usize) {
                                if let Some(pbr) = mat_val.get("pbrMetallicRoughness") {
                                    if let Some(tex) = pbr.get("baseColorTexture") {
                                        if let Some(t_idx) =
                                            tex.get("index").and_then(Value::as_u64)
                                        {
                                            if let Some(textures) =
                                                json.get("textures").and_then(Value::as_array)
                                            {
                                                if let Some(t_val) = textures.get(t_idx as usize) {
                                                    if let Some(src) =
                                                        t_val.get("source").and_then(Value::as_u64)
                                                    {
                                                        tex_index = Some(src as usize);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if !positions.is_empty() {
                        let vert_count = positions.len();
                        if normals.is_empty() {
                            normals = vec![[0.0, 1.0, 0.0]; vert_count];
                        }
                        if uvs.is_empty() {
                            uvs = vec![[0.0, 0.0]; vert_count];
                        }
                        if indices.is_empty() {
                            indices = (0..vert_count as u32).collect();
                        }

                        model.primitives.push(Primitive {
                            positions,
                            normals,
                            uv: uvs,
                            indices,
                            texture: tex_index,
                        });
                    }
                }
            }
        }
    }

    Ok(model)
}

fn get_buffer_view_slice<'a>(json: &Value, bin: &'a [u8], bv_idx: usize) -> Option<&'a [u8]> {
    let bvs = json.get("bufferViews")?.as_array()?;
    let bv = bvs.get(bv_idx)?;
    let byte_offset = bv.get("byteOffset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let byte_len = bv.get("byteLength")?.as_u64()? as usize;
    bin.get(byte_offset..byte_offset + byte_len)
}

fn read_vec3_accessor(json: &Value, bin: &[u8], acc_idx: usize) -> Result<Vec<[f32; 3]>, GlbError> {
    let accs = json.get("accessors").and_then(Value::as_array).ok_or(GlbError::CorruptChunks)?;
    let acc = accs.get(acc_idx).ok_or(GlbError::CorruptChunks)?;
    let bv_idx = acc.get("bufferView").and_then(Value::as_u64).unwrap_or(0) as usize;
    let acc_offset = acc.get("byteOffset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let count = acc.get("count").and_then(Value::as_u64).ok_or(GlbError::CorruptChunks)? as usize;

    let bv_slice = get_buffer_view_slice(json, bin, bv_idx).ok_or(GlbError::CorruptChunks)?;
    let total_bytes = count * 12;
    if acc_offset + total_bytes > bv_slice.len() {
        return Err(GlbError::OutOfBounds("Vec3 accessor data out of range"));
    }

    let mut out = Vec::with_capacity(count);
    let bytes = &bv_slice[acc_offset..acc_offset + total_bytes];
    for chunk in bytes.chunks_exact(12) {
        let x = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        let y = f32::from_le_bytes([chunk[4], chunk[5], chunk[6], chunk[7]]);
        let z = f32::from_le_bytes([chunk[8], chunk[9], chunk[10], chunk[11]]);
        out.push([x, y, z]);
    }
    Ok(out)
}

fn read_vec2_accessor(json: &Value, bin: &[u8], acc_idx: usize) -> Result<Vec<[f32; 2]>, GlbError> {
    let accs = json.get("accessors").and_then(Value::as_array).ok_or(GlbError::CorruptChunks)?;
    let acc = accs.get(acc_idx).ok_or(GlbError::CorruptChunks)?;
    let bv_idx = acc.get("bufferView").and_then(Value::as_u64).unwrap_or(0) as usize;
    let acc_offset = acc.get("byteOffset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let count = acc.get("count").and_then(Value::as_u64).ok_or(GlbError::CorruptChunks)? as usize;

    let bv_slice = get_buffer_view_slice(json, bin, bv_idx).ok_or(GlbError::CorruptChunks)?;
    let total_bytes = count * 8;
    if acc_offset + total_bytes > bv_slice.len() {
        return Err(GlbError::OutOfBounds("Vec2 accessor data out of range"));
    }

    let mut out = Vec::with_capacity(count);
    let bytes = &bv_slice[acc_offset..acc_offset + total_bytes];
    for chunk in bytes.chunks_exact(8) {
        let u = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        let v = f32::from_le_bytes([chunk[4], chunk[5], chunk[6], chunk[7]]);
        out.push([u, v]);
    }
    Ok(out)
}

fn read_indices_accessor(json: &Value, bin: &[u8], acc_idx: usize) -> Result<Vec<u32>, GlbError> {
    let accs = json.get("accessors").and_then(Value::as_array).ok_or(GlbError::CorruptChunks)?;
    let acc = accs.get(acc_idx).ok_or(GlbError::CorruptChunks)?;
    let bv_idx = acc.get("bufferView").and_then(Value::as_u64).unwrap_or(0) as usize;
    let acc_offset = acc.get("byteOffset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let count = acc.get("count").and_then(Value::as_u64).ok_or(GlbError::CorruptChunks)? as usize;
    let comp_type = acc.get("componentType").and_then(Value::as_u64).unwrap_or(5123) as u32;

    let bv_slice = get_buffer_view_slice(json, bin, bv_idx).ok_or(GlbError::CorruptChunks)?;
    let mut out = Vec::with_capacity(count);

    match comp_type {
        5121 => {
            // UNSIGNED_BYTE
            let bytes = &bv_slice[acc_offset..acc_offset + count];
            for &b in bytes {
                out.push(b as u32);
            }
        },
        5123 => {
            // UNSIGNED_SHORT
            let total_bytes = count * 2;
            let bytes = &bv_slice[acc_offset..acc_offset + total_bytes];
            for chunk in bytes.chunks_exact(2) {
                out.push(u16::from_le_bytes([chunk[0], chunk[1]]) as u32);
            }
        },
        5125 => {
            // UNSIGNED_INT
            let total_bytes = count * 4;
            let bytes = &bv_slice[acc_offset..acc_offset + total_bytes];
            for chunk in bytes.chunks_exact(4) {
                out.push(u32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]));
            }
        },
        _ => return Err(GlbError::CorruptChunks),
    }

    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_glb_header_validation_failure() {
        let bad_data = b"NOT_GLB_DATA";
        assert!(parse_glb(bad_data).is_err());
    }
}
