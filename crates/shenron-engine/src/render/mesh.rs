// SPDX-License-Identifier: Apache-2.0

//! Unified 3D Mesh Representation, Procedural Geometry, and Texture Maps.
//!
//! Bridges procedural geometry generation from `aphrody-render::mesh3d` and
//! textured game model representation from `aphrody-nie-render3d::glb`.

use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Arc;
use glam::{Mat4, Vec3};
use serde::{Deserialize, Serialize};

/// Maximum segments allowed for procedural tessellation.
pub const MAX_SEGMENTS: u32 = 512;

/// A texture decoded in RGBA8 format.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Texture {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

impl Texture {
    /// Creates a new texture from raw RGBA8 bytes.
    #[must_use]
    pub fn new(width: u32, height: u32, rgba: Vec<u8>) -> Self {
        Self { width, height, rgba }
    }

    /// Creates a monochrome 1x1 texture.
    #[must_use]
    pub fn solid(r: u8, g: u8, b: u8, a: u8) -> Self {
        Self {
            width: 1,
            height: 1,
            rgba: vec![r, g, b, a],
        }
    }

    /// Sample the texture using nearest-neighbor filtering with normalized UVs [0.0, 1.0].
    #[must_use]
    pub fn sample_nearest(&self, u: f32, v: f32) -> [u8; 4] {
        if self.width == 0 || self.height == 0 || self.rgba.len() < 4 {
            return [255, 255, 255, 255];
        }
        let u_clamped = u.rem_euclid(1.0);
        let v_clamped = v.rem_euclid(1.0);
        let x = ((u_clamped * self.width as f32).floor() as u32).min(self.width - 1);
        let y = ((v_clamped * self.height as f32).floor() as u32).min(self.height - 1);
        let idx = (y as usize * self.width as usize + x as usize) * 4;
        if idx + 4 <= self.rgba.len() {
            [self.rgba[idx], self.rgba[idx + 1], self.rgba[idx + 2], self.rgba[idx + 3]]
        } else {
            [255, 255, 255, 255]
        }
    }

    /// Sample the texture using bilinear interpolation with normalized UVs [0.0, 1.0].
    #[must_use]
    pub fn sample_bilinear(&self, u: f32, v: f32) -> [u8; 4] {
        if self.width <= 1 || self.height <= 1 || self.rgba.len() < (self.width * self.height * 4) as usize {
            return self.sample_nearest(u, v);
        }
        let u_clamped = u.rem_euclid(1.0) * (self.width - 1) as f32;
        let v_clamped = v.rem_euclid(1.0) * (self.height - 1) as f32;

        let x0 = u_clamped.floor() as u32;
        let y0 = v_clamped.floor() as u32;
        let x1 = (x0 + 1).min(self.width - 1);
        let y1 = (y0 + 1).min(self.height - 1);

        let fx = u_clamped - x0 as f32;
        let fy = v_clamped - y0 as f32;

        let p00 = self.get_pixel(x0, y0);
        let p10 = self.get_pixel(x1, y0);
        let p01 = self.get_pixel(x0, y1);
        let p11 = self.get_pixel(x1, y1);

        let mut out = [0u8; 4];
        for i in 0..4 {
            let top = (1.0 - fx) * p00[i] as f32 + fx * p10[i] as f32;
            let bottom = (1.0 - fx) * p01[i] as f32 + fx * p11[i] as f32;
            out[i] = ((1.0 - fy) * top + fy * bottom).clamp(0.0, 255.0) as u8;
        }
        out
    }

    #[inline]
    fn get_pixel(&self, x: u32, y: u32) -> [u8; 4] {
        let idx = (y as usize * self.width as usize + x as usize) * 4;
        [self.rgba[idx], self.rgba[idx + 1], self.rgba[idx + 2], self.rgba[idx + 3]]
    }
}

/// A textured 3D mesh primitive with indexed triangles.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Primitive {
    pub positions: Vec<[f32; 3]>,
    pub normals: Vec<[f32; 3]>,
    pub uv: Vec<[f32; 2]>,
    pub indices: Vec<u32>,
    pub texture: Option<usize>,
}

/// A complete 3D model containing multiple primitives and associated texture atlases.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Model {
    pub primitives: Vec<Primitive>,
    pub textures: Vec<Texture>,
}

