// SPDX-License-Identifier: Apache-2.0

//! Modern GPU-driven rendering pipeline: indirect multi-draw, virtual geometry,
//! clustered forward lighting, cascades, TAA, and ACES tonemapping.

pub mod gpu_context;
pub mod gpu_driven;
pub mod lighting;
pub mod postprocess;
pub mod shaders;
pub mod virtual_geometry;

pub use gpu_context::{GpuContext, GpuError};
pub use gpu_driven::{DrawIndexedIndirectArgs, DrawIndirectArgs, GpuInstanceData, IndirectDrawBuffer, InstanceStorageBuffer};
pub use lighting::{CascadedShadowMaps, ClusterGrid, GpuLight, VoxelVolumeUniforms};
pub use postprocess::{HaltonSequence, PostProcessUniforms};
pub use virtual_geometry::{HiZCulling, Meshlet, MeshletBounds, MeshletBuilder, pack_visibility_id, unpack_visibility_id};
