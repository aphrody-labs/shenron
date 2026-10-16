// SPDX-License-Identifier: Apache-2.0

//! 2D Text layout engine with horizontal and vertical typesetting.
//!
//! Provides multiline word wrapping and vertical text flow (Tatechūyoko)
//! for Japanese manga dialogue bubbles.

use glam::Vec2;

/// Writing direction for typesetting.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub enum WritingDirection {
    /// Horizontal left-to-right (standard Western text).
    HorizontalLtr,
    /// Vertical top-to-bottom, columns advancing right-to-left (standard Japanese manga).
    VerticalRtl,
}

/// A positioned glyph ready for rendering.
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct PositionedGlyph {
    /// The character represented.
    pub ch: char,
    /// Top-left 2D position in canvas space.
    pub position: Vec2,
    /// Render size (width, height).
    pub size: Vec2,
}

/// Text layout configuration.
#[derive(Clone, Debug, PartialEq)]
pub struct TextLayoutConfig {
    /// Font size in canvas pixels.
    pub font_size: f32,
    /// Line height multiplier (e.g. 1.25).
    pub line_height: f32,
    /// Letter spacing extra pixels.
    pub letter_spacing: f32,
    /// Maximum bounding width (for horizontal) or height (for vertical).
    pub max_extent: f32,
    /// Direction of writing.
    pub direction: WritingDirection,
}

impl Default for TextLayoutConfig {
    fn default() -> Self {
        Self {
            font_size: 16.0,
            line_height: 1.3,
            letter_spacing: 1.0,
            max_extent: 300.0,
            direction: WritingDirection::HorizontalLtr,
        }
    }
}

/// Layout engine producing positioned glyphs.
pub struct TextLayout;

impl TextLayout {
    /// Computes the approximate character width based on CJK fullwidth vs ASCII halfwidth.
    #[inline]
    #[must_use]
    pub fn char_advance(ch: char, font_size: f32) -> f32 {
        if ch.is_ascii() {
            font_size * 0.55
        } else {
            font_size * 1.05 // CJK full-width characters
        }
    }

    /// Lays out a text string into positioned glyphs according to config.
    #[must_use]
    pub fn layout(text: &str, start_pos: Vec2, config: &TextLayoutConfig) -> Vec<PositionedGlyph> {
        let mut glyphs = Vec::new();
        let line_step = config.font_size * config.line_height;

        match config.direction {
            WritingDirection::HorizontalLtr => {
                let mut cursor_x = start_pos.x;
                let mut cursor_y = start_pos.y;

                for ch in text.chars() {
                    if ch == '\n' {
                        cursor_x = start_pos.x;
                        cursor_y += line_step;
                        continue;
                    }

                    let advance = Self::char_advance(ch, config.font_size) + config.letter_spacing;
                    if cursor_x + advance > start_pos.x + config.max_extent
                        && cursor_x > start_pos.x
                    {
                        // Word/character wrap to next line
                        cursor_x = start_pos.x;
                        cursor_y += line_step;
                    }

                    glyphs.push(PositionedGlyph {
                        ch,
                        position: Vec2::new(cursor_x, cursor_y),
                        size: Vec2::new(advance, config.font_size),
                    });

                    cursor_x += advance;
                }
            },
            WritingDirection::VerticalRtl => {
                let mut cursor_x = start_pos.x;
                let mut cursor_y = start_pos.y;

                for ch in text.chars() {
                    if ch == '\n' {
                        cursor_y = start_pos.y;
                        cursor_x -= line_step; // Column moves left in Japanese manga
                        continue;
                    }

                    let advance = config.font_size + config.letter_spacing;
                    if cursor_y + advance > start_pos.y + config.max_extent
                        && cursor_y > start_pos.y
                    {
                        // Wrap to next vertical column to the left
                        cursor_y = start_pos.y;
                        cursor_x -= line_step;
                    }

                    glyphs.push(PositionedGlyph {
                        ch,
                        position: Vec2::new(cursor_x, cursor_y),
                        size: Vec2::new(config.font_size, advance),
                    });

                    cursor_y += advance;
                }
            },
        }

        glyphs
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_horizontal_wrapping() {
        let config = TextLayoutConfig { font_size: 20.0, max_extent: 100.0, ..Default::default() };
        let glyphs = TextLayout::layout("Hello World from Shenron", Vec2::ZERO, &config);
        assert!(!glyphs.is_empty());
        // Verify multiline wrapping occurred
        let y_coords: std::collections::HashSet<i32> =
            glyphs.iter().map(|g| g.position.y as i32).collect();
        assert!(y_coords.len() > 1);
    }

    #[test]
    fn test_vertical_japanese_layout() {
        let config = TextLayoutConfig {
            font_size: 20.0,
            max_extent: 60.0,
            direction: WritingDirection::VerticalRtl,
            ..Default::default()
        };
        let glyphs = TextLayout::layout("かめはめ波", Vec2::new(200.0, 10.0), &config);
        assert_eq!(glyphs.len(), 5);
        // Column must move top to bottom, wrapping x to the left
        assert!(glyphs[1].position.y > glyphs[0].position.y);
    }
}
