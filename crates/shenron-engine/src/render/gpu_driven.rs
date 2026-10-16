// SPDX-License-Identifier: Apache-2.0

//! GPU-driven multi-draw indirect rendering pipeline.
//!
//! Replaces CPU draw-call submission loops with GPU compute culling passes
//! writing directly into indirect draw command buffers.

use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3A};
use wgpu::{Buffer, BufferAddress, BufferDescriptor, BufferUsages, Device, Queue};

/// 20-byte standard hardware layout matching Vulkan/DirectX 12/WebGPU
/// for `draw_indexed_indirect`.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq)]
#[repr(C)]
pub struct DrawIndexedIndirectArgs {
    /// Number of indices to draw.
    pub index_count: u32,
    /// Number of instances to draw (1 if visible, 0 if culled).
    pub instance_count: u32,
    /// Base offset into the global index buffer.
    pub first_index: u32,
    /// Offset added to vertex index values.
    pub base_vertex: i32,
    /// Base instance ID passed to shaders.
    pub first_instance: u32,
}

unsafe impl Pod for DrawIndexedIndirectArgs {}
unsafe impl Zeroable for DrawIndexedIndirectArgs {}

/// 16-byte standard hardware layout for non-indexed `draw_indirect`.
#[derive(Copy, Clone, Debug, Default, PartialEq, Eq)]
#[repr(C)]
pub struct DrawIndirectArgs {
    /// Number of vertices to draw.
    pub vertex_count: u32,
    /// Number of instances to draw.
    pub instance_count: u32,
    /// Base offset into the vertex buffer.
    pub first_vertex: u32,
    /// Base instance ID.
    pub first_instance: u32,
}

unsafe impl Pod for DrawIndirectArgs {}
unsafe impl Zeroable for DrawIndirectArgs {}

/// Per-instance GPU storage data (aligned to 16 bytes for WGSL uniform/storage rules).
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(C, align(16))]
pub struct GpuInstanceData {
    /// World transformation matrix (64 bytes).
    pub model_matrix: Mat4,
    /// World-space bounding sphere center (12 bytes) + radius (4 bytes).
    pub bounding_sphere: [f32; 4],
    /// Material index within the global material table.
    pub material_index: u32,
    /// Unique object ID for picking and visibility buffer resolve.
    pub object_id: u32,
    /// Flags (e.g. shadow caster, two-sided, static/dynamic).
    pub flags: u32,
    /// Padding for 16-byte alignment.
    pub _pad: u32,
}

unsafe impl Pod for GpuInstanceData {}
unsafe impl Zeroable for GpuInstanceData {}

impl GpuInstanceData {
    /// Constructs a new instance data packet.
    #[must_use]
    pub fn new(
        model_matrix: Mat4,
        center: Vec3A,
        radius: f32,
        material_index: u32,
        object_id: u32,
    ) -> Self {
        Self {
            model_matrix,
            bounding_sphere: [center.x, center.y, center.z, radius],
            material_index,
            object_id,
            flags: 0,
            _pad: 0,
        }
    }
}

/// GPU-resident indirect draw command buffer with host staging capabilities.
pub struct IndirectDrawBuffer {
    buffer: Buffer,
    capacity: usize,
    count: usize,
}

impl IndirectDrawBuffer {
    /// Allocates an indirect draw buffer capable of holding `capacity` draw commands.
    #[must_use]
    pub fn new(device: &Device, capacity: usize) -> Self {
        let size = (capacity * std::mem::size_of::<DrawIndexedIndirectArgs>()) as BufferAddress;
        let buffer = device.create_buffer(&BufferDescriptor {
            label: Some("ShenronEngine_IndirectDrawBuffer"),
            size: size.max(256),
            usage: BufferUsages::INDIRECT | BufferUsages::STORAGE | BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        Self { buffer, capacity, count: 0 }
    }

    /// Uploads CPU-culled or initial indirect draw commands into the GPU buffer.
    pub fn upload(&mut self, queue: &Queue, commands: &[DrawIndexedIndirectArgs]) {
        assert!(commands.len() <= self.capacity, "Exceeded indirect buffer capacity");
        let bytes = bytemuck::cast_slice(commands);
        queue.write_buffer(&self.buffer, 0, bytes);
        self.count = commands.len();
    }

    /// Returns the underlying wgpu buffer.
    #[inline]
    #[must_use]
    pub fn buffer(&self) -> &Buffer {
        &self.buffer
    }

    /// Number of commands currently contained.
    #[inline]
    #[must_use]
    pub fn count(&self) -> usize {
        self.count
    }
}

/// Persistent GPU instance storage buffer.
pub struct InstanceStorageBuffer {
    buffer: Buffer,
    capacity: usize,
}

impl InstanceStorageBuffer {
    /// Creates a new GPU storage buffer for instances.
    #[must_use]
    pub fn new(device: &Device, capacity: usize) -> Self {
        let size = (capacity * std::mem::size_of::<GpuInstanceData>()) as BufferAddress;
        let buffer = device.create_buffer(&BufferDescriptor {
            label: Some("ShenronEngine_InstanceStorageBuffer"),
            size: size.max(256),
            usage: BufferUsages::STORAGE | BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        Self { buffer, capacity }
    }

    /// Writes instance data to the GPU buffer.
    pub fn upload(&self, queue: &Queue, instances: &[GpuInstanceData]) {
        assert!(instances.len() <= self.capacity, "Exceeded instance storage capacity");
        let bytes = bytemuck::cast_slice(instances);
        queue.write_buffer(&self.buffer, 0, bytes);
    }

    /// Returns the wgpu buffer.
    #[inline]
    #[must_use]
    pub fn buffer(&self) -> &Buffer {
        &self.buffer
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_indirect_args_memory_layout() {
        assert_eq!(std::mem::size_of::<DrawIndexedIndirectArgs>(), 20);
        assert_eq!(std::mem::size_of::<DrawIndirectArgs>(), 16);
        assert_eq!(std::mem::size_of::<GpuInstanceData>(), 96);
    }
}
