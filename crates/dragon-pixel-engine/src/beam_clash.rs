// SPDX-License-Identifier: Apache-2.0

use crate::types::HapticEvent;
use serde::{Deserialize, Serialize};

/// Système de Choc de Kikōha (Beam Clash) avec duel de bras de fer en temps réel.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct BeamClashState {
    pub active: bool,
    pub clash_x: f32,
    pub clash_y: f32,
    /// Tension oscillante de -100.0 (défaite du joueur) à +100.0 (victoire du joueur).
    pub tension: f32,
    pub duration_remaining: f32,
    pub total_duration: f32,
    pub player_beam_color: [f32; 4],
    pub enemy_beam_color: [f32; 4],
    pub player_beam_width: f32,
    pub enemy_beam_width: f32,
    pub mash_count: u32,
    pub screen_shake_intensity: f32,
}

impl BeamClashState {
    pub fn new(
        player_x: f32,
        enemy_x: f32,
        clash_y: f32,
        player_color: [f32; 4],
        enemy_color: [f32; 4],
    ) -> Self {
        let initial_x = (player_x + enemy_x) * 0.5;
        Self {
            active: true,
            clash_x: initial_x,
            clash_y,
            tension: 0.0,
            duration_remaining: 5.0,
            total_duration: 5.0,
            player_beam_color: player_color,
            enemy_beam_color: enemy_color,
            player_beam_width: 22.0,
            enemy_beam_width: 22.0,
            mash_count: 0,
            screen_shake_intensity: 6.5,
        }
    }

    /// Mise à jour de la physique du choc chaque tick déterministe.
    pub fn tick(
        &mut self,
        dt: f32,
        mashed: bool,
        enemy_power_bias: f32,
        player_x: f32,
        enemy_x: f32,
    ) -> Option<BeamClashResult> {
        if !self.active {
            return None;
        }

        self.duration_remaining -= dt;

        // Poussée du joueur par mash
        if mashed {
            self.tension += 4.2;
            self.mash_count += 1;
            self.screen_shake_intensity = 8.0;
        } else {
            // Poussée naturelle de l'adversaire (résistance de l'IA)
            let decay = 14.0 * (1.0 + enemy_power_bias * 0.2);
            self.tension -= decay * dt;
        }

        // Déplacement de l'épicentre du choc selon le ratio de tension
        let midpoint = (player_x + enemy_x) * 0.5;
        let range = (enemy_x - player_x).abs() * 0.35;
        self.clash_x = midpoint + (self.tension / 100.0) * range;

        // Événements d'issue
        if self.tension >= 100.0 {
            self.active = false;
            Some(BeamClashResult::PlayerWon {
                damage_to_enemy: 75.0,
                clash_point: (self.clash_x, self.clash_y),
            })
        } else if self.tension <= -100.0 {
            self.active = false;
            Some(BeamClashResult::EnemyWon {
                damage_to_player: 65.0,
                clash_point: (self.clash_x, self.clash_y),
            })
        } else if self.duration_remaining <= 0.0 {
            self.active = false;
            if self.tension >= 0.0 {
                Some(BeamClashResult::PlayerWon {
                    damage_to_enemy: 55.0,
                    clash_point: (self.clash_x, self.clash_y),
                })
            } else {
                Some(BeamClashResult::EnemyWon {
                    damage_to_player: 45.0,
                    clash_point: (self.clash_x, self.clash_y),
                })
            }
        } else {
            None
        }
    }

    /// Retourne un feedback haptique périodique pendant le bras de fer.
    pub fn get_rumble_feedback(&self) -> HapticEvent {
        let tension_norm = (self.tension.abs() / 100.0).clamp(0.0, 1.0);
        HapticEvent {
            weak_magnitude: 0.4 + tension_norm * 0.4,
            strong_magnitude: 0.3 + tension_norm * 0.5,
            duration_ms: 70,
        }
    }
}

/// Résultat d'un affrontement de Kikōha.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum BeamClashResult {
    PlayerWon { damage_to_enemy: f32, clash_point: (f32, f32) },
    EnemyWon { damage_to_player: f32, clash_point: (f32, f32) },
}