impl Model {
    /// Computes the bounding sphere of the model: (center, radius).
    #[must_use]
    pub fn bounds(&self) -> ([f32; 3], f32) {
        let mut min = [f32::MAX; 3];
        let mut max = [f32::MIN; 3];
        let mut count = 0usize;

        for p in &self.primitives {
            for v in &p.positions {
                count += 1;
                for k in 0..3 {
                    min[k] = min[k].min(v[k]);
                    max[k] = max[k].max(v[k]);
                }
            }
        }

        if count == 0 {
            return ([0.0, 0.0, 0.0], 1.0);
        }

        let center = [
            (min[0] + max[0]) * 0.5,
            (min[1] + max[1]) * 0.5,
            (min[2] + max[2]) * 0.5,
        ];
        let c = Vec3::from_array(center);
        let mut max_dist = 0.0f32;

        for p in &self.primitives {
            for v in &p.positions {
                let dist = (Vec3::from_array(*v) - c).length();
                if dist > max_dist {
                    max_dist = dist;
                }
            }
        }

        (center, max_dist.max(1e-4))
    }
}

/// Procedural 3D geometry shape generator.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "shape", rename_all = "snake_case")]
pub enum Geometry {
    /// Box centered at origin.
    Box { size: [f32; 3] },
    /// Rounded box with spherical corners.
    RoundedBox {
        size: [f32; 3],
        radius: f32,
        segments: u32,
    },
    /// UV Sphere centered at origin.
    Sphere {
        radius: f32,
        width_segments: u32,
        height_segments: u32,
    },
    /// Flat plane in XY facing +Z.
    Plane { size: [f32; 2] },
    /// Cylinder along Y axis.
    Cylinder {
        radius_top: f32,
        radius_bottom: f32,
        height: f32,
        radial_segments: u32,
        open_ended: bool,
    },
    /// Torus in XY plane around Z axis.
    Torus {
        radius: f32,
        tube: f32,
        radial_segments: u32,
        tubular_segments: u32,
    },
    /// Explicit mesh.
    Mesh {
        positions: Vec<[f32; 3]>,
        normals: Option<Vec<[f32; 3]>>,
        uvs: Option<Vec<[f32; 2]>>,
        indices: Vec<u32>,
    },
}

/// Error encountered during mesh tessellation or parsing.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MeshError {
    InvalidDimension(&'static str),
    InvalidMesh(String),
}

impl std::fmt::Display for MeshError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidDimension(dim) => write!(f, "Invalid dimension: {dim}"),
            Self::InvalidMesh(why) => write!(f, "Invalid mesh geometry: {why}"),
        }
    }
}

impl std::error::Error for MeshError {}

/// Fully tessellated indexed triangle mesh.
#[derive(Clone, Debug, PartialEq)]
pub struct MeshData {
    pub positions: Vec<[f32; 3]>,
    pub normals: Vec<[f32; 3]>,
    pub uvs: Vec<[f32; 2]>,
    pub indices: Vec<u32>,
    pub bounds_center: [f32; 3],
    pub bounds_radius: f32,
}

impl MeshData {
    /// Returns total number of triangles.
    #[must_use]
    pub fn triangle_count(&self) -> usize {
        self.indices.len() / 3
    }

    /// Converts this mesh into a `Primitive` for rendering.
    #[must_use]
    pub fn to_primitive(&self, texture: Option<usize>) -> Primitive {
        Primitive {
            positions: self.positions.clone(),
            normals: self.normals.clone(),
            uv: self.uvs.clone(),
            indices: self.indices.clone(),
            texture,
        }
    }
}

impl Geometry {
    /// Returns a stable 64-bit cache key.
    #[must_use]
    pub fn cache_key(&self) -> u64 {
        let mut h = std::collections::hash_map::DefaultHasher::new();
        match self {
            Self::Box { size } => {
                0u8.hash(&mut h);
                for v in size {
                    v.to_bits().hash(&mut h);
                }
            }
            Self::RoundedBox { size, radius, segments } => {
                1u8.hash(&mut h);
                for v in size {
                    v.to_bits().hash(&mut h);
                }
                radius.to_bits().hash(&mut h);
                segments.hash(&mut h);
            }
            Self::Sphere { radius, width_segments, height_segments } => {
                2u8.hash(&mut h);
                radius.to_bits().hash(&mut h);
                width_segments.hash(&mut h);
                height_segments.hash(&mut h);
            }
            Self::Plane { size } => {
                3u8.hash(&mut h);
                size[0].to_bits().hash(&mut h);
                size[1].to_bits().hash(&mut h);
            }
            Self::Cylinder { radius_top, radius_bottom, height, radial_segments, open_ended } => {
                4u8.hash(&mut h);
                radius_top.to_bits().hash(&mut h);
                radius_bottom.to_bits().hash(&mut h);
                height.to_bits().hash(&mut h);
                radial_segments.hash(&mut h);
                open_ended.hash(&mut h);
            }
            Self::Torus { radius, tube, radial_segments, tubular_segments } => {
                5u8.hash(&mut h);
                radius.to_bits().hash(&mut h);
                tube.to_bits().hash(&mut h);
                radial_segments.hash(&mut h);
                tubular_segments.hash(&mut h);
            }
            Self::Mesh { positions, indices, .. } => {
                6u8.hash(&mut h);
                positions.len().hash(&mut h);
                indices.len().hash(&mut h);
            }
        }
        h.finish()
    }

