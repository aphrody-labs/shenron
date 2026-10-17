// SPDX-License-Identifier: Apache-2.0

//! Export of a detected panel as PNG, SVG and animated GIF.

use std::io::Cursor;

use base64::{Engine as _, engine::general_purpose::STANDARD};
use image::{
    Delay, DynamicImage, Frame, ImageFormat, RgbaImage,
    codecs::gif::{GifEncoder, Repeat},
    imageops::{self, FilterType},
};

use crate::segment::PanelRect;

/// Errors of the export functions.
#[derive(Debug, thiserror::Error)]
pub enum ExportError {
    /// The page pixels do not match `width × height × 4`.
    #[error("page pixels do not match {width} × {height} × 4")]
    BadPage {
        /// Declared width.
        width: u32,
        /// Declared height.
        height: u32,
    },
    /// The panel has no pixel once clamped to the page.
    #[error("the panel is empty once clamped to the page")]
    EmptyPanel,
    /// A sheet needs at least one panel.
    #[error("a sheet needs at least one panel")]
    NoPanels,
    /// The sheet tile or grid is degenerate (zero side) or exceeds the image limits.
    #[error("invalid sheet geometry: {0}")]
    BadSheet(String),
    /// Image encoding failed.
    #[error("image encoding failed: {0}")]
    Encode(#[from] image::ImageError),
}

/// A panel cropped from its page.
#[derive(Clone, Debug)]
pub struct Panel {
    /// Cropped pixels.
    pub image: RgbaImage,
    /// Where it sits on the page, in page uv.
    pub rect: PanelRect,
}

impl Panel {
    /// PNG bytes of the crop.
    ///
    /// # Errors
    /// Fails when the PNG encoder does.
    pub fn png(&self) -> Result<Vec<u8>, ExportError> {
        let mut out = Cursor::new(Vec::new());
        self.image.write_to(&mut out, ImageFormat::Png)?;
        Ok(out.into_inner())
    }
}

fn page_image(rgba: &[u8], width: u32, height: u32) -> Result<RgbaImage, ExportError> {
    if width == 0 || height == 0 || rgba.len() != (width as usize) * (height as usize) * 4 {
        return Err(ExportError::BadPage { width, height });
    }
    RgbaImage::from_raw(width, height, rgba.to_vec()).ok_or(ExportError::BadPage { width, height })
}

/// Crops `rect` out of the page, with `margin` (a fraction of the panel size, e.g. 0.01) added
/// on every side and clamped to the page.
///
/// # Errors
/// Fails when the page buffer is inconsistent or the panel clamps to nothing.
pub fn crop_panel(
    rgba: &[u8],
    width: u32,
    height: u32,
    rect: PanelRect,
    margin: f32,
) -> Result<Panel, ExportError> {
    let page = page_image(rgba, width, height)?;
    let (mx, my) = (rect.w * margin, rect.h * margin);
    let x0 = ((rect.x - mx).max(0.0) * width as f32).floor() as u32;
    let y0 = ((rect.y - my).max(0.0) * height as f32).floor() as u32;
    let x1 = (((rect.x + rect.w + mx).min(1.0)) * width as f32).ceil() as u32;
    let y1 = (((rect.y + rect.h + my).min(1.0)) * height as f32).ceil() as u32;
    let (x1, y1) = (x1.min(width), y1.min(height));
    if x1 <= x0 || y1 <= y0 {
        return Err(ExportError::EmptyPanel);
    }
    let image = imageops::crop_imm(&page, x0, y0, x1 - x0, y1 - y0).to_image();
    Ok(Panel {
        image,
        rect: PanelRect {
            x: x0 as f32 / width as f32,
            y: y0 as f32 / height as f32,
            w: (x1 - x0) as f32 / width as f32,
            h: (y1 - y0) as f32 / height as f32,
        },
    })
}

/// JPEG data URI (quality 90): a scan is a photograph of ink on paper, and the same panel weighs
/// about a tenth of its PNG, which keeps an SVG shareable.
fn image_data_uri(image: &RgbaImage) -> Result<String, ExportError> {
    let rgb = DynamicImage::ImageRgba8(image.clone()).to_rgb8();
    let mut out = Cursor::new(Vec::new());
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 90).encode_image(&rgb)?;
    Ok(format!("data:image/jpeg;base64,{}", STANDARD.encode(out.into_inner())))
}

