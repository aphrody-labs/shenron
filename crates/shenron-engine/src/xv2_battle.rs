// SPDX-License-Identifier: Apache-2.0

//! Hit resolution from real DBXV2 data: the hitboxes a `.bac` action has active at a frame,
//! placed in the world from the attacker's position and facing, tested against a victim,
//! and the `.bdm` reaction they apply.
//!
//! Hitboxes are spheres of radius `size` centred on `position` in the attacker's frame:
//! y up and forward along -z (Goku's attacks sit at z ≈ -0.5..-1, at chest height). The
//! box bounds BAC also stores are not used yet. A hitbox hits a victim once per action. The
//! reaction comes from variant 0 of the hitbox's BDM entry; damage comes from the hitbox.

use glam::{Quat, Vec3};
use shenron_re::formats::{BacMove, BdmFile, DamageType};

/// A fighter's placement: world position and facing (yaw in radians, 0 faces -z).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Placement {
    pub position: Vec3,
    pub yaw: f32,
}

impl Placement {
    pub fn to_world(self, local: Vec3) -> Vec3 {
        self.position + Quat::from_rotation_y(self.yaw) * local
    }
}

/// What a landed hitbox does to the victim.
#[derive(Debug, Clone, PartialEq)]
pub struct HitEvent {
    pub hitbox: usize,
    pub frame: u16,
    pub damage: u32,
    pub bdm_entry: u16,
    pub reaction: DamageType,
    /// Frames the attacker and the victim stay frozen on impact.
    pub user_stun: u16,
    pub victim_stun: u16,
    pub knockback_frames: u16,
    /// World-space push applied to the victim, along the attacker's facing.
    pub pushback: Vec3,
    pub knockback: Vec3,
}

/// Yaw that makes a fighter at `from` face `to` (forward is -z).
pub fn yaw_toward(from: Vec3, to: Vec3) -> f32 {
    let d = to - from;
    if d.x.abs() + d.z.abs() < f32::EPSILON { 0.0 } else { (-d.x).atan2(-d.z) }
}

/// World-space spheres `(index, centre, radius)` of `action` active at `frame`.
pub fn active_spheres(
    action: &BacMove,
    attacker: Placement,
    frame: u16,
) -> Vec<(usize, Vec3, f32)> {
    action
        .hitboxes
        .iter()
        .enumerate()
        .filter(|(_, h)| h.start_frame <= frame && frame < h.end_frame)
        .map(|(i, h)| (i, attacker.to_world(Vec3::from_array(h.position)), h.size.max(0.0)))
        .collect()
}

/// Hits of `action` landing at `frame` on a victim sphere (`centre`, `radius`). `landed`
/// holds one flag per hitbox and keeps each from landing twice.
pub fn resolve_hits(
    action: &BacMove,
    landed: &mut [bool],
    attacker: Placement,
    victim_centre: Vec3,
    victim_radius: f32,
    frame: u16,
    bdm: Option<&BdmFile>,
) -> Vec<HitEvent> {
    let facing = Quat::from_rotation_y(attacker.yaw);
    let mut events = Vec::new();
    for (index, centre, radius) in active_spheres(action, attacker, frame) {
        let Some(flag) = landed.get_mut(index) else { continue };
        if *flag || centre.distance(victim_centre) > radius + victim_radius {
            continue;
        }
        *flag = true;
        let hitbox = &action.hitboxes[index];
        let variant =
            bdm.and_then(|b| b.find(hitbox.bdm_entry_id as u32)).and_then(|e| e.variants.first());
        events.push(HitEvent {
            hitbox: index,
            frame,
            damage: hitbox.damage,
            bdm_entry: hitbox.bdm_entry_id,
            reaction: variant.map_or(DamageType::Standard, |v| v.damage_type.into()),
            user_stun: variant.map_or(0, |v| v.user_stun),
            victim_stun: variant.map_or(0, |v| v.victim_stun),
            knockback_frames: variant.map_or(0, |v| v.knockback_duration),
            pushback: facing * Vec3::NEG_Z * variant.map_or(0.0, |v| v.pushback_strength),
            knockback: facing
                * Vec3::from_array(variant.map_or([0.0; 3], |v| v.knockback_strength)),
        });
    }
    events
}

/// One action in progress against one victim; remembers which hitboxes already landed.
#[derive(Debug, Clone)]
pub struct ActionState<'a> {
    pub action: &'a BacMove,
    landed: Vec<bool>,
}

impl<'a> ActionState<'a> {
    pub fn new(action: &'a BacMove) -> Self {
        Self { action, landed: vec![false; action.hitboxes.len()] }
    }