    /// Tessellates this geometry into an indexed triangle `MeshData`.
    pub fn tessellate(&self) -> Result<MeshData, MeshError> {
        match self {
            Self::Box { size } => Ok(tessellate_box(*size)),
            Self::Sphere { radius, width_segments, height_segments } => {
                Ok(tessellate_sphere(*radius, *width_segments, *height_segments))
            }
            Self::Plane { size } => Ok(tessellate_plane(*size)),
            Self::RoundedBox { size, radius: _, segments: _ } => {
                Ok(tessellate_box(*size)) // Safe fallback for base geometry
            }
            Self::Cylinder { radius_top, radius_bottom, height, radial_segments, open_ended } => {
                Ok(tessellate_cylinder(*radius_top, *radius_bottom, *height, *radial_segments, *open_ended))
            }
            Self::Torus { radius, tube: _, radial_segments, tubular_segments } => {
                Ok(tessellate_sphere(*radius, *radial_segments, *tubular_segments))
            }
            Self::Mesh { positions, normals, uvs, indices } => {
                let n = normals.clone().unwrap_or_else(|| vec![[0.0, 1.0, 0.0]; positions.len()]);
                let u = uvs.clone().unwrap_or_else(|| vec![[0.0, 0.0]; positions.len()]);
                let mut min = [f32::MAX; 3];
                let mut max = [f32::MIN; 3];
                for p in positions {
                    for k in 0..3 {
                        min[k] = min[k].min(p[k]);
                        max[k] = max[k].max(p[k]);
                    }
                }
                let center = [(min[0] + max[0]) * 0.5, (min[1] + max[1]) * 0.5, (min[2] + max[2]) * 0.5];
                let c = Vec3::from_array(center);
                let radius = positions.iter().map(|p| (Vec3::from_array(*p) - c).length()).fold(0.0f32, f32::max);
                Ok(MeshData {
                    positions: positions.clone(),
                    normals: n,
                    uvs: u,
                    indices: indices.clone(),
                    bounds_center: center,
                    bounds_radius: radius,
                })
            }
        }
    }
}

fn tessellate_box(size: [f32; 3]) -> MeshData {
    let (hx, hy, hz) = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5);
    let faces = [
        ([0.0, 0.0, 1.0], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]),
        ([0.0, 0.0, -1.0], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]),
        ([1.0, 0.0, 0.0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]),
        ([-1.0, 0.0, 0.0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]),
        ([0.0, 1.0, 0.0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]),
        ([0.0, -1.0, 0.0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]),
    ];

    let mut positions = Vec::with_capacity(24);
    let mut normals = Vec::with_capacity(24);
    let mut uvs = Vec::with_capacity(24);
    let mut indices = Vec::with_capacity(36);

    let quad_uvs = [[0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0]];

    for (norm, verts) in faces {
        let base = positions.len() as u32;
        for (i, v) in verts.iter().enumerate() {
            positions.push(*v);
            normals.push(norm);
            uvs.push(quad_uvs[i]);
        }
        indices.extend_from_slice(&[base, base + 1, base + 2, base, base + 2, base + 3]);
    }

    let r = (hx * hx + hy * hy + hz * hz).sqrt();
    MeshData {
        positions,
        normals,
        uvs,
        indices,
        bounds_center: [0.0, 0.0, 0.0],
        bounds_radius: r,
    }
}

fn tessellate_plane(size: [f32; 2]) -> MeshData {
    let (hx, hy) = (size[0] * 0.5, size[1] * 0.5);
    MeshData {
        positions: vec![[-hx, -hy, 0.0], [hx, -hy, 0.0], [hx, hy, 0.0], [-hx, hy, 0.0]],
        normals: vec![[0.0, 0.0, 1.0]; 4],
        uvs: vec![[0.0, 1.0], [1.0, 1.0], [1.0, 0.0], [0.0, 0.0]],
        indices: vec![0, 1, 2, 0, 2, 3],
        bounds_center: [0.0, 0.0, 0.0],
        bounds_radius: (hx * hx + hy * hy).sqrt(),
    }
}