/// An SVG of one panel: a vector frame (ink border, hard drop shadow, clip) around the embedded
/// scan crop. The scan pixels are embedded, not traced.
///
/// `title` becomes the accessible name (`<title>`), XML-escaped. `max_side` caps the longer side
/// of the embedded raster (the frame scales with it; `0` keeps the original size): a 1700 px
/// panel base64-embedded weighs several MB, and an SVG is meant to scale, not to archive.
///
/// # Errors
/// Fails when the PNG encoder does.
pub fn panel_svg(panel: &Panel, title: &str, max_side: u32) -> Result<String, ExportError> {
    let scaled;
    let image = if max_side == 0 {
        &panel.image
    } else {
        scaled = fit(&panel.image, max_side);
        &scaled
    };
    let (w, h) = image.dimensions();
    let border = (w.max(h) as f32 * 0.008).max(2.0);
    let shadow = border * 2.5;
    let pad = border / 2.0;
    let uri = image_data_uri(image)?;
    let total_w = w as f32 + shadow + border;
    let total_h = h as f32 + shadow + border;
    Ok(format!(
        concat!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" "#,
            r#"viewBox="0 0 {tw:.1} {th:.1}" width="{tw:.0}" height="{th:.0}" role="img" aria-labelledby="t">"#,
            "<title id=\"t\">{title}</title>",
            r#"<defs><clipPath id="c"><rect x="{pad:.1}" y="{pad:.1}" width="{w}" height="{h}"/></clipPath></defs>"#,
            r##"<rect x="{sx:.1}" y="{sy:.1}" width="{w}" height="{h}" fill="#000" opacity=".55"/>"##,
            r##"<g clip-path="url(#c)"><image x="{pad:.1}" y="{pad:.1}" width="{w}" height="{h}" "##,
            r#"preserveAspectRatio="none" xlink:href="{uri}" href="{uri}"/></g>"#,
            r##"<rect x="{pad:.1}" y="{pad:.1}" width="{w}" height="{h}" fill="none" stroke="#050508" "##,
            r#"stroke-width="{border:.1}" stroke-linejoin="miter"/>"#,
            "</svg>"
        ),
        tw = total_w,
        th = total_h,
        title = xml_escape(title),
        pad = pad,
        w = w,
        h = h,
        sx = pad + shadow,
        sy = pad + shadow,
        uri = uri,
        border = border,
    ))
}

/// An SVG layout map of the page (`koma-wari`): the page outline and every panel as a numbered
/// vector rectangle, in reading order. Pure vector, no scan pixels.
#[must_use]
pub fn page_layout_svg(
    panels: &[PanelRect],
    page_width: u32,
    page_height: u32,
    title: &str,
) -> String {
    let (w, h) = (page_width as f32, page_height as f32);
    let stroke = (w.max(h) * 0.004).max(1.5);
    let font = (w.min(h) * 0.06).max(12.0);
    let mut body = String::new();
    for (i, p) in panels.iter().enumerate() {
        let (x, y, pw, ph) = (p.x * w, p.y * h, p.w * w, p.h * h);
        body.push_str(&format!(
            concat!(
                r##"<g><rect x="{x:.1}" y="{y:.1}" width="{pw:.1}" height="{ph:.1}" fill="#efe9d8" "##,
                r##"stroke="#050508" stroke-width="{s:.1}"/>"##,
                r##"<text x="{cx:.1}" y="{cy:.1}" font-size="{f:.0}" text-anchor="middle" "##,
                r##"dominant-baseline="central" fill="#050508" font-family="sans-serif" "##,
                r#"font-weight="700">{n}</text></g>"#
            ),
            x = x,
            y = y,
            pw = pw,
            ph = ph,
            s = stroke,
            cx = x + pw / 2.0,
            cy = y + ph / 2.0,
            f = font.min(pw.min(ph) * 0.5),
            n = i + 1,
        ));
    }
    format!(
        concat!(
            r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0} {h:.0}" width="{w:.0}" "##,
            r##"height="{h:.0}" role="img" aria-labelledby="t"><title id="t">{title}</title>"##,
            r##"<rect width="{w:.0}" height="{h:.0}" fill="#fff" stroke="#050508" stroke-width="{s:.1}"/>"##,
            "{body}</svg>"
        ),
        w = w,
        h = h,
        s = stroke,
        title = xml_escape(title),
        body = body,
    )
}

