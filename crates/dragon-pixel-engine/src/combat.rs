// SPDX-License-Identifier: Apache-2.0
#![allow(clippy::collapsible_if, clippy::manual_is_multiple_of)]

use crate::beam_clash::{BeamClashResult, BeamClashState};
use crate::frame_data::{
    calculate_world_hitbox, calculate_world_hurtbox, get_default_move_data, get_fighter_hurtbox,
    MoveKind, MovePhase,
};
use crate::haptics::HapticTrigger;
use crate::input::EngineInput;
use crate::render_packet::{
    ArenaRenderData, BeamClashRenderData, CameraData, FighterRenderData, ParticleRenderData,
    ProjectileRenderData, UiOverlayData, WebGpuRenderPacket,
};
use crate::roster::{get_fighter_def, get_story_chapters, FighterDefinition};
use crate::types::{
    ArenaId, AudioEvent, AuraType, FighterId, FighterStyle, GameMode, HapticEvent, Rect,
};
use serde::{Deserialize, Serialize};

/// État interne complet d'un combattant dans la simulation déterministe.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FighterEntity {
    pub id: FighterId,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub hp: f32,
    pub max_hp: f32,
    pub ki: f32,
    pub max_ki: f32,
    pub facing: f32,
    pub form_level: u32,
    pub current_move: Option<MoveKind>,
    pub frame_in_move: u32,
    pub hitstun_remaining: u32,
    pub blockstun_remaining: u32,
    pub knockdown_remaining: u32,
    pub is_guarding: bool,
    pub is_charging: bool,
    pub is_airborne: bool,
    pub vanish_cooldown: f32,
    pub transform_duration: f32,
    pub combo_count: u32,
    pub flash_timer: f32,
}

impl FighterEntity {
    pub fn new(id: FighterId, x: f32, y: f32, facing: f32, def: &FighterDefinition) -> Self {
        Self {
            id,
            x,
            y,
            vx: 0.0,
            vy: 0.0,
            hp: def.base_hp,
            max_hp: def.base_hp,
            ki: 40.0,
            max_ki: def.base_ki,
            facing,
            form_level: 0,
            current_move: None,
            frame_in_move: 0,
            hitstun_remaining: 0,
            blockstun_remaining: 0,
            knockdown_remaining: 0,
            is_guarding: false,
            is_charging: false,
            is_airborne: false,
            vanish_cooldown: 0.0,
            transform_duration: 0.0,
            combo_count: 0,
            flash_timer: 0.0,
        }
    }

    pub fn is_free(&self) -> bool {
        self.hitstun_remaining == 0
            && self.blockstun_remaining == 0
            && self.knockdown_remaining == 0
            && self.current_move.is_none()
    }

    pub fn get_power_multiplier(&self, def: &FighterDefinition) -> f32 {
        let idx = (self.form_level as usize).min(def.forms.len().saturating_sub(1));
        def.forms[idx].power_multiplier
    }

    pub fn get_current_aura(&self, def: &FighterDefinition) -> (AuraType, [f32; 4]) {
        let idx = (self.form_level as usize).min(def.forms.len().saturating_sub(1));
        let form = &def.forms[idx];
        (form.aura, form.aura_color)
    }
}

/// Projectile de Kikōha ou rayon d'énergie en vol.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Projectile {
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub is_beam: bool,
    pub width: f32,
    pub height: f32,
    pub damage: f32,
    pub chip_damage: f32,
    pub color: [f32; 4],
    pub source_is_player: bool,
    pub duration: f32,
}

/// Particule d'impact ou éclat d'énergie.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Particle {
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub life: f32,
    pub max_life: f32,
    pub size: f32,
    pub color: [f32; 4],
}

/// Moteur de combat complet de Dragon Pixel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DragonPixelEngineCore {
    pub player: FighterEntity,
    pub player_def: FighterDefinition,
    pub enemy: FighterEntity,
    pub enemy_def: FighterDefinition,
    pub projectiles: Vec<Projectile>,
    pub particles: Vec<Particle>,
    pub clash: Option<BeamClashState>,
    pub arena: ArenaId,
    pub mode: GameMode,
    pub current_chapter_id: u32,
    pub score: u32,
    pub time_elapsed: f32,
    pub status: String, // "playing", "won", "lost"
    pub trauma: f32,    // Secousse d'écran 0.0 à 1.0
    pub haptic_queue: Vec<HapticEvent>,
    pub audio_queue: Vec<AudioEvent>,
    pub ground_y: f32,
}

