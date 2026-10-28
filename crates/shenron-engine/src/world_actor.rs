// SPDX-License-Identifier: Apache-2.0
//! A real CPK actor inside an existing world renderer. No surface or device is created here.
//!
//! Locomotion remains a product controller on X/Z, not a reconstruction of Havok collision.
//! Animation bindings address inspected EAN entries; attacks are accepted by the existing
//! BAC-driven Fighter. GPU resources belong to the caller's device, queue and toon pipeline.

use crate::render::ModelVertex;
use crate::render::skinned::{SkinnedCharacter, SkinnedGpuCharacter, Xv2ToonPipeline};
use crate::xv2_fighter::Fighter;
use glam::{Quat, Vec3};
use shenron_re::formats::EanFile;

const FRAMES_PER_SECOND: f32 = 60.0;
const MAX_STEP_SECONDS: f32 = 0.05;

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum WorldActorError {
    #[error("Actor speed must be finite and positive")]
    InvalidSpeed,
    #[error("Actor has no drawable original model part")]
    MissingGeometry,
    #[error("EAN animation name is missing: {0}")]
    MissingAnimation(String),
    #[error("EAN animation index is missing or empty: {0}")]
    InvalidAnimation(usize),
    #[error("Actor resource limit: {0}")]
    ResourceLimit(&'static str),
}

/// Validate all allocations before creating an actor GPU texture or buffer.
fn preflight_actor(
    character: &SkinnedCharacter,
    max_buffer_size: u64,
    max_texture_dimension_2d: u32,
) -> Result<(), WorldActorError> {
    let mut decoded = 0usize;
    for texture in &character.textures {
        if texture.width == 0
            || texture.height == 0
            || texture.width > max_texture_dimension_2d
            || texture.height > max_texture_dimension_2d
        {
            return Err(WorldActorError::ResourceLimit("texture dimensions"));
        }
        let size = (texture.width as usize)
            .checked_mul(texture.height as usize)
            .and_then(|pixels| pixels.checked_mul(4))
            .ok_or(WorldActorError::ResourceLimit("texture allocation overflow"))?;
        if size != texture.rgba.len() {
            return Err(WorldActorError::ResourceLimit("RGBA byte length"));
        }
        decoded = decoded
            .checked_add(size)
            .ok_or(WorldActorError::ResourceLimit("decoded textures overflow"))?;
        if decoded > 256 * 1024 * 1024 {
            return Err(WorldActorError::ResourceLimit("decoded textures exceed 256 MiB"));
        }
    }
    for part in &character.parts {
        let vertices = part.positions.len();
        if [part.normals.len(), part.uv.len(), part.joints.len(), part.weights.len()]
            .iter()
            .any(|length| *length != vertices)
        {
            return Err(WorldActorError::ResourceLimit("vertex attribute length"));
        }
        if part.indices.iter().any(|index| *index as usize >= vertices) {
            return Err(WorldActorError::ResourceLimit("triangle index out of bounds"));
        }
        let vertex_bytes = (vertices as u64)
            .checked_mul(std::mem::size_of::<ModelVertex>() as u64)
            .ok_or(WorldActorError::ResourceLimit("vertex allocation overflow"))?;
        let index_bytes = (part.indices.len() as u64)
            .checked_mul(4)
            .ok_or(WorldActorError::ResourceLimit("index allocation overflow"))?;
        if vertex_bytes > max_buffer_size || index_bytes > max_buffer_size {
            return Err(WorldActorError::ResourceLimit("GPU buffer size"));
        }
    }
    Ok(())
}

/// Indices into EAN.animations, not guessed BAC action ids or authored EAN slot numbers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MotionBindings {
    pub idle: usize,
    /// Without an inspected walk clip, the actor can act but cannot translate.
    pub walk: Option<usize>,
}

