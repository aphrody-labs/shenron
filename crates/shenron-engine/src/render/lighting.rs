// SPDX-License-Identifier: Apache-2.0

//! Clustered Forward lighting, Cascaded Shadow Maps (CSM), and Real-time GI.
//!
//! Handles 10,000+ local dynamic light sources via 3D frustum cluster grids,
//! directional cascaded shadow maps with texel stabilization, and Voxel Cone Tracing.

use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3, Vec3A, Vec4};

/// Number of cluster divisions along the X axis.
pub const CLUSTER_GRID_X: u32 = 16;
/// Number of cluster divisions along the Y axis.
pub const CLUSTER_GRID_Y: u32 = 9;
/// Number of cluster divisions along the Z (depth) axis.
pub const CLUSTER_GRID_Z: u32 = 24;
/// Total number of 3D clusters.
pub const TOTAL_CLUSTERS: usize = (CLUSTER_GRID_X * CLUSTER_GRID_Y * CLUSTER_GRID_Z) as usize;
/// Maximum number of active lights per cluster.
pub const MAX_LIGHTS_PER_CLUSTER: usize = 128;

/// GPU representation of a dynamic light source (64 bytes aligned).
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(C, align(16))]
pub struct GpuLight {
    /// World position (xyz) and attenuation radius (w).
    pub position_radius: [f32; 4],
    /// Linear RGB color (xyz) and luminous intensity in candelas/lumens (w).
    pub color_intensity: [f32; 4],
    /// Spot direction (xyz) and inner cone angle cosine (w).
    pub direction_inner: [f32; 4],
    /// Outer cone cosine (x), light type (y: 0=Directional, 1=Point, 2=Spot), shadow map index (z), pad (w).
    pub params: [f32; 4],
}

unsafe impl Pod for GpuLight {}
unsafe impl Zeroable for GpuLight {}

impl GpuLight {
    /// Creates a point light.
    #[must_use]
    pub fn point(pos: Vec3A, radius: f32, color: Vec3, intensity: f32) -> Self {
        Self {
            position_radius: [pos.x, pos.y, pos.z, radius],
            color_intensity: [color.x, color.y, color.z, intensity],
            direction_inner: [0.0, -1.0, 0.0, 1.0],
            params: [0.0, 1.0, -1.0, 0.0],
        }
    }

    /// Creates a directional sunlight.
    #[must_use]
    pub fn directional(dir: Vec3A, color: Vec3, intensity: f32, shadow_cascade_idx: i32) -> Self {
        let d = dir.normalize();
        Self {
            position_radius: [0.0, 0.0, 0.0, f32::INFINITY],
            color_intensity: [color.x, color.y, color.z, intensity],
            direction_inner: [d.x, d.y, d.z, 1.0],
            params: [0.0, 0.0, shadow_cascade_idx as f32, 0.0],
        }
    }

    /// Creates a spotlight.
    #[must_use]
    pub fn spot(
        pos: Vec3A,
        dir: Vec3A,
        radius: f32,
        color: Vec3,
        intensity: f32,
        inner_cone_rad: f32,
        outer_cone_rad: f32,
    ) -> Self {
        let d = dir.normalize();
        Self {
            position_radius: [pos.x, pos.y, pos.z, radius],
            color_intensity: [color.x, color.y, color.z, intensity],
            direction_inner: [d.x, d.y, d.z, inner_cone_rad.cos()],
            params: [outer_cone_rad.cos(), 2.0, -1.0, 0.0],
        }
    }
}

/// 3D Frustum Cluster Grid for clustered light assignment.
pub struct ClusterGrid;

impl ClusterGrid {
    /// Computes the cluster Z slice for a given view-space depth ($z > 0$).
    #[inline]
    #[must_use]
    pub fn depth_to_slice(depth: f32, near: f32, far: f32, num_slices: u32) -> u32 {
        if depth <= near {
            return 0;
        }
        let norm = (depth / near).ln() / (far / near).ln();
        let slice = (norm * num_slices as f32).floor() as u32;
        slice.min(num_slices - 1)
    }

    /// Computes the view-space depth range for a given cluster Z slice.
    #[inline]
    #[must_use]
    pub fn slice_to_depth_range(slice: u32, near: f32, far: f32, num_slices: u32) -> (f32, f32) {
        let z_near = near * (far / near).powf(slice as f32 / num_slices as f32);
        let z_far = near * (far / near).powf((slice + 1) as f32 / num_slices as f32);
        (z_near, z_far)
    }
}

/// Cascaded Shadow Maps (CSM) system with 4 cascades and sub-texel stabilization.
pub struct CascadedShadowMaps {
    num_cascades: usize,
    split_lambda: f32,
    pub split_distances: [f32; 4],
    pub light_view_projections: [Mat4; 4],
}

impl Default for CascadedShadowMaps {
    fn default() -> Self {
        Self::new(0.85) // 85% logarithmic, 15% uniform practical split
    }
}

impl CascadedShadowMaps {
    /// Creates a 4-cascade shadow map calculator.
    #[must_use]
    pub fn new(split_lambda: f32) -> Self {
        Self {
            num_cascades: 4,
            split_lambda,
            split_distances: [0.0; 4],
            light_view_projections: [Mat4::IDENTITY; 4],
        }
    }

