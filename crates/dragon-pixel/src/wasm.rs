// SPDX-License-Identifier: Apache-2.0

use crate::combat::DragonPixelEngineCore;
use crate::input::EngineInput;
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