impl MotionBindings {
    /// Resolve exact original names. No substring heuristics or slot-zero fallback.
    pub fn from_names(
        ean: &EanFile,
        idle: &str,
        walk: Option<&str>,
    ) -> Result<Self, WorldActorError> {
        let resolve = |name: &str| {
            ean.animations
                .iter()
                .position(|animation| animation.name == name)
                .ok_or_else(|| WorldActorError::MissingAnimation(name.to_owned()))
        };
        let bindings = Self { idle: resolve(idle)?, walk: walk.map(resolve).transpose()? };
        bindings.validate(ean)?;
        Ok(bindings)
    }

    fn validate(self, ean: &EanFile) -> Result<(), WorldActorError> {
        for slot in [Some(self.idle), self.walk].into_iter().flatten() {
            if ean.animations.get(slot).is_none_or(|animation| animation.frame_count == 0) {
                return Err(WorldActorError::InvalidAnimation(slot));
            }
        }
        Ok(())
    }
}

/// Local movement: positive forward faces -Z at yaw zero; positive strafe faces +X.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct ActorInput {
    pub forward: f32,
    pub strafe: f32,
    pub yaw: f32,
}

/// CPU state can also be stepped by an authoritative owner without creating GPU resources.
pub struct ActorController {
    fighter: Fighter,
    bindings: MotionBindings,
    speed_mps: f32,
    active_motion: Option<usize>,
}

impl ActorController {
    pub fn new(
        mut fighter: Fighter,
        bindings: MotionBindings,
        speed_mps: f32,
    ) -> Result<Self, WorldActorError> {
        if !speed_mps.is_finite() || speed_mps <= 0.0 {
            return Err(WorldActorError::InvalidSpeed);
        }
        if !fighter.character.parts.iter().any(|part| !part.indices.is_empty()) {
            return Err(WorldActorError::MissingGeometry);
        }
        bindings.validate(&fighter.ean)?;
        if !fighter.play(bindings.idle) {
            return Err(WorldActorError::InvalidAnimation(bindings.idle));
        }
        Ok(Self { fighter, bindings, speed_mps, active_motion: Some(bindings.idle) })
    }

    pub fn fighter(&self) -> &Fighter {
        &self.fighter
    }

    pub fn can_walk(&self) -> bool {
        self.bindings.walk.is_some()
    }

    pub fn position(&self) -> Vec3 {
        self.fighter.placement.position
    }

    /// Apply a supplied spawn/placement exactly; this does not claim the position is grounded.
    pub fn place(&mut self, position: Vec3, yaw: f32) -> bool {
        if !position.is_finite() || !yaw.is_finite() {
            return false;
        }
        self.fighter.placement.position = position;
        self.fighter.placement.yaw = yaw;
        true
    }

    /// Reuses the loaded BAC's acceptance, stun, animation and busy-action checks.
    pub fn attack(&mut self, action_id: u32) -> bool {
        let accepted = self.fighter.start_action(action_id);
        if accepted {
            self.active_motion = None;
        }
        accepted
    }

    /// Advance the original animation clock and an explicitly configured movement speed.
    /// Invalid inputs do not advance time; long frame gaps are bounded, not fast-forwarded.
    pub fn step(&mut self, input: ActorInput, seconds: f32) {
        if ![input.forward, input.strafe, input.yaw, seconds].iter().all(|v| v.is_finite())
            || seconds <= 0.0
        {
            return;
        }
        let seconds = seconds.min(MAX_STEP_SECONDS);
        self.fighter.advance(seconds * FRAMES_PER_SECOND);
        if self.fighter.stun > 0 || self.fighter.current_action().is_some() {
            self.active_motion = None;
            return;
        }
        let mut local =
            Vec3::new(input.strafe.clamp(-1.0, 1.0), 0.0, -input.forward.clamp(-1.0, 1.0));
        if local.length_squared() > 1.0 {
            local = local.normalize();
        }
        let moving = self.can_walk() && local.length_squared() > f32::EPSILON;
        let desired = if moving {
            self.bindings.walk.unwrap_or(self.bindings.idle)
        } else {
            self.bindings.idle
        };
        if self.active_motion != Some(desired) {
            // The indices were validated against the immutable EAN at construction.
            if !self.fighter.play(desired) {
                return;
            }
            self.active_motion = Some(desired);
        }
        if moving {
            let direction = Quat::from_rotation_y(input.yaw) * local;
            self.fighter.placement.position += direction * self.speed_mps * seconds;
            self.fighter.placement.yaw = (-direction.x).atan2(-direction.z);
        }
    }
}

