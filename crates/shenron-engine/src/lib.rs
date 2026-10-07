// SPDX-License-Identifier: Apache-2.0

//! Shenron Engine: Production-grade full-Rust AAA game engine.
//!
//! Subsystems:
//! - [`core`]: Archetypal ECS, SIMD math, lock-free concurrency, frame arena allocators.
//! - [`render`]: GPU-driven pipeline, virtual geometry (meshlets/Hi-Z), clustered lighting, TAA.
//! - [`pipeline_2d`]: Texture atlas packer, Aseprite animation, dynamic quad batching, tilemaps.
//! - [`scene`]: Decoupled flat transform hierarchy, spatial acceleration (BVH, spatial hash).
//! - [`physics`]: Deterministic 3D rigid body dynamics, CCD, GJK/EPA narrowphase, joints, ragdolls.
//! - [`animation`]: Dual-quaternion skeletal skinning, blend trees, two-bone/FABRIK IK, FSM.
//! - [`audio`]: Spatial 3D attenuation, HRTF simulation, occlusion filtering, dynamic bus routing.
//! - [`ui`]: Immediate-mode editor tooling, Flexbox vector HUD.
//! - [`net`]: State synchronization, delta compression, client prediction, rollback netcode.
//! - [`script`]: Sandboxed modding virtual machine with ECS bindings and fuel metering.

pub mod canvas;
pub mod core;
pub mod game;
pub mod render;

/// Returns the compile-time crate version of `shenron-engine`.
pub fn engine_version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}

