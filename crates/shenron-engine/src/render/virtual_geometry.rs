// SPDX-License-Identifier: Apache-2.0

//! Virtualized Geometry pipeline (Nanite architectural equivalent).
//!
//! Provides meshlet generation, continuous LOD clustering, Hierarchical Z-Buffer (Hi-Z)
//! occlusion culling, and Visibility Buffer primitives.

use bytemuck::{Pod, Zeroable};
use glam::Vec3A;

/// Maximum vertices per meshlet (aligned with AMD/Nvidia GPU wave sizes).
pub const MESHLET_MAX_VERTICES: usize = 64;
/// Maximum triangles per meshlet (126 triangles = 42 * 3 indices, fits packed cache).
pub const MESHLET_MAX_TRIANGLES: usize = 126;

/// Bounding sphere and normal cone for early meshlet frustum and backface culling.
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(C, align(16))]
pub struct MeshletBounds {
    /// Bounding sphere center (12 bytes) + radius (4 bytes).
    pub sphere: [f32; 4],
    /// Normal cone axis (12 bytes) + cone cutoff cosine (4 bytes).
    pub cone: [f32; 4],
}

unsafe impl Pod for MeshletBounds {}
unsafe impl Zeroable for MeshletBounds {}

/// Compact GPU-resident meshlet descriptor (32 bytes).
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
#[repr(C)]
pub struct Meshlet {
    /// Byte/index offset into the global meshlet vertex buffer.
    pub vertex_offset: u32,
    /// Byte/index offset into the global meshlet triangle index buffer.
    pub triangle_offset: u32,
    /// Number of local vertices referenced (<= 64).
    pub vertex_count: u32,
    /// Number of triangles in this meshlet (<= 126).
    pub triangle_count: u32,
    /// Meshlet LOD level.
    pub lod_level: u32,
    /// Geometric error metric for screen-space LOD transitions.
    pub lod_error_bits: u32,
    /// Padding for 32-byte alignment.
    pub _pad: [u32; 2],
}

unsafe impl Pod for Meshlet {}
unsafe impl Zeroable for Meshlet {}

impl Meshlet {
    /// Gets the LOD geometric error as a float.
    #[inline]
    #[must_use]
    pub fn lod_error(&self) -> f32 {
        f32::from_bits(self.lod_error_bits)
    }

    /// Sets the LOD geometric error float.
    #[inline]
    pub fn set_lod_error(&mut self, error: f32) {
        self.lod_error_bits = error.to_bits();
    }
}

/// A cluster of meshlets sharing continuous boundary seams for seamless LOD transitions.
#[derive(Clone, Debug)]
pub struct MeshletCluster {
    /// Indices of child meshlets belonging to this cluster.
    pub meshlets: Vec<Meshlet>,
    /// Bounding sphere enclosing all meshlets in the cluster.
    pub bounds: MeshletBounds,
    /// Maximum geometric error of this cluster compared to the base mesh.
    pub cluster_error: f32,
    /// Parent cluster error (must be strictly greater than `cluster_error`).
    pub parent_error: f32,
}

/// Generates meshlets from raw triangle indices and vertex positions.
pub struct MeshletBuilder;

