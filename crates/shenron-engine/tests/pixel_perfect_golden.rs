// SPDX-License-Identifier: Apache-2.0

//! Pixel golden tests. Every texture is synthetic and generated here: no game data, no fixture.
//! The expected bytes come from a per-pixel formula independent of the code under test.

use shenron_engine::render::model_adapter::model_from_json_with_pngs;
use shenron_engine::render::{
    AlphaMode, ColorSpace, Framebuffer, GpuContext, PixelTexture, pixel_perfect_box,
    render_sprite_rgba,
};
use std::io::Cursor;

fn synthetic(w: u32, h: u32, cs: ColorSpace) -> PixelTexture {
    let mut rgba = Vec::new();
    for y in 0..h {
        for x in 0..w {
            rgba.extend_from_slice(&[
                (x * 53 + y * 17 + 9) as u8,
                (x * 7 + y * 91) as u8,
                ((x * 29) ^ (y * 3)) as u8,
                255,
            ]);
        }
    }
    PixelTexture::from_rgba(w, h, rgba, cs, AlphaMode::Straight).unwrap()
}

fn expected(tex: &PixelTexture, x: i32, y: i32, scale: u32, w: u32, h: u32) -> Vec<u8> {
    let mut out = vec![0u8; (w * h * 4) as usize];
    for py in 0..h as i32 {
        for px in 0..w as i32 {
            let (sx, sy) = (px - x, py - y);
            if sx >= 0
                && sy >= 0
                && sx < (tex.width * scale) as i32
                && sy < (tex.height * scale) as i32
            {
                let t = tex.texel(sx as u32 / scale, sy as u32 / scale);
                let i = ((py as u32 * w + px as u32) * 4) as usize;
                out[i..i + 4].copy_from_slice(&t);
            }
        }
    }
    out
}

fn png_bytes(t: &PixelTexture) -> Vec<u8> {
    let mut out = Vec::new();
    image::RgbaImage::from_raw(t.width, t.height, t.rgba.clone())
        .unwrap()
        .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
        .unwrap();
    out
}

#[test]
fn png_to_framebuffer_matches_expected_bytes() {
    let src = synthetic(11, 7, ColorSpace::Srgb);
    let tex =
        PixelTexture::decode_png(&png_bytes(&src), ColorSpace::Srgb, AlphaMode::Straight).unwrap();
    let frame = pixel_perfect_box(tex.width, tex.height, 100.0, 40.0, 1.0, 0);
    assert_eq!(frame.scale, 5);
    let mut fb = Framebuffer::new(100, 40);
    fb.draw_sprite(&tex, frame.x, frame.y, frame.scale);
    assert_eq!(fb.rgba, expected(&tex, frame.x, frame.y, frame.scale, 100, 40));
}

#[test]
fn model_textures_survive_the_adapter_unchanged() {
    let src = synthetic(4, 2, ColorSpace::Srgb);
    let json = r#"{"name":"m","primitives":[],"textures":[{"width":4,"height":2}]}"#;
    let bytes = png_bytes(&src);
    let m =
        model_from_json_with_pngs(json, &[&bytes], ColorSpace::Srgb, AlphaMode::Straight).unwrap();
    assert_eq!(m.textures[0].rgba, src.rgba);
}

/// Headless GPU context, or `None` (with a message) when the machine has no wgpu adapter. With
/// `SHENRON_REQUIRE_GPU=1` (factory CI) a missing adapter fails the test instead of skipping it,
/// so a skip can never pass for a success. The detected adapter is always printed.
fn gpu_or_skip() -> Option<GpuContext> {
    let required = std::env::var("SHENRON_REQUIRE_GPU").is_ok_and(|v| v == "1");
    match pollster::block_on(GpuContext::new_headless()) {
        Ok(ctx) => {
            let info = ctx.adapter.get_info();
            eprintln!(
                "wgpu adapter: {} | backend {:?} | type {:?} | driver {}",
                info.name, info.backend, info.device_type, info.driver
            );
            Some(ctx)
        },
        Err(e) => {
            assert!(!required, "SHENRON_REQUIRE_GPU=1 but no wgpu adapter: {e}");
            eprintln!("no wgpu adapter ({e}): GPU golden skipped");
            None
        },
    }
}