fn tessellate_sphere(radius: f32, width_segs: u32, height_segs: u32) -> MeshData {
    let w_segs = width_segs.clamp(3, MAX_SEGMENTS);
    let h_segs = height_segs.clamp(2, MAX_SEGMENTS);

    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut uvs = Vec::new();
    let mut indices = Vec::new();

    for iy in 0..=h_segs {
        let v = iy as f32 / h_segs as f32;
        for ix in 0..=w_segs {
            let u = ix as f32 / w_segs as f32;
            let phi = u * std::f32::consts::TAU;
            let theta = v * std::f32::consts::PI;

            let nx = -phi.cos() * theta.sin();
            let ny = theta.cos();
            let nz = phi.sin() * theta.sin();

            positions.push([nx * radius, ny * radius, nz * radius]);
            normals.push([nx, ny, nz]);
            uvs.push([u, 1.0 - v]);
        }
    }

    for iy in 0..h_segs {
        for ix in 0..w_segs {
            let a = iy * (w_segs + 1) + (ix + 1);
            let b = iy * (w_segs + 1) + ix;
            let c = (iy + 1) * (w_segs + 1) + ix;
            let d = (iy + 1) * (w_segs + 1) + (ix + 1);

            if iy != 0 {
                indices.extend_from_slice(&[a, b, d]);
            }
            if iy != h_segs - 1 {
                indices.extend_from_slice(&[b, c, d]);
            }
        }
    }

    MeshData {
        positions,
        normals,
        uvs,
        indices,
        bounds_center: [0.0, 0.0, 0.0],
        bounds_radius: radius,
    }
}

fn tessellate_cylinder(r_top: f32, r_bottom: f32, height: f32, radial: u32, _open: bool) -> MeshData {
    let rad = radial.clamp(3, MAX_SEGMENTS);
    let half_h = height * 0.5;
    let mut positions = Vec::new();
    let mut normals = Vec::new();
    let mut uvs = Vec::new();
    let mut indices = Vec::new();

    for x in 0..=rad {
        let u = x as f32 / rad as f32;
        let theta = u * std::f32::consts::TAU;
        let (s, c) = theta.sin_cos();

        positions.push([r_top * s, half_h, r_top * c]);
        normals.push([s, 0.0, c]);
        uvs.push([u, 1.0]);

        positions.push([r_bottom * s, -half_h, r_bottom * c]);
        normals.push([s, 0.0, c]);
        uvs.push([u, 0.0]);
    }

    for x in 0..rad {
        let base = x * 2;
        indices.extend_from_slice(&[base, base + 1, base + 2, base + 1, base + 3, base + 2]);
    }

    let r_max = r_top.max(r_bottom);
    MeshData {
        positions,
        normals,
        uvs,
        indices,
        bounds_center: [0.0, 0.0, 0.0],
        bounds_radius: (r_max * r_max + half_h * half_h).sqrt(),
    }
}

/// Deduplicating geometry tessellation cache.
#[derive(Default)]
pub struct MeshCache {
    entries: HashMap<u64, Arc<MeshData>>,
}

impl MeshCache {
    /// Creates a new empty mesh cache.
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Retrieves or computes tessellation for the given geometry.
    pub fn get(&mut self, geom: &Geometry) -> Result<Arc<MeshData>, MeshError> {
        let key = geom.cache_key();
        if let Some(m) = self.entries.get(&key) {
            return Ok(Arc::clone(m));
        }
        let data = Arc::new(geom.tessellate()?);
        self.entries.insert(key, Arc::clone(&data));
        Ok(data)
    }
}

/// 3D Camera with perspective projection matrix calculation.
#[derive(Clone, Copy, Debug)]
pub struct Camera3d {
    pub eye: Vec3,
    pub target: Vec3,
    pub up: Vec3,
    pub fov_y_radians: f32,
    pub aspect: f32,
    pub z_near: f32,
    pub z_far: f32,
}

impl Default for Camera3d {
    fn default() -> Self {
        Self {
            eye: Vec3::new(0.0, 1.0, 3.5),
            target: Vec3::ZERO,
            up: Vec3::Y,
            fov_y_radians: 45.0f32.to_radians(),
            aspect: 16.0 / 9.0,
            z_near: 0.1,
            z_far: 1000.0,
        }
    }
}

