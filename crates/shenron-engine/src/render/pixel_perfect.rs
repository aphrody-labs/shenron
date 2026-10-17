// SPDX-License-Identifier: Apache-2.0

//! Pixel perfect 2D rendering contract for DBXV2 textures.
//!
//! Everything here is data-agnostic: textures are supplied by the caller at run time (PNG bytes
//! or raw RGBA) and are never embedded. The contract:
//!
//! - lossless PNG decode at native dimensions (8-bit channels only, no resampling);
//! - declared color space (`Rgba8UnormSrgb` or `Rgba8Unorm`) and alpha mode (straight or
//!   premultiplied) carried by [`PixelTexture`], never guessed;
//! - nearest sampler, a single mip level, clamp-to-edge addressing, exact texel-center UVs;
//! - integer scale framing on the physical pixel grid (device pixel ratio included), sprites on
//!   whole pixels only;
//! - a software reference rasterizer ([`Framebuffer::draw_sprite`]) that defines the expected
//!   bytes the GPU path must reproduce.

use std::io::Cursor;

/// Largest accepted texture edge, to bound memory on hostile or corrupt input.
pub const MAX_TEXTURE_EDGE: u32 = 16_384;

/// Color space the texture bytes are declared to be in (a PNG does not carry it reliably).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ColorSpace {
    /// Color data, GPU format `Rgba8UnormSrgb`.
    #[default]
    Srgb,
    /// Non color data, GPU format `Rgba8Unorm`.
    Linear,
}

/// Alpha representation of the texture bytes.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum AlphaMode {
    /// Color channels are independent of alpha.
    #[default]
    Straight,
    /// Color channels are already multiplied by alpha.
    Premultiplied,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum PixelError {
    #[error("png decode failed: {0}")]
    Png(String),
    #[error("unsupported png channel layout {0}: only 8-bit L, LA, RGB and RGBA are lossless here")]
    UnsupportedLayout(String),
    #[error("invalid dimensions {width}x{height}")]
    Dimensions { width: u32, height: u32 },
    #[error("rgba length {got} does not match {width}x{height}x4 = {expected}")]
    Length { width: u32, height: u32, got: usize, expected: usize },
    #[error("texture {index} is {got_w}x{got_h}, model declares {want_w}x{want_h}")]
    DeclaredSizeMismatch { index: usize, got_w: u32, got_h: u32, want_w: u32, want_h: u32 },
}

/// A decoded, tightly packed RGBA8 texture at its native size.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PixelTexture {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
    pub color_space: ColorSpace,
    pub alpha: AlphaMode,
}

impl PixelTexture {
    /// Wraps raw RGBA8 bytes after validating size and length.
    pub fn from_rgba(
        width: u32,
        height: u32,
        rgba: Vec<u8>,
        color_space: ColorSpace,
        alpha: AlphaMode,
    ) -> Result<Self, PixelError> {
        if width == 0 || height == 0 || width > MAX_TEXTURE_EDGE || height > MAX_TEXTURE_EDGE {
            return Err(PixelError::Dimensions { width, height });
        }
        let expected = width as usize * height as usize * 4;
        if rgba.len() != expected {
            return Err(PixelError::Length { width, height, got: rgba.len(), expected });
        }
        Ok(Self { width, height, rgba, color_space, alpha })
    }

    /// Decodes PNG bytes losslessly. Grey and RGB layouts are expanded exactly (opaque alpha);
    /// 16-bit and float layouts are rejected because narrowing them would not be lossless.
    pub fn decode_png(
        bytes: &[u8],
        color_space: ColorSpace,
        alpha: AlphaMode,
    ) -> Result<Self, PixelError> {
        let mut reader = image::ImageReader::new(Cursor::new(bytes));
        reader.set_format(image::ImageFormat::Png);
        let decoded = reader.decode().map_err(|e| PixelError::Png(e.to_string()))?;
        let (width, height) = (decoded.width(), decoded.height());
        let rgba = match decoded {
            image::DynamicImage::ImageRgba8(img) => img.into_raw(),
            image::DynamicImage::ImageRgb8(img) => {
                let mut out = Vec::with_capacity(img.as_raw().len() / 3 * 4);
                for p in img.as_raw().chunks_exact(3) {
                    out.extend_from_slice(&[p[0], p[1], p[2], 255]);
                }
                out
            },
            image::DynamicImage::ImageLuma8(img) => {
                let mut out = Vec::with_capacity(img.as_raw().len() * 4);
                for &l in img.as_raw() {
                    out.extend_from_slice(&[l, l, l, 255]);
                }
                out
            },
            image::DynamicImage::ImageLumaA8(img) => {
                let mut out = Vec::with_capacity(img.as_raw().len() * 2);
                for p in img.as_raw().chunks_exact(2) {
                    out.extend_from_slice(&[p[0], p[0], p[0], p[1]]);
                }
                out
            },
            other => return Err(PixelError::UnsupportedLayout(format!("{:?}", other.color()))),
        };
        Self::from_rgba(width, height, rgba, color_space, alpha)
    }

