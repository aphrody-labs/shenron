// SPDX-License-Identifier: Apache-2.0

//! Deterministic fighting game frame data and move phases.

use super::types::{Hitbox, Hurtbox, Rect};
use serde::{Deserialize, Serialize};

/// Attack category and identifier.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum MoveKind {
    /// 5L - Quick standing jab.
    LightJab,
    /// 5M - Heavy straight punch.
    HeavyPunch,
    /// 5H - Long-range forward kick.
    ForwardKick,
    /// 2M - Low sweeping kick.
    LowSweep,
    /// 2H - Anti-air dragon uppercut.
    DragonUppercut,
    /// 5S - Ki blast projectile.
    KiBlast,
    /// 236S - Special energy beam (Kamehameha / Galick Gun / Masenko).
    BeamSpecial,
    /// 236H+S - Ultimate cinematic beam.
    UltimateBeam,
    /// 66 - Forward dash.
    DashForward,
    /// 44 - Back step.
    DashBack,
}

/// The three deterministic phases of an active combat move.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum MovePhase {
    /// Wind-up frames before active hitboxes appear.
    Startup,
    /// Active frames where hitboxes can intersect enemy hurtboxes.
    Active,
    /// Cooldown frames where fighter cannot block or act.
    Recovery,
}

/// Complete deterministic frame data specification for a move.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MoveFrameData {
    /// Move identifier.
    pub kind: MoveKind,
    /// Number of startup frames.
    pub startup_frames: u32,
    /// Number of active hit frames.
    pub active_frames: u32,
    /// Number of recovery cooldown frames.
    pub recovery_frames: u32,
    /// Base damage.
    pub damage: f32,
    /// Hitbox active during Active phase.
    pub hitbox: Option<Hitbox>,
    /// Ki cost required to initiate.
    pub ki_cost: f32,
}

impl MoveFrameData {
    /// Total duration of the move in frames.
    #[inline]
    #[must_use]
    pub fn total_frames(&self) -> u32 {
        self.startup_frames + self.active_frames + self.recovery_frames
    }

    /// Evaluates the current move phase given the elapsed frame counter.
    #[must_use]
    pub fn get_phase(&self, current_frame: u32) -> Option<MovePhase> {
        if current_frame < self.startup_frames {
            Some(MovePhase::Startup)
        } else if current_frame < self.startup_frames + self.active_frames {
            Some(MovePhase::Active)
        } else if current_frame < self.total_frames() {
            Some(MovePhase::Recovery)
        } else {
            None
        }
    }
}

/// Retrieves standard canonical move frame data scaled by a fighter multiplier.
#[must_use]
pub fn get_default_move_data(kind: MoveKind, damage_mult: f32) -> MoveFrameData {
    match kind {
        MoveKind::LightJab => MoveFrameData {
            kind,
            startup_frames: 4,
            active_frames: 3,
            recovery_frames: 7,
            damage: 400.0 * damage_mult,
            hitbox: Some(Hitbox {
                offset: Rect::new(40.0, -10.0, 50.0, 30.0),
                damage: 400.0 * damage_mult,
                knockback: [2.0, 0.0],
                hitstun: 12,
                blockstun: 8,
            }),
            ki_cost: 0.0,
        },
        MoveKind::HeavyPunch => MoveFrameData {
            kind,
            startup_frames: 9,
            active_frames: 4,
            recovery_frames: 14,
            damage: 850.0 * damage_mult,
            hitbox: Some(Hitbox {
                offset: Rect::new(45.0, -15.0, 65.0, 35.0),
                damage: 850.0 * damage_mult,
                knockback: [6.0, 1.0],
                hitstun: 20,
                blockstun: 12,
            }),
            ki_cost: 0.0,
        },
        MoveKind::ForwardKick => MoveFrameData {
            kind,
            startup_frames: 11,
            active_frames: 5,
            recovery_frames: 16,
            damage: 1100.0 * damage_mult,
            hitbox: Some(Hitbox {
                offset: Rect::new(50.0, -5.0, 80.0, 40.0),
                damage: 1100.0 * damage_mult,
                knockback: [10.0, 2.0],
                hitstun: 24,
                blockstun: 14,
            }),
            ki_cost: 0.0,
        },
        MoveKind::LowSweep => MoveFrameData {
            kind,
            startup_frames: 8,
            active_frames: 4,
            recovery_frames: 15,
            damage: 700.0 * damage_mult,
            hitbox: Some(Hitbox {
                offset: Rect::new(35.0, 20.0, 70.0, 25.0),
                damage: 700.0 * damage_mult,
                knockback: [4.0, -4.0],
                hitstun: 22,
                blockstun: 10,
            }),
            ki_cost: 0.0,
        },
        MoveKind::DragonUppercut => MoveFrameData {
            kind,
            startup_frames: 7,
            active_frames: 6,
            recovery_frames: 22,
            damage: 1300.0 * damage_mult,
            hitbox: Some(Hitbox {
                offset: Rect::new(30.0, -40.0, 50.0, 90.0),
                damage: 1300.0 * damage_mult,
                knockback: [3.0, -14.0],
                hitstun: 32,
                blockstun: 18,
            }),
            ki_cost: 0.0,
        },
        MoveKind::KiBlast => MoveFrameData {
            kind,
            startup_frames: 12,
            active_frames: 4,
            recovery_frames: 18,
            damage: 600.0 * damage_mult,
            hitbox: None, // Spawns projectile
            ki_cost: 10.0,
        },
        MoveKind::BeamSpecial => MoveFrameData {
            kind,
            startup_frames: 18,
            active_frames: 30,
            recovery_frames: 28,
            damage: 2400.0 * damage_mult,
            hitbox: Some(Hitbox {
                offset: Rect::new(60.0, -25.0, 600.0, 50.0),
                damage: 2400.0 * damage_mult,
                knockback: [16.0, 3.0],
                hitstun: 40,
                blockstun: 25,
            }),
            ki_cost: 30.0,
        },
        MoveKind::UltimateBeam => MoveFrameData {
            kind,
            startup_frames: 32,
            active_frames: 45,
            recovery_frames: 40,
            damage: 4800.0 * damage_mult,
            hitbox: Some(Hitbox {
                offset: Rect::new(60.0, -40.0, 800.0, 80.0),
                damage: 4800.0 * damage_mult,
                knockback: [25.0, 5.0],
                hitstun: 60,
                blockstun: 35,
            }),
            ki_cost: 100.0,
        },
        MoveKind::DashForward => MoveFrameData {
            kind,
            startup_frames: 2,
            active_frames: 12,
            recovery_frames: 4,
            damage: 0.0,
            hitbox: None,
            ki_cost: 0.0,
        },
        MoveKind::DashBack => MoveFrameData {
            kind,
            startup_frames: 2,
            active_frames: 10,
            recovery_frames: 6,
            damage: 0.0,
            hitbox: None,
            ki_cost: 0.0,
        },
    }
}