fn xml_escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

/// Tuning of the GIF exporters.
#[derive(Clone, Copy, Debug)]
pub struct GifOptions {
    /// Longer side of every frame, in pixels (GIF is 256 colours: keep it modest).
    pub max_side: u32,
    /// Number of frames of a Ken Burns clip.
    pub frames: u32,
    /// Delay of a frame in milliseconds.
    pub frame_ms: u32,
    /// Zoom reached at the end of a Ken Burns clip (`1.0` = none).
    pub zoom: f32,
    /// Hold time of each panel of a reveal, in frames.
    pub hold_frames: u32,
}

impl Default for GifOptions {
    fn default() -> Self {
        Self { max_side: 480, frames: 24, frame_ms: 50, zoom: 1.18, hold_frames: 14 }
    }
}

fn encode_gif(frames: Vec<RgbaImage>, delays_ms: &[u32]) -> Result<Vec<u8>, ExportError> {
    let mut out = Vec::new();
    {
        let mut encoder = GifEncoder::new_with_speed(&mut out, 10);
        encoder.set_repeat(Repeat::Infinite)?;
        for (image, &ms) in frames.into_iter().zip(delays_ms) {
            encoder.encode_frame(Frame::from_parts(
                image,
                0,
                0,
                Delay::from_numer_denom_ms(ms, 1),
            ))?;
        }
    }
    Ok(out)
}

fn fit(image: &RgbaImage, max_side: u32) -> RgbaImage {
    let (w, h) = image.dimensions();
    let longer = w.max(h);
    if longer <= max_side {
        return image.clone();
    }
    let scale = max_side as f32 / longer as f32;
    imageops::resize(
        image,
        ((w as f32 * scale).round() as u32).max(1),
        ((h as f32 * scale).round() as u32).max(1),
        FilterType::Lanczos3,
    )
}

/// An animated GIF of one panel: a slow push-in (Ken Burns) towards its centre, then back, so
/// the loop has no jump. Frames are cropped windows of the full-resolution panel, resampled.
///
/// # Errors
/// Fails when GIF encoding does.
pub fn ken_burns_gif(panel: &Panel, options: &GifOptions) -> Result<Vec<u8>, ExportError> {
    let source = &panel.image;
    let (w, h) = source.dimensions();
    let base = fit(source, options.max_side);
    let (ow, oh) = base.dimensions();
    let frames = options.frames.max(2);
    let mut out = Vec::with_capacity(frames as usize);
    for i in 0..frames {
        // Triangle wave 0 → 1 → 0 over the loop, eased.
        let t = 1.0 - ((i as f32 / frames as f32) * 2.0 - 1.0).abs();
        let eased = t * t * (3.0 - 2.0 * t);
        let zoom = 1.0 + (options.zoom - 1.0).max(0.0) * eased;
        let (cw, ch) =
            (((w as f32 / zoom).round() as u32).max(1), ((h as f32 / zoom).round() as u32).max(1));
        let (cx, cy) = ((w - cw) / 2, (h - ch) / 2);
        let window = imageops::crop_imm(source, cx, cy, cw, ch).to_image();
        out.push(imageops::resize(&window, ow, oh, FilterType::Triangle));
    }
    encode_gif(out, &vec![options.frame_ms; frames as usize])
}

