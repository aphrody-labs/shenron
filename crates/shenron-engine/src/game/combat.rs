// SPDX-License-Identifier: Apache-2.0

//! Deterministic 60 FPS fighting game simulation core.
//!
//! Handles fighter state machines, physics, hitboxes, projectile motion,
//! particle dynamics, beam clashes, and audio/haptics event dispatching.

use super::beam_clash::{BeamClashResult, BeamClashState};
use super::frame_data::{get_default_move_data, get_fighter_hurtbox, MoveFrameData, MoveKind, MovePhase};
use super::roster::{get_fighter_def, FighterDefinition};
use super::types::{ArenaId, AudioEvent, FighterId, GameMode, HapticEvent, Rect};
use serde::{Deserialize, Serialize};

/// High-level combat state of a fighter.
#[derive(Copy, Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CombatState {
    /// Standing neutral.
    Idle,
    /// Moving forward or backward.
    Walking,
    /// Fast dash evasion.
    Dashing,
    /// Airborne jump.
    Jumping,
    /// Crouching block or stance.
    Crouching,
    /// Executing an attack move.
    Attacking,
    /// Blocking incoming strikes.
    Guarding,
    /// In hitstun recoil.
    HitStun,
    /// Knocked down to the ground.
    KnockedDown,
    /// Locked in an epic beam clash.
    BeamClashing,
}

/// Dynamic entity representing a fighter in the match.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FighterEntity {
    /// Character identifier.
    pub id: FighterId,
    /// Fighter definition stats.
    pub def: FighterDefinition,
    /// Horizontal position.
    pub x: f32,
    /// Vertical position (0.0 = ground level).
    pub y: f32,
    /// Horizontal velocity.
    pub vx: f32,
    /// Vertical velocity.
    pub vy: f32,
    /// True if feet are on the ground.
    pub is_grounded: bool,
    /// True if facing right, false if facing left.
    pub facing_right: bool,
    /// Current health points.
    pub hp: f32,
    /// Current ki energy points.
    pub ki: f32,
    /// Current state machine mode.
    pub state: CombatState,
    /// Active attack move if attacking.
    pub current_move: Option<MoveFrameData>,
    /// Frame counter within current move.
    pub move_frame: u32,
    /// Remaining hitstun frames.
    pub hitstun_remaining: u32,
    /// Remaining blockstun frames.
    pub blockstun_remaining: u32,
    /// Remaining knockdown recovery frames.
    pub knockdown_remaining: u32,
    /// Number of consecutive combo hits landed.
    pub combo_hits: u32,
}

impl FighterEntity {
    /// Initializes a fighter at the specified X position.
    #[must_use]
    pub fn new(id: FighterId, x: f32, facing_right: bool) -> Self {
        let def = get_fighter_def(id);
        Self {
            id,
            hp: def.max_hp,
            ki: 0.0,
            def,
            x,
            y: 0.0,
            vx: 0.0,
            vy: 0.0,
            is_grounded: true,
            facing_right,
            state: CombatState::Idle,
            current_move: None,
            move_frame: 0,
            hitstun_remaining: 0,
            blockstun_remaining: 0,
            knockdown_remaining: 0,
            combo_hits: 0,
        }
    }

    /// Returns the active hurtbox.
    #[must_use]
    pub fn hurtbox(&self) -> Rect {
        let base = get_fighter_hurtbox(self.state == CombatState::Crouching);
        let ox = if self.facing_right {
            self.x + base.offset.x
        } else {
            self.x - base.offset.x - base.offset.width
        };
        Rect::new(ox, self.y + base.offset.y, base.offset.width, base.offset.height)
    }

    /// Returns the active hitbox if in an attack's active phase.
    #[must_use]
    pub fn active_hitbox(&self) -> Option<Rect> {
        let mv = self.current_move.as_ref()?;
        if mv.get_phase(self.move_frame) == Some(MovePhase::Active) {
            let hb = mv.hitbox.as_ref()?;
            let ox = if self.facing_right {
                self.x + hb.offset.x
            } else {
                self.x - hb.offset.x - hb.offset.width
            };
            Some(Rect::new(ox, self.y + hb.offset.y, hb.offset.width, hb.offset.height))
        } else {
            None
        }
    }
}

/// An active projectile in flight (e.g. Ki Blast).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Projectile {
    /// Horizontal position.
    pub x: f32,
    /// Vertical position.
    pub y: f32,
    /// Velocity vector.
    pub vx: f32,
    pub vy: f32,
    /// Damage on impact.
    pub damage: f32,
    /// True if belongs to player 1, false for player 2.
    pub from_p1: bool,
    /// Remaining lifetime in frames.
    pub lifetime: u32,
}

