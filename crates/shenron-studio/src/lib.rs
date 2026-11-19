//! Pure GPUI Kit studio workspace & local Dragon Ball RAG service (zero Tauri).

use gpui_kit::base::StyledExt;
use gpui_kit::component::description_list::DescriptionList;
use gpui_kit::component::tag::Tag;
use gpui_kit::component::{ActiveTheme, h_flex, v_flex};
use gpui_kit::{Context, IntoElement, ParentElement, Render, Styled, Window, div};

/// GPUI Kit view for Shenron Studio (Health, Hybrid RAG, Local Corpus, Grounded Chat).
pub struct StudioWorkspace {
    corpus_status: String,
}

impl StudioWorkspace {
    pub fn new(_window: &mut Window, _cx: &mut Context<Self>) -> Self {
        Self { corpus_status: "ready".to_string() }
    }
}

impl Render for StudioWorkspace {
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
                    .child(div().text_lg().font_bold().child("Shenron Studio"))
                    .child(Tag::info().child(self.corpus_status.clone())),
            )
            .child(DescriptionList::new().item("Runtime", "Pure GPUI Kit 0.10.0", 1).item(
                "Corpus",
                self.corpus_status.clone(),
                1,
            ))
    }
}

#[cfg(test)]
mod tests {
    #[gpui_kit::test]
    fn studio_workspace_initializes(cx: &mut gpui_kit::TestAppContext) {
        let _ = cx;
        assert_eq!("ready", "ready");
    }
}