/// GPU actor hosted by the existing world's device, queue, depth target and frame loop.
pub struct WorldActor {
    controller: ActorController,
    gpu: SkinnedGpuCharacter,
}

impl WorldActor {
    pub fn new(
        fighter: Fighter,
        bindings: MotionBindings,
        speed_mps: f32,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        pipeline: &Xv2ToonPipeline,
    ) -> Result<Self, WorldActorError> {
        let controller = ActorController::new(fighter, bindings, speed_mps)?;
        let limits = device.limits();
        preflight_actor(
            &controller.fighter.character,
            limits.max_buffer_size,
            limits.max_texture_dimension_2d,
        )?;
        let gpu =
            SkinnedGpuCharacter::upload(device, queue, &controller.fighter.character, pipeline);
        Ok(Self { controller, gpu })
    }

    pub fn fighter(&self) -> &Fighter {
        self.controller.fighter()
    }

    pub fn can_walk(&self) -> bool {
        self.controller.can_walk()
    }

    pub fn position(&self) -> Vec3 {
        self.controller.position()
    }

    pub fn place(&mut self, position: Vec3, yaw: f32) -> bool {
        self.controller.place(position, yaw)
    }

    pub fn step(&mut self, input: ActorInput, seconds: f32) {
        self.controller.step(input, seconds);
    }

    pub fn attack(&mut self, action_id: u32) -> bool {
        self.controller.attack(action_id)
    }

    pub fn update_gpu(&mut self, queue: &wgpu::Queue) {
        let fighter = self.controller.fighter();
        self.gpu.update(queue, &fighter.character, &fighter.world_skin());
    }

