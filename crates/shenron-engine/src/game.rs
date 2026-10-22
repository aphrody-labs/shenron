// SPDX-License-Identifier: Apache-2.0

//! Thin facade over `dragon-pixel`, the single owner of the game logic (combat, arcade,
//! frame data, roster, render packets). Only the Xenoverse reverse-engineering bridge lives here.

pub use dragon_pixel::{
    ArenaId, ArenaRenderData, AudioEvent, BeamClashRenderData, BeamClashResult, BeamClashState,
    CameraData, DragonPixelEngineCore, EngineInput, FighterDefinition, FighterEntity, FighterId,
    FighterRenderData, FighterStyle, GameMode, HapticEvent, Hitbox, Hurtbox, MoveFrameData,
    MoveKind, MovePhase, Particle, ParticleRenderData, Projectile, ProjectileRenderData, Rect,
    StoryChapter, UiOverlayData, WebGpuRenderPacket, get_default_move_data, get_fighter_def,
    get_fighter_hurtbox, get_story_chapters,
};

/// Converts a DBXV2 reverse-engineered move into a Dragon Pixel combat move.
#[must_use]
pub fn from_xenoverse_move(xv: &shenron_re::formats::MoveFrameData) -> MoveFrameData {
    use shenron_re::formats::DamageType;
    let kind = match xv.damage_type {
        DamageType::Knockback if xv.base_damage > 3000 => MoveKind::Ultimate,
        DamageType::Knockback => MoveKind::BeamSpecial,
        DamageType::Heavy | DamageType::GuardBreak => MoveKind::HeavyStrike,
        _ if xv.startup_frames <= 6 => MoveKind::LightJab,
        _ if xv.startup_frames <= 10 => MoveKind::HeavyStrike,
        _ => MoveKind::SweepKick,
    };
    let hitstun = (xv.recovery_frames as i16 + xv.hit_advantage).max(1) as u32;
    let blockstun = (xv.recovery_frames as i16 + xv.block_advantage).max(1) as u32;
    let hitbox = (xv.active_frames > 0).then(|| Hitbox {
        offset_x: 40.0,
        offset_y: -15.0,
        width: 60.0,
        height: 40.0,
        damage: xv.base_damage as f32,
        chip_damage: 0.0,
        hitstun_frames: hitstun,
        blockstun_frames: blockstun,
        knockback_x: xv.knockback_strength,
        knockback_y: 0.0,
        screen_shake: 0.0,
    });
    let ki_cost = match kind {
        MoveKind::Ultimate => 100.0,
        MoveKind::BeamSpecial => 30.0,
        MoveKind::KiBlast => 10.0,
        _ => 0.0,
    };
    MoveFrameData {
        kind,
        startup_frames: xv.startup_frames as u32,
        active_frames: xv.active_frames as u32,
        recovery_frames: xv.recovery_frames as u32,
        total_frames: xv.total_frames as u32,
        ki_cost,
        cancelable_into_heavy: false,
        cancelable_into_special: false,
        cancelable_into_ultimate: false,
        cancelable_into_vanish: false,
        hitbox,
    }
}

/// Converts an entire character moveset into Dragon Pixel combat moves.
#[must_use]
pub fn map_xenoverse_moveset(
    xv_moveset: &shenron_re::formats::CharacterMoveset,
) -> Vec<MoveFrameData> {
    xv_moveset.moves.iter().map(from_xenoverse_move).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xenoverse_move_conversion() {
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
            damage_type: shenron_re::formats::DamageType::Knockback,
            knockback_strength: 12.0,
            is_invincible: false,
            has_super_armor: false,
        };
        let m = from_xenoverse_move(&xv_move);
        assert_eq!(m.kind, MoveKind::BeamSpecial);
        assert_eq!(m.ki_cost, 30.0);
        let hit = m.hitbox.unwrap();
        assert_eq!(hit.hitstun_frames, 23);
        assert_eq!(hit.blockstun_frames, 11);
    }
}
