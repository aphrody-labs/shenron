// SPDX-License-Identifier: Apache-2.0
//! Bounded DBXV2 FMP stage manifests, measured on BFtok and BFlbn CPK entries.
//!
//! Absolute offsets and record layouts are described by LibXenoverse2's Fmp.h/Fmp.cpp.
//! Matrices retain the original twelve floats: three basis rows followed by translation.
//! Object and entity transforms stay separate; this parser performs no placement or physics.

use crate::game::error::{ReError, Result};
use serde::{Deserialize, Serialize};

const HEADER: usize = 0x70;
const MAX_COUNT: usize = 65_536;
const MAX_BYTES: usize = 64 * 1024 * 1024;
const MAX_TEXT_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FmpResources {
    pub nsk: Vec<String>,
    pub emb: Vec<String>,
    pub emm: Vec<String>,
    pub ema: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FmpLod {
    pub nsk: Option<usize>,
    pub emm: Option<usize>,
    pub distance: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FmpEntity {
    pub source_offset: usize,
    pub name: Option<String>,
    pub matrix: [f32; 12],
    pub emb: Option<usize>,
    pub ema: Option<usize>,
    pub lods: Vec<FmpLod>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FmpObject {
    pub source_offset: usize,
    pub name: String,
    pub matrix: [f32; 12],
    pub entities: Vec<FmpEntity>,
    /// Optional spatial hierarchy remains unconsumed, not a fabricated parent transform.
    pub spatial_hierarchy_offset: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FmpFile {
    pub version: u32,
    pub resources: FmpResources,
    /// Includes nonvisual named points from EVE manifests, preserving their source matrix.
    pub objects: Vec<FmpObject>,
}

/// Transposes the file's affine row-vector convention into GPU column-vector storage.
/// Translation is the original final row (floats 9..12), now the final column.
pub fn fmp_matrix_column_major(matrix: &[f32; 12]) -> [f32; 16] {
    [
        matrix[0], matrix[1], matrix[2], 0.0, matrix[3], matrix[4], matrix[5], 0.0, matrix[6],
        matrix[7], matrix[8], 0.0, matrix[9], matrix[10], matrix[11], 1.0,
    ]
}

fn error(message: impl Into<String>) -> ReError {
    ReError::ParseError { context: "fmp", details: message.into() }
}

struct Reader<'a>(&'a [u8]);

impl Reader<'_> {
    fn range(&self, at: usize, count: usize, stride: usize) -> Result<()> {
        let end = count.checked_mul(stride).and_then(|size| at.checked_add(size));
        if count > MAX_COUNT || end.is_none_or(|end| end > self.0.len()) {
            return Err(error("table exceeds FMP bounds"));
        }
        if count != 0 && at < HEADER {
            return Err(error("table points inside FMP header"));
        }
        Ok(())
    }

    fn u32(&self, at: usize) -> Result<u32> {
        let end = at.checked_add(4).ok_or_else(|| error("u32 offset overflow"))?;
        let bytes = self.0.get(at..end).ok_or_else(|| error("u32 outside FMP"))?;
        Ok(u32::from_le_bytes(bytes.try_into().map_err(|_| error("u32"))?))
    }

    fn float(&self, at: usize) -> Result<f32> {
        let value = f32::from_bits(self.u32(at)?);
        if !value.is_finite() {
            return Err(error("non-finite FMP transform or LOD distance"));
        }
        Ok(value)
    }

    fn matrix(&self, at: usize) -> Result<[f32; 12]> {
        let mut matrix = [0.0; 12];
        for (index, value) in matrix.iter_mut().enumerate() {
            *value = self.float(at + index * 4)?;
        }
        Ok(matrix)
    }

    fn string(&self, at: usize, text_budget: &mut usize) -> Result<String> {
        if at < HEADER {
            return Err(error("name points inside FMP header"));
        }
        let tail = self.0.get(at..).ok_or_else(|| error("name outside FMP"))?;
        let length = tail
            .iter()
            .take(4097)
            .position(|byte| *byte == 0)
            .ok_or_else(|| error("unterminated or oversized FMP name"))?;
        *text_budget =
            text_budget.checked_add(length).ok_or_else(|| error("name budget overflow"))?;
        if *text_budget > MAX_TEXT_BYTES {
            return Err(error("FMP total name limit exceeded"));
        }
        String::from_utf8(tail[..length].to_vec()).map_err(|_| error("FMP name is not UTF-8"))
    }

    fn resources(
        &self,
        count_at: usize,
        offset_at: usize,
        text_budget: &mut usize,
    ) -> Result<Vec<String>> {
        let count = self.u32(count_at)? as usize;
        let at = self.u32(offset_at)? as usize;
        self.range(at, count, 4)?;
        (0..count)
            .map(|index| self.string(self.u32(at + index * 4)? as usize, text_budget))
            .collect()
    }

    fn index(&self, value: u32, count: usize) -> Result<Option<usize>> {
        if value == u32::MAX {
            return Ok(None);
        }
        let index = value as usize;
        if index >= count {
            return Err(error("FMP dependency index outside resource table"));
        }
        Ok(Some(index))
    }

    fn entity(
        &self,
        at: usize,
        resources: &FmpResources,
        lod_budget: &mut usize,
        text_budget: &mut usize,
    ) -> Result<FmpEntity> {
        self.range(at, 1, 0x38)?;
        let mut entity = FmpEntity {
            source_offset: at,
            name: None,
            matrix: self.matrix(at + 8)?,
            emb: None,
            ema: None,
            lods: Vec::new(),
        };
        let visual = self.u32(at)? as usize;
        if visual == 0 {
            return Ok(entity);
        }
        self.range(visual, 1, 0x34)?;
        entity.name = Some(self.string(self.u32(visual)? as usize, text_budget)?);
        entity.emb = self.index(self.u32(visual + 0x10)?, resources.emb.len())?;
        entity.ema = self.index(self.u32(visual + 0x20)?, resources.ema.len())?;
        let count = self.u32(visual + 8)? as usize;
        *lod_budget = lod_budget.checked_add(count).ok_or_else(|| error("LOD count overflow"))?;
        if *lod_budget > MAX_COUNT {
            return Err(error("too many FMP LODs"));
        }
        let nsk = self.u32(visual + 0xC)?;
        let emm = self.u32(visual + 0x14)?;
        let distances = self.u32(visual + 0x30)?;
        if count > 1 {
            self.range(nsk as usize, count, 4)?;
            self.range(emm as usize, count, 4)?;
            self.range(distances as usize, count, 4)?;
        }
        for index in 0..count {
            let (nsk, emm, distance) = if count == 1 {
                (nsk, emm, self.float(visual + 0x30)?)
            } else {
                (
                    self.u32(nsk as usize + index * 4)?,
                    self.u32(emm as usize + index * 4)?,
                    self.float(distances as usize + index * 4)?,
                )
            };
            entity.lods.push(FmpLod {
                nsk: self.index(nsk, resources.nsk.len())?,
                emm: self.index(emm, resources.emm.len())?,
                distance,
            });
        }
        Ok(entity)
    }
}

impl FmpFile {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        if bytes.len() < HEADER || bytes.len() > MAX_BYTES {
            return Err(error("FMP size must be between 112 bytes and 64 MiB"));
        }
        if &bytes[..4] != b"#FMP" {
            return Err(ReError::InvalidMagic {
                expected: b"#FMP".to_vec(),
                found: bytes[..4].to_vec(),
            });
        }
        let reader = Reader(bytes);
        let version = reader.u32(4)?;
        if version != 0x0002_0900 {
            return Err(ReError::UnsupportedVersion { version });
        }
        let mut text_budget = 0usize;
        let resources = FmpResources {
            nsk: reader.resources(0x40, 0x44, &mut text_budget)?,
            emb: reader.resources(0x48, 0x4C, &mut text_budget)?,
            emm: reader.resources(0x50, 0x54, &mut text_budget)?,
            ema: reader.resources(0x58, 0x5C, &mut text_budget)?,
        };
        let count = reader.u32(0x30)? as usize;
        let at = reader.u32(0x34)? as usize;
        reader.range(at, count, 0x54)?;
        let mut objects = Vec::with_capacity(count);
        let mut entity_budget = 0usize;
        let mut lod_budget = 0usize;
        for index in 0..count {
            let object = at + index * 0x54;
            let entity_count = reader.u32(object + 0x14)? as usize;
            entity_budget = entity_budget
                .checked_add(entity_count)
                .ok_or_else(|| error("entity count overflow"))?;
            if entity_budget > MAX_COUNT {
                return Err(error("FMP total entity limit exceeded"));
            }
            let entity_at = reader.u32(object + 0x18)? as usize;
            reader.range(entity_at, entity_count, 0x38)?;
            let hierarchy = reader.u32(object + 0x1C)? as usize;
            if hierarchy != 0 {
                reader.range(hierarchy, 1, 0x14)?;
            }
            objects.push(FmpObject {
                source_offset: object,
                name: reader.string(reader.u32(object)? as usize, &mut text_budget)?,
                matrix: reader.matrix(object + 0x24)?,
                entities: (0..entity_count)
                    .map(|index| {
                        reader.entity(
                            entity_at + index * 0x38,
                            &resources,
                            &mut lod_budget,
                            &mut text_budget,
                        )
                    })
                    .collect::<Result<_>>()?,
                spatial_hierarchy_offset: (hierarchy != 0).then_some(hierarchy),
            });
        }
        Ok(Self { version, resources, objects })
    }

    /// Exact original named transform, including EVE spawn markers; no camera inferred.
    pub fn named_point(&self, name: &str) -> Option<[f32; 3]> {
        self.objects
            .iter()
            .find(|object| object.name == name)
            .map(|object| [object.matrix[9], object.matrix[10], object.matrix[11]])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn put(bytes: &mut [u8], at: usize, value: u32) {
        bytes[at..at + 4].copy_from_slice(&value.to_le_bytes());
    }

    fn fixture() -> Vec<u8> {
        let mut bytes = vec![0u8; 0x300];
        bytes[..4].copy_from_slice(b"#FMP");
        put(&mut bytes, 4, 0x20900);
        for (at, value) in [
            (0x30, 1),
            (0x34, 0x70),
            (0x40, 2),
            (0x44, 0x180),
            (0x48, 1),
            (0x4C, 0x190),
            (0x50, 2),
            (0x54, 0x198),
            (0x70, 0x250),
            (0x84, 1),
            (0x88, 0xD0),
            (0xD0, 0x110),
            (0x110, 0x270),
            (0x118, 1),
            (0x120, 0),
            (0x130, u32::MAX),
            (0x180, 0x200),
            (0x184, 0x210),
            (0x190, 0x220),
            (0x198, 0x230),
            (0x19C, 0x240),
        ] {
            put(&mut bytes, at, value);
        }
        for at in [0x94, 0xD8] {
            for (index, value) in [1.0f32, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, -10.0]
                .into_iter()
                .enumerate()
            {
                put(&mut bytes, at + index * 4, value.to_bits());
            }
        }
        put(&mut bytes, 0x140, 100f32.to_bits());
        for (at, text) in [
            (0x200, "LBY\\palm.nsk"),
            (0x210, "LBY\\palmLOD.nsk"),
            (0x220, "LBY\\shared.emb"),
            (0x230, "LBY\\palm.emm"),
            (0x240, "LBY\\palmLOD.emm"),
            (0x250, "VS_INIT_POS_A_0"),
            (0x270, "palm"),
        ] {
            bytes[at..at + text.len()].copy_from_slice(text.as_bytes());
        }
        bytes
    }

    #[test]
    fn retains_resources_instances_and_named_points_without_flattening() {
        let file = FmpFile::parse(&fixture()).unwrap();
        assert_eq!(file.resources.nsk, ["LBY\\palm.nsk", "LBY\\palmLOD.nsk"]);
        let object = &file.objects[0];
        assert_eq!(object.source_offset, 0x70);
        assert_eq!(object.matrix[11], -10.0);
        assert_eq!(object.entities[0].matrix[11], -10.0);
        assert_eq!(object.entities[0].lods[0].nsk, Some(0));
        assert_eq!(object.entities[0].emb, Some(0));
        assert_eq!(object.entities[0].ema, None);
        assert_eq!(file.named_point("VS_INIT_POS_A_0"), Some([0.0, 0.0, -10.0]));
        assert_eq!(file.named_point("missing"), None);
    }

    #[test]
    fn reads_multiple_lods_from_tables_instead_of_treating_offsets_as_indices() {
        let mut bytes = fixture();
        for (at, value) in [
            (0x118, 2),
            (0x11C, 0x1C0),
            (0x124, 0x1C8),
            (0x140, 0x1D0),
            (0x1C0, 0),
            (0x1C4, 1),
            (0x1C8, 0),
            (0x1CC, 1),
        ] {
            put(&mut bytes, at, value);
        }
        put(&mut bytes, 0x1D0, 5f32.to_bits());
        put(&mut bytes, 0x1D4, 25f32.to_bits());
        let file = FmpFile::parse(&bytes).unwrap();
        let lods = &file.objects[0].entities[0].lods;
        assert_eq!(lods.len(), 2);
        assert_eq!(lods[1].nsk, Some(1));
        assert_eq!(lods[1].emm, Some(1));
        assert_eq!(lods[1].distance, 25.0);
    }

    #[test]
    fn rejects_truncated_invalid_indices_nonfinite_matrices_and_overflowing_tables() {
        let original = fixture();
        for length in [0, 111, 0xC3, 0x143, 0x250] {
            assert!(FmpFile::parse(&original[..length]).is_err());
        }
        for (at, value) in [
            (0x11C, 2),
            (0x120, 1),
            (0x124, 2),
            (0x130, 0),
            (0x34, u32::MAX),
            (0x30, u32::MAX),
            (0x84, u32::MAX),
            (0x94, f32::NAN.to_bits()),
            (0x44, 4),
            (0x70, u32::MAX),
            (0x118, u32::MAX),
        ] {
            let mut bytes = original.clone();
            put(&mut bytes, at, value);
            assert!(FmpFile::parse(&bytes).is_err(), "field {at:x} accepted {value:x}");
        }
        let mut bytes = original.clone();
        bytes[0] = b'?';
        assert!(FmpFile::parse(&bytes).is_err());
        put(&mut bytes, 0, u32::from_le_bytes(*b"#FMP"));
        put(&mut bytes, 4, 0);
        assert!(FmpFile::parse(&bytes).is_err());
    }

    #[test]
    fn rejects_pointer_arithmetic_overflow_and_shared_string_budget_exhaustion() {
        let bytes = fixture();
        let reader = Reader(&bytes);
        assert!(reader.u32(usize::MAX).is_err());
        assert!(reader.range(usize::MAX, 2, 4).is_err());
        let mut budget = MAX_TEXT_BYTES;
        assert!(reader.string(0x200, &mut budget).is_err());
    }

    #[test]
    fn column_major_conversion_preserves_basis_and_translation() {
        let matrix =
            fmp_matrix_column_major(&[0.0, 0.0, -1.0, 0.0, 1.0, 0.0, 1.0, 0.0, 0.0, 3.0, 4.0, 5.0]);
        // A local +X basis vector rotates toward -Z, then receives the source translation.
        assert_eq!(
            [matrix[0] + matrix[12], matrix[1] + matrix[13], matrix[2] + matrix[14]],
            [3.0, 4.0, 4.0]
        );
    }

    #[test]
    fn parses_real_bftok_manifest_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_BFTOK_FMP") else { return };
        let file = FmpFile::parse(&std::fs::read(path).unwrap()).unwrap();
        assert_eq!(file.objects.len(), 7);
        assert_eq!(file.resources.nsk.len(), 4);
        assert_eq!(file.resources.emb.len(), 1);
        assert_eq!(
            file.objects
                .iter()
                .flat_map(|object| &object.entities)
                .filter(|entity| !entity.lods.is_empty())
                .count(),
            4
        );
    }

    #[test]
    fn parses_real_bflbn_instances_and_cross_directory_dependencies_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_BFLBN_FMP") else { return };
        let file = FmpFile::parse(&std::fs::read(path).unwrap()).unwrap();
        assert_eq!(file.objects.len(), 173);
        assert_eq!(file.resources.nsk.len(), 60);
        assert!(file.resources.nsk.iter().any(|name| name == "LBY\\NLBYa40.nsk"));
        let palm = file.objects.iter().find(|object| object.name == "ACT40_palm01").unwrap();
        assert!((palm.matrix[9] - 77.12407).abs() < 0.001);
        assert_eq!(palm.entities[0].lods[0].nsk, Some(0));
        assert!(
            file.objects
                .iter()
                .flat_map(|object| &object.entities)
                .any(|entity| entity.lods.len() > 1)
        );
    }

    #[test]
    fn parses_real_eve_spawns_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_BFLBN_EVE") else { return };
        let file = FmpFile::parse(&std::fs::read(path).unwrap()).unwrap();
        assert_eq!(file.objects.len(), 46);
        assert_eq!(file.named_point("VS_INIT_POS_A_0"), Some([0.0, 0.0, -10.0]));
        assert_eq!(file.named_point("VS_INIT_POS_B_0"), Some([0.0, 0.0, 10.0]));
    }
}
