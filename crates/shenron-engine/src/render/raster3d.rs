// SPDX-License-Identifier: Apache-2.0

//! Reference CPU 3D Rasterizer with Z-buffering, Backface Culling, and Textured Shading.
//!
//! Provides deterministic software 3D rendering for both procedural geometries and
//! textured game models (`Model`), matching `aphrody-nie-render3d::render` and `aphrody-render::raster3d`.
//!
//! Key optical and projection constants:
//! - [`FOCALE`] = 1.7 (focal length for perspective projection)
//! - [`DISTANCE_CAMERA`] = 3.1 (camera distance in model bounding radius units)
//! - [`TILT`] = 0.20 (slight downward pitch in radians)

use super::mesh::Model;
use glam::Vec3;

/// Reference projection focal length. Half vertical field of view is `atan(1 / FOCALE)`.
pub const FOCALE: f32 = 1.7;

/// Camera distance from the bounding sphere center, in units of bounding sphere radius.
pub const DISTANCE_CAMERA: f32 = 3.1;

/// Default pitch tilt in radians (mild high-angle view).
pub const TILT: f32 = 0.20;

/// Computes the dark vertical gradient background color at scanline `y` of image height `h`.
#[inline]
#[must_use]
pub fn couleur_fond(y: u32, h: u32) -> [u8; 4] {
    if h == 0 {
        return [24, 28, 40, 255];
    }
    let t = y as f32 / h as f32;
    [
        (24.0 + 26.0 * t) as u8,
        (28.0 + 30.0 * t) as u8,
        (40.0 + 34.0 * t) as u8,
        255,
    ]
}

/// Rotates vector around Y axis by `angle` (turntable) then tilts around X axis.
#[inline]
fn orient_vector(v: Vec3, cy: f32, sy: f32, cx: f32, sx: f32) -> Vec3 {
    // Y rotation
    let x = v.x * cy + v.z * sy;
    let z = -v.x * sy + v.z * cy;
    let y = v.y;
    // X tilt
    let y2 = y * cx - z * sx;
    let z2 = y * sx + z * cx;
    Vec3::new(x, y2, z2)
}