impl DragonPixelEngineCore {
    pub fn new(player_id: FighterId, mode: GameMode, chapter_id: u32, arena: ArenaId) -> Self {
        let chapters = get_story_chapters();
        let (actual_player_id, actual_enemy_id, actual_arena, boss_hp) = if mode == GameMode::Story
        {
            let chap = chapters
                .iter()
                .find(|c| c.id == chapter_id)
                .cloned()
                .unwrap_or_else(|| chapters[0].clone());
            (
                chap.player_fighter,
                chap.enemy_fighter,
                ArenaId::from_str_loose(&chap.arena_id),
                chap.boss_hp,
            )
        } else {
            (player_id, FighterId::Vegeta, arena, 100.0)
        };

        let p_def = get_fighter_def(actual_player_id);
        let mut e_def = get_fighter_def(actual_enemy_id);
        e_def.base_hp = boss_hp;

        let ground_y = 330.0;
        let mut player = FighterEntity::new(actual_player_id, 160.0, ground_y, 1.0, &p_def);
        let mut enemy = FighterEntity::new(actual_enemy_id, 800.0, ground_y, -1.0, &e_def);
        enemy.hp = boss_hp;
        enemy.max_hp = boss_hp;

        // Pré-transformation si demandé par le chapitre
        if mode == GameMode::Story {
            let chap = chapters
                .iter()
                .find(|c| c.id == chapter_id)
                .unwrap_or(&chapters[0]);
            if let Some(target_form) = chap.target_transformation {
                if target_form > 0 {
                    player.form_level = target_form;
                }
            }
        }

        Self {
            player,
            player_def: p_def,
            enemy,
            enemy_def: e_def,
            projectiles: Vec::new(),
            particles: Vec::new(),
            clash: None,
            arena: actual_arena,
            mode,
            current_chapter_id: chapter_id,
            score: 0,
            time_elapsed: 0.0,
            status: "playing".into(),
            trauma: 0.0,
            haptic_queue: Vec::new(),
            audio_queue: Vec::new(),
            ground_y,
        }
    }

    /// Pas de simulation déterministe (Tick à 60 FPS ou delta-time).
    pub fn step(&mut self, input: EngineInput, dt: f32) {
        if self.status != "playing" {
            return;
        }

        let clamped_dt = dt.clamp(0.001, 0.05);
        self.time_elapsed += clamped_dt;

        // Amortissement de la secousse d'écran
        self.trauma = (self.trauma - clamped_dt * 1.8).max(0.0);

        // Amortissement des temps de flash
        self.player.flash_timer = (self.player.flash_timer - clamped_dt).max(0.0);
        self.enemy.flash_timer = (self.enemy.flash_timer - clamped_dt).max(0.0);
        self.player.vanish_cooldown = (self.player.vanish_cooldown - clamped_dt).max(0.0);
        self.enemy.vanish_cooldown = (self.enemy.vanish_cooldown - clamped_dt).max(0.0);

        // Résolution du Beam Clash prioritaire
        if let Some(mut clash) = self.clash.take() {
            let enemy_bias = self.enemy.get_power_multiplier(&self.enemy_def);
            let result = clash.tick(
                clamped_dt,
                input.mash || input.punch || input.blast,
                enemy_bias,
                self.player.x,
                self.enemy.x,
            );

            // Secousse d'écran et haptique
            self.trauma = (self.trauma + 0.15).min(1.0);
            self.haptic_queue.push(clash.get_rumble_feedback());

            if let Some(res) = result {
                match res {
                    BeamClashResult::PlayerWon {
                        damage_to_enemy,
                        clash_point,
                    } => {
                        self.enemy.hp = (self.enemy.hp - damage_to_enemy).max(0.0);
                        self.enemy.hitstun_remaining = 35;
                        self.enemy.knockdown_remaining = 25;
                        self.enemy.flash_timer = 0.3;
                        Self::spawn_explosion_particles(&mut self.particles, clash_point.0, clash_point.1, [0.0, 0.8, 1.0, 1.0], 40);
                        self.trauma = 1.0;
                        self.haptic_queue.push(HapticTrigger::KnockdownKO.to_event());
                        self.audio_queue.push(AudioEvent {
                            sound_type: "explosion".into(),
                            pitch: 1.0,
                            volume: 1.0,
                        });
                        self.score += 1500;
                        if self.enemy.hp <= 0.0 {
                            self.status = "won".into();
                        }
                    }
                    BeamClashResult::EnemyWon {
                        damage_to_player,
                        clash_point,
                    } => {
                        self.player.hp = (self.player.hp - damage_to_player).max(0.0);
                        self.player.hitstun_remaining = 35;
                        self.player.knockdown_remaining = 25;
                        self.player.flash_timer = 0.3;
                        Self::spawn_explosion_particles(&mut self.particles, clash_point.0, clash_point.1, [1.0, 0.2, 0.2, 1.0], 40);
                        self.trauma = 1.0;
                        self.haptic_queue.push(HapticTrigger::KnockdownKO.to_event());
                        self.audio_queue.push(AudioEvent {
                            sound_type: "explosion".into(),
                            pitch: 0.8,
                            volume: 1.0,
                        });
                        if self.player.hp <= 0.0 {
                            self.status = "lost".into();
                        }
                    }
                }
            } else {
                self.clash = Some(clash);
            }
            return;
        }

        // 1. Mise à jour du Joueur
        self.update_player(input, clamped_dt);

        // 2. Mise à jour de l'IA adverse
        self.update_enemy_ai(clamped_dt);

        // 3. Mise à jour des projectiles & détection de Beam Clash
        self.update_projectiles(clamped_dt);

        // 4. Mise à jour des particules
        self.update_particles(clamped_dt);

        // 5. Conditions de victoire / défaite
        if self.enemy.hp <= 0.0 {
            self.status = "won".into();
            self.score += 2000;
        } else if self.player.hp <= 0.0 {
            self.status = "lost".into();
        }
    }

