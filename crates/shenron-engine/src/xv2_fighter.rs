// SPDX-License-Identifier: Apache-2.0

//! DBXV2 fighters and a two-fighter duel driven by real data: each fighter plays its `.ean`
//! animations and its `.bac` actions; [`Duel::step`] advances both on a 60 fps clock,
//! lands hitboxes through [`crate::xv2_battle`] and applies the BDM reaction (damage,
//! stun, pushback) to the victim.

use crate::render::skinned::{BoundAnimation, SkinnedCharacter};
use crate::xv2_battle::{HitEvent, Placement, resolve_hits, yaw_toward};
use glam::{Mat4, Quat, Vec3};
use shenron_re::formats::{BacFile, BdmFile, EanFile};

/// BAC animation source naming the character's own `.ean`.
pub const EAN_CHARACTER: u16 = 5;
/// Starting health of a duel fighter.
pub const START_HP: i32 = 1000;
/// Victim body sphere: centre height above the feet and radius, in metres.
const BODY_HEIGHT: f32 = 0.9;
const BODY_RADIUS: f32 = 0.45;
/// Pushback decays by this factor every frame.
const PUSHBACK_DECAY: f32 = 0.85;

/// A posed, animated character with its moveset and placement.
pub struct Fighter {
    pub character: SkinnedCharacter,
    pub ean: EanFile,
    pub actions: Option<BacFile>,
    pub damage: Option<BdmFile>,
    pub placement: Placement,
    pub hp: i32,
    /// Frames during which the fighter cannot act.
    pub stun: u16,
    velocity: Vec3,
    animation: Option<BoundAnimation>,
    range: (f32, f32),
    speed: f32,
    once: bool,
    idle: usize,
    clock: f32,
    action: Option<u32>,
    landed: Vec<bool>,
}

impl Fighter {
    pub fn new(character: SkinnedCharacter, ean: EanFile) -> Self {
        let mut fighter = Self {
            character,
            ean,
            actions: None,
            damage: None,
            placement: Placement { position: Vec3::ZERO, yaw: 0.0 },
            hp: START_HP,
            stun: 0,
            velocity: Vec3::ZERO,
            animation: None,
            range: (0.0, 0.0),
            speed: 1.0,
            once: false,
            idle: 0,
            clock: 0.0,
            action: None,
            landed: Vec::new(),
        };
        fighter.play(0);
        fighter
    }

    /// Position in `ean.animations` of the animation stored at EAN slot `index`.
    fn slot(&self, index: u16) -> Option<usize> {
        self.ean.animations.iter().position(|a| a.index == index as usize)
    }

    /// Loops the animation at `index` of `ean.animations`.
    pub fn play(&mut self, index: usize) -> bool {
        let Some(animation) = self.ean.animations.get(index) else { return false };
        let bound = self.character.bind(&self.ean, animation);
        self.range = (0.0, bound.frame_count.saturating_sub(1) as f32);
        self.animation = Some(bound);
        self.speed = 1.0;
        self.once = false;
        self.idle = index;
        self.clock = 0.0;
        self.action = None;
        true
    }

    /// Ids of the loaded actions that animate the character with its own `.ean`.
    pub fn playable_actions(&self) -> Vec<u32> {
        let Some(bac) = &self.actions else { return Vec::new() };
        bac.moves
            .iter()
            .filter(|m| {
                m.animations
                    .iter()
                    .any(|a| a.ean_type == EAN_CHARACTER && self.slot(a.ean_index).is_some())
            })
            .map(|m| m.move_id)
            .collect()
    }