/// Dynamic visual particle for impacts and auras.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Particle {
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub color: [f32; 4],
    pub size: f32,
    pub lifetime: u32,
}

/// Engine input command packet from controller/keyboard.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct FighterInput {
    pub left: bool,
    pub right: bool,
    pub up: bool,
    pub down: bool,
    pub light_attack: bool,
    pub heavy_attack: bool,
    pub special: bool,
    pub ultimate: bool,
    pub block: bool,
    pub dash: bool,
}

/// The master deterministic fighting game core.
pub struct DragonPixelEngineCore {
    /// Player 1.
    pub p1: FighterEntity,
    /// Player 2.
    pub p2: FighterEntity,
    /// Active projectiles.
    pub projectiles: Vec<Projectile>,
    /// Active particles.
    pub particles: Vec<Particle>,
    /// Active beam clash if triggered.
    pub beam_clash: Option<BeamClashState>,
    /// Match arena stage.
    pub arena: ArenaId,
    /// Game mode.
    pub mode: GameMode,
    /// Match frame count elapsed.
    pub frame_count: u64,
    /// Winner status if match ended.
    pub winner: Option<u8>, // 1 = P1, 2 = P2, 0 = Draw
    /// Audio events emitted in current frame.
    pub audio_events: Vec<AudioEvent>,
    /// Haptic events emitted in current frame.
    pub haptic_events: Vec<HapticEvent>,
}

impl DragonPixelEngineCore {
    /// Creates a new match between two fighters.
    #[must_use]
    pub fn new(p1_id: FighterId, p2_id: FighterId, arena: ArenaId, mode: GameMode) -> Self {
        Self {
            p1: FighterEntity::new(p1_id, 250.0, true),
            p2: FighterEntity::new(p2_id, 750.0, false),
            projectiles: Vec::new(),
            particles: Vec::new(),
            beam_clash: None,
            arena,
            mode,
            frame_count: 0,
            winner: None,
            audio_events: Vec::new(),
            haptic_events: Vec::new(),
        }
    }

    /// Executes one deterministic 60 FPS simulation frame.
    pub fn tick(&mut self, p1_input: FighterInput, p2_input: FighterInput) {
        self.audio_events.clear();
        self.haptic_events.clear();
        self.frame_count += 1;

        if self.winner.is_some() {
            return;
        }

        // 1. If in active beam clash, update tug-of-war
        if let Some(mut clash) = self.beam_clash.take() {
            let p1_mash = p1_input.light_attack || p1_input.heavy_attack || p1_input.special;
            let p2_mash = p2_input.light_attack || p2_input.heavy_attack || p2_input.special;
            clash.register_input(p1_mash, p2_mash);

            match clash.update() {
                BeamClashResult::Ongoing { clash_point, .. } => {
                    self.spawn_clash_particles(clash_point.0, clash_point.1);
                    self.haptic_events.push(HapticEvent::ClashPulse);
                    self.beam_clash = Some(clash);
                }
                BeamClashResult::Player1Win { clash_point, damage_to_p2 } => {
                    self.spawn_explosion_particles(clash_point.0, clash_point.1, [0.2, 0.7, 1.0, 1.0], 50);
                    self.apply_damage(false, damage_to_p2, 45, [18.0, -8.0]);
                    self.p1.state = CombatState::Idle;
                    self.p2.state = CombatState::KnockedDown;
                }
                BeamClashResult::Player2Win { clash_point, damage_to_p1 } => {
                    self.spawn_explosion_particles(clash_point.0, clash_point.1, [0.8, 0.3, 1.0, 1.0], 50);
                    self.apply_damage(true, damage_to_p1, 45, [-18.0, -8.0]);
                    self.p2.state = CombatState::Idle;
                    self.p1.state = CombatState::KnockedDown;
                }
            }
            return;
        }

        // 2. Update fighter physics and inputs
        self.update_fighter(&mut true, p1_input);
        self.update_fighter(&mut false, p2_input);

        // 3. Projectile physics and collisions
        self.update_projectiles();

        // 4. Hitbox vs Hurtbox detection
        self.check_combat_collisions();

        // 5. Particle decay
        self.update_particles();

        // 6. Check win condition
        if self.p1.hp <= 0.0 && self.p2.hp <= 0.0 {
            self.winner = Some(0); // Draw
            self.haptic_events.push(HapticEvent::Knockout);
        } else if self.p2.hp <= 0.0 {
            self.winner = Some(1);
            self.haptic_events.push(HapticEvent::Knockout);
        } else if self.p1.hp <= 0.0 {
            self.winner = Some(2);
            self.haptic_events.push(HapticEvent::Knockout);
        }
    }

