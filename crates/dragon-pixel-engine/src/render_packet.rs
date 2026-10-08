// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};

/// Rendu de la caméra et secousses d'écran pour les shaders WGSL.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct CameraData {
    pub shake_offset_x: f32,
    pub shake_offset_y: f32,
    pub trauma: f32,
    pub time: f32,
    pub aspect_ratio: f32,
}

/// Rendu de l'arène sélectionnée avec défilement de parallaxe.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ArenaRenderData {
    pub arena_index: u32,
    pub time: f32,
    pub scroll_x: f32,
    pub ground_y: f32,
}

/// Données d'instance d'un combattant transmises au buffer GPU.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FighterRenderData {
    pub fighter_index: u32,
    pub x: f32,
    pub y: f32,
    pub facing: f32,
    pub state_index: u32,
    pub frame_phase: u32,
    pub current_anim_frame: u32,
    pub form_level: u32,
    pub flash_intensity: f32,
    pub aura_type: u32,
    pub aura_color: [f32; 4],
    pub aura_intensity: f32,
    pub has_ssj2_lightning: bool,
}

/// Projectile de Kikōha ou rayon d'énergie pour le pipeline WebGPU.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProjectileRenderData {
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub is_beam: bool,
    pub width: f32,
    pub height: f32,
    pub color: [f32; 4],
    pub glow_radius: f32,
}

/// État de rendu d'un choc de Kikōha (Beam Clash).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BeamClashRenderData {
    pub active: bool,
    pub clash_x: f32,
    pub clash_y: f32,
    pub tension: f32,
    pub player_color: [f32; 4],
    pub enemy_color: [f32; 4],
    pub sphere_radius: f32,
    pub shockwave_scale: f32,
}

/// Particule d'impact, étincelle de ki ou éclat de roche.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ParticleRenderData {
    pub x: f32,
    pub y: f32,
    pub size: f32,
    pub life_ratio: f32,
    pub color: [f32; 4],
}

/// Données pour l'affichage de l'ATH rétro / Scouter.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct UiOverlayData {
    pub player_hp_ratio: f32,
    pub player_ki_ratio: f32,
    pub enemy_hp_ratio: f32,
    pub enemy_ki_ratio: f32,
    pub player_name: String,
    pub enemy_name: String,
    pub player_combo: u32,
    pub player_score: u32,
    pub time_elapsed: f32,
    pub player_power_level: u64,
    pub enemy_power_level: u64,
    pub clash_active: bool,
    pub clash_tension: f32,
    pub chapter_title: String,
}

/// Paquet complet de rendu produit à chaque tick déterministe pour le pipeline WebGPU.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WebGpuRenderPacket {
    pub camera: CameraData,
    pub arena: ArenaRenderData,
    pub player: FighterRenderData,
    pub enemy: Option<FighterRenderData>,
    pub projectiles: Vec<ProjectileRenderData>,
    pub clash: BeamClashRenderData,
    pub particles: Vec<ParticleRenderData>,
    pub ui: UiOverlayData,
}