    /// Starts action `id` once; refused while stunned or during another action.
    pub fn start_action(&mut self, id: u32) -> bool {
        if self.stun > 0 || self.action.is_some() {
            return false;
        }
        let Some(action) = self.actions.as_ref().and_then(|b| b.find(id)) else { return false };
        let Some(record) = action
            .animations
            .iter()
            .find(|a| a.ean_type == EAN_CHARACTER && self.slot(a.ean_index).is_some())
            .cloned()
        else {
            return false;
        };
        let hitboxes = action.hitboxes.len();
        let Some(slot) = self.slot(record.ean_index) else { return false };
        let bound = self.character.bind(&self.ean, &self.ean.animations[slot]);
        let last = bound.frame_count.saturating_sub(1) as f32;
        let end =
            if record.frame_end == u16::MAX { last } else { (record.frame_end as f32).min(last) };
        self.range = ((record.frame_start as f32).min(end), end);
        self.speed = if record.time_scale.is_finite() && record.time_scale > 0.0 {
            record.time_scale
        } else {
            1.0
        };
        self.animation = Some(bound);
        self.once = true;
        self.clock = 0.0;
        self.action = Some(id);
        self.landed = vec![false; hitboxes];
        true
    }

    /// The action in progress and its current frame.
    pub fn current_action(&self) -> Option<(u32, u16)> {
        self.action.map(|id| (id, self.clock as u16))
    }

    /// Moves along the fighter's facing (`forward` metres; negative steps back).
    pub fn walk(&mut self, forward: f32) {
        if self.stun == 0 && self.action.is_none() && forward.is_finite() {
            let dir = Quat::from_rotation_y(self.placement.yaw) * Vec3::NEG_Z;
            self.placement.position += dir * forward.clamp(-0.5, 0.5);
        }
    }

    /// Advances animation, action, stun and pushback by `frames` game frames.
    pub fn advance(&mut self, frames: f32) {
        let frames = frames.clamp(0.0, 10.0);
        self.clock += frames;
        self.stun = self.stun.saturating_sub(frames.round() as u16);
        self.placement.position += self.velocity * frames;
        self.velocity *= PUSHBACK_DECAY.powf(frames);
        let length = (self.range.1 - self.range.0).max(0.0);
        let action_length = self
            .action
            .and_then(|id| self.actions.as_ref()?.find(id))
            .map_or(0.0, |a| a.total_frames as f32);
        if self.once && self.clock * self.speed > length.max(action_length) {
            self.play(self.idle);
        }
    }

    /// Current animation frame.
    pub fn pose_frame(&self) -> f32 {
        let (start, end) = self.range;
        let length = (end - start).max(0.0);
        let elapsed = self.clock * self.speed;
        if self.once {
            start + elapsed.min(length)
        } else if length > 0.0 {
            start + elapsed % length
        } else {
            start
        }
    }

    /// Skin matrices in world space (placement applied).
    pub fn world_skin(&self) -> Vec<Mat4> {
        let world = Mat4::from_rotation_translation(
            Quat::from_rotation_y(self.placement.yaw),
            self.placement.position,
        );
        self.character
            .skin_matrices(self.animation.as_ref(), self.pose_frame())
            .into_iter()
            .map(|m| world * m)
            .collect()
    }

    fn body_centre(&self) -> Vec3 {
        self.placement.position + Vec3::Y * BODY_HEIGHT
    }

    fn take(&mut self, hit: &HitEvent) {
        self.hp = (self.hp - hit.damage as i32).max(0);
        self.stun = self.stun.max(hit.victim_stun.saturating_add(hit.knockback_frames));
        self.velocity += hit.pushback;
        if self.action.is_some() {
            self.play(self.idle);
        }
    }
}

/// Two fighters facing each other.
pub struct Duel {
    pub fighters: [Fighter; 2],
}

impl Duel {
    /// Places the fighters `distance` metres apart on the x axis, facing each other.
    pub fn new(a: Fighter, b: Fighter, distance: f32) -> Self {
        let mut duel = Self { fighters: [a, b] };
        duel.fighters[0].placement.position = Vec3::new(-distance / 2.0, 0.0, 0.0);
        duel.fighters[1].placement.position = Vec3::new(distance / 2.0, 0.0, 0.0);
        duel.face();
        duel
    }