/// Renders a textured 3D `Model` on the CPU with turntable rotation and perspective projection.
/// Returns raw RGBA8 pixels of size `width * height * 4`.
#[must_use]
pub fn render_model_cpu(model: &Model, angle: f32, width: u32, height: u32) -> Vec<u8> {
    if width == 0 || height == 0 {
        return Vec::new();
    }

    let pixel_count = (width as usize).saturating_mul(height as usize);
    let byte_count = pixel_count.saturating_mul(4);
    let mut pixels = vec![0u8; byte_count];
    let mut zbuffer = vec![f32::INFINITY; pixel_count];

    // Initialize background with dark gradient
    for y in 0..height {
        let bg = couleur_fond(y, height);
        let row_start = y as usize * width as usize * 4;
        let row_end = row_start + width as usize * 4;
        for chunk in pixels[row_start..row_end].chunks_exact_mut(4) {
            chunk.copy_from_slice(&bg);
        }
    }

    let (center_arr, radius) = model.bounds();
    let center = Vec3::from_array(center_arr);
    let inv_radius = 1.0 / radius.max(1e-4);

    let (cy, sy) = (angle.cos(), angle.sin());
    let (cx, sx) = (TILT.cos(), TILT.sin());
    let half_w = width as f32 * 0.5;
    let half_h = height as f32 * 0.5;
    let scale = half_h;
    let light_dir = Vec3::new(0.35, 0.75, 0.55).normalize();

    let project = |world_pos: Vec3| -> Option<(f32, f32, f32)> {
        let norm_pos = (world_pos - center) * inv_radius;
        let rotated = orient_vector(norm_pos, cy, sy, cx, sx);
        let depth = DISTANCE_CAMERA - rotated.z;
        if depth <= 0.05 {
            return None;
        }
        let sx = half_w + FOCALE * rotated.x / depth * scale;
        let sy = half_h - FOCALE * rotated.y / depth * scale;
        Some((sx, sy, depth))
    };

    for prim in &model.primitives {
        let texture = prim.texture.and_then(|idx| model.textures.get(idx));
        for tri in prim.indices.chunks_exact(3) {
            let (ia, ib, ic) = (tri[0] as usize, tri[1] as usize, tri[2] as usize);
            if ia >= prim.positions.len() || ib >= prim.positions.len() || ic >= prim.positions.len() {
                continue;
            }

            let wa = Vec3::from_array(prim.positions[ia]);
            let wb = Vec3::from_array(prim.positions[ib]);
            let wc = Vec3::from_array(prim.positions[ic]);

            let (Some(a), Some(b), Some(c)) = (project(wa), project(wb), project(wc)) else {
                continue;
            };

            // Backface culling via 2D cross product
            let screen_area = (b.0 - a.0) * (c.1 - a.1) - (b.1 - a.1) * (c.0 - a.0);
            if screen_area >= 0.0 {
                continue; // Back-facing triangle
            }

            // Normal and Lambertian lighting
            let na = orient_vector((wa - center) * inv_radius, cy, sy, cx, sx);
            let nb = orient_vector((wb - center) * inv_radius, cy, sy, cx, sx);
            let nc = orient_vector((wc - center) * inv_radius, cy, sy, cx, sx);
            let face_normal = (nb - na).cross(nc - na).normalize_or_zero();
            let lambert = face_normal.dot(light_dir).abs();
            let shade = 0.35 + 0.65 * lambert;

            let uva = prim.uv.get(ia).copied().unwrap_or([0.0, 0.0]);
            let uvb = prim.uv.get(ib).copied().unwrap_or([0.0, 0.0]);
            let uvc = prim.uv.get(ic).copied().unwrap_or([0.0, 0.0]);

            // Triangle bounding box clamped to viewport
            let min_x = (a.0.min(b.0).min(c.0).floor() as i32).clamp(0, width as i32 - 1);
            let max_x = (a.0.max(b.0).max(c.0).ceil() as i32).clamp(0, width as i32 - 1);
            let min_y = (a.1.min(b.1).min(c.1).floor() as i32).clamp(0, height as i32 - 1);
            let max_y = (a.1.max(b.1).max(c.1).ceil() as i32).clamp(0, height as i32 - 1);

            let inv_area = 1.0 / screen_area;

            for y in min_y..=max_y {
                let py = y as f32 + 0.5;
                let row_offset = y as usize * width as usize;

                for x in min_x..=max_x {
                    let px = x as f32 + 0.5;

                    // Barycentric coordinates
                    let w0 = ((b.0 - px) * (c.1 - py) - (b.1 - py) * (c.0 - px)) * inv_area;
                    let w1 = ((c.0 - px) * (a.1 - py) - (c.1 - py) * (a.0 - px)) * inv_area;
                    let w2 = 1.0 - w0 - w1;

                    if w0 >= 0.0 && w1 >= 0.0 && w2 >= 0.0 {
                        // Depth interpolation
                        let z = w0 * a.2 + w1 * b.2 + w2 * c.2;
                        let pixel_idx = row_offset + x as usize;

                        if z < zbuffer[pixel_idx] {
                            // Perspective-correct UV interpolation
                            let inv_za = 1.0 / a.2;
                            let inv_zb = 1.0 / b.2;
                            let inv_zc = 1.0 / c.2;

                            let interp_inv_z = w0 * inv_za + w1 * inv_zb + w2 * inv_zc;
                            let u = (w0 * uva[0] * inv_za + w1 * uvb[0] * inv_zb + w2 * uvc[0] * inv_zc) / interp_inv_z;
                            let v = (w0 * uva[1] * inv_za + w1 * uvb[1] * inv_zb + w2 * uvc[1] * inv_zc) / interp_inv_z;

                            let base_color = if let Some(tex) = texture {
                                tex.sample_bilinear(u, v)
                            } else {
                                [210, 205, 195, 255] // Default cel-clay
                            };

                            // Alpha test cutout (discard transparent pixels)
                            if base_color[3] >= 32 {
                                zbuffer[pixel_idx] = z;
                                let r = ((base_color[0] as f32) * shade).min(255.0) as u8;
                                let g = ((base_color[1] as f32) * shade).min(255.0) as u8;
                                let b = ((base_color[2] as f32) * shade).min(255.0) as u8;

                                let p_offset = pixel_idx * 4;
                                pixels[p_offset] = r;
                                pixels[p_offset + 1] = g;
                                pixels[p_offset + 2] = b;
                                pixels[p_offset + 3] = base_color[3];
                            }
                        }
                    }
                }
            }
        }
    }

    pixels
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::render::mesh::Primitive;

    #[test]
    fn test_cpu_rasterizer_model() {
        let tri_prim = Primitive {
            positions: vec![
                [-1.0, -1.0, 0.0],
                [1.0, -1.0, 0.0],
                [0.0, 1.0, 0.0],
            ],
            normals: vec![[0.0, 0.0, 1.0]; 3],
            uv: vec![[0.0, 0.0], [1.0, 0.0], [0.5, 1.0]],
            indices: vec![0, 1, 2],
            texture: None,
        };

        let model = Model {
            primitives: vec![tri_prim],
            textures: Vec::new(),
        };

        let img = render_model_cpu(&model, 0.0, 64, 64);
        assert_eq!(img.len(), 64 * 64 * 4);
    }
}