/// Retrieves the base standing hurtbox for a fighter.
#[must_use]
pub fn get_fighter_hurtbox(is_crouching: bool) -> Hurtbox {
    if is_crouching {
        Hurtbox {
            offset: Rect::new(-25.0, 0.0, 50.0, 65.0),
            is_invulnerable: false,
        }
    } else {
        Hurtbox {
            offset: Rect::new(-25.0, -45.0, 50.0, 110.0),
            is_invulnerable: false,
        }
    }
}

/// Converts a DBXV2 reverse-engineered move frame data into an engine combat move.
pub fn from_xenoverse_move(xv: &shenron_re::formats::MoveFrameData) -> MoveFrameData {
    let kind = match xv.damage_type {
        shenron_re::formats::DamageType::KiBlast => MoveKind::KiBlast,
        shenron_re::formats::DamageType::Special => {
            if xv.base_damage > 3000 {
                MoveKind::UltimateBeam
            } else {
                MoveKind::BeamSpecial
            }
        }
        shenron_re::formats::DamageType::HeavyStrike => MoveKind::HeavyPunch,
        _ => {
            if xv.startup_frames <= 6 {
                MoveKind::LightJab
            } else if xv.startup_frames <= 10 {
                MoveKind::HeavyPunch
            } else {
                MoveKind::ForwardKick
            }
        }
    };

    let hitstun = (xv.recovery_frames as i16 + xv.hit_advantage).max(1) as u32;
    let blockstun = (xv.recovery_frames as i16 + xv.block_advantage).max(1) as u32;

    let hitbox = if xv.active_frames > 0 {
        Some(Hitbox {
            offset: Rect::new(40.0, -15.0, 60.0, 40.0),
            damage: xv.base_damage as f32,
            knockback: [xv.knockback_strength, 0.0],
            hitstun,
            blockstun,
        })
    } else {
        None
    };

    let ki_cost = match kind {
        MoveKind::UltimateBeam => 100.0,
        MoveKind::BeamSpecial => 30.0,
        MoveKind::KiBlast => 10.0,
        _ => 0.0,
    };

    MoveFrameData {
        kind,
        startup_frames: xv.startup_frames as u32,
        active_frames: xv.active_frames as u32,
        recovery_frames: xv.recovery_frames as u32,
        damage: xv.base_damage as f32,
        hitbox,
        ki_cost,
    }
}

/// Converts an entire character moveset into engine combat moves.
pub fn map_xenoverse_moveset(xv_moveset: &shenron_re::formats::CharacterMoveset) -> Vec<MoveFrameData> {
    xv_moveset.moves.iter().map(from_xenoverse_move).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_from_xenoverse_move_conversion() {
        let xv_move = shenron_re::formats::MoveFrameData {
            move_id: 200,
            name: "Kamehameha".into(),
            total_frames: 45,
            startup_frames: 18,
            active_frames: 12,
            recovery_frames: 15,
            hit_advantage: 8,
            block_advantage: -4,
            base_damage: 1800,
            stamina_damage: 100,
            damage_type: shenron_re::formats::DamageType::Special,
            knockback_strength: 12.0,
            is_invincible: false,
            has_super_armor: false,
        };

        let engine_move = from_xenoverse_move(&xv_move);
        assert_eq!(engine_move.kind, MoveKind::BeamSpecial);
        assert_eq!(engine_move.startup_frames, 18);
        assert_eq!(engine_move.active_frames, 12);
        assert_eq!(engine_move.recovery_frames, 15);
        assert_eq!(engine_move.damage, 1800.0);
        assert_eq!(engine_move.ki_cost, 30.0);

        let hit = engine_move.hitbox.unwrap();
        assert_eq!(hit.hitstun, 23); // 15 + 8 = 23
        assert_eq!(hit.blockstun, 11); // 15 - 4 = 11
    }
}