    fn face(&mut self) {
        let (p0, p1) = (self.fighters[0].placement.position, self.fighters[1].placement.position);
        self.fighters[0].placement.yaw = yaw_toward(p0, p1);
        self.fighters[1].placement.yaw = yaw_toward(p1, p0);
    }

    /// Advances both fighters by `frames` and returns the hits landed as
    /// `(attacker, event)`, already applied to the victims.
    pub fn step(&mut self, frames: f32) -> Vec<(usize, HitEvent)> {
        let mut events = Vec::new();
        for attacker in 0..2 {
            let victim = 1 - attacker;
            let before = self.fighters[attacker].clock;
            self.fighters[attacker].advance(frames);
            let fighter = &self.fighters[attacker];
            let (Some(id), Some(bac)) = (fighter.action, fighter.actions.as_ref()) else {
                continue;
            };
            let Some(action) = bac.find(id).cloned() else { continue };
            let after = self.fighters[attacker].clock;
            let centre = self.fighters[victim].body_centre();
            let mut landed = std::mem::take(&mut self.fighters[attacker].landed);
            for frame in (before.floor() as u16 + 1)..=(after.floor() as u16) {
                let fighter = &self.fighters[attacker];
                let hits = resolve_hits(
                    &action,
                    &mut landed,
                    fighter.placement,
                    centre,
                    BODY_RADIUS,
                    frame,
                    fighter.damage.as_ref(),
                );
                for hit in hits {
                    self.fighters[victim].take(&hit);
                    self.fighters[attacker].stun = self.fighters[attacker].stun.max(hit.user_stun);
                    events.push((attacker, hit));
                }
            }
            if self.fighters[attacker].action == Some(id) {
                self.fighters[attacker].landed = landed;
            }
        }
        // Keep the fighters apart and facing each other.
        let gap = self.fighters[1].placement.position - self.fighters[0].placement.position;
        let flat = Vec3::new(gap.x, 0.0, gap.z);
        let min = BODY_RADIUS * 2.0;
        if flat.length() < min {
            let push = flat.normalize_or(Vec3::X) * (min - flat.length()) / 2.0;
            self.fighters[0].placement.position -= push;
            self.fighters[1].placement.position += push;
        }
        self.face();
        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shenron_re::formats::bac::encode_bac;
    use shenron_re::formats::bdm::encode_bdm;
    use shenron_re::formats::{EmdFile, EskBone, emd::encode_emd};

    fn ean_with_one_animation() -> EanFile {
        // An EAN with an empty skeleton and no animation is enough to drive playback;
        // build one animation slot by hand through the public structs.
        let mut ean = EanFile { is_camera: false, skeleton: Vec::new(), animations: Vec::new() };
        for index in 0..5 {
            ean.animations.push(shenron_re::formats::EanAnimation {
                index,
                name: format!("A{index}"),
                frame_count: 40,
                nodes: Vec::new(),
            });
        }
        ean
    }

    fn fighter() -> Fighter {
        let bones = vec![EskBone { name: "b".into(), ..Default::default() }];
        let emd = EmdFile::parse(&encode_emd("m", &[[0.0; 3]; 3], &[0, 1, 2], &["b"])).unwrap();
        let character = SkinnedCharacter::new(
            bones,
            vec![crate::render::skinned::CharacterPart::new(emd, Vec::new())],
        );
        let mut f = Fighter::new(character, ean_with_one_animation());
        // Action 1: animation slot 4, hitbox frames 8..12, 250 damage, BDM entry 7.
        let mut bac = BacFile::parse(&encode_bac(4, 8, 4, 250)).unwrap();
        // Like Goku's jabs: in front (-z) at chest height.
        bac.moves[0].hitboxes[0].position = [0.0, 0.8, -0.8];
        f.actions = Some(bac);
        f.damage = Some(BdmFile::parse(&encode_bdm(&[(7, 3, 0, 20)])).unwrap());
        f
    }

    #[test]
    fn an_attack_in_range_damages_stuns_and_pushes() {
        let mut duel = Duel::new(fighter(), fighter(), 1.0);
        assert_eq!(duel.fighters[0].playable_actions(), [1]);
        assert!(duel.fighters[0].start_action(1));
        assert!(!duel.fighters[0].start_action(1), "one action at a time");
        let mut hits = Vec::new();
        for _ in 0..20 {
            hits.extend(duel.step(1.0));
        }
        assert_eq!(hits.len(), 1, "a hitbox lands once");
        assert_eq!(hits[0].0, 0);
        assert_eq!(duel.fighters[1].hp, START_HP - 250);
        assert!(duel.fighters[1].stun > 0 || duel.fighters[1].placement.position.x > 0.5);
        assert!(!duel.fighters[1].start_action(1) || duel.fighters[1].stun == 0);
    }

    #[test]
    fn out_of_reach_attacks_miss_and_actions_end() {
        let mut duel = Duel::new(fighter(), fighter(), 6.0);
        assert!(duel.fighters[0].start_action(1));
        let hits: Vec<_> = (0..60).flat_map(|_| duel.step(1.0)).collect();
        assert!(hits.is_empty());
        assert_eq!(duel.fighters[1].hp, START_HP);
        assert!(duel.fighters[0].current_action().is_none(), "returns to its loop");
        assert!(duel.fighters[0].start_action(1));
    }

    #[test]
    fn fighters_face_each_other_and_keep_apart() {
        let mut duel = Duel::new(fighter(), fighter(), 2.0);
        duel.fighters[0].walk(0.5);
        duel.fighters[0].walk(0.5);
        duel.fighters[0].walk(0.5);
        duel.step(1.0);
        let gap = duel.fighters[1].placement.position - duel.fighters[0].placement.position;
        assert!(gap.length() >= BODY_RADIUS * 2.0 - 1e-4);
        let forward = Quat::from_rotation_y(duel.fighters[0].placement.yaw) * Vec3::NEG_Z;
        assert!(forward.dot(gap.normalize()) > 0.99);
    }
}

/// `SHENRON_REAL_DUEL=<dir>` with `GOK_000.esk`, `GOK.ean`, `GOK_PLAYER.bac` and
/// `GOK_PLAYER.bdm` from the game runs Goku's first light attack against another Goku.
#[cfg(test)]
mod real {
    use super::*;
    use shenron_re::formats::EskFile;

