// SPDX-License-Identifier: Apache-2.0

use crate::types::{Hitbox, Hurtbox, Rect};
use serde::{Deserialize, Serialize};

/// Type d'action et coup d'un combattant.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MoveKind {
    LightJab,
    HeavyStrike,
    SweepKick,
    KiBlast,
    BeamSpecial,
    Ultimate,
    ZVanish,
    KiCharge,
    Guard,
}

/// Phase active de la frame data d'un coup.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MovePhase {
    Startup,
    Active,
    Recovery,
}

/// Spécification complète et déterministe de la frame data d'un coup.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MoveFrameData {
    pub kind: MoveKind,
    pub startup_frames: u32,
    pub active_frames: u32,
    pub recovery_frames: u32,
    pub total_frames: u32,
    pub ki_cost: f32,
    pub cancelable_into_heavy: bool,
    pub cancelable_into_special: bool,
    pub cancelable_into_ultimate: bool,
    pub cancelable_into_vanish: bool,
    pub hitbox: Option<Hitbox>,
}

impl MoveFrameData {
    pub fn get_phase(&self, current_frame: u32) -> Option<MovePhase> {
        if current_frame < self.startup_frames {
            Some(MovePhase::Startup)
        } else if current_frame < self.startup_frames + self.active_frames {
            Some(MovePhase::Active)
        } else if current_frame < self.total_frames {
            Some(MovePhase::Recovery)
        } else {
            None
        }
    }
}

/// Catalogue des données de trame rétro compétitives.
pub fn get_default_move_data(kind: MoveKind, power_mult: f32) -> MoveFrameData {
    match kind {
        MoveKind::LightJab => MoveFrameData {
            kind,
            startup_frames: 4,
            active_frames: 3,
            recovery_frames: 7,
            total_frames: 14,
            ki_cost: 0.0,
            cancelable_into_heavy: true,
            cancelable_into_special: true,
            cancelable_into_ultimate: false,
            cancelable_into_vanish: true,
            hitbox: Some(Hitbox {
                offset_x: 28.0,
                offset_y: -24.0,
                width: 32.0,
                height: 24.0,
                damage: 12.0 * power_mult,
                chip_damage: 1.0,
                hitstun_frames: 12,
                blockstun_frames: 7,
                knockback_x: 18.0,
                knockback_y: 0.0,
                screen_shake: 2.0,
            }),
        },
        MoveKind::HeavyStrike => MoveFrameData {
            kind,
            startup_frames: 8,
            active_frames: 4,
            recovery_frames: 14,
            total_frames: 26,
            ki_cost: 0.0,
            cancelable_into_heavy: false,
            cancelable_into_special: true,
            cancelable_into_ultimate: true,
            cancelable_into_vanish: true,
            hitbox: Some(Hitbox {
                offset_x: 36.0,
                offset_y: -26.0,
                width: 44.0,
                height: 28.0,
                damage: 24.0 * power_mult,
                chip_damage: 3.0,
                hitstun_frames: 20,
                blockstun_frames: 12,
                knockback_x: 55.0,
                knockback_y: -12.0,
                screen_shake: 4.5,
            }),
        },
        MoveKind::SweepKick => MoveFrameData {
            kind,
            startup_frames: 6,
            active_frames: 4,
            recovery_frames: 11,
            total_frames: 21,
            ki_cost: 0.0,
            cancelable_into_heavy: true,
            cancelable_into_special: true,
            cancelable_into_ultimate: false,
            cancelable_into_vanish: true,
            hitbox: Some(Hitbox {
                offset_x: 32.0,
                offset_y: -6.0,
                width: 40.0,
                height: 16.0,
                damage: 16.0 * power_mult,
                chip_damage: 2.0,
                hitstun_frames: 16,
                blockstun_frames: 9,
                knockback_x: 30.0,
                knockback_y: 0.0,
                screen_shake: 3.0,
            }),
        },
        MoveKind::KiBlast => MoveFrameData {
            kind,
            startup_frames: 9,
            active_frames: 3,
            recovery_frames: 15,
            total_frames: 27,
            ki_cost: 18.0,
            cancelable_into_heavy: false,
            cancelable_into_special: true,
            cancelable_into_ultimate: false,
            cancelable_into_vanish: true,
            hitbox: None, // Géré par l'entité Projectile
        },
        MoveKind::BeamSpecial => MoveFrameData {
            kind,
            startup_frames: 20,
            active_frames: 36,
            recovery_frames: 22,
            total_frames: 78,
            ki_cost: 45.0,
            cancelable_into_heavy: false,
            cancelable_into_special: false,
            cancelable_into_ultimate: true,
            cancelable_into_vanish: false,
            hitbox: None, // Géré par l'entité Beam
        },
        MoveKind::Ultimate => MoveFrameData {
            kind,
            startup_frames: 32,
            active_frames: 50,
            recovery_frames: 30,
            total_frames: 112,
            ki_cost: 80.0,
            cancelable_into_heavy: false,
            cancelable_into_special: false,
            cancelable_into_ultimate: false,
            cancelable_into_vanish: false,
            hitbox: None,
        },
        MoveKind::ZVanish => MoveFrameData {
            kind,
            startup_frames: 2,
            active_frames: 1,
            recovery_frames: 8,
            total_frames: 11,
            ki_cost: 25.0,
            cancelable_into_heavy: true,
            cancelable_into_special: true,
            cancelable_into_ultimate: false,
            cancelable_into_vanish: false,
            hitbox: None,
        },
        MoveKind::KiCharge => MoveFrameData {
            kind,
            startup_frames: 2,
            active_frames: 60,
            recovery_frames: 4,
            total_frames: 66,
            ki_cost: 0.0,
            cancelable_into_heavy: true,
            cancelable_into_special: true,
            cancelable_into_ultimate: true,
            cancelable_into_vanish: true,
            hitbox: None,
        },
        MoveKind::Guard => MoveFrameData {
            kind,
            startup_frames: 1,
            active_frames: 60,
            recovery_frames: 2,
            total_frames: 63,
            ki_cost: 0.0,
            cancelable_into_heavy: false,
            cancelable_into_special: false,
            cancelable_into_ultimate: false,
            cancelable_into_vanish: true,
            hitbox: None,
        },
    }
}

