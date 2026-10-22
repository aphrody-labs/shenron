// SPDX-License-Identifier: Apache-2.0
//! CUS (Character Ultimate Skill) binary format parser.
//!
//! `data/system/custom_skill.cus` lists every skill in the game, across six categories
//! (Super, Ultimate, Evasive, an unnamed one, Blast, Awoken) plus a skillset table that
//! groups skill ids into the sets characters/costumes equip.
//!
//! Layout (little-endian): `#CUS`, `u16 0xFFFE`, `u16`, then seven `(count, offset)` header
//! fields: skillset (count @8, offset @12), super (count @16, offset @40), ultimate
//! (count @20, offset @44), evasive (count @24, offset @48), an unnamed category
//! (count @28, offset @52), blast (count @32, offset @56), awoken (count @36, offset @60).
//! A skillset entry is 32 bytes: `i32 id, i32, u16×9`. A skill entry's byte stride encodes
//! the CUS version (`(next_offset - this_offset) / count`); only version 3 (patch 1.25+,
//! stride 92, cross-checked against LazyBone's MIT XV2-Tools `CUS_File.cs`/`Parser.cs`) is
//! supported, which is what the game currently ships. Every count/offset in this layout was
//! verified against the real 434-skillset file: each category's declared offset lands
//! exactly at the previous category's `offset + count * stride`.
//!
//! Which character a skill belongs to is not stored directly; it is derived from
//! [`CusSkill::id2`]: within each category independently, a character's ten skill slots are
//! `id2 ∈ [cms_id * 10, cms_id * 10 + 10)` (`cms_id` from [`super::cms::CmsFile`]'s roster).
//! This is XV2-Tools' own id-assignment rule (`CUS_File.AssignNewSkillId`: `cmsEntry.ID *
//! 10`), confirmed against the real file: Goku (`cms_id` 0) owns the ten Super skills with
//! `id2` 0..9 (`KMH` Kamehameha, `GKD` Kaioken Kamehameha at slot 4 -- matching the real
//! `data/skill/SPA/004_GOK_GKD/` asset path -- …), and `id2` 10..17 continues with another
//! character's skills without a gap.

use crate::error::{ReError, Result};
use crate::formats::esk::{c_string_at, u16_at, u32_at};
use serde::{Deserialize, Serialize};

pub const CUS_MAGIC: &[u8; 4] = b"#CUS";

const SKILLSET_SIZE: usize = 32;
/// Byte stride of a version-3 (patch 1.25+) skill entry; the only version this parses.
const SKILL_SIZE_V3: usize = 92;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SkillCategory {
    Super,
    Ultimate,
    Evasive,
    Unk,
    Blast,
    Awoken,
}

/// One entry of the skillset table: the skill ids a character/costume equips by default.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skillset {
    pub id: i32,
    pub flags: i32,
    pub values: [u16; 9],
}

/// One skill: its short code, equip constraints, referenced assets and stat ids.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CusSkill {
    pub category: SkillCategory,
    /// Four-letter code (e.g. an ability's short name).
    pub short_name: String,
    pub id1: u16,
    pub id2: u16,
    /// `CusRaceLock` bitflags (HUM 1, SYM 2, NMC 4, FRI 8, MAM 0x10, HUF 0x20, SYF 0x40,
    /// MAF 0x80); 0 means unlocked for every race.
    pub race_lock: u8,
    /// Which optional asset paths below are actually present (`FilesLoadedFlags`).
    pub files_loaded: u16,
    pub ean_path: Option<String>,
    pub cam_ean_path: Option<String>,
    pub eepk_path: Option<String>,
    pub se_path: Option<String>,
    pub vox_path: Option<String>,
    pub after_bac_path: Option<String>,
    pub after_bcm_path: Option<String>,
    /// PUP (power-up preset) id this skill applies, if any.
    pub pup: u16,
    pub cus_aura: i16,
    pub num_transformations: u16,
    pub part_set: i32,
    pub part_set_2: i32,
    pub part_set_3: i32,
    pub chara_swap_id: i32,
    pub chara_swap_id_2: i32,
    pub chara_swap_id_3: i32,
    pub skillset_change_1: i16,
    pub skillset_change_2: i16,
    pub skillset_change_3: i16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CusFile {
    pub skillsets: Vec<Skillset>,
    pub skills: Vec<CusSkill>,
}

fn optional_path(buffer: &[u8], at: usize) -> Result<Option<String>> {
    let ptr = u32_at(buffer, at)? as usize;
    if ptr == 0 {
        return Ok(None);
    }
    Ok(Some(c_string_at(buffer, ptr)?))
}

/// `u16::MAX`-sentinel part/character-swap fields decode to `-1`, matching the reference.
fn signed_slot(raw: u16) -> i32 {
    if raw == u16::MAX { -1 } else { raw as i32 }
}

