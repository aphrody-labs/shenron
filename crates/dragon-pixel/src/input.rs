// SPDX-License-Identifier: Apache-2.0

use serde::{Deserialize, Serialize};

/// État brut ou mappé des entrées utilisateur (clavier et manettes).
#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
pub struct EngineInput {
    pub left: bool,
    pub right: bool,
    pub up: bool,
    pub down: bool,
    pub jump: bool,
    pub punch: bool,
    pub heavy: bool,
    pub blast: bool,
    pub charge: bool,
    pub transform: bool,
    pub guard: bool,
    pub vanish: bool,
    pub special: bool,
    pub ultimate: bool,
    pub mash: bool,
}

impl EngineInput {
    /// Both inputs at once: a control is held when either source holds it.
    #[must_use]
    pub fn merged(self, other: Self) -> Self {
        Self {
            left: self.left || other.left,
            right: self.right || other.right,
            up: self.up || other.up,
            down: self.down || other.down,
            jump: self.jump || other.jump,
            punch: self.punch || other.punch,
            heavy: self.heavy || other.heavy,
            blast: self.blast || other.blast,
            charge: self.charge || other.charge,
            transform: self.transform || other.transform,
            guard: self.guard || other.guard,
            vanish: self.vanish || other.vanish,
            special: self.special || other.special,
            ultimate: self.ultimate || other.ultimate,
            mash: self.mash || other.mash,
        }
    }

    pub fn is_moving_forward(&self, facing: f32) -> bool {
        if facing > 0.0 { self.right } else { self.left }
    }

    pub fn is_moving_backward(&self, facing: f32) -> bool {
        if facing > 0.0 { self.left } else { self.right }
    }

    pub fn horizontal_axis(&self) -> f32 {
        let mut x = 0.0;
        if self.right {
            x += 1.0;
        }
        if self.left {
            x -= 1.0;
        }
        x
    }
}

/// Type de manette physique détectée.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GamepadType {
    Xbox,
    PlayStation,
    EightBitDo,
    Generic,
}

impl GamepadType {
    pub fn from_gamepad_id(id_str: &str) -> Self {
        let s = id_str.to_lowercase();
        if s.contains("xbox") || s.contains("x-box") || s.contains("microsoft") {
            Self::Xbox
        } else if s.contains("dualshock")
            || s.contains("dualsense")
            || s.contains("sony")
            || s.contains("playstation")
        {
            Self::PlayStation
        } else if s.contains("8bitdo") {
            Self::EightBitDo
        } else {
            Self::Generic
        }
    }
}

/// Mappage standard des 16 boutons du Standard Gamepad API du W3C.
pub fn parse_standard_gamepad(
    axes: &[f32],
    buttons: &[bool],
    deadzone: f32,
    _pad_type: GamepadType,
) -> EngineInput {
    let raw_stick_x = if !axes.is_empty() { axes[0] } else { 0.0 };
    let raw_stick_y = if axes.len() > 1 { axes[1] } else { 0.0 };

    let stick_x = if raw_stick_x.abs() > deadzone { raw_stick_x } else { 0.0 };
    let stick_y = if raw_stick_y.abs() > deadzone { raw_stick_y } else { 0.0 };

    // D-Pad standard buttons: 12 (up), 13 (down), 14 (left), 15 (right)
    let dpad_up = buttons.get(12).copied().unwrap_or(false);
    let dpad_down = buttons.get(13).copied().unwrap_or(false);
    let dpad_left = buttons.get(14).copied().unwrap_or(false);
    let dpad_right = buttons.get(15).copied().unwrap_or(false);

    let left = stick_x < -0.3 || dpad_left;
    let right = stick_x > 0.3 || dpad_right;
    let up = stick_y < -0.4 || dpad_up;
    let down = stick_y > 0.4 || dpad_down;

    // Action buttons (Xbox: A=0, B=1, X=2, Y=3 / PS: Cross=0, Circle=1, Square=2, Triangle=3)
    let btn_a = buttons.first().copied().unwrap_or(false);
    let btn_b = buttons.get(1).copied().unwrap_or(false);
    let btn_x = buttons.get(2).copied().unwrap_or(false);
    let btn_y = buttons.get(3).copied().unwrap_or(false);

    // Bumpers: LB/L1=4, RB/R1=5
    let btn_lb = buttons.get(4).copied().unwrap_or(false);
    let btn_rb = buttons.get(5).copied().unwrap_or(false);

    // Triggers: LT/L2=6, RT/R2=7
    let btn_lt = buttons.get(6).copied().unwrap_or(false);
    let btn_rt = buttons.get(7).copied().unwrap_or(false);

    // Stick clicks: L3=10, R3=11
    let btn_l3 = buttons.get(10).copied().unwrap_or(false);
    let btn_r3 = buttons.get(11).copied().unwrap_or(false);

    EngineInput {
        left,
        right,
        up,
        down,
        jump: btn_a || up,
        punch: btn_x,
        heavy: btn_y,
        blast: btn_b,
        charge: btn_rb,
        guard: btn_lb,
        special: btn_rt,
        ultimate: btn_lt,
        vanish: btn_l3 || btn_r3,
        transform: btn_lb && btn_rb,
        mash: btn_a || btn_b || btn_x || btn_y || btn_rb || btn_rt,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merged_inputs_hold_a_control_when_either_source_does() {
        let keyboard = EngineInput { left: true, punch: true, ..EngineInput::default() };
        let pad = EngineInput { right: true, punch: true, ..EngineInput::default() };
        let both = keyboard.merged(pad);
        assert!(both.left && both.right && both.punch);
        assert!(!both.jump && !both.guard);
    }

    #[test]
    fn standard_gamepad_maps_face_buttons_and_dpad() {
        let mut buttons = [false; 16];
        buttons[2] = true;
        buttons[15] = true;
        let input = parse_standard_gamepad(&[0.0, 0.0], &buttons, 0.15, GamepadType::Generic);
        assert!(input.punch && input.right && input.mash);
        assert!(!input.left && !input.blast);
    }
}