/// Hurtbox standard d'un combattant selon sa posture.
pub fn get_fighter_hurtbox(is_crouching: bool, is_airborne: bool) -> Hurtbox {
    if is_crouching {
        Hurtbox { offset_x: -18.0, offset_y: -36.0, width: 36.0, height: 36.0 }
    } else if is_airborne {
        Hurtbox { offset_x: -16.0, offset_y: -54.0, width: 32.0, height: 50.0 }
    } else {
        Hurtbox { offset_x: -18.0, offset_y: -64.0, width: 36.0, height: 64.0 }
    }
}

/// Calcule la boîte absolue d'une hitbox orientée.
pub fn calculate_world_hitbox(
    fighter_x: f32,
    fighter_y: f32,
    facing: f32,
    hitbox: &Hitbox,
) -> Rect {
    let x = if facing >= 0.0 {
        fighter_x + hitbox.offset_x
    } else {
        fighter_x - hitbox.offset_x - hitbox.width
    };
    let y = fighter_y + hitbox.offset_y;
    Rect::new(x, y, hitbox.width, hitbox.height)
}

/// Calcule la boîte absolue d'une hurtbox orientée.
pub fn calculate_world_hurtbox(
    fighter_x: f32,
    fighter_y: f32,
    facing: f32,
    hurtbox: &Hurtbox,
) -> Rect {
    let x = if facing >= 0.0 {
        fighter_x + hurtbox.offset_x
    } else {
        fighter_x - hurtbox.offset_x - hurtbox.width
    };
    let y = fighter_y + hurtbox.offset_y;
    Rect::new(x, y, hurtbox.width, hurtbox.height)
}