    /// Returns the texel at `(x, y)`.
    pub fn texel(&self, x: u32, y: u32) -> [u8; 4] {
        let i = (y as usize * self.width as usize + x as usize) * 4;
        [self.rgba[i], self.rgba[i + 1], self.rgba[i + 2], self.rgba[i + 3]]
    }

    /// GPU format matching the declared color space.
    pub fn wgpu_format(&self) -> wgpu::TextureFormat {
        match self.color_space {
            ColorSpace::Srgb => wgpu::TextureFormat::Rgba8UnormSrgb,
            ColorSpace::Linear => wgpu::TextureFormat::Rgba8Unorm,
        }
    }

    /// Uploads the texture with a single mip level at its native size.
    pub fn upload(&self, device: &wgpu::Device, queue: &wgpu::Queue) -> wgpu::Texture {
        use wgpu::util::DeviceExt;
        device.create_texture_with_data(
            queue,
            &wgpu::TextureDescriptor {
                label: Some("pixel_perfect_texture"),
                size: wgpu::Extent3d {
                    width: self.width,
                    height: self.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: self.wgpu_format(),
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            },
            wgpu::util::TextureDataOrder::LayerMajor,
            &self.rgba,
        )
    }

    /// Converts straight alpha into premultiplied alpha (round to nearest).
    pub fn premultiplied(&self) -> Self {
        if self.alpha == AlphaMode::Premultiplied {
            return self.clone();
        }
        let mut rgba = self.rgba.clone();
        for p in rgba.chunks_exact_mut(4) {
            let a = u32::from(p[3]);
            for c in &mut p[..3] {
                *c = ((u32::from(*c) * a + 127) / 255) as u8;
            }
        }
        Self { rgba, alpha: AlphaMode::Premultiplied, ..self.clone() }
    }
}

/// Sampler of the contract: nearest, no mip, clamp to edge.
pub fn nearest_sampler_descriptor() -> wgpu::SamplerDescriptor<'static> {
    wgpu::SamplerDescriptor {
        label: Some("pixel_perfect_nearest"),
        address_mode_u: wgpu::AddressMode::ClampToEdge,
        address_mode_v: wgpu::AddressMode::ClampToEdge,
        address_mode_w: wgpu::AddressMode::ClampToEdge,
        mag_filter: wgpu::FilterMode::Nearest,
        min_filter: wgpu::FilterMode::Nearest,
        mipmap_filter: wgpu::MipmapFilterMode::Nearest,
        lod_min_clamp: 0.0,
        lod_max_clamp: 0.0,
        ..Default::default()
    }
}

/// Blend state for the declared alpha mode.
pub fn blend_state(alpha: AlphaMode) -> wgpu::BlendState {
    match alpha {
        AlphaMode::Straight => wgpu::BlendState::ALPHA_BLENDING,
        AlphaMode::Premultiplied => wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING,
    }
}

/// UV of the center of texel `(x, y)`: sampling there never depends on filtering or rounding.
pub fn texel_center_uv(x: u32, y: u32, width: u32, height: u32) -> [f32; 2] {
    [(x as f32 + 0.5) / width as f32, (y as f32 + 0.5) / height as f32]
}

/// Integer scale framing, in physical pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PixelBox {
    /// Integer magnification of the texture (>= 1).
    pub scale: u32,
    /// Drawn size in physical pixels (`texture * scale`).
    pub width: u32,
    pub height: u32,
    /// Top-left origin in physical pixels, centered in the box and snapped to the grid. Negative
    /// when the texture overflows the box at 1:1.
    pub x: i32,
    pub y: i32,
    /// The texture does not fit at 1:1.
    pub overflow: bool,
}