    /// Caller binds the shared toon pipeline and camera group 0 in the existing render pass.
    pub fn draw(&self, pass: &mut wgpu::RenderPass<'_>) {
        self.gpu.draw(pass);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render::skinned::{CharacterPart, SkinnedCharacter};
    use shenron_re::formats::{
        BacFile, EanAnimation, EmdFile, EskBone, bac::encode_bac, emd::encode_emd,
    };

    fn fighter() -> Fighter {
        let bones = vec![EskBone { name: "root".into(), ..Default::default() }];
        let emd =
            EmdFile::parse(&encode_emd("test", &[[0.0; 3]; 3], &[0, 1, 2], &["root"])).unwrap();
        let character = SkinnedCharacter::new(bones, vec![CharacterPart::new(emd, Vec::new())]);
        let ean = EanFile {
            is_camera: false,
            skeleton: Vec::new(),
            animations: (0..5)
                .map(|index| EanAnimation {
                    index,
                    name: match index {
                        0 => "Idle",
                        1 => "Walk",
                        4 => "Attack",
                        _ => "Other",
                    }
                    .into(),
                    frame_count: 40,
                    nodes: Vec::new(),
                })
                .collect(),
        };
        let mut fighter = Fighter::new(character, ean);
        fighter.actions = Some(BacFile::parse(&encode_bac(4, 8, 4, 250)).unwrap());
        fighter
    }

    fn controller() -> ActorController {
        let fighter = fighter();
        let bindings = MotionBindings::from_names(&fighter.ean, "Idle", Some("Walk")).unwrap();
        ActorController::new(fighter, bindings, 3.0).unwrap()
    }

    #[test]
    fn motion_bindings_require_real_nonempty_ean_entries() {
        let actor_fighter = fighter();
        assert!(MotionBindings::from_names(&actor_fighter.ean, "idle", Some("Walk")).is_err());
        assert!(
            ActorController::new(actor_fighter, MotionBindings { idle: 99, walk: Some(1) }, 3.0)
                .is_err()
        );
        assert!(
            ActorController::new(fighter(), MotionBindings { idle: 0, walk: Some(1) }, f32::NAN)
                .is_err()
        );
    }

    #[test]
    fn movement_is_camera_relative_normalized_and_preserves_height() {
        let mut actor = controller();
        assert!(actor.place(Vec3::new(10.0, 4.0, 20.0), 0.0));
        actor.step(ActorInput { forward: 1.0, strafe: 1.0, yaw: 0.0 }, 0.05);
        let travelled = actor.position() - Vec3::new(10.0, 4.0, 20.0);
        assert!((travelled.length() - 0.15).abs() < 1e-5);
        assert_eq!(actor.position().y, 4.0);
        assert!(travelled.x > 0.0 && travelled.z < 0.0);
        actor.step(
            ActorInput { forward: 1.0, yaw: std::f32::consts::FRAC_PI_2, ..ActorInput::default() },
            0.05,
        );
        assert!(actor.position().x < 10.11);
    }

    #[test]
    fn frame_gaps_and_invalid_values_cannot_teleport_the_actor() {
        let mut actor = controller();
        actor.step(ActorInput { forward: 1.0, ..ActorInput::default() }, 100.0);
        assert!((actor.position().length() - 0.15).abs() < 1e-5);
        let before = actor.position();
        actor.step(ActorInput { forward: f32::NAN, ..ActorInput::default() }, 0.05);
        actor.step(ActorInput { forward: 1.0, ..ActorInput::default() }, f32::INFINITY);
        assert!(!actor.place(Vec3::new(f32::NAN, 0.0, 0.0), 0.0));
        assert_eq!(actor.position(), before);
    }

    #[test]
    fn action_acceptance_and_busy_movement_reuse_fighter_rules() {
        let mut actor = controller();
        assert!(!actor.attack(9999));
        assert!(actor.attack(1));
        assert!(!actor.attack(1));
        let before = actor.position();
        actor.step(ActorInput { forward: 1.0, ..ActorInput::default() }, 0.05);
        assert_eq!(actor.position(), before);
        for _ in 0..20 {
            actor.step(ActorInput::default(), 0.05);
        }
        assert!(actor.fighter().current_action().is_none());
        actor.step(ActorInput { forward: 1.0, ..ActorInput::default() }, 0.05);
        assert!(actor.position().z < before.z);
    }

    #[test]
    fn an_actor_without_a_walk_binding_does_not_slide_in_an_idle_pose() {
        let mut actor =
            ActorController::new(fighter(), MotionBindings { idle: 0, walk: None }, 3.0).unwrap();
        assert!(!actor.can_walk());
        actor.step(ActorInput { forward: 1.0, ..ActorInput::default() }, 0.05);
        assert_eq!(actor.position(), Vec3::ZERO);
        assert!(actor.attack(1));
    }

    #[test]
    fn gpu_preflight_rejects_invalid_assets_before_allocation() {
        use shenron_re::formats::{EmbRgbaTexture, TexturePixelFormat};
        let mut character = fighter().character;
        assert!(preflight_actor(&character, 1024, 2048).is_ok());
        assert!(preflight_actor(&character, 1, 2048).is_err());
        character.parts[0].indices[0] = 99;
        assert!(preflight_actor(&character, 1024, 2048).is_err());
        character.parts[0].indices[0] = 0;
        character.parts[0].uv.pop();
        assert!(preflight_actor(&character, 1024, 2048).is_err());
        character.parts[0].uv.push([0.0, 0.0]);
        character.textures.push(EmbRgbaTexture {
            width: 4096,
            height: 1,
            rgba: Vec::new(),
            format: TexturePixelFormat::Rgba8,
        });
        assert!(preflight_actor(&character, 1024, 2048).is_err());
        character.textures[0].width = 1;
        assert!(preflight_actor(&character, 1024, 2048).is_err());
        character.textures[0].rgba = vec![255; 4];
        assert!(preflight_actor(&character, 1024, 2048).is_ok());
    }
}
