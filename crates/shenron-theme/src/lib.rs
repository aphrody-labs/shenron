//! Semantic theme tokens and Dragon Ball palette initialization for Pure GPUI Kit.

use gpui_kit::{App, Hsla, px};
use gpui_kit::component::{Theme, ThemeMode};

/// Semantic color tokens derived from the active `gpui_kit::component::Theme`.
#[derive(Clone, Copy, Debug)]
pub struct SemanticThemeTokens {
    pub background: Hsla,
    pub surface: Hsla,
    pub surface_muted: Hsla,
    pub foreground: Hsla,
    pub muted_foreground: Hsla,
    pub border: Hsla,
    pub accent: Hsla,
    pub danger: Hsla,
    pub success: Hsla,
    pub warning: Hsla,
}

impl SemanticThemeTokens {
    /// Reads semantic tokens from the active `gpui-kit` theme.
    pub fn from_theme(theme: &Theme) -> Self {
        Self {
            background: theme.background,
            surface: theme.secondary,
            surface_muted: theme.muted,
            foreground: theme.foreground,
            muted_foreground: theme.muted_foreground,
            border: theme.border,
            accent: theme.primary,
            danger: theme.danger,
            success: theme.success,
            warning: theme.warning,
        }
    }
}

/// Initializes Shenron's semantic theme mode and base `rem` scale (`14.0px`).
pub fn init(cx: &mut App, mode: ThemeMode) {
    Theme::change(mode, None, cx);
    Theme::update(cx, |theme| {
        theme.font_size = px(14.0);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[gpui_kit::test]
    fn theme_init_sets_mode_and_font_size(cx: &mut gpui_kit::TestAppContext) {
        cx.update(|cx| {
            gpui_kit::init(cx);
            init(cx, ThemeMode::Dark);
            let theme = Theme::global(cx);
            let tokens = SemanticThemeTokens::from_theme(theme);
            assert_eq!(theme.font_size, px(14.0));
            assert_eq!(tokens.background, theme.background);
        });
    }
}
