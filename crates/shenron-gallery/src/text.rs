//! Single-line text laid out the way Blink lays out an inline run: `letter-spacing` added after
//! every character, the glyphs centered in the line box by half-leading, the baseline snapped to
//! a whole pixel. GPUI's text element has neither letter spacing nor CSS half-leading, so the
//! line is shaped once and its glyphs painted here.

use gpui_kit::{
    FontWeight, Hsla, IntoElement, SharedString, Styled as _, TextRun, Window, canvas, font, point,
    px,
};

/// The family registered from the font files of the contract.
pub const FAMILY: &str = "Inter";

/// Inter weights loaded from the contract. CSS asks for 400 on unstyled text, which the browser
/// resolves to the nearest face present, 500.
pub const MEDIUM: FontWeight = FontWeight(500.);
pub const SEMIBOLD: FontWeight = FontWeight(600.);
pub const BOLD: FontWeight = FontWeight(700.);
pub const EXTRABOLD: FontWeight = FontWeight(800.);

/// A Tailwind text size: font size and line height in pixels.
#[derive(Clone, Copy, Debug)]
pub struct TextSize {
    pub size: f32,
    pub line_height: f32,
}

/// `text-xs`: 12px / calc(1 / 0.75).
pub const XS: TextSize = TextSize { size: 12., line_height: 16. };
/// `text-sm`: 14px / calc(1.25 / 0.875).
pub const SM: TextSize = TextSize { size: 14., line_height: 20. };
/// `text-sm leading-relaxed`: 14px / 1.625.
pub const SM_RELAXED: TextSize = TextSize { size: 14., line_height: 22.75 };
/// Body text: 16px with the preflight `line-height: 1.5`.
pub const BASE: TextSize = TextSize { size: 16., line_height: 24. };
/// `text-3xl`: 30px / calc(2.25 / 1.875).
pub const XL3: TextSize = TextSize { size: 30., line_height: 36. };

/// Tailwind tracking scale, in em.
pub const TRACKING_NORMAL: f32 = 0.;
pub const TRACKING_WIDE: f32 = 0.025;
pub const TRACKING_WIDER: f32 = 0.05;

#[derive(Clone, Debug)]
pub struct Label {
    text: SharedString,
    size: TextSize,
    weight: FontWeight,
    tracking_em: f32,
    /// `None` inherits the color of the enclosing element at paint time, so its `hover` and
    /// state styles recolor the text as CSS `color` inheritance does.
    color: Option<Hsla>,
}

impl Label {
    pub fn new(text: impl Into<SharedString>, size: TextSize) -> Self {
        Self { text: text.into(), size, weight: MEDIUM, tracking_em: TRACKING_NORMAL, color: None }
    }

    /// `uppercase`.
    pub fn uppercase(mut self) -> Self {
        self.text = self.text.to_uppercase().into();
        self
    }

    pub fn weight(mut self, weight: FontWeight) -> Self {
        self.weight = weight;
        self
    }

    pub fn tracking(mut self, em: f32) -> Self {
        self.tracking_em = em;
        self
    }

    pub fn color(mut self, color: impl Into<Hsla>) -> Self {
        self.color = Some(color.into());
        self
    }

    /// Shapes the line and returns a fixed-size element that paints it.
    pub fn build(self, window: &mut Window) -> impl IntoElement + use<> {
        let Self { text, size, weight, tracking_em, color } = self;
        let font_size = px(size.size);
        let tracking = size.size * tracking_em;
        let run = TextRun {
            len: text.len(),
            font: gpui_kit::Font { weight, ..font(FAMILY) },
            color: color.unwrap_or_default(),
            background_color: None,
            underline: None,
            strikethrough: None,
        };
        let line = window.text_system().shape_line(text.clone(), font_size, &[run], None);
        let characters = text.chars().count();
        let width = line.width + px(tracking * characters as f32);
        // Blink rounds the font's ascent and descent to whole pixels and floors the half-leading,
        // so the baseline sits at a whole-pixel offset from the top of the line box.
        let ascent = f32::from(line.ascent).round();
        let descent = f32::from(line.descent).round();
        let baseline = ((size.line_height - (ascent + descent)) / 2.).floor() + ascent;

        canvas(
            |_, _, _| {},
            move |bounds, (), window, _| {
                let color = color.unwrap_or_else(|| window.text_style().color);
                let baseline_y = px((f32::from(bounds.origin.y) + baseline).round());
                for run in &line.runs {
                    for glyph in &run.glyphs {
                        let index = text.get(..glyph.index).map_or(0, |head| head.chars().count());
                        let x = bounds.origin.x + glyph.position.x + px(tracking * index as f32);
                        // A glyph the atlas cannot rasterize is left out of the frame; the
                        // pixel diff reports it.
                        let _ = window.paint_glyph(
                            point(x, baseline_y + glyph.position.y),
                            run.font_id,
                            glyph.id,
                            font_size,
                            color,
                        );
                    }
                }
            },
        )
        .w(width)
        .h(px(size.line_height))
        .flex_none()
    }
}
