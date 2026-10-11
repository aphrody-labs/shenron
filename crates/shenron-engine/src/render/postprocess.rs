// SPDX-License-Identifier: Apache-2.0

//! Post-processing pipeline: TAA, Bloom, and ACES/Khronos PBR tonemapping.
//!
//! Features Halton (2, 3) subpixel camera jitter, YCoCg neighborhood clipping
//! to prevent ghosting, Karis-weighted bloom, and filmic curve transforms.

use bytemuck::{Pod, Zeroable};
use glam::{Vec2, Vec3};

/// 16-sample Halton (2, 3) low-discrepancy sequence generator for TAA subpixel jitter.
pub struct HaltonSequence;

impl HaltonSequence {
    /// Computes the radical inverse in base `base`.
    #[inline]
    #[must_use]
    pub fn get(index: u32, base: u32) -> f32 {
        let mut f = 1.0;
        let mut r = 0.0;
        let mut i = index;
        while i > 0 {
            f /= base as f32;
            r += f * (i % base) as f32;
            i /= base;
        }
        r
    }

    /// Computes the 2D subpixel jitter offset for a frame index in $[-0.5, 0.5]$ texel space.
    #[inline]
    #[must_use]
    pub fn get_subpixel_jitter(frame_index: u32) -> Vec2 {
        let idx = (frame_index % 16) + 1;
        let x = Self::get(idx, 2) - 0.5;
        let y = Self::get(idx, 3) - 0.5;
        Vec2::new(x, y)
    }
}

/// Converts linear RGB color to YCoCg color space for compact bounding box clamping.
#[inline]
#[must_use]
pub fn rgb_to_ycocg(rgb: Vec3) -> Vec3 {
    let y = rgb.x * 0.25 + rgb.y * 0.5 + rgb.z * 0.25;
    let co = rgb.x * 0.5 - rgb.z * 0.5;
    let cg = -rgb.x * 0.25 + rgb.y * 0.5 - rgb.z * 0.25;
    Vec3::new(y, co, cg)
}

/// Converts YCoCg color back into linear RGB.
#[inline]
#[must_use]
pub fn ycocg_to_rgb(ycocg: Vec3) -> Vec3 {
    let y = ycocg.x;
    let co = ycocg.y;
    let cg = ycocg.z;
    let r = y + co - cg;
    let g = y + cg;
    let b = y - co - cg;
    Vec3::new(r, g, b)
}

/// Clips a history sample to the 3x3 neighborhood AABB in YCoCg space to eliminate ghosting.
#[inline]
#[must_use]
pub fn clip_aabb_ycocg(history: Vec3, aabb_min: Vec3, aabb_max: Vec3) -> Vec3 {
    history.clamp(aabb_min, aabb_max)
}

/// ACES fitted tonemapping curve (Krzysztof Narkowicz / Stephen Hill fit).
#[inline]
#[must_use]
pub fn tonemap_aces_fitted(color: Vec3) -> Vec3 {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    let num = color * (color * a + b);
    let den = color * (color * c + d) + e;
    (num / den).clamp(Vec3::ZERO, Vec3::ONE)
}

/// Khronos PBR Neutral tonemapping operator.
#[inline]
#[must_use]
pub fn tonemap_khronos_pbr_neutral(color: Vec3) -> Vec3 {
    let start_compression = 0.8 - 0.04;
    let desaturation = 0.15;
    let x = color.min_element();
    let offset = if x < 0.08 { x - 6.25 * x * x } else { 0.04 };
    let c = color - offset;
    let peak = c.max_element();
    if peak < start_compression {
        return color;
    }
    let d = 1.0 - start_compression;
    let new_peak = 1.0 - d * d / (peak + d - start_compression);
    c * (new_peak / peak) + Vec3::splat(new_peak * desaturation)
}

/// Post-processing uniform buffer layout.
#[derive(Copy, Clone, Debug, PartialEq)]
#[repr(C, align(16))]
pub struct PostProcessUniforms {
    /// Subpixel jitter offset (xy) and screen dimensions (zw).
    pub jitter_and_resolution: [f32; 4],
    /// TAA history blend factor (x: ~0.05-0.1), bloom intensity (y), exposure (z), tonemapper mode (w: 0=ACES, 1=Khronos).
    pub params: [f32; 4],
}

unsafe impl Pod for PostProcessUniforms {}
unsafe impl Zeroable for PostProcessUniforms {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_halton_subpixel_jitter_bounds() {
        for frame in 0..64 {
            let jitter = HaltonSequence::get_subpixel_jitter(frame);
            assert!(jitter.x >= -0.5 && jitter.x <= 0.5);
            assert!(jitter.y >= -0.5 && jitter.y <= 0.5);
        }
    }

    #[test]
    fn test_ycocg_roundtrip() {
        let original = Vec3::new(0.8, 0.4, 0.2);
        let ycocg = rgb_to_ycocg(original);
        let reconstructed = ycocg_to_rgb(ycocg);
        assert!((original - reconstructed).length() < 1e-5);
    }

    #[test]
    fn test_tonemap_aces_range() {
        let hdr = Vec3::new(10.0, 50.0, 100.0);
        let ldr = tonemap_aces_fitted(hdr);
        assert!(ldr.x <= 1.0 && ldr.y <= 1.0 && ldr.z <= 1.0);
        assert!(ldr.x >= 0.0 && ldr.y >= 0.0 && ldr.z >= 0.0);
    }
}
