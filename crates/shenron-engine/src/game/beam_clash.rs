// SPDX-License-Identifier: Apache-2.0

//! Epic energy beam clash system (button mash tug-of-war dynamics).

use serde::{Deserialize, Serialize};

/// Result of a single frame update in a beam clash.
#[derive(Copy, Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum BeamClashResult {
    /// Clash is ongoing; returns clash center `(x, y)` and push dominance in `[-1.0, 1.0]`.
    Ongoing { clash_point: (f32, f32), dominance: f32 },
    /// Player 1 won the clash and overwhelmed Player 2.
    Player1Win { clash_point: (f32, f32), damage_to_p2: f32 },
    /// Player 2 won the clash and overwhelmed Player 1.
    Player2Win { clash_point: (f32, f32), damage_to_p1: f32 },
}

/// Dynamic state of an active beam clash.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct BeamClashState {
    /// Horizontal position of Player 1.
    pub p1_x: f32,
    /// Horizontal position of Player 2.
    pub p2_x: f32,
    /// Vertical height of the clash.
    pub clash_y: f32,
    /// Current clash point along the X axis.
    pub current_x: f32,
    /// Total accumulated button presses from Player 1.
    pub p1_mashes: u32,
    /// Total accumulated button presses from Player 2.
    pub p2_mashes: u32,
    /// Remaining duration in frames before sudden death resolution.
    pub frames_remaining: u32,
    /// Base damage of Player 1's beam.
    pub p1_beam_damage: f32,
    /// Base damage of Player 2's beam.
    pub p2_beam_damage: f32,
}

impl BeamClashState {
    /// Initializes a new beam clash between two fighters.
    #[must_use]
    pub fn new(
        p1_x: f32,
        p2_x: f32,
        clash_y: f32,
        p1_beam_damage: f32,
        p2_beam_damage: f32,
    ) -> Self {
        let current_x = (p1_x + p2_x) * 0.5;
        Self {
            p1_x,
            p2_x,
            clash_y,
            current_x,
            p1_mashes: 0,
            p2_mashes: 0,
            frames_remaining: 180, // ~3 seconds at 60 FPS
            p1_beam_damage,
            p2_beam_damage,
        }
    }

    /// Registers button mashing inputs for this frame.
    pub fn register_input(&mut self, p1_mash: bool, p2_mash: bool) {
        if p1_mash {
            self.p1_mashes += 1;
        }
        if p2_mash {
            self.p2_mashes += 1;
        }
    }

    /// Updates the clash simulation by 1 frame.
    pub fn update(&mut self) -> BeamClashResult {
        if self.frames_remaining > 0 {
            self.frames_remaining -= 1;
        }

        let total_distance = (self.p2_x - self.p1_x).abs().max(100.0);
        let mash_diff = (self.p1_mashes as f32) - (self.p2_mashes as f32);
        let power_bias = (self.p1_beam_damage - self.p2_beam_damage) * 0.001;
        let dominance = (mash_diff * 0.04 + power_bias).clamp(-1.0, 1.0);

        // Move clash point towards dominated fighter
        let target_x = (self.p1_x + self.p2_x) * 0.5 + dominance * (total_distance * 0.45);
        self.current_x += (target_x - self.current_x) * 0.2;

        let clash_point = (self.current_x, self.clash_y);

        // Win conditions: threshold reached or timer expired with dominance
        if dominance >= 0.95 || (self.frames_remaining == 0 && dominance > 0.0) {
            BeamClashResult::Player1Win { clash_point, damage_to_p2: self.p1_beam_damage * 1.5 }
        } else if dominance <= -0.95 || (self.frames_remaining == 0 && dominance < 0.0) {
            BeamClashResult::Player2Win { clash_point, damage_to_p1: self.p2_beam_damage * 1.5 }
        } else {
            BeamClashResult::Ongoing { clash_point, dominance }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_beam_clash_p1_win() {
        let mut clash = BeamClashState::new(100.0, 700.0, 300.0, 2400.0, 2400.0);
        for _ in 0..60 {
            clash.register_input(true, false);
            let res = clash.update();
            if let BeamClashResult::Player1Win { .. } = res {
                return;
            }
        }
        panic!("P1 should have won with continuous mashing");
    }
}
