// SPDX-License-Identifier: Apache-2.0
//! DBXV2 stage NSK containers: an ESK skeleton followed by an EMD model.
//!
//! The little-endian ESK header field at `0x14` points to the embedded EMD,
//! relative to the beginning of the container. This is the `offset_nextPart`
//! field documented by LibXenoverse2's ESK loader and observed in real stage files.
//! Geometry, textures and transforms remain owned by the existing format parsers.

use crate::game::error::{ReError, Result};
use crate::game::formats::emd::{EMD_MAGIC, EmdFile};
use crate::game::formats::esk::{ESK_MAGIC, EskFile, u32_at};
use crate::game::formats::{AssembledCharacterModel, EmbFile, EmmFile};

/// A stage model's original skeleton and geometry, without inferred placement.
#[derive(Debug, Clone)]
pub struct NskFile {
    pub skeleton: EskFile,
    pub model: EmdFile,
}

impl NskFile {
    /// Parses the bounded ESK and EMD sections using their existing owners.
    pub fn parse(buffer: &[u8]) -> Result<Self> {
        if buffer.len() < 0x20 {
            return Err(ReError::BufferTooSmall { required: 0x20, available: buffer.len() });
        }
        if &buffer[..4] != ESK_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: ESK_MAGIC.to_vec(),
                found: buffer[..4].to_vec(),
            });
        }
        if buffer[4..6] != [0xFE, 0xFF] {
            return Err(ReError::CorruptHeader("NSK requires little-endian data".into()));
        }
        let model_offset = u32_at(buffer, 0x14)? as usize;
        if model_offset < 0x20 || model_offset > buffer.len().saturating_sub(4) {
            return Err(ReError::CorruptHeader("NSK EMD offset outside container".into()));
        }
        let (skeleton_bytes, model_bytes) = buffer.split_at(model_offset);
        if &model_bytes[..4] != EMD_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: EMD_MAGIC.to_vec(),
                found: model_bytes[..4].to_vec(),
            });
        }
        Ok(Self { skeleton: EskFile::parse(skeleton_bytes)?, model: EmdFile::parse(model_bytes)? })
    }
}

/// Parses one uncompressed NSK entry obtained from a CPK archive.
pub fn parse_nsk(buffer: &[u8]) -> Result<NskFile> {
    NskFile::parse(buffer)
}

/// Uses the existing static assembler; it retains the skeleton without applying skinning.
pub fn assemble_nsk(
    name: &str,
    nsk: &NskFile,
    emb: Option<&EmbFile>,
    emm: Option<&EmmFile>,
) -> AssembledCharacterModel {
    AssembledCharacterModel::assemble(name, &nsk.model, emb, Some(&nsk.skeleton), emm)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::formats::emd::encode_emd;
    use crate::game::formats::esk::{EskBone, encode_esk};

    fn container(offset: usize) -> Vec<u8> {
        let mut bytes = encode_esk(&[EskBone::default()]);
        assert!(bytes.len() <= offset);
        bytes.resize(offset, 0);
        bytes[0x14..0x18].copy_from_slice(&(offset as u32).to_le_bytes());
        bytes.extend(encode_emd(
            "stage",
            &[[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
            &[0, 1, 2],
            &["root"],
        ));
        bytes
    }

    #[test]
    fn parses_sections_at_offsets_observed_in_real_stages() {
        for offset in [224, 320, 336, 528, 1584, 2672] {
            let nsk = parse_nsk(&container(offset)).expect("parse stage sections");
            assert_eq!(nsk.skeleton.bones.len(), 1);
            assert_eq!(nsk.skeleton.bones[0].name, "root");
            assert_eq!(nsk.model.total_triangles(), 1);
            let assembled = assemble_nsk("stage", &nsk, None, None);
            assert_eq!(assembled.total_vertices(), 3);
            assert_eq!(assembled.total_triangles(), 1);
            assert!(assembled.skeleton.is_some());
            assert!(assembled.to_glb().is_ok());
        }
    }

    #[test]
    fn rejects_truncation_invalid_offsets_magic_and_endianness() {
        let original = container(320);
        for length in [0, 3, 20, 31, 320, 323, 324] {
            assert!(parse_nsk(&original[..length]).is_err());
        }
        for offset in [0, 16, 31, 319, original.len() - 3, original.len(), u32::MAX as usize] {
            let mut bytes = original.clone();
            bytes[0x14..0x18].copy_from_slice(&(offset as u32).to_le_bytes());
            assert!(parse_nsk(&bytes).is_err());
        }
        for at in [0, 4, 5, 320] {
            let mut bytes = original.clone();
            bytes[at] ^= 0xFF;
            assert!(parse_nsk(&bytes).is_err());
        }
    }

    #[test]
    fn skeleton_offsets_cannot_read_into_the_embedded_model() {
        let mut bytes = container(320);
        bytes[0x10..0x14].copy_from_slice(&320u32.to_le_bytes());
        assert!(parse_nsk(&bytes).is_err());
    }

    /// Set to a private real CPK entry; absent fixtures do not qualify game data.
    #[test]
    fn parses_real_stage_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_NSK") else { return };
        let bytes = std::fs::read(path).expect("read private real NSK");
        let nsk = parse_nsk(&bytes).expect("parse real stage NSK");
        assert!(!nsk.skeleton.bones.is_empty());
        assert!(nsk.model.total_triangles() > 0);
        let assembled = assemble_nsk("real-stage", &nsk, None, None);
        assert!(assembled.total_vertices() > 0);
        assert!(assembled.to_glb().is_ok());
    }
}