/// Fits a `tex_w x tex_h` texture into a `box_w x box_h` CSS-pixel box at the largest integer
/// scale of the physical pixel grid (`dpr` device pixels per CSS pixel), never below 1:1.
/// `max_scale` (0 = unbounded) caps the magnification.
pub fn pixel_perfect_box(
    tex_w: u32,
    tex_h: u32,
    box_w: f32,
    box_h: f32,
    dpr: f32,
    max_scale: u32,
) -> PixelBox {
    let dpr = if dpr.is_finite() && dpr > 0.0 { dpr } else { 1.0 };
    let phys_w = (box_w.max(0.0) * dpr).floor() as u64;
    let phys_h = (box_h.max(0.0) * dpr).floor() as u64;
    let (tw, th) = (u64::from(tex_w.max(1)), u64::from(tex_h.max(1)));
    let fit = (phys_w / tw).min(phys_h / th);
    let overflow = fit == 0;
    let mut scale = fit.max(1);
    if max_scale > 0 {
        scale = scale.min(u64::from(max_scale));
    }
    let (w, h) = (tw * scale, th * scale);
    let x = (phys_w as i64 - w as i64).div_euclid(2);
    let y = (phys_h as i64 - h as i64).div_euclid(2);
    PixelBox {
        scale: scale as u32,
        width: w as u32,
        height: h as u32,
        x: x as i32,
        y: y as i32,
        overflow,
    }
}

/// Snaps a 2D sprite position to the nearest whole pixel (no sub-pixel placement).
pub fn snap_sprite_position(x: f32, y: f32) -> (i32, i32) {
    (x.round() as i32, y.round() as i32)
}

/// Clip-space rectangle `[x0, y0, x1, y1]` of a pixel-aligned rectangle in a `vw x vh` viewport
/// (origin top-left, y down). Edges land exactly on pixel boundaries.
pub fn pixel_rect_to_clip(x: i32, y: i32, w: u32, h: u32, vw: u32, vh: u32) -> [f32; 4] {
    let fx = |px: f64| (2.0 * px / f64::from(vw) - 1.0) as f32;
    let fy = |py: f64| (1.0 - 2.0 * py / f64::from(vh)) as f32;
    [
        fx(f64::from(x)),
        fy(f64::from(y)),
        fx(f64::from(x) + f64::from(w)),
        fy(f64::from(y) + f64::from(h)),
    ]
}

/// Orthographic projection mapping pixel coordinates (top-left origin, y down) of a `vw x vh`
/// viewport to clip space, with no offset: integer pixel coordinates are pixel edges.
pub fn snapped_ortho(vw: u32, vh: u32) -> glam::Mat4 {
    glam::Mat4::orthographic_rh(0.0, vw as f32, vh as f32, 0.0, -1.0, 1.0)
}

/// RGBA8 software framebuffer: the reference the GPU output is compared against.
///
/// Blending happens on the stored bytes (no linearization), rounded to nearest. It is exact for
/// alpha 0 and 255, which is what golden comparisons with the GPU use.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Framebuffer {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

impl Framebuffer {
    /// Transparent black framebuffer.
    pub fn new(width: u32, height: u32) -> Self {
        Self { width, height, rgba: vec![0; width as usize * height as usize * 4] }
    }

    /// Draws `tex` at whole-pixel `(x, y)` magnified by the integer `scale`, nearest sampled at
    /// destination pixel centers (clipped to the framebuffer).
    pub fn draw_sprite(&mut self, tex: &PixelTexture, x: i32, y: i32, scale: u32) {
        let scale = scale.max(1);
        for dy in 0..tex.height * scale {
            let py = i64::from(y) + i64::from(dy);
            if py < 0 || py >= i64::from(self.height) {
                continue;
            }
            for dx in 0..tex.width * scale {
                let px = i64::from(x) + i64::from(dx);
                if px < 0 || px >= i64::from(self.width) {
                    continue;
                }
                let src = tex.texel(dx / scale, dy / scale);
                let i = (py as usize * self.width as usize + px as usize) * 4;
                let dst = [self.rgba[i], self.rgba[i + 1], self.rgba[i + 2], self.rgba[i + 3]];
                self.rgba[i..i + 4].copy_from_slice(&blend(src, dst, tex.alpha));
            }
        }
    }
}

