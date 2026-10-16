// SPDX-License-Identifier: Apache-2.0

//! Deterministic combat engine, canonical fighter roster, frame data,
//! beam clashes, and WebGPU render packets.

pub mod beam_clash;
pub mod combat;
pub mod frame_data;
pub mod render_packet;
pub mod roster;
pub mod types;

pub use beam_clash::{BeamClashResult, BeamClashState};
pub use combat::{
    CombatState, DragonPixelEngineCore, FighterEntity, FighterInput, Particle, Projectile,
};
pub use frame_data::{
    MoveFrameData, MoveKind, MovePhase, from_xenoverse_move, get_default_move_data,
    get_fighter_hurtbox, map_xenoverse_moveset,
};
pub use render_packet::{
    ArenaRenderData, BeamClashRenderData, CameraData, FighterRenderData, ParticleRenderData,
    UiOverlayData, WebGpuRenderPacket,
};
pub use roster::{FighterDefinition, StoryChapter, get_fighter_def, get_story_chapters};
pub use types::{
    ArenaId, AudioEvent, FighterId, FighterStyle, GameMode, HapticEvent, Hitbox, Hurtbox, Rect,
};
