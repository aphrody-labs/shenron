// SPDX-License-Identifier: Apache-2.0

pub mod beam_clash;
pub mod combat;
pub mod frame_data;
pub mod haptics;
pub mod input;
pub mod render_packet;
pub mod roster;
pub mod types;
pub mod wasm;

pub use beam_clash::{BeamClashResult, BeamClashState};
pub use combat::{DragonPixelEngineCore, FighterEntity, Particle, Projectile};
pub use frame_data::{get_default_move_data, get_fighter_hurtbox, MoveFrameData, MoveKind, MovePhase};
pub use haptics::HapticTrigger;
pub use input::{parse_standard_gamepad, EngineInput, GamepadType};
pub use render_packet::{
    ArenaRenderData, BeamClashRenderData, CameraData, FighterRenderData, ParticleRenderData,
    ProjectileRenderData, UiOverlayData, WebGpuRenderPacket,
};
pub use roster::{get_fighter_def, get_story_chapters, FighterDefinition, StoryChapter};
pub use types::{
    ArenaId, AudioEvent, AuraType, FighterId, FighterStyle, GameMode, HapticEvent, Hitbox, Hurtbox,
    Rect,
};
pub use wasm::DragonPixelEngineWasm;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_engine_initialization() {
        let engine = DragonPixelEngineCore::new(
            FighterId::Goku,
            GameMode::Story,
            1,
            ArenaId::Paozu,
        );
        assert_eq!(engine.player.id, FighterId::Goku);
        assert_eq!(engine.player.hp, 100.0);
        assert_eq!(engine.enemy.id, FighterId::Yamcha);
        assert_eq!(engine.status, "playing");
    }

    #[test]
    fn test_frame_data_phases() {
        let jab = get_default_move_data(MoveKind::LightJab, 1.0);
        assert_eq!(jab.startup_frames, 4);
        assert_eq!(jab.active_frames, 3);
        assert_eq!(jab.recovery_frames, 7);
        assert_eq!(jab.get_phase(0), Some(MovePhase::Startup));
        assert_eq!(jab.get_phase(3), Some(MovePhase::Startup));
        assert_eq!(jab.get_phase(4), Some(MovePhase::Active));
        assert_eq!(jab.get_phase(6), Some(MovePhase::Active));
        assert_eq!(jab.get_phase(7), Some(MovePhase::Recovery));
        assert_eq!(jab.get_phase(13), Some(MovePhase::Recovery));
        assert_eq!(jab.get_phase(14), None);
    }

    #[test]
    fn test_beam_clash_struggle() {
        let mut clash = BeamClashState::new(
            160.0,
            800.0,
            300.0,
            [0.0, 0.7, 1.0, 1.0],
            [1.0, 0.2, 0.2, 1.0],
        );
        assert!(clash.active);
        assert_eq!(clash.tension, 0.0);

        // Player mashes button
        let res = clash.tick(0.016, true, 1.0, 160.0, 800.0);
        assert!(res.is_none());
        assert!(clash.tension > 0.0);

        // Simulate massive mash until victory
        for _ in 0..30 {
            let r = clash.tick(0.016, true, 1.0, 160.0, 800.0);
            if r.is_some() {
                break;
            }
        }
        assert!(clash.tension >= 100.0 || !clash.active);
    }

    #[test]
    fn test_transformation_and_aura() {
        let mut engine = DragonPixelEngineCore::new(
            FighterId::Goku,
            GameMode::Arcade,
            1,
            ArenaId::Wasteland,
        );
        assert_eq!(engine.player.form_level, 0);

        // Give Ki and trigger transformation
        engine.player.ki = 100.0;
        let input = EngineInput {
            transform: true,
            ..EngineInput::default()
        };
        engine.step(input, 0.016);

        assert_eq!(engine.player.form_level, 1);
        let (aura, _) = engine.player.get_current_aura(&engine.player_def);
        assert_eq!(aura, AuraType::KaioKen);
        assert!(engine.trauma > 0.5);
    }

    #[test]
    fn test_render_packet_generation() {
        let engine = DragonPixelEngineCore::new(
            FighterId::Goku,
            GameMode::Story,
            7, // Goku vs Vegeta Kaiō-ken
            ArenaId::Wasteland,
        );
        let packet = engine.create_render_packet();
        assert_eq!(packet.arena.arena_index, 2); // Wasteland
        assert_eq!(packet.ui.player_name, "Son Goku");
        assert_eq!(packet.ui.enemy_name, "Vegeta");
        assert!(packet.camera.aspect_ratio > 1.7);
    }

    #[test]
    fn test_wasm_wrapper_serialization() {
        let mut wasm_engine = DragonPixelEngineWasm::new("goku", "arcade", 1, "wasteland");
        let input_json = r#"{"punch":true,"right":true}"#;
        let status = wasm_engine.step(input_json, 0.016);
        assert_eq!(status, "playing");

        let render_json = wasm_engine.get_render_packet_json();
        assert!(render_json.contains("\"camera\""));
        assert!(render_json.contains("\"arena\""));
        assert!(render_json.contains("\"player\""));
    }
}