    fn update_player(&mut self, input: EngineInput, dt: f32) {
        let p = &mut self.player;

        // Récupération de Hitstun / Blockstun
        if p.hitstun_remaining > 0 {
            p.hitstun_remaining -= 1;
            p.current_move = None;
            return;
        }
        if p.blockstun_remaining > 0 {
            p.blockstun_remaining -= 1;
            p.current_move = None;
            return;
        }
        if p.knockdown_remaining > 0 {
            p.knockdown_remaining -= 1;
            p.current_move = None;
            return;
        }

        // Garde
        p.is_guarding = input.guard;

        // Téléportation Z-Vanish
        if input.vanish && p.ki >= 25.0 && p.vanish_cooldown <= 0.0 {
            p.ki -= 25.0;
            p.vanish_cooldown = 1.0;
            let target_x = self.enemy.x + if self.enemy.facing > 0.0 { -70.0 } else { 70.0 };
            p.x = target_x.clamp(40.0, 920.0);
            p.facing = if p.x < self.enemy.x { 1.0 } else { -1.0 };
            self.trauma = (self.trauma + 0.35).min(1.0);
            self.audio_queue.push(AudioEvent {
                sound_type: "teleport".into(),
                pitch: 1.1,
                volume: 0.8,
            });
            self.haptic_queue.push(HapticTrigger::LightHit.to_event());
            Self::spawn_vanish_sparks(&mut self.particles, p.x, p.y - 30.0);
        }

        // Charge de Ki
        p.is_charging = input.charge;
        if p.is_charging {
            p.ki = (p.ki + 32.0 * dt).min(p.max_ki);
            self.trauma = (self.trauma + 0.05).min(0.4);
            if (self.time_elapsed * 10.0) as u32 % 5 == 0 {
                let (aura, color) = p.get_current_aura(&self.player_def);
                Self::spawn_ki_charge_particles(&mut self.particles, p.x, p.y, aura, color);
            }
        } else {
            p.ki = (p.ki + 4.0 * dt).min(p.max_ki);
        }

        // Transformation
        if input.transform && p.ki >= 80.0 {
            let max_form = (self.player_def.forms.len() as u32).saturating_sub(1);
            if p.form_level < max_form {
                p.ki -= 80.0;
                p.form_level += 1;
                self.trauma = 0.85;
                self.haptic_queue.push(HapticTrigger::TransformationSurge.to_event());
                self.audio_queue.push(AudioEvent {
                    sound_type: "power-up".into(),
                    pitch: 1.0 + p.form_level as f32 * 0.1,
                    volume: 1.0,
                });
                let (_, color) = p.get_current_aura(&self.player_def);
                Self::spawn_transformation_burst(&mut self.particles, p.x, p.y, color);
            }
        }

        // Déplacement au sol
        let move_dir = input.horizontal_axis();
        let speed_mult = if p.is_guarding { 0.35 } else { 1.0 };
        let power_mult = p.get_power_multiplier(&self.player_def);
        let base_speed = match self.player_def.style {
            FighterStyle::Speed => 280.0,
            FighterStyle::Power => 210.0,
            FighterStyle::Balanced => 240.0,
        };

        if p.is_free() && move_dir != 0.0 {
            p.facing = move_dir;
            p.x = (p.x + move_dir * base_speed * speed_mult * dt).clamp(30.0, 930.0);
        }

        // Saut & Gravité
        if input.jump && !p.is_airborne && p.is_free() {
            p.vy = -450.0;
            p.is_airborne = true;
            self.audio_queue.push(AudioEvent {
                sound_type: "whoosh".into(),
                pitch: 1.2,
                volume: 0.6,
            });
        }
        if p.is_airborne {
            p.vy += 980.0 * dt;
            p.y += p.vy * dt;
            if p.y >= self.ground_y {
                p.y = self.ground_y;
                p.vy = 0.0;
                p.is_airborne = false;
            }
        }

        // Déclenchement d'attaque
        if p.is_free() {
            if input.special && p.ki >= 40.0 {
                p.ki -= 40.0;
                p.current_move = Some(MoveKind::BeamSpecial);
                p.frame_in_move = 0;
                self.audio_queue.push(AudioEvent {
                    sound_type: "kamehameha".into(),
                    pitch: 1.0,
                    volume: 1.0,
                });
                self.haptic_queue.push(HapticTrigger::BeamFired.to_event());
            } else if input.blast && p.ki >= 18.0 {
                p.ki -= 18.0;
                p.current_move = Some(MoveKind::KiBlast);
                p.frame_in_move = 0;
                self.audio_queue.push(AudioEvent {
                    sound_type: "blast".into(),
                    pitch: 1.0,
                    volume: 0.75,
                });
                self.haptic_queue.push(HapticTrigger::KiBlastFired.to_event());
            } else if input.heavy {
                p.current_move = Some(MoveKind::HeavyStrike);
                p.frame_in_move = 0;
            } else if input.punch {
                p.current_move = Some(MoveKind::LightJab);
                p.frame_in_move = 0;
            }
        }

        // Progression de la frame data d'attaque active
        if let Some(current_move) = p.current_move {
            let mdata = get_default_move_data(current_move, power_mult);
            p.frame_in_move += 1;

            // Instanciation de tirs au bon moment
            if current_move == MoveKind::KiBlast && p.frame_in_move == mdata.startup_frames {
                self.projectiles.push(Projectile {
                    x: p.x + p.facing * 35.0,
                    y: p.y - 32.0,
                    vx: p.facing * 550.0,
                    vy: 0.0,
                    is_beam: false,
                    width: 22.0,
                    height: 18.0,
                    damage: 22.0 * power_mult,
                    chip_damage: 2.0,
                    color: [0.0, 0.75, 1.0, 1.0],
                    source_is_player: true,
                    duration: 2.0,
                });
            } else if current_move == MoveKind::BeamSpecial && p.frame_in_move == mdata.startup_frames {
                self.projectiles.push(Projectile {
                    x: p.x + p.facing * 50.0,
                    y: p.y - 32.0,
                    vx: p.facing * 750.0,
                    vy: 0.0,
                    is_beam: true,
                    width: 140.0,
                    height: 28.0,
                    damage: 48.0 * power_mult,
                    chip_damage: 8.0,
                    color: p.get_current_aura(&self.player_def).1,
                    source_is_player: true,
                    duration: 0.8,
                });
                self.trauma = (self.trauma + 0.5).min(1.0);
            }

            // Détection de collision de coups de mêlée
            if let Some(phase) = mdata.get_phase(p.frame_in_move) {
                if phase == MovePhase::Active {
                    if let Some(ref hitbox) = mdata.hitbox {
                        let w_hit = calculate_world_hitbox(p.x, p.y, p.facing, hitbox);
                        let e_hurt = get_fighter_hurtbox(false, self.enemy.is_airborne);
                        let w_hurt = calculate_world_hurtbox(
                            self.enemy.x,
                            self.enemy.y,
                            self.enemy.facing,
                            &e_hurt,
                        );

                        if w_hit.intersects(&w_hurt) && self.enemy.flash_timer <= 0.0 {
                            let is_blocking = self.enemy.is_guarding
                                && (self.enemy.facing * p.facing < 0.0);
                            let dmg = if is_blocking {
                                hitbox.chip_damage
                            } else {
                                hitbox.damage
                            };

                            self.enemy.hp = (self.enemy.hp - dmg).max(0.0);
                            self.enemy.flash_timer = 0.15;
                            self.trauma = (self.trauma + hitbox.screen_shake * 0.1).min(1.0);

                            if is_blocking {
                                self.enemy.blockstun_remaining = hitbox.blockstun_frames;
                                self.haptic_queue.push(HapticTrigger::BlockedHit.to_event());
                                self.audio_queue.push(AudioEvent {
                                    sound_type: "block".into(),
                                    pitch: 1.0,
                                    volume: 0.8,
                                });
                            } else {
                                self.enemy.hitstun_remaining = hitbox.hitstun_frames;
                                self.enemy.x = (self.enemy.x + p.facing * hitbox.knockback_x)
                                    .clamp(30.0, 930.0);
                                p.combo_count += 1;
                                self.score += 50 * p.combo_count;
                                self.haptic_queue.push(if hitbox.damage > 20.0 {
                                    HapticTrigger::HeavyHit.to_event()
                                } else {
                                    HapticTrigger::LightHit.to_event()
                                });
                                self.audio_queue.push(AudioEvent {
                                    sound_type: "hit".into(),
                                    pitch: 1.0,
                                    volume: 0.9,
                                });
                                Self::spawn_hit_sparks(&mut self.particles, w_hit.x, w_hit.y);
                            }
                        }
                    }
                }
            }

            if p.frame_in_move >= mdata.total_frames {
                p.current_move = None;
                p.frame_in_move = 0;
            }
        }
    }

