// SPDX-License-Identifier: Apache-2.0

//! WebAssembly bindings for browser WebGPU canvas and JS game loops.

use crate::canvas::{BubbleKind, CanvasSurface, ColorRgba, SpeechBubble, TextLayoutConfig, WritingDirection};
use crate::game::{
    ArenaId, DragonPixelEngineCore, FighterId, FighterInput, GameMode, WebGpuRenderPacket,
};
use glam::Vec2;

#[cfg(feature = "wasm")]
use wasm_bindgen::prelude::*;

/// WebAssembly wrapper around the deterministic game simulation core.
#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub struct ShenronEngineWasm {
    core: DragonPixelEngineCore,
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
impl ShenronEngineWasm {
    /// Creates a new match between two fighters by string name.
    #[must_use]
    pub fn new(
        p1_name: &str,
        p2_name: &str,
        arena_name: &str,
        mode_name: &str,
    ) -> Self {
        let p1_id = match p1_name.to_lowercase().as_str() {
            "vegeta" => FighterId::Vegeta,
            "gohan" => FighterId::Gohan,
            "piccolo" => FighterId::Piccolo,
            "frieza" => FighterId::Frieza,
            "cell" => FighterId::Cell,
            "majinbuu" | "buu" => FighterId::MajinBuu,
            "trunks" => FighterId::Trunks,
            "yamcha" => FighterId::Yamcha,
            _ => FighterId::Goku,
        };

        let p2_id = match p2_name.to_lowercase().as_str() {
            "goku" => FighterId::Goku,
            "gohan" => FighterId::Gohan,
            "piccolo" => FighterId::Piccolo,
            "frieza" => FighterId::Frieza,
            "cell" => FighterId::Cell,
            "majinbuu" | "buu" => FighterId::MajinBuu,
            "trunks" => FighterId::Trunks,
            "yamcha" => FighterId::Yamcha,
            _ => FighterId::Vegeta,
        };

        let arena = match arena_name.to_lowercase().as_str() {
            "namek" => ArenaId::Namek,
            "cellgames" => ArenaId::CellGames,
            "tournament" => ArenaId::Tournament,
            "kaioshin" => ArenaId::KaioshinRealm,
            "timechamber" => ArenaId::TimeChamber,
            _ => ArenaId::Paozu,
        };

        let mode = match mode_name.to_lowercase().as_str() {
            "story" => GameMode::Story,
            "arcade" => GameMode::Arcade,
            "training" => GameMode::Training,
            _ => GameMode::Versus,
        };

        Self {
            core: DragonPixelEngineCore::new(p1_id, p2_id, arena, mode),
        }
    }

    /// Advances the simulation by 1 frame with raw boolean input flags.
    #[allow(clippy::too_many_arguments)]
    pub fn tick_raw(
        &mut self,
        p1_left: bool,
        p1_right: bool,
        p1_up: bool,
        p1_down: bool,
        p1_light: bool,
        p1_heavy: bool,
        p1_special: bool,
        p1_ultimate: bool,
        p1_block: bool,
        p2_left: bool,
        p2_right: bool,
        p2_up: bool,
        p2_down: bool,
        p2_light: bool,
        p2_heavy: bool,
        p2_special: bool,
        p2_ultimate: bool,
        p2_block: bool,
    ) {
        let p1_input = FighterInput {
            left: p1_left,
            right: p1_right,
            up: p1_up,
            down: p1_down,
            light_attack: p1_light,
            heavy_attack: p1_heavy,
            special: p1_special,
            ultimate: p1_ultimate,
            block: p1_block,
            dash: false,
        };

        let p2_input = FighterInput {
            left: p2_left,
            right: p2_right,
            up: p2_up,
            down: p2_down,
            light_attack: p2_light,
            heavy_attack: p2_heavy,
            special: p2_special,
            ultimate: p2_ultimate,
            block: p2_block,
            dash: false,
        };

        self.core.tick(p1_input, p2_input);
    }

    /// Returns the WebGPU render packet serialized as a JSON string.
    #[must_use]
    pub fn get_render_packet_json(&self) -> String {
        let packet = WebGpuRenderPacket::from_core(&self.core);
        serde_json::to_string(&packet).unwrap_or_else(|_| "{}".into())
    }

    /// Returns Player 1's current HP.
    #[inline]
    #[must_use]
    pub fn p1_hp(&self) -> f32 {
        self.core.p1.hp
    }

