// SPDX-License-Identifier: Apache-2.0

//! GPU render packet generation for zero-copy 60/120 FPS WebGPU rendering.

use super::combat::DragonPixelEngineCore;
use super::types::{ArenaId, Rect};
use serde::{Deserialize, Serialize};

/// Dynamic camera state including screen shake.
#[derive(Copy, Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CameraData {
    pub center_x: f32,
    pub center_y: f32,
    pub zoom: f32,
    pub shake_offset_x: f32,
    pub shake_offset_y: f32,
}

/// Arena background rendering info.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ArenaRenderData {
    pub arena_id: ArenaId,
    pub width: u32,
    pub height: u32,
}

/// Render descriptor for an active fighter.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FighterRenderData {
    pub name: String,
    pub x: f32,
    pub y: f32,
    pub facing_right: bool,
    pub state_label: String,
    pub hp_ratio: f32,
    pub ki_ratio: f32,
    pub aura_color: [f32; 4],
    pub hurtbox: Rect,
    pub active_hitbox: Option<Rect>,
}

/// Individual particle render entry.
#[derive(Copy, Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ParticleRenderData {
    pub x: f32,
    pub y: f32,
    pub size: f32,
    pub color: [f32; 4],
}

/// Active beam clash rendering geometry.
#[derive(Copy, Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BeamClashRenderData {
    pub p1_beam_start: (f32, f32),
    pub p2_beam_start: (f32, f32),
    pub clash_point: (f32, f32),
    pub dominance: f32,
    pub p1_beam_color: [f32; 4],
    pub p2_beam_color: [f32; 4],
}

/// HUD UI overlay data.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UiOverlayData {
    pub match_frame: u64,
    pub p1_name: String,
    pub p2_name: String,
    pub p1_combo: u32,
    pub p2_combo: u32,
    pub winner: Option<u8>,
}

/// The complete WebGPU frame packet delivered per tick to the GPU renderer.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct WebGpuRenderPacket {
    pub camera: CameraData,
    pub arena: ArenaRenderData,
    pub fighters: [FighterRenderData; 2],
    pub particles: Vec<ParticleRenderData>,
    pub beam_clash: Option<BeamClashRenderData>,
    pub ui: UiOverlayData,
}

impl WebGpuRenderPacket {
    /// Extracts a complete render packet from the simulation core state.
    #[must_use]
    pub fn from_core(core: &DragonPixelEngineCore) -> Self {
        let cam_x = (core.p1.x + core.p2.x) * 0.5;
        let cam_y = ((core.p1.y + core.p2.y) * 0.5).min(0.0);
        let dist = (core.p1.x - core.p2.x).abs();
        let zoom = (1000.0 / dist.max(400.0)).clamp(0.7, 1.25);

        let camera = CameraData {
            center_x: cam_x,
            center_y: cam_y - 60.0,
            zoom,
            shake_offset_x: 0.0,
            shake_offset_y: 0.0,
        };

        let arena = ArenaRenderData { arena_id: core.arena, width: 1000, height: 600 };

        let build_fighter = |f: &super::combat::FighterEntity| -> FighterRenderData {
            FighterRenderData {
                name: f.def.name.clone(),
                x: f.x,
                y: f.y,
                facing_right: f.facing_right,
                state_label: format!("{:?}", f.state),
                hp_ratio: (f.hp / f.def.max_hp).clamp(0.0, 1.0),
                ki_ratio: (f.ki / f.def.max_ki).clamp(0.0, 1.0),
                aura_color: f.def.aura_color,
                hurtbox: f.hurtbox(),
                active_hitbox: f.active_hitbox(),
            }
        };

        let fighters = [build_fighter(&core.p1), build_fighter(&core.p2)];

        let particles = core
            .particles
            .iter()
            .map(|p| ParticleRenderData { x: p.x, y: p.y, size: p.size, color: p.color })
            .collect();

        let beam_clash = core.beam_clash.as_ref().map(|c| {
            let _total_dist = (c.p2_x - c.p1_x).abs().max(100.0);
            let mash_diff = (c.p1_mashes as f32) - (c.p2_mashes as f32);
            let dominance = (mash_diff * 0.04).clamp(-1.0, 1.0);
            BeamClashRenderData {
                p1_beam_start: (c.p1_x, c.clash_y),
                p2_beam_start: (c.p2_x, c.clash_y),
                clash_point: (c.current_x, c.clash_y),
                dominance,
                p1_beam_color: core.p1.def.beam_color,
                p2_beam_color: core.p2.def.beam_color,
            }
        });

        let ui = UiOverlayData {
            match_frame: core.frame_count,
            p1_name: core.p1.def.name.clone(),
            p2_name: core.p2.def.name.clone(),
            p1_combo: core.p1.combo_hits,
            p2_combo: core.p2.combo_hits,
            winner: core.winner,
        };

        Self { camera, arena, fighters, particles, beam_clash, ui }
    }
}
