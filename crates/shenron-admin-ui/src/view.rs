//! Pure GPUI Kit admin workspace view (desktop + web).

use gpui_kit::{
    Context, IntoElement, ParentElement, Render, Styled, Window, div, px,
};
use gpui_kit::base::StyledExt;
use gpui_kit::component::alert::Alert;
use gpui_kit::component::button::Button;
use gpui_kit::component::description_list::DescriptionList;
use gpui_kit::component::tag::Tag;
use gpui_kit::component::{ActiveTheme, h_flex, v_flex};
use gpui_kit::prelude::FluentBuilder;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AdminPanelSummary {
    pub id: String,
    pub title: String,
    pub group: String,
    pub status: String,
}

pub struct AdminWorkspace {
    panels: Vec<AdminPanelSummary>,
    selected_id: Option<String>,
    error_message: Option<String>,
}

impl AdminWorkspace {
    pub fn new(_window: &mut Window, _cx: &mut Context<Self>) -> Self {
        let panels = vec![
            AdminPanelSummary {
                id: "status".to_string(),
                title: "Service Status".to_string(),
                group: "Core".to_string(),
                status: "online".to_string(),
            },
            AdminPanelSummary {
                id: "queues".to_string(),
                title: "Queues & Workers".to_string(),
                group: "Core".to_string(),
                status: "idle".to_string(),
            },
            AdminPanelSummary {
                id: "pipeline".to_string(),
                title: "Editorial Pipeline".to_string(),
                group: "Content".to_string(),
                status: "ready".to_string(),
            },
        ];
        let selected_id = panels.first().map(|p| p.id.clone());
        Self {
            panels,
            selected_id,
            error_message: None,
        }
    }

    pub fn select_panel(&mut self, id: String, cx: &mut Context<Self>) {
        self.selected_id = Some(id);
        cx.notify();
    }
}

impl Render for AdminWorkspace {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme();
        let selected = self
            .selected_id
            .as_ref()
            .and_then(|id| self.panels.iter().find(|p| &p.id == id))
            .or_else(|| self.panels.first());

        h_flex()
            .items_stretch()
            .size_full()
            .bg(theme.background)
            .text_color(theme.foreground)
            .child(
                v_flex()
                    .w(px(240.0))
                    .h_full()
                    .p_3()
                    .gap_2()
                    .border_r_1()
                    .border_color(theme.border)
                    .bg(theme.secondary)
                    .child(div().text_sm().font_bold().child("Shenron Admin"))
                    .children(self.panels.iter().map(|panel| {
                        let id = panel.id.clone();
                        let label = panel.title.clone();
                        Button::new(gpui_kit::SharedString::from(format!("admin-nav-{id}")))
                            .label(label)
                            .outline()
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.select_panel(id.clone(), cx);
                            }))
                    })),
            )
            .child(
                v_flex()
                    .flex_1()
                    .min_w_0()
                    .min_h_0()
                    .p_4()
                    .gap_3()
                    .when_some(self.error_message.as_ref(), |el, msg| {
                        el.child(Alert::error("admin-error", msg.clone()))
                    })
                    .when_some(selected, |el, panel| {
                        el.child(
                            h_flex()
                                .justify_between()
                                .items_center()
                                .child(div().text_lg().font_bold().child(panel.title.clone()))
                                .child(Tag::info().child(panel.status.clone())),
                        )
                        .child(
                            DescriptionList::new()
                                .item("Panel ID", panel.id.clone(), 1)
                                .item("Group", panel.group.clone(), 1)
                                .item("Status", panel.status.clone(), 1),
                        )
                    }),
            )
    }
}
