// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Global 2D/3D sprite and animation manifest for the Dragon Pixel engine.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SpriteManifest {
    #[serde(rename = "$schema", default)]
    pub schema: Option<String>,
    pub version: String,
    pub asset_base_url: String,
    pub meta: SpriteMeta,
    pub roster: HashMap<String, FighterSpriteDefinition>,
    pub vfx: VfxCatalog,
    pub ui: UiSpriteCatalog,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SpriteMeta {
    pub engine: String,
    pub target_fps: u32,
    pub pixel_ratio: f32,
    pub texture_format: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FighterSpriteDefinition {
    pub id: String,
    pub name: String,
    pub name_ja: String,
    pub style: String,
    pub base_hp: f32,
    pub base_ki: f32,
    pub base_power_level: u64,
    pub emblem: String,
    pub forms: Vec<FormSpriteDefinition>,
    pub actions: HashMap<String, ActionSpriteDefinition>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FormSpriteDefinition {
    pub level: u32,
    pub id: String,
    pub name: String,
    pub name_ja: String,
    pub power_multiplier: f32,
    pub power_level: u64,
    pub aura_type: String,
    pub aura_color: [f32; 4],
    pub atlas: String,
    pub texture: String,
    #[serde(default)]
    pub texture_sha256: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ActionSpriteDefinition {
    pub kind: String,
    pub frame_start: u32,
    pub frame_count: u32,
    #[serde(rename = "loop", default)]
    pub is_loop: Option<bool>,
    pub fps: u32,
    #[serde(default)]
    pub startup_frames: Option<u32>,
    #[serde(default)]
    pub active_frames: Option<u32>,
    #[serde(default)]
    pub recovery_frames: Option<u32>,
    pub pivot: [i32; 2],
    #[serde(default)]
    pub hurtbox: Option<[i32; 4]>,
    #[serde(default)]
    pub hitbox: Option<[i32; 4]>,
    #[serde(default)]
    pub damage: Option<f32>,
    #[serde(default)]
    pub ki_gain: Option<f32>,
    #[serde(default)]
    pub ki_cost: Option<f32>,
    #[serde(default)]
    pub hitstun_frames: Option<u32>,
    #[serde(default)]
    pub blockstun_frames: Option<u32>,
    #[serde(default)]
    pub is_beam: Option<bool>,
    #[serde(default)]
    pub beam_id: Option<String>,
    #[serde(default)]
    pub hitspark: Option<String>,
    #[serde(default)]
    pub sfx: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VfxCatalog {
    pub hitsparks: HashMap<String, HitsparkVfxDefinition>,
    pub beams: HashMap<String, BeamVfxDefinition>,
    pub auras: HashMap<String, AuraVfxDefinition>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HitsparkVfxDefinition {
    pub atlas: String,
    pub texture: String,
    pub frame_start: u32,
    pub frame_count: u32,
    pub fps: u32,
    pub scale: f32,
    pub blend_mode: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BeamVfxDefinition {
    pub color: [f32; 4],
    pub glow_radius: f32,
    pub charge_atlas: String,
    pub beam_texture: String,
    pub impact_atlas: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AuraVfxDefinition {
    pub atlas: String,
    pub texture: String,
    pub frame_count: u32,
    pub fps: u32,
    #[serde(rename = "loop", default)]
    pub is_loop: Option<bool>,
    pub blend_mode: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UiSpriteCatalog {
    pub hud: HudUiElements,
    pub chibi_avatars: ChibiAvatarsDefinition,
    pub stamps: StampsDefinition,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HudUiElements {
    pub hp_bar_frame: String,
    pub ki_bar_frame: String,
    pub dragon_radar: String,
    pub dragon_balls_atlas: String,
    pub combo_font_atlas: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChibiAvatarsDefinition {
    pub atlas: String,
    pub texture: String,
    pub tile_size: [u32; 2],
    pub characters: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StampsDefinition {
    pub directory: String,
    pub items: Vec<StampItem>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StampItem {
    pub id: String,
    pub file: String,
    pub character: String,
}

impl SpriteManifest {
    /// Parse from JSON raw string.
    pub fn from_json_str(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_manifest() {
        let manifest_raw = include_str!("../../../data/games/dragon-ball-sprites-manifest.json");
        let manifest = SpriteManifest::from_json_str(manifest_raw)
            .expect("Failed to deserialize dragon-ball-sprites-manifest.json");
        assert_eq!(manifest.version, "1.0.0");
        assert_eq!(manifest.meta.engine, "dragon-pixel");
        assert!(manifest.roster.contains_key("goku"));
        assert!(manifest.roster.contains_key("vegeta"));
        assert_eq!(manifest.ui.chibi_avatars.characters.len(), 10);
    }
}