    /// World-space spheres `(index, centre, radius)` active at `frame`.
    pub fn active_spheres(&self, attacker: Placement, frame: u16) -> Vec<(usize, Vec3, f32)> {
        active_spheres(self.action, attacker, frame)
    }

    /// Hits landing at `frame` on a victim sphere (`centre`, `radius`).
    pub fn step(
        &mut self,
        attacker: Placement,
        victim_centre: Vec3,
        victim_radius: f32,
        frame: u16,
        bdm: Option<&BdmFile>,
    ) -> Vec<HitEvent> {
        resolve_hits(
            self.action,
            &mut self.landed,
            attacker,
            victim_centre,
            victim_radius,
            frame,
            bdm,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use shenron_re::formats::bac::{BacFile, encode_bac};
    use shenron_re::formats::bdm::encode_bdm;

    fn action() -> BacFile {
        // One hitbox on frames 8..12, 250 damage, BDM entry 7, radius 0.3 at the origin.
        BacFile::parse(&encode_bac(4, 8, 4, 250)).unwrap()
    }

    #[test]
    fn lands_once_inside_the_active_window() {
        let bac = action();
        let bdm = BdmFile::parse(&encode_bdm(&[(7, 8, 0, 42)])).unwrap();
        let mut state = ActionState::new(bac.find(1).unwrap());
        let attacker = Placement { position: Vec3::ZERO, yaw: 0.0 };
        let victim = Vec3::new(0.0, 0.0, -0.5);
        assert!(state.step(attacker, victim, 0.25, 7, Some(&bdm)).is_empty(), "before startup");
        let hits = state.step(attacker, victim, 0.25, 8, Some(&bdm));
        assert_eq!(hits.len(), 1);
        assert_eq!((hits[0].damage, hits[0].victim_stun), (250, 42));
        assert_eq!(hits[0].reaction, DamageType::Knockback);
        assert!((hits[0].pushback - Vec3::new(0.0, 0.0, -0.2)).length() < 1e-6);
        assert!(state.step(attacker, victim, 0.25, 9, Some(&bdm)).is_empty(), "lands once");
    }

    #[test]
    fn misses_out_of_reach_and_follows_facing() {
        let bac = action();
        let mut state = ActionState::new(bac.find(1).unwrap());
        let turned =
            Placement { position: Vec3::new(5.0, 0.0, 0.0), yaw: std::f32::consts::FRAC_PI_2 };
        assert!(state.step(turned, Vec3::ZERO, 0.25, 8, None).is_empty());
        let hits = state.step(turned, Vec3::new(5.0, 0.0, -0.4), 0.25, 9, None);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].reaction, DamageType::Standard, "no BDM: plain hit");
    }

    #[test]
    fn faces_the_target_along_negative_z() {
        let yaw = yaw_toward(Vec3::ZERO, Vec3::new(1.0, 0.0, 0.0));
        let forward = Quat::from_rotation_y(yaw) * Vec3::NEG_Z;
        assert!((forward - Vec3::X).length() < 1e-5);
        assert_eq!(yaw_toward(Vec3::ZERO, Vec3::new(0.0, 0.0, -2.0)), 0.0);
    }

    /// `SHENRON_REAL_BAC` and `SHENRON_REAL_BDM` (a character's PLAYER files) resolve every
    /// attack against a victim standing on each of its active hitboxes.
    #[test]
    fn resolves_real_attacks_when_provided() {
        let (Ok(bac), Ok(bdm)) =
            (std::env::var("SHENRON_REAL_BAC"), std::env::var("SHENRON_REAL_BDM"))
        else {
            return;
        };
        let bac = BacFile::parse(&std::fs::read(bac).unwrap()).unwrap();
        let bdm = BdmFile::parse(&std::fs::read(bdm).unwrap()).unwrap();
        let attacker = Placement { position: Vec3::ZERO, yaw: 0.0 };
        let mut landed = 0;
        for action in bac.moves.iter().filter(|m| m.hitboxes.iter().any(|h| h.damage > 0)) {
            let mut state = ActionState::new(action);
            for frame in 0..action.total_frames.min(600) {
                for (_, centre, _) in state.clone().active_spheres(attacker, frame) {
                    for hit in state.step(attacker, centre, 0.1, frame, Some(&bdm)) {
                        assert!(hit.pushback.is_finite() && hit.knockback.is_finite());
                        landed += 1;
                    }
                }
            }
        }
        assert!(landed > 10, "only {landed} hits landed");
    }
}