    fn update_enemy_ai(&mut self, dt: f32) {
        let e = &mut self.enemy;
        let px = self.player.x;

        if e.hitstun_remaining > 0 {
            e.hitstun_remaining -= 1;
            return;
        }
        if e.blockstun_remaining > 0 {
            e.blockstun_remaining -= 1;
            return;
        }
        if e.knockdown_remaining > 0 {
            e.knockdown_remaining -= 1;
            return;
        }

        let dist = px - e.x;
        e.facing = if dist > 0.0 { 1.0 } else { -1.0 };

        // L'IA se rapproche du joueur
        let abs_dist = dist.abs();
        if abs_dist > 65.0 {
            let speed = 180.0;
            e.x = (e.x + e.facing * speed * dt).clamp(40.0, 920.0);
        } else {
            // À portée de corps-à-corps : l'IA donne un coup
            if e.current_move.is_none() && (self.time_elapsed * 5.0) as u32 % 3 == 0 {
                e.current_move = Some(MoveKind::LightJab);
                e.frame_in_move = 0;
            }
        }

        // Tir de rayon à distance pour provoquer un Beam Clash !
        if abs_dist > 250.0
            && e.current_move.is_none()
            && e.ki >= 35.0
            && (self.time_elapsed * 2.0) as u32 % 7 == 0
        {
            e.ki -= 35.0;
            e.current_move = Some(MoveKind::BeamSpecial);
            e.frame_in_move = 0;
        }

        // Progression de l'action adverse
        if let Some(cm) = e.current_move {
            let mdata = get_default_move_data(cm, e.get_power_multiplier(&self.enemy_def));
            e.frame_in_move += 1;

            if cm == MoveKind::BeamSpecial && e.frame_in_move == mdata.startup_frames {
                self.projectiles.push(Projectile {
                    x: e.x + e.facing * 50.0,
                    y: e.y - 32.0,
                    vx: e.facing * 700.0,
                    vy: 0.0,
                    is_beam: true,
                    width: 140.0,
                    height: 28.0,
                    damage: 42.0,
                    chip_damage: 6.0,
                    color: [0.95, 0.15, 0.25, 1.0],
                    source_is_player: false,
                    duration: 0.8,
                });
            }

            if let Some(phase) = mdata.get_phase(e.frame_in_move) {
                if phase == MovePhase::Active {
                    if let Some(ref hitbox) = mdata.hitbox {
                        let w_hit = calculate_world_hitbox(e.x, e.y, e.facing, hitbox);
                        let p_hurt = get_fighter_hurtbox(false, self.player.is_airborne);
                        let w_hurt = calculate_world_hurtbox(
                            self.player.x,
                            self.player.y,
                            self.player.facing,
                            &p_hurt,
                        );

                        if w_hit.intersects(&w_hurt) && self.player.flash_timer <= 0.0 {
                            let is_blocking = self.player.is_guarding
                                && (self.player.facing * e.facing < 0.0);
                            let dmg = if is_blocking {
                                hitbox.chip_damage
                            } else {
                                hitbox.damage
                            };

                            self.player.hp = (self.player.hp - dmg).max(0.0);
                            self.player.flash_timer = 0.15;
                            self.trauma = (self.trauma + hitbox.screen_shake * 0.1).min(1.0);

                            if is_blocking {
                                self.player.blockstun_remaining = hitbox.blockstun_frames;
                                self.haptic_queue.push(HapticTrigger::BlockedHit.to_event());
                            } else {
                                self.player.hitstun_remaining = hitbox.hitstun_frames;
                                self.player.x = (self.player.x + e.facing * hitbox.knockback_x)
                                    .clamp(30.0, 930.0);
                                self.haptic_queue.push(HapticTrigger::LightHit.to_event());
                                Self::spawn_hit_sparks(&mut self.particles, w_hit.x, w_hit.y);
                            }
                        }
                    }
                }
            }

            if e.frame_in_move >= mdata.total_frames {
                e.current_move = None;
                e.frame_in_move = 0;
            }
        }
    }