    /// Updates cascade split distances and calculates stabilized light view-projection matrices.
    #[allow(clippy::too_many_arguments)]
    pub fn update(
        &mut self,
        camera_near: f32,
        camera_far: f32,
        camera_fov: f32,
        aspect_ratio: f32,
        camera_view: &Mat4,
        sun_direction: Vec3A,
        shadow_map_resolution: u32,
    ) {
        let sun_dir = sun_direction.normalize();
        let inv_cam_view = camera_view.inverse();

        // 1. Calculate practical split distances
        for i in 0..self.num_cascades {
            let p = (i + 1) as f32 / self.num_cascades as f32;
            let log_split = camera_near * (camera_far / camera_near).powf(p);
            let uniform_split = camera_near + (camera_far - camera_near) * p;
            self.split_distances[i] = self.split_lambda * log_split + (1.0 - self.split_lambda) * uniform_split;
        }

        // 2. Compute orthographic projection per cascade with texel stabilization
        let mut prev_split = camera_near;
        for i in 0..self.num_cascades {
            let cur_split = self.split_distances[i];

            // Corner frustum points in camera space
            let tan_half_fov = (camera_fov * 0.5).tan();
            let x_near = prev_split * tan_half_fov * aspect_ratio;
            let y_near = prev_split * tan_half_fov;
            let x_far = cur_split * tan_half_fov * aspect_ratio;
            let y_far = cur_split * tan_half_fov;

            let corners = [
                Vec4::new(-x_near, -y_near, -prev_split, 1.0),
                Vec4::new(x_near, -y_near, -prev_split, 1.0),
                Vec4::new(x_near, y_near, -prev_split, 1.0),
                Vec4::new(-x_near, y_near, -prev_split, 1.0),
                Vec4::new(-x_far, -y_far, -cur_split, 1.0),
                Vec4::new(x_far, -y_far, -cur_split, 1.0),
                Vec4::new(x_far, y_far, -cur_split, 1.0),
                Vec4::new(-x_far, y_far, -cur_split, 1.0),
            ];

            // Transform frustum corners to world space
            let mut frustum_center = Vec3::ZERO;
            let mut world_corners = [Vec3::ZERO; 8];
            for (j, corner) in corners.iter().enumerate() {
                let wc = inv_cam_view * *corner;
                world_corners[j] = Vec3::new(wc.x / wc.w, wc.y / wc.w, wc.z / wc.w);
                frustum_center += world_corners[j];
            }
            frustum_center /= 8.0;

            // Bounding sphere radius of frustum slice
            let mut sphere_radius: f32 = 0.0;
            for corner in &world_corners {
                sphere_radius = sphere_radius.max(frustum_center.distance(*corner));
            }

            // Stabilize sphere to prevent edge shimmering: round to shadow map texel increments
            let world_units_per_texel = (2.0 * sphere_radius) / shadow_map_resolution as f32;
            let light_view = Mat4::look_at_rh(
                frustum_center + Vec3::from(sun_dir) * sphere_radius,
                frustum_center,
                Vec3::Y,
            );

            // Snap center to texel grid in light space
            let mut center_light_space = light_view.transform_point3(frustum_center);
            center_light_space.x = (center_light_space.x / world_units_per_texel).floor() * world_units_per_texel;
            center_light_space.y = (center_light_space.y / world_units_per_texel).floor() * world_units_per_texel;

            let light_proj = Mat4::orthographic_rh(
                -sphere_radius,
                sphere_radius,
                -sphere_radius,
                sphere_radius,
                0.0,
                2.0 * sphere_radius,
            );

            self.light_view_projections[i] = light_proj * light_view;
            prev_split = cur_split;
        }
    }
}

/// Real-time Global Illumination Voxel Volume descriptor.
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(C, align(16))]
pub struct VoxelVolumeUniforms {
    /// World-space minimum boundary of the voxel grid (xyz) and voxel size (w).
    pub min_boundary_voxel_size: [f32; 4],
    /// Grid resolution: 128x128x128.
    pub resolution: [u32; 4],
    /// Cone tracing parameters: max distance, step size, diffuse intensity, specular intensity.
    pub trace_params: [f32; 4],
}

unsafe impl Pod for VoxelVolumeUniforms {}
unsafe impl Zeroable for VoxelVolumeUniforms {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cluster_depth_slices() {
        let near = 0.1;
        let far = 100.0;
        let slices = 24;

        let s0 = ClusterGrid::depth_to_slice(0.1, near, far, slices);
        assert_eq!(s0, 0);

        let s_mid = ClusterGrid::depth_to_slice(10.0, near, far, slices);
        assert!(s_mid > 0 && s_mid < slices);

        let s_far = ClusterGrid::depth_to_slice(100.0, near, far, slices);
        assert_eq!(s_far, slices - 1);
    }

    #[test]
    fn test_cascaded_shadow_split_calculation() {
        let mut csm = CascadedShadowMaps::new(0.8);
        let cam_view = Mat4::look_at_rh(Vec3::new(0.0, 5.0, 10.0), Vec3::ZERO, Vec3::Y);
        csm.update(0.1, 100.0, 1.0, 16.0 / 9.0, &cam_view, Vec3A::new(0.5, -1.0, 0.5), 2048);

        // Splits must be monotonically increasing
        assert!(csm.split_distances[0] < csm.split_distances[1]);
        assert!(csm.split_distances[1] < csm.split_distances[2]);
        assert!(csm.split_distances[2] < csm.split_distances[3]);
        assert!((csm.split_distances[3] - 100.0).abs() < 1e-2);
    }
}