    fn update_fighter(&mut self, is_p1: &mut bool, input: FighterInput) {
        let (fighter, other_x) = if *is_p1 {
            (&mut self.p1, self.p2.x)
        } else {
            (&mut self.p2, self.p1.x)
        };

        // Auto-face opponent when neutral
        if fighter.state == CombatState::Idle || fighter.state == CombatState::Walking {
            fighter.facing_right = fighter.x < other_x;
        }

        // Hitstun / blockstun countdown
        if fighter.hitstun_remaining > 0 {
            fighter.hitstun_remaining -= 1;
            if fighter.hitstun_remaining == 0 {
                fighter.state = CombatState::Idle;
            }
        }
        if fighter.blockstun_remaining > 0 {
            fighter.blockstun_remaining -= 1;
            if fighter.blockstun_remaining == 0 {
                fighter.state = CombatState::Idle;
            }
        }
        if fighter.knockdown_remaining > 0 {
            fighter.knockdown_remaining -= 1;
            if fighter.knockdown_remaining == 0 {
                fighter.state = CombatState::Idle;
            }
        }

        // Action input if actionable
        if fighter.state == CombatState::Idle || fighter.state == CombatState::Walking {
            if input.block {
                fighter.state = CombatState::Guarding;
            } else if input.ultimate && fighter.ki >= 100.0 {
                fighter.ki -= 100.0;
                fighter.state = CombatState::Attacking;
                fighter.current_move = Some(get_default_move_data(MoveKind::UltimateBeam, fighter.def.damage_multiplier));
                fighter.move_frame = 0;
            } else if input.special && fighter.ki >= 30.0 {
                fighter.ki -= 30.0;
                fighter.state = CombatState::Attacking;
                fighter.current_move = Some(get_default_move_data(MoveKind::BeamSpecial, fighter.def.damage_multiplier));
                fighter.move_frame = 0;
            } else if input.heavy_attack {
                fighter.state = CombatState::Attacking;
                fighter.current_move = Some(get_default_move_data(MoveKind::HeavyPunch, fighter.def.damage_multiplier));
                fighter.move_frame = 0;
            } else if input.light_attack {
                fighter.state = CombatState::Attacking;
                fighter.current_move = Some(get_default_move_data(MoveKind::LightJab, fighter.def.damage_multiplier));
                fighter.move_frame = 0;
            } else if input.up && fighter.is_grounded {
                fighter.vy = -fighter.def.jump_power;
                fighter.is_grounded = false;
                fighter.state = CombatState::Jumping;
            } else if input.left {
                fighter.vx = -fighter.def.walk_speed;
                fighter.state = CombatState::Walking;
            } else if input.right {
                fighter.vx = fighter.def.walk_speed;
                fighter.state = CombatState::Walking;
            } else {
                fighter.vx = 0.0;
                fighter.state = CombatState::Idle;
            }
        }

        // Move execution frame advancement
        if fighter.state == CombatState::Attacking
            && let Some(mv) = &fighter.current_move
        {
            fighter.move_frame += 1;
            if fighter.move_frame >= mv.total_frames() {
                fighter.state = CombatState::Idle;
                fighter.current_move = None;
                fighter.move_frame = 0;
            }
        }

        // Gravity & Position integration
        if !fighter.is_grounded {
            fighter.vy += 0.85; // Gravity constant
        }
        fighter.x += fighter.vx;
        fighter.y += fighter.vy;

        // Ground clamping
        if fighter.y >= 0.0 {
            fighter.y = 0.0;
            fighter.vy = 0.0;
            fighter.is_grounded = true;
            if fighter.state == CombatState::Jumping {
                fighter.state = CombatState::Idle;
            }
        }

        // Arena boundary clamping (0.0 to 1000.0)
        fighter.x = fighter.x.clamp(40.0, 960.0);
    }

    fn check_combat_collisions(&mut self) {
        let p1_hit = self.p1.active_hitbox();
        let p2_hurt = self.p2.hurtbox();

        if let Some(hit) = p1_hit
            && hit.intersects(&p2_hurt)
            && self.p2.hitstun_remaining == 0
        {
            let damage = self.p1.current_move.as_ref().map_or(300.0, |m| m.damage);
            self.apply_damage(false, damage, 18, [8.0, -2.0]);
            self.spawn_impact_particles(hit.x + hit.width * 0.5, hit.y + hit.height * 0.5);
            self.audio_events.push(AudioEvent {
                sound_type: "heavy_impact".into(),
                pitch: 1.0,
                volume: 1.0,
            });
            self.haptic_events.push(HapticEvent::LightImpact);
        }

        let p2_hit = self.p2.active_hitbox();
        let p1_hurt = self.p1.hurtbox();

        if let Some(hit) = p2_hit
            && hit.intersects(&p1_hurt)
            && self.p1.hitstun_remaining == 0
        {
            let damage = self.p2.current_move.as_ref().map_or(300.0, |m| m.damage);
            self.apply_damage(true, damage, 18, [-8.0, -2.0]);
            self.spawn_impact_particles(hit.x + hit.width * 0.5, hit.y + hit.height * 0.5);
            self.audio_events.push(AudioEvent {
                sound_type: "heavy_impact".into(),
                pitch: 1.0,
                volume: 1.0,
            });
            self.haptic_events.push(HapticEvent::LightImpact);
        }
    }