impl MeshletBuilder {
    /// Partitions an indexed triangle list into GPU-optimized meshlets.
    #[must_use]
    pub fn build(
        positions: &[Vec3A],
        indices: &[u32],
    ) -> (Vec<Meshlet>, Vec<u32>, Vec<u8>, Vec<MeshletBounds>) {
        let mut meshlets = Vec::new();
        let mut meshlet_vertices = Vec::new();
        let mut meshlet_triangles = Vec::new(); // 3 local u8 indices per triangle
        let mut bounds = Vec::new();

        let num_triangles = indices.len() / 3;
        let mut tri_idx = 0;

        while tri_idx < num_triangles {
            let mut local_vertices = Vec::new();
            let mut local_indices = Vec::new();

            let vert_offset = meshlet_vertices.len() as u32;
            let tri_offset = meshlet_triangles.len() as u32;

            while tri_idx < num_triangles && local_indices.len() / 3 < MESHLET_MAX_TRIANGLES {
                let i0 = indices[tri_idx * 3];
                let i1 = indices[tri_idx * 3 + 1];
                let i2 = indices[tri_idx * 3 + 2];

                // Check if adding this triangle exceeds max vertices
                let mut needed = 0;
                if !local_vertices.contains(&i0) { needed += 1; }
                if !local_vertices.contains(&i1) { needed += 1; }
                if !local_vertices.contains(&i2) { needed += 1; }

                if local_vertices.len() + needed > MESHLET_MAX_VERTICES && !local_vertices.is_empty() {
                    break;
                }

                let get_local = |idx: u32, verts: &mut Vec<u32>| -> u8 {
                    if let Some(pos) = verts.iter().position(|&v| v == idx) {
                        pos as u8
                    } else {
                        let pos = verts.len() as u8;
                        verts.push(idx);
                        pos
                    }
                };

                let l0 = get_local(i0, &mut local_vertices);
                let l1 = get_local(i1, &mut local_vertices);
                let l2 = get_local(i2, &mut local_vertices);

                local_indices.push(l0);
                local_indices.push(l1);
                local_indices.push(l2);

                tri_idx += 1;
            }

            let vertex_count = local_vertices.len() as u32;
            let triangle_count = (local_indices.len() / 3) as u32;

            // Compute bounding sphere
            let mut center = Vec3A::ZERO;
            for &v in &local_vertices {
                center += positions[v as usize];
            }
            if vertex_count > 0 {
                center /= vertex_count as f32;
            }

            let mut radius: f32 = 0.0;
            for &v in &local_vertices {
                radius = radius.max(center.distance(positions[v as usize]));
            }

            let meshlet_bound = MeshletBounds {
                sphere: [center.x, center.y, center.z, radius],
                cone: [0.0, 1.0, 0.0, -1.0], // Default unconstrained cone
            };

            let meshlet = Meshlet {
                vertex_offset: vert_offset,
                triangle_offset: tri_offset,
                vertex_count,
                triangle_count,
                lod_level: 0,
                lod_error_bits: 0.0f32.to_bits(),
                _pad: [0; 2],
            };

            meshlet_vertices.extend_from_slice(&local_vertices);
            meshlet_triangles.extend_from_slice(&local_indices);
            meshlets.push(meshlet);
            bounds.push(meshlet_bound);
        }

        (meshlets, meshlet_vertices, meshlet_triangles, bounds)
    }
}

/// Packs a 64-bit Visibility Buffer ID encoding an instance ID and primitive/triangle index.
#[inline]
#[must_use]
pub fn pack_visibility_id(instance_id: u32, primitive_id: u32) -> u64 {
    ((instance_id as u64) << 32) | (primitive_id as u64)
}

/// Unpacks a 64-bit Visibility Buffer ID into `(instance_id, primitive_id)`.
#[inline]
#[must_use]
pub fn unpack_visibility_id(packed: u64) -> (u32, u32) {
    ((packed >> 32) as u32, packed as u32)
}

/// Hierarchical Z-Buffer (Hi-Z) pyramid helper for compute-driven occlusion culling.
pub struct HiZCulling;

impl HiZCulling {
    /// Computes the optimal Hi-Z mip level for testing an AABB covering `screen_size_pixels`.
    #[inline]
    #[must_use]
    pub fn select_hiz_mip(screen_size_pixels: f32, max_mip: u32) -> u32 {
        if screen_size_pixels <= 1.0 {
            return max_mip;
        }
        let mip = screen_size_pixels.log2().floor() as u32;
        mip.min(max_mip)
    }

    /// Evaluates whether a meshlet cluster should be rendered at the given camera distance
    /// based on screen-space geometric error tolerance (Unreal Nanite metric).
    #[inline]
    #[must_use]
    pub fn should_render_cluster(
        cluster_error: f32,
        parent_error: f32,
        distance: f32,
        fov_rad: f32,
        screen_height: f32,
        error_threshold_pixels: f32,
    ) -> bool {
        let view_factor = screen_height / (2.0 * (fov_rad * 0.5).tan());
        let screen_error = (cluster_error / distance.max(0.001)) * view_factor;
        let screen_parent_error = (parent_error / distance.max(0.001)) * view_factor;

        // Render if this cluster error is acceptable, and its parent error would be unacceptable
        screen_error <= error_threshold_pixels && screen_parent_error > error_threshold_pixels
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_meshlet_generation_simple_quad() {
        let positions = vec![
            Vec3A::new(-1.0, -1.0, 0.0),
            Vec3A::new(1.0, -1.0, 0.0),
            Vec3A::new(1.0, 1.0, 0.0),
            Vec3A::new(-1.0, 1.0, 0.0),
        ];
        let indices = vec![0, 1, 2, 0, 2, 3];

        let (meshlets, verts, tris, bounds) = MeshletBuilder::build(&positions, &indices);
        assert_eq!(meshlets.len(), 1);
        assert_eq!(meshlets[0].vertex_count, 4);
        assert_eq!(meshlets[0].triangle_count, 2);
        assert_eq!(verts.len(), 4);
        assert_eq!(tris.len(), 6);
        assert_eq!(bounds.len(), 1);
    }

    #[test]
    fn test_visibility_id_packing() {
        let packed = pack_visibility_id(42, 1337);
        let (inst, prim) = unpack_visibility_id(packed);
        assert_eq!(inst, 42);
        assert_eq!(prim, 1337);
    }
}
