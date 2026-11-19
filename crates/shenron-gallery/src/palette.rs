//! The Toriyama skin of `packages/ui`, resolved from `packages/ui/src/styles.css` and the
//! Tailwind v4 palette as the browser computes it for the gallery page.
//!
//! The gallery CSS defines `--background` and `--foreground` but no `--primary` or `--ring`:
//! `bg-primary` therefore computes to transparent, `text-primary-foreground` inherits the text
//! color, and `focus-visible:border-ring` falls back to `currentColor`. `outline-none` on Button
//! and Switch sets `--tw-outline-style: none`, so their `focus-visible:outline-*` draws nothing.
//!
//! Translucent fills are composited here in sRGB, the space the browser blends in, over the
//! opaque surface they sit on. That keeps an offset shadow painted under a translucent control
//! from showing through it, and makes CSS group opacity exact without a compositing layer.

use gpui_kit::{Fill, Hsla, Rgba};

/// An sRGB color with straight alpha.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Color {
    pub r: f32,
    pub g: f32,
    pub b: f32,
    pub a: f32,
}

impl Color {
    pub const fn hex(hex: u32) -> Self {
        Self {
            r: ((hex >> 16) & 0xff) as f32 / 255.,
            g: ((hex >> 8) & 0xff) as f32 / 255.,
            b: (hex & 0xff) as f32 / 255.,
            a: 1.,
        }
    }

    /// Tailwind's `color/<percent>` modifier.
    pub const fn alpha(self, a: f32) -> Self {
        Self { a: self.a * a, ..self }
    }

    /// Source-over composition of `self` on `under`.
    pub fn over(self, under: Self) -> Self {
        let a = self.a + under.a * (1. - self.a);
        if a == 0. {
            return Self { r: 0., g: 0., b: 0., a: 0. };
        }
        let mix = |top: f32, bottom: f32| (top * self.a + bottom * under.a * (1. - self.a)) / a;
        Self { r: mix(self.r, under.r), g: mix(self.g, under.g), b: mix(self.b, under.b), a }
    }

    /// The color CSS `opacity: <opacity>` leaves on an opaque `backdrop`.
    pub fn faded(self, opacity: f32, backdrop: Self) -> Self {
        self.alpha(opacity).over(backdrop)
    }

    pub fn hsla(self) -> Hsla {
        Rgba { r: self.r, g: self.g, b: self.b, a: self.a }.into()
    }
}

impl From<Color> for Hsla {
    fn from(color: Color) -> Self {
        color.hsla()
    }
}

impl From<Color> for Fill {
    fn from(color: Color) -> Self {
        color.hsla().into()
    }
}

pub const BLACK: Color = Color::hex(0x000000);
pub const WHITE: Color = Color::hex(0xffffff);
pub const TRANSPARENT: Color = Color { r: 0., g: 0., b: 0., a: 0. };

/// `--background` and `--foreground` of `:root, .dark`.
pub const BACKGROUND: Color = Color::hex(0x0a0e27);
pub const FOREGROUND: Color = Color::hex(0xfff7e0);

/// `--color-dbz-*` defaults.
pub const DBZ_ORANGE: Color = Color::hex(0xe78220);
pub const DBZ_YELLOW: Color = Color::hex(0xfefd03);
pub const DBZ_BORDER: Color = Color::hex(0x2a2a26);

/// `--input` is `var(--color-dbz-border)`.
pub const INPUT: Color = DBZ_BORDER;

/// Tailwind v4 palette entries, as sRGB hex of their oklch definitions.
pub const AMBER_500: Color = Color::hex(0xfe9a00);
pub const YELLOW_100: Color = Color::hex(0xfef9c2);
pub const GRAY_100: Color = Color::hex(0xf3f4f6);
pub const GRAY_200: Color = Color::hex(0xe5e7eb);
pub const GRAY_300: Color = Color::hex(0xd1d5dc);
pub const GRAY_400: Color = Color::hex(0x99a1af);

/// Arbitrary surfaces of the Toriyama variants.
pub const CONTROL_SURFACE: Color = Color::hex(0x121218);
pub const DIALOG_SURFACE: Color = Color::hex(0x0d0d12);
pub const SELECT_SURFACE: Color = Color::hex(0x0d0d14);

/// Appearance the page is captured in. The tokens of `:root` and `.dark` are the same; only the
/// `dark:` utilities follow it, because the capture sets `prefers-color-scheme` to the theme.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Theme {
    Dark,
    Light,
}

impl Theme {
    pub fn as_str(self) -> &'static str {
        match self {
            Theme::Dark => "dark",
            Theme::Light => "light",
        }
    }

    pub fn dark_variants(self) -> bool {
        self == Theme::Dark
    }
}

impl std::str::FromStr for Theme {
    type Err = anyhow::Error;

    fn from_str(value: &str) -> anyhow::Result<Self> {
        match value {
            "dark" => Ok(Theme::Dark),
            "light" => Ok(Theme::Light),
            _ => Err(anyhow::anyhow!("unknown theme `{value}` (dark or light)")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Asserts a composite against a pixel of the web capture, within one step of rounding.
    fn assert_pixel(color: Color, expected: [u8; 3]) {
        let actual = [color.r, color.g, color.b].map(|c| c * 255.);
        for (channel, want) in actual.iter().zip(expected) {
            assert!((channel - f32::from(want)).abs() <= 1., "{actual:?} != {expected:?}");
        }
    }

    #[test]
    fn composites_match_the_reference_capture() {
        // Switch track `bg-black/80` over the page, sampled at (66, 76) of switch/off.
        assert_pixel(BLACK.alpha(0.8).over(BACKGROUND), [2, 3, 8]);
        // Dialog close `bg-black/60` over the popup, sampled inside dialog-close.
        assert_pixel(BLACK.alpha(0.6).over(DIALOG_SURFACE), [5, 5, 7]);
        // Hovered tab `bg-white/5` over the list `bg-black/40` over the page.
        assert_pixel(WHITE.alpha(0.05).over(BLACK.alpha(0.4).over(BACKGROUND)), [19, 21, 35]);
        // Disabled button border: black at `opacity-50` over the page.
        assert_pixel(BLACK.faded(0.5, BACKGROUND), [5, 7, 19]);
    }
}