    fn apply_damage(&mut self, to_p1: bool, amount: f32, hitstun: u32, knockback: [f32; 2]) {
        let fighter = if to_p1 { &mut self.p1 } else { &mut self.p2 };
        if fighter.state == CombatState::Guarding {
            fighter.hp -= amount * 0.2; // 80% chip damage reduction on block
            fighter.blockstun_remaining = hitstun / 2;
        } else {
            fighter.hp -= amount;
            fighter.hitstun_remaining = hitstun;
            fighter.vx = knockback[0];
            fighter.vy = knockback[1];
            fighter.is_grounded = false;
            fighter.state = CombatState::HitStun;
        }
        if fighter.hp < 0.0 {
            fighter.hp = 0.0;
        }
    }

    fn update_projectiles(&mut self) {
        let mut i = 0;
        while i < self.projectiles.len() {
            let (px, py, from_p1, damage, hit) = {
                let p = &mut self.projectiles[i];
                p.x += p.vx;
                p.y += p.vy;
                if p.lifetime > 0 {
                    p.lifetime -= 1;
                }
                let target_hurt = if p.from_p1 { self.p2.hurtbox() } else { self.p1.hurtbox() };
                let p_rect = Rect::new(p.x - 10.0, p.y - 10.0, 20.0, 20.0);
                (p.x, p.y, p.from_p1, p.damage, p_rect.intersects(&target_hurt))
            };

            if hit {
                self.apply_damage(!from_p1, damage, 15, [if from_p1 { 6.0 } else { -6.0 }, -1.0]);
                self.spawn_impact_particles(px, py);
                self.projectiles.swap_remove(i);
                continue;
            }

            let p = &self.projectiles[i];
            if p.lifetime == 0 || p.x < 0.0 || p.x > 1000.0 {
                self.projectiles.swap_remove(i);
            } else {
                i += 1;
            }
        }
    }

    fn update_particles(&mut self) {
        let mut i = 0;
        while i < self.particles.len() {
            let pt = &mut self.particles[i];
            pt.x += pt.vx;
            pt.y += pt.vy;
            if pt.lifetime > 0 {
                pt.lifetime -= 1;
            }
            if pt.lifetime == 0 {
                self.particles.swap_remove(i);
            } else {
                i += 1;
            }
        }
    }

    fn spawn_impact_particles(&mut self, x: f32, y: f32) {
        for _ in 0..12 {
            self.particles.push(Particle {
                x,
                y,
                vx: (self.frame_count % 7) as f32 - 3.0,
                vy: (self.frame_count % 5) as f32 - 4.0,
                color: [1.0, 0.8, 0.2, 1.0],
                size: 3.5,
                lifetime: 15,
            });
        }
    }

    fn spawn_clash_particles(&mut self, x: f32, y: f32) {
        for _ in 0..4 {
            self.particles.push(Particle {
                x,
                y,
                vx: ((self.frame_count * 13) % 11) as f32 - 5.0,
                vy: ((self.frame_count * 7) % 11) as f32 - 5.0,
                color: [0.5, 0.8, 1.0, 1.0],
                size: 5.0,
                lifetime: 20,
            });
        }
    }

    fn spawn_explosion_particles(&mut self, x: f32, y: f32, color: [f32; 4], count: usize) {
        for j in 0..count {
            let angle = (j as f32 / count as f32) * std::f32::consts::TAU;
            let speed = 4.0 + (j % 5) as f32 * 1.5;
            self.particles.push(Particle {
                x,
                y,
                vx: angle.cos() * speed,
                vy: angle.sin() * speed,
                color,
                size: 6.0,
                lifetime: 35,
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_combat_simulation_tick() {
        let mut engine = DragonPixelEngineCore::new(
            FighterId::Goku,
            FighterId::Vegeta,
            ArenaId::CellGames,
            GameMode::Versus,
        );

        let initial_p1_x = engine.p1.x;
        // Step with forward movement
        engine.tick(
            FighterInput { right: true, ..Default::default() },
            FighterInput::default(),
        );

        assert!(engine.p1.x > initial_p1_x);
        assert_eq!(engine.frame_count, 1);
    }
}
