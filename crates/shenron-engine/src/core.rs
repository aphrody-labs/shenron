// SPDX-License-Identifier: Apache-2.0

//! Core engine foundation: SIMD math, custom DOD allocators, archetypal ECS,
//! work-stealing concurrency, and memory-mapped VFS.

pub mod alloc;
pub mod concurrency;
pub mod ecs;
pub mod math;
pub mod vfs;

pub use alloc::{FrameArena, PoolAllocator, PoolHandle, StagingRingBuffer};
pub use concurrency::{JobBarrier, JobGraph, JobHandle};
pub use ecs::{Archetype, Component, Entity, SystemScheduler, World};
pub use math::{Aabb, Frustum, Plane, Ray, Sphere};
pub use vfs::{AssetHandle, VirtualFileSystem};