/// GPU golden on opaque and fully transparent pixels: must be byte exact.
#[test]
fn gpu_headless_matches_software_reference() {
    let Some(ctx) = gpu_or_skip() else { return };
    for (cs, scale, x, y) in [
        (ColorSpace::Linear, 3u32, 2i32, 1i32),
        (ColorSpace::Srgb, 4, 5, 3),
        (ColorSpace::Linear, 1, -2, -1),
    ] {
        let tex = synthetic(6, 5, cs);
        let (w, h) = (40u32, 24u32);
        let got = render_sprite_rgba(&ctx.device, &ctx.queue, &tex, x, y, scale, w, h).unwrap();
        assert_eq!(got, expected(&tex, x, y, scale, w, h), "{cs:?} scale {scale}");
    }
}

fn srgb_decode(v: u8) -> f64 {
    let c = f64::from(v) / 255.0;
    if c <= 0.04045 { c / 12.92 } else { ((c + 0.055) / 1.055).powf(2.4) }
}

fn srgb_encode(l: f64) -> u8 {
    let c = if l <= 0.003_130_8 { l * 12.92 } else { 1.055 * l.powf(1.0 / 2.4) - 0.055 };
    (c * 255.0).round().clamp(0.0, 255.0) as u8
}

/// Semi-transparent texture: alpha ramps over 1..=254 (never 0 or 255).
fn translucent(w: u32, h: u32, cs: ColorSpace, alpha: AlphaMode) -> PixelTexture {
    let mut rgba = Vec::new();
    for y in 0..h {
        for x in 0..w {
            let a = (1 + (x * 41 + y * 23) % 254) as u8;
            let c =
                [(x * 53 + y * 17 + 9) as u8, (x * 7 + y * 91) as u8, ((x * 29) ^ (y * 3)) as u8];
            // premultiplied bytes never exceed alpha
            let c = if alpha == AlphaMode::Premultiplied { c.map(|v| v.min(a)) } else { c };
            rgba.extend_from_slice(&[c[0], c[1], c[2], a]);
        }
    }
    PixelTexture::from_rgba(w, h, rgba, cs, alpha).unwrap()
}

/// Independent per-texel expectation for blending onto a transparent target: Linear blends the
/// stored bytes; Srgb blends in linear light (the GPU decodes on sampling and encodes on write).
fn expected_blend(src: [u8; 4], cs: ColorSpace, alpha: AlphaMode) -> [u8; 4] {
    let a = f64::from(src[3]) / 255.0;
    let mut out = [0u8; 4];
    for c in 0..3 {
        out[c] = match (cs, alpha) {
            (ColorSpace::Linear, AlphaMode::Straight) => {
                (f64::from(src[c]) * a).round().clamp(0.0, 255.0) as u8
            },
            (ColorSpace::Srgb, AlphaMode::Straight) => srgb_encode(srgb_decode(src[c]) * a),
            (_, AlphaMode::Premultiplied) => src[c],
        };
    }
    out[3] = src[3];
    out
}

/// Maximum accepted per-channel deviation of the GPU blend from the exact real-number formula.
/// Measured on lavapipe / llvmpipe; see docs/products/dbxv2-rendu-pixel-perfect.md.
const MAX_BLEND_DELTA: i32 = 1;

/// Semi-transparent GPU golden. The blend runs in float on the GPU, so it is compared with the
/// exact formula under a documented one-byte bound; the measured maximum is printed.
#[test]
fn gpu_translucent_blend_within_documented_bound() {
    let Some(ctx) = gpu_or_skip() else { return };
    let (w, h, scale) = (30u32, 20u32, 3u32);
    for cs in [ColorSpace::Linear, ColorSpace::Srgb] {
        for alpha in [AlphaMode::Straight, AlphaMode::Premultiplied] {
            let tex = translucent(6, 5, cs, alpha);
            let got = render_sprite_rgba(&ctx.device, &ctx.queue, &tex, 2, 1, scale, w, h).unwrap();
            let (mut max_delta, mut off_by_one) = (0i32, 0usize);
            for py in 0..h as i32 {
                for px in 0..w as i32 {
                    let (sx, sy) = (px - 2, py - 1);
                    let i = ((py as u32 * w + px as u32) * 4) as usize;
                    let want = if sx >= 0 && sy >= 0 && sx < 18 && sy < 15 {
                        expected_blend(tex.texel(sx as u32 / scale, sy as u32 / scale), cs, alpha)
                    } else {
                        [0; 4]
                    };
                    for c in 0..4 {
                        let d = (i32::from(got[i + c]) - i32::from(want[c])).abs();
                        max_delta = max_delta.max(d);
                        off_by_one += usize::from(d == 1);
                    }
                }
            }
            eprintln!(
                "translucent {cs:?} {alpha:?}: max delta {max_delta}, off-by-one bytes {off_by_one}"
            );
            assert!(max_delta <= MAX_BLEND_DELTA, "{cs:?} {alpha:?}: max delta {max_delta}");
        }
    }
}