/// An animated GIF revealing the page panel by panel in reading order: the dimmed page, then
/// each panel lit in turn (the others stay dimmed), and a last frame with the whole page.
///
/// # Errors
/// Fails when the page buffer is inconsistent or GIF encoding does.
pub fn reveal_gif(
    rgba: &[u8],
    width: u32,
    height: u32,
    panels: &[PanelRect],
    options: &GifOptions,
) -> Result<Vec<u8>, ExportError> {
    let page = page_image(rgba, width, height)?;
    let page = DynamicImage::ImageRgba8(page).to_rgba8();
    let scaled = fit(&page, options.max_side);
    let (sw, sh) = scaled.dimensions();
    let dim = |image: &RgbaImage| -> RgbaImage {
        let mut out = image.clone();
        for px in out.pixels_mut() {
            for c in 0..3 {
                px.0[c] = (u16::from(px.0[c]) * 35 / 100) as u8;
            }
        }
        out
    };
    let dimmed = dim(&scaled);
    let mut frames = vec![dimmed.clone()];
    let mut delays = vec![options.frame_ms * 6];
    for p in panels {
        let (x0, y0) = ((p.x * sw as f32).floor() as u32, (p.y * sh as f32).floor() as u32);
        let (x1, y1) = (
            (((p.x + p.w) * sw as f32).ceil() as u32).min(sw),
            (((p.y + p.h) * sh as f32).ceil() as u32).min(sh),
        );
        if x1 <= x0 || y1 <= y0 {
            continue;
        }
        let mut frame = dimmed.clone();
        let lit = imageops::crop_imm(&scaled, x0, y0, x1 - x0, y1 - y0).to_image();
        imageops::replace(&mut frame, &lit, i64::from(x0), i64::from(y0));
        frames.push(frame);
        delays.push(options.frame_ms * options.hold_frames.max(1));
    }
    frames.push(scaled);
    delays.push(options.frame_ms * 24);
    encode_gif(frames, &delays)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page(width: u32, height: u32) -> Vec<u8> {
        let mut rgba = vec![255_u8; (width * height * 4) as usize];
        // Two black panels on a white page: a wide one and a narrow one.
        for (x0, y0, x1, y1) in [(10, 10, 190, 120), (10, 140, 90, 290)] {
            for y in y0..y1 {
                for x in x0..x1 {
                    let i = ((y * width + x) * 4) as usize;
                    rgba[i..i + 3].copy_from_slice(&[30, 30, 30]);
                }
            }
        }
        rgba
    }

    // Exact in pixels on a 200 × 300 page: x 10, y 10, 180 × 110.
    const RECT: PanelRect = PanelRect { x: 0.05, y: 10.0 / 300.0, w: 0.9, h: 110.0 / 300.0 };

    #[test]
    fn a_crop_has_the_panel_size_plus_margin_and_clamps_to_the_page() {
        let rgba = page(200, 300);
        let panel = crop_panel(&rgba, 200, 300, RECT, 0.0).expect("crop");
        assert_eq!(panel.image.dimensions(), (180, 110));
        let bigger = crop_panel(&rgba, 200, 300, RECT, 0.5).expect("crop");
        assert!(bigger.image.width() > panel.image.width());
        assert!(bigger.rect.x >= 0.0 && bigger.rect.x + bigger.rect.w <= 1.0 + 1e-6);
        assert!(
            crop_panel(&rgba, 200, 300, PanelRect { x: 0.5, y: 0.5, w: 0.0, h: 0.0 }, 0.0).is_err()
        );
        assert!(matches!(
            crop_panel(&rgba[..10], 200, 300, RECT, 0.0),
            Err(ExportError::BadPage { .. })
        ));
    }

    #[test]
    fn the_png_is_a_png() {
        let panel = crop_panel(&page(200, 300), 200, 300, RECT, 0.0).expect("crop");
        assert_eq!(&panel.png().expect("png")[..8], b"\x89PNG\r\n\x1a\n");
    }

    #[test]
    fn the_panel_svg_frames_the_scan_and_escapes_its_title() {
        let panel = crop_panel(&page(200, 300), 200, 300, RECT, 0.0).expect("crop");
        let svg = panel_svg(&panel, "Chapitre 516 <p.1> & \"case\" 2", 0).expect("svg");
        assert!(svg.starts_with("<svg "));
        assert!(svg.contains("data:image/jpeg;base64,"));
        assert!(svg.contains("clip-path=\"url(#c)\""));
        assert!(svg.contains("Chapitre 516 &lt;p.1&gt; &amp; &quot;case&quot; 2"));
        assert!(svg.contains("role=\"img\"") && svg.ends_with("</svg>"));
        // Well-formed enough: every opened tag family is closed.
        assert_eq!(svg.matches("<g ").count(), svg.matches("</g>").count());
    }

    #[test]
    fn the_svg_raster_is_capped_by_max_side() {
        let panel = crop_panel(&page(200, 300), 200, 300, RECT, 0.0).expect("crop");
        let full = panel_svg(&panel, "t", 0).expect("svg");
        let small = panel_svg(&panel, "t", 60).expect("svg");
        assert!(full.contains("width=\"180\" height=\"110\""));
        assert!(
            small.contains("width=\"60\" height=\"37\"")
                || small.contains("width=\"60\" height=\"36\"")
        );
        assert!(small.len() < full.len());
    }

    #[test]
    fn the_layout_svg_numbers_the_panels_in_order() {
        let panels = [RECT, PanelRect { x: 0.05, y: 0.46, w: 0.4, h: 0.5 }];
        let svg = page_layout_svg(&panels, 200, 300, "Plan");
        assert!(svg.contains(">1</text>") && svg.contains(">2</text>"));
        assert_eq!(svg.matches("<rect").count(), 3);
        assert!(!svg.contains("<image"), "pure vector: no scan pixels");
    }

    fn is_gif(bytes: &[u8]) -> bool {
        bytes.starts_with(b"GIF89a") || bytes.starts_with(b"GIF87a")
    }

    #[test]
    fn the_ken_burns_gif_loops_with_the_asked_frames() {
        let panel = crop_panel(&page(200, 300), 200, 300, RECT, 0.0).expect("crop");
        let options = GifOptions { frames: 6, max_side: 64, ..GifOptions::default() };
        let bytes = ken_burns_gif(&panel, &options).expect("gif");
        assert!(is_gif(&bytes));
        let decoder = image::codecs::gif::GifDecoder::new(Cursor::new(&bytes)).expect("decode");
        use image::AnimationDecoder as _;
        assert_eq!(decoder.into_frames().count(), 6);
    }

    #[test]
    fn the_reveal_gif_has_a_frame_per_panel_plus_dimmed_and_full() {
        let rgba = page(200, 300);
        let panels = [RECT, PanelRect { x: 0.05, y: 0.46, w: 0.4, h: 0.5 }];
        let bytes = reveal_gif(
            &rgba,
            200,
            300,
            &panels,
            &GifOptions { max_side: 64, ..GifOptions::default() },
        )
        .expect("gif");
        assert!(is_gif(&bytes));
        let decoder = image::codecs::gif::GifDecoder::new(Cursor::new(&bytes)).expect("decode");
        use image::AnimationDecoder as _;
        assert_eq!(decoder.into_frames().count(), 2 + panels.len());
    }
}