    fn update_projectiles(&mut self, dt: f32) {
        for s in &mut self.projectiles {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.duration -= dt;
        }

        // DÉTECTION MAJEURE DU BEAM CLASH : Deux rayons opposés se percutent !
        let player_beam = self
            .projectiles
            .iter()
            .find(|p| p.source_is_player && p.is_beam);
        let enemy_beam = self
            .projectiles
            .iter()
            .find(|p| !p.source_is_player && p.is_beam);

        if let (Some(pb), Some(eb)) = (player_beam, enemy_beam) {
            if (pb.x - eb.x).abs() < 120.0 {
                // Déclenchement du BEAM CLASH !
                let clash_state = BeamClashState::new(
                    self.player.x,
                    self.enemy.x,
                    self.ground_y - 32.0,
                    pb.color,
                    eb.color,
                );
                self.clash = Some(clash_state);
                self.projectiles.clear();
                self.trauma = 0.9;
                self.haptic_queue.push(HapticTrigger::BeamClashTension.to_event());
                self.audio_queue.push(AudioEvent {
                    sound_type: "clash".into(),
                    pitch: 1.0,
                    volume: 1.0,
                });
                return;
            }
        }

        // Résolution des tirs normaux contre les combattants
        let mut surviving = Vec::new();
        for proj in self.projectiles.drain(..) {
            if proj.duration <= 0.0 || proj.x < 0.0 || proj.x > 960.0 {
                continue;
            }

            let mut consumed = false;
            if proj.source_is_player {
                let e_hurt = get_fighter_hurtbox(false, self.enemy.is_airborne);
                let w_hurt = calculate_world_hurtbox(
                    self.enemy.x,
                    self.enemy.y,
                    self.enemy.facing,
                    &e_hurt,
                );
                let p_rect = Rect::new(proj.x - proj.width * 0.5, proj.y - proj.height * 0.5, proj.width, proj.height);

                if p_rect.intersects(&w_hurt) {
                    let is_blocking = self.enemy.is_guarding;
                    let dmg = if is_blocking {
                        proj.chip_damage
                    } else {
                        proj.damage
                    };
                    self.enemy.hp = (self.enemy.hp - dmg).max(0.0);
                    self.enemy.flash_timer = 0.2;
                    self.trauma = (self.trauma + if proj.is_beam { 0.4 } else { 0.2 }).min(1.0);
                    Self::spawn_hit_sparks(&mut self.particles, proj.x, proj.y);
                    if !proj.is_beam {
                        consumed = true;
                    }
                }
            } else {
                let p_hurt = get_fighter_hurtbox(false, self.player.is_airborne);
                let w_hurt = calculate_world_hurtbox(
                    self.player.x,
                    self.player.y,
                    self.player.facing,
                    &p_hurt,
                );
                let p_rect = Rect::new(proj.x - proj.width * 0.5, proj.y - proj.height * 0.5, proj.width, proj.height);

                if p_rect.intersects(&w_hurt) {
                    let is_blocking = self.player.is_guarding;
                    let dmg = if is_blocking {
                        proj.chip_damage
                    } else {
                        proj.damage
                    };
                    self.player.hp = (self.player.hp - dmg).max(0.0);
                    self.player.flash_timer = 0.2;
                    self.trauma = (self.trauma + if proj.is_beam { 0.4 } else { 0.2 }).min(1.0);
                    self.haptic_queue.push(if is_blocking {
                        HapticTrigger::BlockedHit.to_event()
                    } else {
                        HapticTrigger::HeavyHit.to_event()
                    });
                    Self::spawn_hit_sparks(&mut self.particles, proj.x, proj.y);
                    if !proj.is_beam {
                        consumed = true;
                    }
                }
            }

            if !consumed {
                surviving.push(proj);
            }
        }
        self.projectiles = surviving;
    }