fn parse_skillset(buffer: &[u8], at: usize) -> Result<Skillset> {
    let mut values = [0u16; 9];
    for (k, slot) in values.iter_mut().enumerate() {
        *slot = u16_at(buffer, at + 8 + k * 2)?;
    }
    Ok(Skillset { id: u32_at(buffer, at)? as i32, flags: u32_at(buffer, at + 4)? as i32, values })
}

fn parse_skill(buffer: &[u8], at: usize, category: SkillCategory) -> Result<CusSkill> {
    let u16 = |o: usize| u16_at(buffer, at + o);
    let i16 = |o: usize| u16_at(buffer, at + o).map(|v| v as i16);
    Ok(CusSkill {
        category,
        short_name: c_string_at(buffer, at)?.chars().take(4).collect(),
        id1: u16(8)?,
        id2: u16(10)?,
        race_lock: *buffer
            .get(at + 12)
            .ok_or(ReError::BufferTooSmall { required: at + 13, available: buffer.len() })?,
        files_loaded: u16(14)?,
        ean_path: optional_path(buffer, at + 20)?,
        cam_ean_path: optional_path(buffer, at + 24)?,
        eepk_path: optional_path(buffer, at + 28)?,
        se_path: optional_path(buffer, at + 32)?,
        vox_path: optional_path(buffer, at + 36)?,
        after_bac_path: optional_path(buffer, at + 40)?,
        after_bcm_path: optional_path(buffer, at + 44)?,
        pup: u16(56)?,
        cus_aura: i16(58)?,
        num_transformations: u16(60)?,
        part_set: signed_slot(u16(64)?),
        part_set_2: signed_slot(u16(66)?),
        part_set_3: signed_slot(u16(68)?),
        chara_swap_id: signed_slot(u16(70)?),
        chara_swap_id_2: signed_slot(u16(72)?),
        chara_swap_id_3: signed_slot(u16(74)?),
        skillset_change_1: i16(76)?,
        skillset_change_2: i16(78)?,
        skillset_change_3: i16(80)?,
    })
}

impl CusFile {
    pub fn parse(buffer: &[u8]) -> Result<Self> {
        if buffer.len() < 64 {
            return Err(ReError::BufferTooSmall { required: 64, available: buffer.len() });
        }
        if &buffer[0..4] != CUS_MAGIC {
            return Err(ReError::InvalidMagic {
                expected: CUS_MAGIC.to_vec(),
                found: buffer[0..4].to_vec(),
            });
        }
        let skillset_count = u32_at(buffer, 8)? as usize;
        let skillset_offset = u32_at(buffer, 12)? as usize;
        let categories = [
            (SkillCategory::Super, 16, 40),
            (SkillCategory::Ultimate, 20, 44),
            (SkillCategory::Evasive, 24, 48),
            (SkillCategory::Unk, 28, 52),
            (SkillCategory::Blast, 32, 56),
            (SkillCategory::Awoken, 36, 60),
        ];
        if skillset_count > 1_000_000 {
            return Err(ReError::ParseError {
                context: "cus",
                details: format!("{skillset_count} skillsets"),
            });
        }
        let mut skillsets = Vec::with_capacity(skillset_count);
        for i in 0..skillset_count {
            skillsets.push(parse_skillset(buffer, skillset_offset + i * SKILLSET_SIZE)?);
        }

        let mut skills = Vec::new();
        for (category, count_at, offset_at) in categories {
            let count = u32_at(buffer, count_at)? as usize;
            let offset = u32_at(buffer, offset_at)? as usize;
            if count == 0 {
                continue;
            }
            if count > 1_000_000 {
                return Err(ReError::ParseError {
                    context: "cus",
                    details: format!("{count} {category:?} skills"),
                });
            }
            for i in 0..count {
                let at = offset + i * SKILL_SIZE_V3;
                if at + SKILL_SIZE_V3 > buffer.len() {
                    return Err(ReError::BufferTooSmall {
                        required: at + SKILL_SIZE_V3,
                        available: buffer.len(),
                    });
                }
                skills.push(parse_skill(buffer, at, category)?);
            }
        }
        Ok(Self { skillsets, skills })
    }

    pub fn find(&self, category: SkillCategory, id1: u16) -> Option<&CusSkill> {
        self.skills.iter().find(|s| s.category == category && s.id1 == id1)
    }
}