fn blend(src: [u8; 4], dst: [u8; 4], mode: AlphaMode) -> [u8; 4] {
    let a = u32::from(src[3]);
    let inv = 255 - a;
    let mut out = [0u8; 4];
    for c in 0..3 {
        let s = u32::from(src[c]);
        let d = u32::from(dst[c]);
        out[c] = match mode {
            AlphaMode::Straight => (s * a + d * inv + 127) / 255,
            AlphaMode::Premultiplied => s + (d * inv + 127) / 255,
        }
        .min(255) as u8;
    }
    out[3] = (a + (u32::from(dst[3]) * inv + 127) / 255).min(255) as u8;
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Deterministic synthetic pattern, distinct on every texel.
    pub(crate) fn synthetic(w: u32, h: u32, alpha: u8) -> PixelTexture {
        let mut rgba = Vec::new();
        for y in 0..h {
            for x in 0..w {
                rgba.extend_from_slice(&[
                    (x * 37 + y * 11) as u8,
                    (x * 5 + y * 71 + 3) as u8,
                    ((x * 13) ^ (y * 29)) as u8,
                    alpha,
                ]);
            }
        }
        PixelTexture::from_rgba(w, h, rgba, ColorSpace::Srgb, AlphaMode::Straight).unwrap()
    }

    pub(crate) fn encode_png(t: &PixelTexture) -> Vec<u8> {
        let mut out = Vec::new();
        let img = image::RgbaImage::from_raw(t.width, t.height, t.rgba.clone()).unwrap();
        img.write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png).unwrap();
        out
    }

    #[test]
    fn png_roundtrip_is_byte_exact_at_native_size() {
        let t = synthetic(7, 5, 200);
        let d = PixelTexture::decode_png(&encode_png(&t), ColorSpace::Srgb, AlphaMode::Straight)
            .unwrap();
        assert_eq!((d.width, d.height), (7, 5));
        assert_eq!(d.rgba, t.rgba);
    }

    #[test]
    fn rgb_and_grey_expand_exactly_and_16bit_is_rejected() {
        let mut out = Vec::new();
        image::RgbImage::from_raw(1, 1, vec![9, 8, 7])
            .unwrap()
            .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
            .unwrap();
        let d = PixelTexture::decode_png(&out, ColorSpace::Linear, AlphaMode::Straight).unwrap();
        assert_eq!(d.rgba, vec![9, 8, 7, 255]);
        assert_eq!(d.wgpu_format(), wgpu::TextureFormat::Rgba8Unorm);

        let mut out16 = Vec::new();
        image::ImageBuffer::<image::Rgba<u16>, _>::from_raw(1, 1, vec![1u16, 2, 3, 4])
            .unwrap()
            .write_to(&mut Cursor::new(&mut out16), image::ImageFormat::Png)
            .unwrap();
        assert!(matches!(
            PixelTexture::decode_png(&out16, ColorSpace::Srgb, AlphaMode::Straight),
            Err(PixelError::UnsupportedLayout(_))
        ));
        assert!(matches!(
            PixelTexture::decode_png(b"nope", ColorSpace::Srgb, AlphaMode::Straight),
            Err(PixelError::Png(_))
        ));
    }

    #[test]
    fn sampler_and_format_contract() {
        let s = nearest_sampler_descriptor();
        assert_eq!(s.mag_filter, wgpu::FilterMode::Nearest);
        assert_eq!(s.min_filter, wgpu::FilterMode::Nearest);
        assert_eq!(s.address_mode_u, wgpu::AddressMode::ClampToEdge);
        assert_eq!(s.address_mode_v, wgpu::AddressMode::ClampToEdge);
        assert_eq!(s.lod_max_clamp, 0.0);
        assert_eq!(synthetic(1, 1, 255).wgpu_format(), wgpu::TextureFormat::Rgba8UnormSrgb);
        assert_eq!(blend_state(AlphaMode::Straight), wgpu::BlendState::ALPHA_BLENDING);
        assert_eq!(
            blend_state(AlphaMode::Premultiplied),
            wgpu::BlendState::PREMULTIPLIED_ALPHA_BLENDING
        );
        assert_eq!(texel_center_uv(0, 0, 2, 4), [0.25, 0.125]);
    }

    #[test]
    fn integer_scale_framing_uses_dpr_and_grid() {
        // 100x60 CSS box at dpr 2 = 200x120 physical; 16x16 fits 7x (112 <= 120).
        let b = pixel_perfect_box(16, 16, 100.0, 60.0, 2.0, 0);
        assert_eq!((b.scale, b.width, b.height), (7, 112, 112));
        assert_eq!((b.x, b.y), (44, 4));
        assert!(!b.overflow);
        // Cap.
        assert_eq!(pixel_perfect_box(16, 16, 100.0, 60.0, 2.0, 3).scale, 3);
        // Overflow stays 1:1 and centers with a negative origin.
        let o = pixel_perfect_box(64, 64, 10.0, 10.0, 1.0, 0);
        assert!(o.overflow);
        assert_eq!((o.scale, o.x, o.y), (1, -27, -27));
        // Invalid dpr falls back to 1.
        assert_eq!(pixel_perfect_box(4, 4, 8.0, 8.0, f32::NAN, 0).scale, 2);
        assert_eq!(snap_sprite_position(3.4, -1.6), (3, -2));
    }

    #[test]
    fn clip_rect_edges_are_pixel_boundaries() {
        let r = pixel_rect_to_clip(2, 1, 4, 2, 8, 4);
        assert_eq!(r, [-0.5, 0.5, 0.5, -0.5]);
        let m = snapped_ortho(8, 4);
        let p = m * glam::Vec4::new(2.0, 1.0, 0.0, 1.0);
        assert!((p.x + 0.5).abs() < 1e-6 && (p.y - 0.5).abs() < 1e-6);
    }

    #[test]
    fn sprite_golden_matches_independent_expectation() {
        let tex = synthetic(5, 3, 255);
        let (scale, ox, oy) = (3u32, 2i32, 1i32);
        let mut fb = Framebuffer::new(24, 14);
        fb.draw_sprite(&tex, ox, oy, scale);

        // Expected built per destination pixel straight from the formula, not from draw_sprite.
        let mut expected = vec![0u8; 24 * 14 * 4];
        for py in 0..14i32 {
            for px in 0..24i32 {
                let (sx, sy) = (px - ox, py - oy);
                if sx >= 0 && sy >= 0 && sx < (5 * scale) as i32 && sy < (3 * scale) as i32 {
                    let t = tex.texel(sx as u32 / scale, sy as u32 / scale);
                    let i = (py as usize * 24 + px as usize) * 4;
                    expected[i..i + 4].copy_from_slice(&t);
                }
            }
        }
        assert_eq!(fb.rgba, expected);
    }

    #[test]
    fn alpha_modes_blend_as_declared() {
        let straight = PixelTexture::from_rgba(
            1,
            1,
            vec![200, 100, 0, 128],
            ColorSpace::Linear,
            AlphaMode::Straight,
        )
        .unwrap();
        let mut fb = Framebuffer::new(1, 1);
        fb.rgba = vec![0, 100, 255, 255];
        fb.draw_sprite(&straight, 0, 0, 1);
        // (200*128 + 0*127 + 127)/255 = 100 ; (100*128+100*127+127)/255 = 100 ; (0+255*127+127)/255 = 127
        assert_eq!(fb.rgba, vec![100, 100, 127, 255]);

        let pre = straight.premultiplied();
        assert_eq!(pre.alpha, AlphaMode::Premultiplied);
        assert_eq!(pre.rgba, vec![100, 50, 0, 128]);
        let mut fb2 = Framebuffer::new(1, 1);
        fb2.rgba = vec![0, 100, 255, 255];
        fb2.draw_sprite(&pre, 0, 0, 1);
        // 100+0 ; 50+(100*127+127)/255=50+50 ; 0+(255*127+127)/255=127
        assert_eq!(fb2.rgba, vec![100, 100, 127, 255]);
    }

    #[test]
    fn rejects_bad_sizes() {
        assert!(matches!(
            PixelTexture::from_rgba(0, 1, vec![], ColorSpace::Srgb, AlphaMode::Straight),
            Err(PixelError::Dimensions { .. })
        ));
        assert!(matches!(
            PixelTexture::from_rgba(1, 1, vec![0; 3], ColorSpace::Srgb, AlphaMode::Straight),
            Err(PixelError::Length { .. })
        ));
    }
}
