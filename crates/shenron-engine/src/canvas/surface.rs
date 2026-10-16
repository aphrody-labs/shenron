// SPDX-License-Identifier: Apache-2.0

//! 2D Canvas Surface with high-speed rasterization and image export.
//!
//! Serves as both a software rasterizer for headless execution/tests
//! and the staging pipeline for WebGPU hardware canvas rendering.

use super::bubble::SpeechBubble;
use super::path::Path2D;
use super::text::{TextLayout, TextLayoutConfig};
use glam::Vec2;

/// A 2D RGBA color represented as 4 bytes `[r, g, b, a]`.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct ColorRgba(pub [u8; 4]);

impl ColorRgba {
    /// Transparent black.
    pub const TRANSPARENT: Self = Self([0, 0, 0, 0]);
    /// Solid white.
    pub const WHITE: Self = Self([255, 255, 255, 255]);
    /// Solid black.
    pub const BLACK: Self = Self([0, 0, 0, 255]);
    /// Primary Dragon Ball Gold.
    pub const DB_GOLD: Self = Self([255, 184, 0, 255]);
    /// Primary Dragon Ball Orange.
    pub const DB_ORANGE: Self = Self([255, 87, 34, 255]);

    /// Creates an RGBA color.
    #[inline]
    #[must_use]
    pub const fn new(r: u8, g: u8, b: u8, a: u8) -> Self {
        Self([r, g, b, a])
    }
}

/// A 2D Drawing Surface managing pixel buffers and drawing operations.
pub struct CanvasSurface {
    width: u32,
    height: u32,
    pixels: Vec<u8>, // RGBA8888
}

impl CanvasSurface {
    /// Creates a new surface of the given dimensions initialized to transparent black.
    #[must_use]
    pub fn new(width: u32, height: u32) -> Self {
        let size = (width as usize) * (height as usize) * 4;
        Self { width, height, pixels: vec![0; size] }
    }

    /// Surface width.
    #[inline]
    #[must_use]
    pub fn width(&self) -> u32 {
        self.width
    }

    /// Surface height.
    #[inline]
    #[must_use]
    pub fn height(&self) -> u32 {
        self.height
    }

    /// Access raw RGBA pixel slice.
    #[inline]
    #[must_use]
    pub fn pixels(&self) -> &[u8] {
        &self.pixels
    }

    /// Clears the entire canvas to a solid color.
    pub fn clear(&mut self, color: ColorRgba) {
        for chunk in self.pixels.as_chunks_mut::<4>().0 {
            *chunk = color.0;
        }
    }

    /// Sets a single pixel with alpha blending.
    #[inline]
    pub fn set_pixel(&mut self, x: i32, y: i32, color: ColorRgba) {
        if x < 0 || y < 0 || x >= self.width as i32 || y >= self.height as i32 {
            return;
        }
        let idx = ((y as usize * self.width as usize) + x as usize) * 4;
        let src_a = color.0[3] as u32;
        if src_a == 255 {
            self.pixels[idx..idx + 4].copy_from_slice(&color.0);
        } else if src_a > 0 {
            let inv_a = 255 - src_a;
            let dst_r = self.pixels[idx] as u32;
            let dst_g = self.pixels[idx + 1] as u32;
            let dst_b = self.pixels[idx + 2] as u32;

            self.pixels[idx] = ((color.0[0] as u32 * src_a + dst_r * inv_a) / 255) as u8;
            self.pixels[idx + 1] = ((color.0[1] as u32 * src_a + dst_g * inv_a) / 255) as u8;
            self.pixels[idx + 2] = ((color.0[2] as u32 * src_a + dst_b * inv_a) / 255) as u8;
            self.pixels[idx + 3] = (src_a + (self.pixels[idx + 3] as u32 * inv_a) / 255) as u8;
        }
    }

    /// Fills an axis-aligned rectangle.
    pub fn fill_rect(&mut self, min: Vec2, size: Vec2, color: ColorRgba) {
        let x0 = min.x.floor().max(0.0) as i32;
        let y0 = min.y.floor().max(0.0) as i32;
        let x1 = (min.x + size.x).ceil().min(self.width as f32) as i32;
        let y1 = (min.y + size.y).ceil().min(self.height as f32) as i32;

        for y in y0..y1 {
            for x in x0..x1 {
                self.set_pixel(x, y, color);
            }
        }
    }

    /// Draws a line using Bresenham's algorithm.
    pub fn draw_line(&mut self, p0: Vec2, p1: Vec2, color: ColorRgba) {
        let mut x0 = p0.x.round() as i32;
        let mut y0 = p0.y.round() as i32;
        let x1 = p1.x.round() as i32;
        let y1 = p1.y.round() as i32;

        let dx = (x1 - x0).abs();
        let sx = if x0 < x1 { 1 } else { -1 };
        let dy = -(y1 - y0).abs();
        let sy = if y0 < y1 { 1 } else { -1 };
        let mut err = dx + dy;

        loop {
            self.set_pixel(x0, y0, color);
            if x0 == x1 && y0 == y1 {
                break;
            }
            let e2 = 2 * err;
            if e2 >= dy {
                err += dy;
                x0 += sx;
            }
            if e2 <= dx {
                err += dx;
                y0 += sy;
            }
        }
    }

    /// Draws the stroke outline of a 2D vector path.
    pub fn stroke_path(&mut self, path: &Path2D, color: ColorRgba) {
        let points = path.flatten(1.0);
        for window in points.windows(2) {
            self.draw_line(window[0], window[1], color);
        }
    }

    /// Draws a complete manga speech bubble with background fill and border outline.
    pub fn draw_speech_bubble(
        &mut self,
        bubble: &SpeechBubble,
        fill_color: ColorRgba,
        border_color: ColorRgba,
    ) {
        // Draw rough filled interior
        self.fill_rect(bubble.position, bubble.size, fill_color);
        // Draw crisp procedural vector contour
        let path = bubble.to_path();
        self.stroke_path(&path, border_color);
    }

    /// Draws text with typesetting layout.
    pub fn draw_text(
        &mut self,
        text: &str,
        pos: Vec2,
        config: &TextLayoutConfig,
        color: ColorRgba,
    ) {
        let glyphs = TextLayout::layout(text, pos, config);
        for glyph in glyphs {
            // Draw simple character bounding block for raster verification
            self.fill_rect(glyph.position, glyph.size * Vec2::new(0.8, 0.9), color);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_canvas_fill_and_clear() {
        let mut canvas = CanvasSurface::new(64, 64);
        canvas.clear(ColorRgba::WHITE);
        assert_eq!(&canvas.pixels()[0..4], &[255, 255, 255, 255]);

        canvas.fill_rect(Vec2::new(10.0, 10.0), Vec2::new(20.0, 20.0), ColorRgba::DB_ORANGE);
        let idx = (15 * 64 + 15) * 4;
        assert_eq!(&canvas.pixels()[idx..idx + 4], &[255, 87, 34, 255]);
    }
}