    fn goku(dir: &str) -> Fighter {
        let read = |name: &str| std::fs::read(format!("{dir}/{name}")).unwrap();
        let esk = EskFile::parse(&read("GOK_000.esk")).unwrap();
        let character = SkinnedCharacter::new(esk.bones, Vec::new());
        let mut f = Fighter::new(character, EanFile::parse(&read("GOK.ean")).unwrap());
        f.actions = Some(BacFile::parse(&read("GOK_PLAYER.bac")).unwrap());
        f.damage = Some(BdmFile::parse(&read("GOK_PLAYER.bdm")).unwrap());
        f
    }

    #[test]
    fn goku_jab_lands_on_goku_when_provided() {
        let Ok(dir) = std::env::var("SHENRON_REAL_DUEL") else { return };
        let mut duel = Duel::new(goku(&dir), goku(&dir), 1.2);
        assert!(duel.fighters[0].playable_actions().contains(&300));
        assert!(duel.fighters[0].start_action(300));
        let hits: Vec<_> = (0..90).flat_map(|_| duel.step(1.0)).collect();
        assert_eq!(hits.len(), 1, "{hits:?}");
        assert_eq!(hits[0].1.frame, 12, "Goku's jab hitbox opens on frame 12");
        assert_eq!(duel.fighters[1].hp, START_HP - 5);
        assert!(duel.fighters[0].current_action().is_none());
        let out_of_reach = {
            let mut far = Duel::new(goku(&dir), goku(&dir), 4.0);
            far.fighters[0].start_action(300);
            (0..90).flat_map(|_| far.step(1.0)).count()
        };
        assert_eq!(out_of_reach, 0);
    }
}
