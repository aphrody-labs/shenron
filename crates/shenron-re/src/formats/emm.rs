// SPDX-License-Identifier: Apache-2.0
//! Dragon Ball Xenoverse 2 (DBXV2) material (`.emm`) parser.
//!
//! Layout (little-endian): `#EMM`, `u16 0xFFFE`, `u16 header_size`, `u32 version`,
//! `u32 material_table`. The table holds `u32 count` then `count` offsets relative to the
//! table. A material is `char name[32], char shader[32], u16 parameter_count, u16`, then
//! 40-byte parameters: `char name[32], u32 type, u32 value` where type 0 is an `f32` and
//! other types are integers (bools, enums).
//!
//! Toon materials name their dye line in `MatScale1X`: the row block of the `.dyt.emb`
//! ramp texture that colours the material.

use crate::error::{ReError, Result};
use crate::formats::esk::{f32_at, u16_at, u32_at};
use serde::{Deserialize, Serialize};

/// Signature magic for DBXV2 EMM material files (`#EMM`).
pub const EMM_MAGIC: &[u8; 4] = b"#EMM";

/// One named material parameter.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct EmmParameter {
    pub name: String,
    pub kind: u32,
    /// The value as stored: an `f32` for kind 0, otherwise the integer converted to `f32`.
    pub value: f32,
}

/// An individual material definition in a DBXV2 `.emm` file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmmMaterial {
    pub name: String,
    pub shader_program: String,
    pub parameters: Vec<EmmParameter>,
}

impl EmmMaterial {
    pub fn parameter(&self, name: &str) -> Option<f32> {
        self.parameters.iter().find(|p| p.name == name).map(|p| p.value)
    }

    /// The `.dyt.emb` ramp line colouring this material (`MatScale1X`).
    pub fn dye_line(&self) -> Option<u32> {
        self.parameter("MatScale1X").filter(|v| v.is_finite() && *v >= 0.0).map(|v| v as u32)
    }
}

/// Parsed DBXV2 `.emm` Material file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmmFile {
    pub materials: Vec<EmmMaterial>,
}

fn fixed_string(buffer: &[u8], at: usize) -> Result<String> {
    let raw = buffer
        .get(at..at + 32)
        .ok_or(ReError::BufferTooSmall { required: at + 32, available: buffer.len() })?;
    let end = raw.iter().position(|&b| b == 0).unwrap_or(32);
    Ok(String::from_utf8_lossy(&raw[..end]).into_owned())
}

impl EmmFile {
    /// Number of materials defined in this file.
    pub fn len(&self) -> usize {
        self.materials.len()
    }

    /// Returns true if empty.
    pub fn is_empty(&self) -> bool {
        self.materials.is_empty()
    }

    pub fn find(&self, name: &str) -> Option<&EmmMaterial> {
        self.materials.iter().find(|m| m.name == name)
    }

    pub fn parse(buffer: &[u8]) -> Result<Self> {
        if buffer.len() < 0x10 {
            return Err(ReError::BufferTooSmall { required: 0x10, available: buffer.len() });
        }
        if &buffer[0..4] != EMM_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: EMM_MAGIC.to_vec(),
                found: buffer[0..4].to_vec(),
            });
        }
        let table = u32_at(buffer, 0x0C)? as usize;
        let count = u32_at(buffer, table)? as usize;
        if count > 4096 {
            return Err(ReError::ParseError {
                context: "emm",
                details: format!("{count} materials"),
            });
        }
        let mut materials = Vec::with_capacity(count);
        for i in 0..count {
            let at = table + u32_at(buffer, table + 4 + i * 4)? as usize;
            let parameter_count = u16_at(buffer, at + 64)? as usize;
            let parameters = (0..parameter_count)
                .map(|k| {
                    let p = at + 68 + k * 40;
                    let kind = u32_at(buffer, p + 32)?;
                    let value = if kind == 0 {
                        f32_at(buffer, p + 36)?
                    } else {
                        u32_at(buffer, p + 36)? as f32
                    };
                    Ok(EmmParameter { name: fixed_string(buffer, p)?, kind, value })
                })
                .collect::<Result<_>>()?;
            materials.push(EmmMaterial {
                name: fixed_string(buffer, at)?,
                shader_program: fixed_string(buffer, at + 32)?,
                parameters,
            });
        }
        Ok(Self { materials })
    }
}

/// A material to encode: `(name, shader, [(parameter, f32 value)])`.
pub type EncodedMaterial<'a> = (&'a str, &'a str, &'a [(&'a str, f32)]);

/// Writes an `.emm` file, for tests and tools.
pub fn encode_emm(materials: &[EncodedMaterial<'_>]) -> Vec<u8> {
    let mut out = vec![0u8; 0x20];
    out[0..4].copy_from_slice(EMM_MAGIC);
    out[4..8].copy_from_slice(&[0xFE, 0xFF, 0x20, 0]);
    out[0x0C..0x10].copy_from_slice(&0x20u32.to_le_bytes());
    let table = 0x20;
    out.extend((materials.len() as u32).to_le_bytes());
    let mut offset = 4 + materials.len() * 4;
    let mut body = Vec::new();
    for (name, shader, parameters) in materials {
        out.extend((offset as u32).to_le_bytes());
        let mut material = vec![0u8; 68 + parameters.len() * 40];
        material[..name.len()].copy_from_slice(name.as_bytes());
        material[32..32 + shader.len()].copy_from_slice(shader.as_bytes());
        material[64..66].copy_from_slice(&(parameters.len() as u16).to_le_bytes());
        for (k, (param, value)) in parameters.iter().enumerate() {
            let p = 68 + k * 40;
            material[p..p + param.len()].copy_from_slice(param.as_bytes());
            material[p + 36..p + 40].copy_from_slice(&value.to_le_bytes());
        }
        offset += material.len();
        body.extend(material);
    }
    debug_assert_eq!(out.len(), table + 4 + materials.len() * 4);
    out.extend(body);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_materials_and_dye_line() {
        let bytes = encode_emm(&[
            ("skin_bust", "TOON_UNIF_STAIN3d2_XVM_DFD", &[("MatScale1X", 3.0), ("MatCol2G", 0.25)]),
            ("armor_A", "TOON_UNIF_STAIN2_DFD", &[]),
        ]);
        let emm = EmmFile::parse(&bytes).unwrap();
        assert_eq!(emm.len(), 2);
        let skin = emm.find("skin_bust").unwrap();
        assert_eq!(skin.shader_program, "TOON_UNIF_STAIN3d2_XVM_DFD");
        assert_eq!(skin.dye_line(), Some(3));
        assert_eq!(skin.parameter("MatCol2G"), Some(0.25));
        assert_eq!(emm.find("armor_A").unwrap().dye_line(), None);
    }

    #[test]
    fn rejects_truncated_tables() {
        let mut bytes = encode_emm(&[("m", "s", &[("MatScale1X", 1.0)])]);
        bytes.truncate(bytes.len() - 20);
        assert!(EmmFile::parse(&bytes).is_err());
    }

    /// `SHENRON_REAL_EMM=<path to a game .emm>` checks a real material file.
    #[test]
    fn parses_real_materials_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_EMM") else { return };
        let emm = EmmFile::parse(&std::fs::read(path).unwrap()).expect("parse real EMM");
        assert!(!emm.is_empty());
        assert!(emm.materials.iter().all(|m| !m.name.is_empty() && !m.shader_program.is_empty()));
    }
}
