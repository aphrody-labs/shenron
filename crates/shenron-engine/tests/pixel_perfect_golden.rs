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

/// GPU golden: skipped (with a message) when the machine has no wgpu adapter; the software
/// reference above is the guaranteed check.
#[test]
fn gpu_headless_matches_software_reference() {
    let Ok(ctx) = pollster::block_on(GpuContext::new_headless()) else {
        eprintln!("no wgpu adapter: GPU golden skipped");
        return;
    };
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