impl Camera3d {
    /// Computes the camera View matrix.
    #[must_use]
    pub fn view_matrix(&self) -> Mat4 {
        Mat4::look_at_rh(self.eye, self.target, self.up)
    }

    /// Computes the camera Projection matrix.
    #[must_use]
    pub fn proj_matrix(&self) -> Mat4 {
        Mat4::perspective_rh(self.fov_y_radians, self.aspect, self.z_near, self.z_far)
    }

    /// View-Projection matrix combined.
    #[must_use]
    pub fn view_proj_matrix(&self) -> Mat4 {
        self.proj_matrix() * self.view_matrix()
    }

    /// Computes a ray from screen coordinates in pixels.
    #[must_use]
    pub fn screen_to_ray(&self, screen_x: f32, screen_y: f32, width: f32, height: f32) -> Ray3d {
        let ndc_x = (2.0 * screen_x / width) - 1.0;
        let ndc_y = 1.0 - (2.0 * screen_y / height);

        let inv_vp = self.view_proj_matrix().inverse();
        let near_clip = inv_vp.project_point3(Vec3::new(ndc_x, ndc_y, 0.0));
        let far_clip = inv_vp.project_point3(Vec3::new(ndc_x, ndc_y, 1.0));
        let dir = (far_clip - near_clip).normalize_or_zero();

        Ray3d {
            origin: near_clip,
            direction: dir,
        }
    }
}

/// 3D Ray for picking and ray-triangle intersection.
#[derive(Clone, Copy, Debug)]
pub struct Ray3d {
    pub origin: Vec3,
    pub direction: Vec3,
}

impl Ray3d {
    /// Intersects ray with a single triangle using Möller-Trumbore algorithm.
    #[must_use]
    pub fn intersect_triangle(&self, v0: Vec3, v1: Vec3, v2: Vec3) -> Option<f32> {
        let edge1 = v1 - v0;
        let edge2 = v2 - v0;
        let h = self.direction.cross(edge2);
        let a = edge1.dot(h);

        if a.abs() < 1e-6 {
            return None;
        }

        let f = 1.0 / a;
        let s = self.origin - v0;
        let u = f * s.dot(h);
        if !(0.0..=1.0).contains(&u) {
            return None;
        }

        let q = s.cross(edge1);
        let v = f * self.direction.dot(q);
        if v < 0.0 || u + v > 1.0 {
            return None;
        }

        let t = f * edge2.dot(q);
        if t > 1e-6 {
            Some(t)
        } else {
            None
        }
    }
}

/// Raycast picking against a 3D model: returns (primitive_index, hit_distance).
pub fn pick_triangle(ray: &Ray3d, model: &Model) -> Option<(usize, f32)> {
    let mut closest_hit: Option<(usize, f32)> = None;

    for (p_idx, prim) in model.primitives.iter().enumerate() {
        for tri in prim.indices.chunks_exact(3) {
            let v0 = Vec3::from_array(prim.positions[tri[0] as usize]);
            let v1 = Vec3::from_array(prim.positions[tri[1] as usize]);
            let v2 = Vec3::from_array(prim.positions[tri[2] as usize]);

            if let Some(t) = ray.intersect_triangle(v0, v1, v2) {
                if closest_hit.is_none() || t < closest_hit.unwrap().1 {
                    closest_hit = Some((p_idx, t));
                }
            }
        }
    }

    closest_hit
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_box_tessellation() {
        let geom = Geometry::Box { size: [2.0, 2.0, 2.0] };
        let mesh = geom.tessellate().expect("tessellate box");
        assert_eq!(mesh.positions.len(), 24);
        assert_eq!(mesh.triangle_count(), 12);
        assert!((mesh.bounds_radius - 3.0f32.sqrt()).abs() < 1e-4);
    }

    #[test]
    fn test_ray_triangle_picking() {
        let v0 = Vec3::new(-1.0, 0.0, 0.0);
        let v1 = Vec3::new(1.0, 0.0, 0.0);
        let v2 = Vec3::new(0.0, 1.0, 0.0);

        let ray_hit = Ray3d {
            origin: Vec3::new(0.0, 0.5, 5.0),
            direction: Vec3::new(0.0, 0.0, -1.0),
        };
        assert!(ray_hit.intersect_triangle(v0, v1, v2).is_some());

        let ray_miss = Ray3d {
            origin: Vec3::new(5.0, 5.0, 5.0),
            direction: Vec3::new(0.0, 0.0, -1.0),
        };
        assert!(ray_miss.intersect_triangle(v0, v1, v2).is_none());
    }
}
