// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};

/// Master canonical Dragon Ball story manifest deserializer for Dragon Pixel & Bevy.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanonStoryManifest {
    #[serde(rename = "$schema", default)]
    pub schema: Option<String>,
    pub version: String,
    pub generated_at: String,
    pub source_author: String,
    pub curation: String,
    pub sagas: Vec<CanonSaga>,
    pub chapters: Vec<CanonChapter>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanonSaga {
    pub id: String,
    pub name: String,
    pub name_ja: String,
    pub tomes: Vec<u32>,
    pub era: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanonFighter {
    pub id: String,
    pub name: String,
    pub name_ja: String,
    pub power_level: u64,
    pub style: String,
    #[serde(default)]
    pub boss_hp: Option<f32>,
    pub wiki_slug: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanonRefs {
    pub manga_url: String,
    pub episode_id: u32,
    pub episode_url: String,
    pub wiki_arc_url: String,
    pub technique_slug: String,
    pub daizenshuu: String,
    pub databook_lot: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanonDialogue {
    pub speaker: String,
    pub speaker_ja: String,
    pub text: String,
    pub text_ja: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanonDramaticFinish {
    pub move_name: String, // serialized from "move"
    pub anim_cutscene: String,
}

// Custom deserialize for CanonDramaticFinish to handle "move" keyword
impl<'de> Deserialize<'de> for CanonDramaticFinish {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct Helper {
            #[serde(rename = "move")]
            move_name: String,
            anim_cutscene: String,
        }
        let h = Helper::deserialize(deserializer)?;
        Ok(CanonDramaticFinish {
            move_name: h.move_name,
            anim_cutscene: h.anim_cutscene,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CanonChapter {
    pub id: u32,
    pub saga_id: String,
    pub tome: u32,
    pub manga_chapter: u32,
    pub page_start: u32,
    pub title: String,
    pub title_ja: String,
    pub arena_id: String,
    pub arena_name: String,
    pub player: CanonFighter,
    pub enemy: CanonFighter,
    pub canon_refs: CanonRefs,
    pub dialogue_intro: Vec<CanonDialogue>,
    pub dialogue_victory: Vec<CanonDialogue>,
    pub objective: String,
    pub dramatic_finish: CanonDramaticFinish,
}

impl CanonStoryManifest {
    pub fn from_json_str(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_canon_story_manifest() {
        let raw = include_str!("../../../data/games/canon-story-manifest.json");
        let manifest = CanonStoryManifest::from_json_str(raw)
            .expect("Failed to parse canon-story-manifest.json");
        assert_eq!(manifest.version, "1.0.0");
        assert_eq!(manifest.source_author, "Akira Toriyama");
        assert!(manifest.sagas.len() >= 10);
        assert!(manifest.chapters.len() >= 10);

        let goku_frieza = manifest.chapters.iter().find(|c| c.id == 7).unwrap();
        assert_eq!(goku_frieza.tome, 27);
        assert_eq!(goku_frieza.manga_chapter, 318);
        assert!(goku_frieza.canon_refs.daizenshuu.contains("Daizenshuu 7"));
    }
}