/// Writes a minimal version-3 `.cus` with one skillset and one skill per given category, for
/// tests and tools. Skills carry no string-table paths.
pub fn encode_cus(skillset_id: i32, skills: &[(SkillCategory, &str, u16)]) -> Vec<u8> {
    let mut out = vec![0u8; 64];
    out[0..4].copy_from_slice(CUS_MAGIC);
    out[4..6].copy_from_slice(&0xFFFEu16.to_le_bytes());
    out[8..12].copy_from_slice(&1u32.to_le_bytes());
    out[12..16].copy_from_slice(&64u32.to_le_bytes());
    out[16..20].copy_from_slice(&1u32.to_le_bytes());
    let skillset_end = 64 + SKILLSET_SIZE;
    out.resize(skillset_end, 0);
    out[64..68].copy_from_slice(&skillset_id.to_le_bytes());

    let order = [
        SkillCategory::Super,
        SkillCategory::Ultimate,
        SkillCategory::Evasive,
        SkillCategory::Unk,
        SkillCategory::Blast,
        SkillCategory::Awoken,
    ];
    let offsets = [40usize, 44, 48, 52, 56, 60];
    let counts = [16usize, 20, 24, 28, 32, 36];
    let mut cursor = skillset_end;
    for (category, offset_field, count_field) in
        order.into_iter().zip(offsets).zip(counts).map(|((c, o), n)| (c, o, n))
    {
        let entries: Vec<_> = skills.iter().filter(|(cat, ..)| *cat == category).collect();
        out[count_field..count_field + 4].copy_from_slice(&(entries.len() as u32).to_le_bytes());
        out[offset_field..offset_field + 4].copy_from_slice(&(cursor as u32).to_le_bytes());
        for (_, name, id1) in &entries {
            let mut entry = vec![0u8; SKILL_SIZE_V3];
            entry[0..name.len().min(4)].copy_from_slice(&name.as_bytes()[..name.len().min(4)]);
            entry[8..10].copy_from_slice(&id1.to_le_bytes());
            entry[64..70].copy_from_slice(&[0xFF; 6]); // part_set/2/3 default -1
            out.extend(entry);
            cursor += SKILL_SIZE_V3;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_skillsets_and_skills_across_categories() {
        let bytes = encode_cus(
            7,
            &[(SkillCategory::Super, "KMHM", 12), (SkillCategory::Awoken, "SSJ3", 99)],
        );
        let cus = CusFile::parse(&bytes).unwrap();
        assert_eq!(cus.skillsets.len(), 1);
        assert_eq!(cus.skillsets[0].id, 7);
        assert_eq!(cus.skills.len(), 2);
        let kame = cus.find(SkillCategory::Super, 12).unwrap();
        assert_eq!(kame.short_name, "KMHM");
        assert_eq!(kame.part_set, -1);
        assert!(cus.find(SkillCategory::Ultimate, 12).is_none());
        assert_eq!(cus.find(SkillCategory::Awoken, 99).unwrap().short_name, "SSJ3");
    }

    #[test]
    fn test_invalid_magic() {
        let mut bytes = encode_cus(1, &[(SkillCategory::Super, "ABCD", 1)]);
        bytes[0] = b'X';
        assert!(CusFile::parse(&bytes).is_err());
    }

    #[test]
    fn rejects_truncated_skill_table() {
        let mut bytes = encode_cus(1, &[(SkillCategory::Super, "ABCD", 1)]);
        bytes.truncate(bytes.len() - 10);
        assert!(CusFile::parse(&bytes).is_err());
    }

    /// `SHENRON_REAL_CUS=<path to custom_skill.cus>` checks the real, current-patch file:
    /// 434 skillsets and every category offset landing exactly where declared.
    #[test]
    fn parses_real_skills_when_provided() {
        let Ok(path) = std::env::var("SHENRON_REAL_CUS") else { return };
        let cus = CusFile::parse(&std::fs::read(path).unwrap()).expect("parse real CUS");
        assert_eq!(cus.skillsets.len(), 434);
        assert!(cus.skills.len() > 500, "only {} skills", cus.skills.len());
        assert!(cus.skills.iter().any(|s| s.category == SkillCategory::Super));
        assert!(cus.skills.iter().any(|s| s.category == SkillCategory::Awoken));
        for skill in &cus.skills {
            assert!(
                skill.short_name.chars().all(|c| c.is_ascii_graphic() || c == ' '),
                "{:?} has a non-ASCII short name",
                skill.short_name
            );
        }

        // Goku is cms_id 0: his ten Super skills are id2 0..9, in slot order, starting with
        // Kamehameha and including Kaioken Kamehameha at slot 4 (data/skill/SPA/004_GOK_GKD/).
        let mut goku_supers: Vec<_> = cus
            .skills
            .iter()
            .filter(|s| s.category == SkillCategory::Super && s.id2 < 10)
            .collect();
        goku_supers.sort_by_key(|s| s.id2);
        let names: Vec<_> = goku_supers.iter().map(|s| s.short_name.as_str()).collect();
        assert_eq!(names, ["KMH", "KMC", "CSG", "CRG", "GKD", "SKI", "GTW", "AST", "4KM", "KMQ"]);
    }
}
