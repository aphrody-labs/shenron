// SPDX-License-Identifier: Apache-2.0

use crate::combat::DragonPixelEngineCore;
use crate::input::{EngineInput, GamepadType, parse_standard_gamepad};
use crate::types::{ArenaId, FighterId, GameMode};

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

/// Pont d'intégration WebAssembly pour le moteur Dragon Pixel.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub struct DragonPixelEngineWasm {
    core: DragonPixelEngineCore,
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
impl DragonPixelEngineWasm {
    #[cfg_attr(target_arch = "wasm32", wasm_bindgen(constructor))]
    pub fn new(fighter_id: &str, mode_str: &str, chapter_id: u32, arena_str: &str) -> Self {
        let f_id = FighterId::from_str_loose(fighter_id);
        let g_mode = GameMode::from_str_loose(mode_str);
        let a_id = ArenaId::from_str_loose(arena_str);
        let core = DragonPixelEngineCore::new(f_id, g_mode, chapter_id, a_id);
        Self { core }
    }

    /// Exécute un pas de simulation déterministe avec les entrées utilisateur.
    pub fn step(&mut self, input_json: &str, dt: f32) -> String {
        let input: EngineInput = serde_json::from_str(input_json).unwrap_or_default();
        self.core.step(input, dt);
        self.core.status.clone()
    }

    /// Récupère le paquet de rendu complet formaté pour les pipelines WebGPU (WGSL).
    pub fn get_render_packet_json(&self) -> String {
        let packet = self.core.create_render_packet();
        serde_json::to_string(&packet).unwrap_or_else(|_| "{}".into())
    }

    /// Draine et renvoie les événements de secousse haptique pour la manette physique.
    pub fn poll_haptic_events_json(&mut self) -> String {
        let events = std::mem::take(&mut self.core.haptic_queue);
        serde_json::to_string(&events).unwrap_or_else(|_| "[]".into())
    }

    /// Draine et renvoie les événements audio déclenchés.
    pub fn poll_audio_events_json(&mut self) -> String {
        let events = std::mem::take(&mut self.core.audio_queue);
        serde_json::to_string(&events).unwrap_or_else(|_| "[]".into())
    }

    /// Réinitialise le combat en cours.
    pub fn restart(&mut self) {
        let p_id = self.core.player.id;
        let mode = self.core.mode;
        let chap = self.core.current_chapter_id;
        let arena = self.core.arena;
        self.core = DragonPixelEngineCore::new(p_id, mode, chap, arena);
    }

    /// Modifie le chapitre du Mode Histoire en cours.
    pub fn set_chapter(&mut self, chapter_id: u32) {
        let p_id = self.core.player.id;
        let arena = self.core.arena;
        self.core = DragonPixelEngineCore::new(p_id, GameMode::Story, chapter_id, arena);
    }

    /// Modifie le combattant sélectionné.
    pub fn set_fighter(&mut self, fighter_id: &str) {
        let f_id = FighterId::from_str_loose(fighter_id);
        let mode = self.core.mode;
        let chap = self.core.current_chapter_id;
        let arena = self.core.arena;
        self.core = DragonPixelEngineCore::new(f_id, mode, chap, arena);
    }

    /// Renvoie le statut actuel du jeu ("playing", "won", "lost").
    pub fn get_status(&self) -> String {
        self.core.status.clone()
    }
}

/// Maps a Standard Gamepad snapshot (stick axes and pressed flags in W3C order) to the JSON of an
/// engine input, so the canvas view uses the same mapper as the Bevy view.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub fn map_standard_gamepad(axes: &[f32], pressed: &[u8], deadzone: f32) -> String {
    let buttons: Vec<bool> = pressed.iter().map(|state| *state != 0).collect();
    let input = parse_standard_gamepad(axes, &buttons, deadzone, GamepadType::Generic);
    serde_json::to_string(&input).unwrap_or_else(|_| "{}".into())
}

/// Story chapters in chronological order with their sources (manga volume and episode rows), as JSON
/// for the chapter picker of the site: the roster stays the only list of chapters.
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub fn story_chapters_json() -> String {
    #[derive(serde::Serialize)]
    struct ChapterSummary<'a> {
        id: u32,
        saga: &'a str,
        title: &'a str,
        title_ja: &'a str,
        episode_id: Option<u32>,
        manga_volume_id: Option<u32>,
    }
    let chapters = crate::roster::get_story_chapters();
    let summaries: Vec<ChapterSummary<'_>> = chapters
        .iter()
        .map(|chapter| ChapterSummary {
            id: chapter.id,
            saga: &chapter.saga,
            title: &chapter.title,
            title_ja: &chapter.title_ja,
            episode_id: chapter.episode_id,
            manga_volume_id: chapter.manga_volume_id,
        })
        .collect();
    serde_json::to_string(&summaries).unwrap_or_else(|_| "[]".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gamepad_snapshot_maps_to_engine_input_json() {
        let mut pressed = [0_u8; 16];
        pressed[2] = 1;
        let json = map_standard_gamepad(&[-0.9, 0.0], &pressed, 0.15);
        let input: EngineInput = serde_json::from_str(&json).unwrap_or_default();
        assert!(input.left && input.punch);
        assert!(!input.right);
    }

    #[test]
    fn story_chapters_json_lists_every_chapter_with_its_sources() {
        let chapters: Vec<serde_json::Value> = serde_json::from_str(&story_chapters_json()).unwrap_or_default();
        assert_eq!(chapters.len(), crate::roster::get_story_chapters().len());
        assert_eq!(chapters[17]["episode_id"], 880);
        assert_eq!(chapters[0]["manga_volume_id"], 82);
    }
}