    fn update_particles(&mut self, dt: f32) {
        for p in &mut self.particles {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
        }
        self.particles.retain(|p| p.life > 0.0);
    }

    fn spawn_hit_sparks(particles: &mut Vec<Particle>, x: f32, y: f32) {
        for i in 0..12 {
            let angle = (i as f32) * (std::f32::consts::PI * 2.0 / 12.0);
            let speed = 120.0 + (i as f32 % 4.0) * 40.0;
            particles.push(Particle {
                x,
                y,
                vx: angle.cos() * speed,
                vy: angle.sin() * speed,
                life: 0.25,
                max_life: 0.25,
                size: 4.0,
                color: [1.0, 0.9, 0.2, 1.0],
            });
        }
    }

    fn spawn_vanish_sparks(particles: &mut Vec<Particle>, x: f32, y: f32) {
        for i in 0..8 {
            let angle = (i as f32) * (std::f32::consts::PI * 2.0 / 8.0);
            particles.push(Particle {
                x,
                y,
                vx: angle.cos() * 80.0,
                vy: angle.sin() * 80.0,
                life: 0.2,
                max_life: 0.2,
                size: 3.5,
                color: [0.6, 0.9, 1.0, 0.8],
            });
        }
    }

    fn spawn_ki_charge_particles(
        particles: &mut Vec<Particle>,
        x: f32,
        y: f32,
        aura: AuraType,
        color: [f32; 4],
    ) {
        let count = if aura == AuraType::SuperSaiyan2 { 6 } else { 3 };
        for _ in 0..count {
            let offset_x = ((particles.len() % 50) as f32 - 25.0) * 1.2;
            particles.push(Particle {
                x: x + offset_x,
                y: y - 5.0,
                vx: -offset_x * 0.5,
                vy: -140.0 - ((particles.len() % 5) as f32) * 20.0,
                life: 0.35,
                max_life: 0.35,
                size: if aura == AuraType::SuperSaiyan2 { 4.5 } else { 3.0 },
                color,
            });
        }
    }