    /// Returns Player 2's current HP.
    #[inline]
    #[must_use]
    pub fn p2_hp(&self) -> f32 {
        self.core.p2.hp
    }

    /// Returns Player 1's current Ki.
    #[inline]
    #[must_use]
    pub fn p1_ki(&self) -> f32 {
        self.core.p1.ki
    }

    /// Returns Player 2's current Ki.
    #[inline]
    #[must_use]
    pub fn p2_ki(&self) -> f32 {
        self.core.p2.ki
    }

    /// Checks if the match has concluded.
    #[inline]
    #[must_use]
    pub fn is_match_over(&self) -> bool {
        self.core.winner.is_some()
    }

    /// Returns winner index (1 = P1, 2 = P2, 0 = Draw, None = In Progress).
    #[inline]
    #[must_use]
    pub fn winner(&self) -> Option<u8> {
        self.core.winner
    }

    /// Returns JSON array of audio events triggered in the current frame.
    #[must_use]
    pub fn get_audio_events_json(&self) -> String {
        serde_json::to_string(&self.core.audio_events).unwrap_or_else(|_| "[]".into())
    }

    /// Returns JSON array of haptic events triggered in the current frame.
    #[must_use]
    pub fn get_haptic_events_json(&self) -> String {
        serde_json::to_string(&self.core.haptic_events).unwrap_or_else(|_| "[]".into())
    }
}

/// WebAssembly wrapper around the 2D vector canvas.
#[cfg_attr(feature = "wasm", wasm_bindgen)]
pub struct CanvasEngineWasm {
    surface: CanvasSurface,
}

#[cfg_attr(feature = "wasm", wasm_bindgen)]
impl CanvasEngineWasm {
    /// Creates a new WASM canvas surface.
    #[must_use]
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            surface: CanvasSurface::new(width, height),
        }
    }

    /// Clears the canvas with an RGBA color.
    pub fn clear(&mut self, r: u8, g: u8, b: u8, a: u8) {
        self.surface.clear(ColorRgba::new(r, g, b, a));
    }

    /// Fills an axis-aligned rectangle.
    #[allow(clippy::too_many_arguments)]
    pub fn fill_rect(&mut self, x: f32, y: f32, w: f32, h: f32, r: u8, g: u8, b: u8, a: u8) {
        self.surface.fill_rect(Vec2::new(x, y), Vec2::new(w, h), ColorRgba::new(r, g, b, a));
    }

    /// Draws a procedural manga speech bubble.
    #[allow(clippy::too_many_arguments)]
    pub fn draw_speech_bubble(
        &mut self,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        kind_str: &str,
        tip_x: f32,
        tip_y: f32,
    ) {
        let kind = match kind_str.to_lowercase().as_str() {
            "shout" => BubbleKind::Shout,
            "thought" => BubbleKind::Thought,
            _ => BubbleKind::Normal,
        };

        let mut bubble = SpeechBubble::new(Vec2::new(x, y), Vec2::new(w, h), kind);
        if tip_x > 0.0 || tip_y > 0.0 {
            bubble = bubble.with_tail(Vec2::new(tip_x, tip_y), 24.0);
        }

        self.surface.draw_speech_bubble(&bubble, ColorRgba::WHITE, ColorRgba::BLACK);
    }

    /// Draws text with horizontal or vertical typesetting.
    pub fn draw_text(&mut self, text: &str, x: f32, y: f32, font_size: f32, vertical: bool) {
        let config = TextLayoutConfig {
            font_size,
            direction: if vertical {
                WritingDirection::VerticalRtl
            } else {
                WritingDirection::HorizontalLtr
            },
            ..Default::default()
        };
        self.surface.draw_text(text, Vec2::new(x, y), &config, ColorRgba::BLACK);
    }

    /// Returns a copy of the RGBA pixel buffer.
    #[must_use]
    pub fn get_pixel_data(&self) -> Vec<u8> {
        self.surface.pixels().to_vec()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wasm_engine_wrapper_simulation() {
        let mut engine = ShenronEngineWasm::new("goku", "vegeta", "cellgames", "versus");
        assert_eq!(engine.p1_hp(), 10000.0);
        assert_eq!(engine.p2_hp(), 9500.0);

        engine.tick_raw(
            false, true, false, false, true, false, false, false, false,
            false, false, false, false, false, false, false, false, false,
        );

        let packet_json = engine.get_render_packet_json();
        assert!(packet_json.contains("fighters"));
    }
}
