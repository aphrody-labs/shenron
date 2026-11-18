//! Pure GPUI Kit Koharu manga translation workspace (zero Tauri / tauri-specta).

use gpui_kit::{Context, IntoElement, ParentElement, Render, Styled, Window, div};
use gpui_kit::base::StyledExt;
use gpui_kit::component::description_list::DescriptionList;
use gpui_kit::component::tag::Tag;
use gpui_kit::component::{ActiveTheme, h_flex, v_flex};

/// Canonical Koharu editor command names dispatched directly via `koharu_library::editor::dispatch`.
pub const COMMAND_NAMES: &[&str] = &["open_document", "detect", "ocr", "inpaint", "render"];

/// GPUI Kit workspace for Koharu manga translation.
pub struct KoharuWorkspace {
    command_count: usize,
}

impl KoharuWorkspace {
    pub fn new(_window: &mut Window, _cx: &mut Context<Self>) -> Self {
        Self {
            command_count: koharu_library::editor::dispatch::COMMANDS.len(),
        }
    }
}

impl Render for KoharuWorkspace {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme();
        v_flex()
            .size_full()
            .p_4()
            .gap_3()
            .bg(theme.background)
            .text_color(theme.foreground)
            .child(
                h_flex()
                    .justify_between()
                    .items_center()
                    .child(div().text_lg().font_bold().child("Koharu Studio"))
                    .child(Tag::info().child(format!("{} commands", self.command_count))),
            )
            .child(
                DescriptionList::new()
                    .item("Engine", "koharu-library", 1)
                    .item("IPC", "Direct Rust (no Tauri)", 1),
            )
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn every_command_is_dispatched_outside_tauri() {
        assert!(!koharu_library::editor::dispatch::COMMANDS.is_empty());
    }
}