    fn spawn_transformation_burst(
        particles: &mut Vec<Particle>,
        x: f32,
        y: f32,
        color: [f32; 4],
    ) {
        for i in 0..32 {
            let angle = (i as f32) * (std::f32::consts::PI * 2.0 / 32.0);
            let speed = 220.0;
            particles.push(Particle {
                x,
                y: y - 30.0,
                vx: angle.cos() * speed,
                vy: angle.sin() * speed,
                life: 0.45,
                max_life: 0.45,
                size: 5.0,
                color,
            });
        }
    }

    fn spawn_explosion_particles(
        particles: &mut Vec<Particle>,
        x: f32,
        y: f32,
        color: [f32; 4],
        count: usize,
    ) {
        for i in 0..count {
            let angle = (i as f32) * (std::f32::consts::PI * 2.0 / count as f32);
            let speed = 180.0 + (i as f32 % 5.0) * 60.0;
            particles.push(Particle {
                x,
                y,
                vx: angle.cos() * speed,
                vy: angle.sin() * speed,
                life: 0.5,
                max_life: 0.5,
                size: 6.0,
                color,
            });
        }
    }

    /// Génère le paquet complet de rendu pour le pipeline WebGPU.
    pub fn create_render_packet(&self) -> WebGpuRenderPacket {
        // Caméra et secousses avec amortissement quadratique (trauma^2)
        let shake_power = self.trauma * self.trauma;
        let shake_x = (self.time_elapsed * 55.0).sin() * 12.0 * shake_power;
        let shake_y = (self.time_elapsed * 67.0).cos() * 8.0 * shake_power;

        let camera = CameraData {
            shake_offset_x: shake_x,
            shake_offset_y: shake_y,
            trauma: self.trauma,
            time: self.time_elapsed,
            aspect_ratio: 16.0 / 9.0,
        };

        let arena_index = match self.arena {
            ArenaId::Paozu => 0,
            ArenaId::Budokai => 1,
            ArenaId::Wasteland => 2,
            ArenaId::Namek => 3,
            ArenaId::CellGames => 4,
            ArenaId::Kaiohshin => 5,
        };

        let arena = ArenaRenderData {
            arena_index,
            time: self.time_elapsed,
            scroll_x: self.player.x * 0.1,
            ground_y: self.ground_y,
        };

        let (p_aura, p_aura_color) = self.player.get_current_aura(&self.player_def);
        let player = FighterRenderData {
            fighter_index: 0,
            x: self.player.x,
            y: self.player.y,
            facing: self.player.facing,
            state_index: if self.player.is_guarding {
                3
            } else if self.player.is_charging {
                7
            } else if self.player.current_move.is_some() {
                4
            } else if self.player.is_airborne {
                2
            } else {
                0
            },
            frame_phase: 0,
            current_anim_frame: self.player.frame_in_move,
            form_level: self.player.form_level,
            flash_intensity: (self.player.flash_timer / 0.15).clamp(0.0, 1.0),
            aura_type: match p_aura {
                AuraType::None => 0,
                AuraType::White => 1,
                AuraType::KaioKen => 2,
                AuraType::SuperSaiyan => 3,
                AuraType::SuperSaiyan2 => 4,
                AuraType::SuperSaiyan3 => 5,
                AuraType::SuperNamek => 6,
                AuraType::Mystic => 7,
                AuraType::Golden => 8,
                AuraType::Perfect => 9,
                AuraType::Majin => 10,
            },
            aura_color: p_aura_color,
            aura_intensity: if self.player.is_charging {
                1.0
            } else if self.player.form_level > 0 {
                0.65
            } else {
                0.0
            },
            has_ssj2_lightning: p_aura == AuraType::SuperSaiyan2,
        };

        let (e_aura, e_aura_color) = self.enemy.get_current_aura(&self.enemy_def);
        let enemy = FighterRenderData {
            fighter_index: 1,
            x: self.enemy.x,
            y: self.enemy.y,
            facing: self.enemy.facing,
            state_index: if self.enemy.current_move.is_some() { 4 } else { 0 },
            frame_phase: 0,
            current_anim_frame: self.enemy.frame_in_move,
            form_level: self.enemy.form_level,
            flash_intensity: (self.enemy.flash_timer / 0.15).clamp(0.0, 1.0),
            aura_type: match e_aura {
                AuraType::SuperSaiyan2 => 4,
                AuraType::Majin => 10,
                _ => 1,
            },
            aura_color: e_aura_color,
            aura_intensity: 0.5,
            has_ssj2_lightning: e_aura == AuraType::SuperSaiyan2,
        };

        let projectiles = self
            .projectiles
            .iter()
            .map(|p| ProjectileRenderData {
                x: p.x,
                y: p.y,
                vx: p.vx,
                vy: p.vy,
                is_beam: p.is_beam,
                width: p.width,
                height: p.height,
                color: p.color,
                glow_radius: if p.is_beam { 40.0 } else { 16.0 },
            })
            .collect();

        let clash = if let Some(ref c) = self.clash {
            BeamClashRenderData {
                active: true,
                clash_x: c.clash_x,
                clash_y: c.clash_y,
                tension: c.tension,
                player_color: c.player_beam_color,
                enemy_color: c.enemy_beam_color,
                sphere_radius: 36.0 + (c.tension.abs() / 100.0) * 14.0,
                shockwave_scale: 1.0 + (self.time_elapsed * 20.0).sin().abs() * 0.3,
            }
        } else {
            BeamClashRenderData {
                active: false,
                clash_x: 0.0,
                clash_y: 0.0,
                tension: 0.0,
                player_color: [0.0; 4],
                enemy_color: [0.0; 4],
                sphere_radius: 0.0,
                shockwave_scale: 0.0,
            }
        };

        let particles = self
            .particles
            .iter()
            .map(|p| ParticleRenderData {
                x: p.x,
                y: p.y,
                size: p.size,
                life_ratio: (p.life / p.max_life).clamp(0.0, 1.0),
                color: p.color,
            })
            .collect();

        let chapters = get_story_chapters();
        let chapter_title = chapters
            .iter()
            .find(|c| c.id == self.current_chapter_id)
            .map(|c| c.title.clone())
            .unwrap_or_else(|| "Dragon Pixel Arena".into());

        let p_idx = (self.player.form_level as usize).min(self.player_def.forms.len().saturating_sub(1));
        let e_idx = (self.enemy.form_level as usize).min(self.enemy_def.forms.len().saturating_sub(1));

        let ui = UiOverlayData {
            player_hp_ratio: (self.player.hp / self.player.max_hp).clamp(0.0, 1.0),
            player_ki_ratio: (self.player.ki / self.player.max_ki).clamp(0.0, 1.0),
            enemy_hp_ratio: (self.enemy.hp / self.enemy.max_hp).clamp(0.0, 1.0),
            enemy_ki_ratio: (self.enemy.ki / self.enemy.max_ki).clamp(0.0, 1.0),
            player_name: self.player_def.name.clone(),
            enemy_name: self.enemy_def.name.clone(),
            player_combo: self.player.combo_count,
            player_score: self.score,
            time_elapsed: self.time_elapsed,
            player_power_level: self.player_def.forms[p_idx].power_level,
            enemy_power_level: self.enemy_def.forms[e_idx].power_level,
            clash_active: self.clash.is_some(),
            clash_tension: self.clash.as_ref().map(|c| c.tension).unwrap_or(0.0),
            chapter_title,
        };

        WebGpuRenderPacket {
            camera,
            arena,
            player,
            enemy: Some(enemy),
            projectiles,
            clash,
            particles,
            ui,
        }
    }
}
