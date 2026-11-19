//! The bench page of the frame-time run, the GPUI counterpart of `?id=bench` in
//! `scripts/parity/web/gallery.tsx`: the six components in a 560px column and a scrolling list of
//! 400 rows, each with a switch.

use gpui_kit::{
    AnyElement, App, Context, Entity, FocusHandle, InteractiveElement as _, IntoElement,
    ParentElement as _, ScrollHandle, StatefulInteractiveElement as _, Styled as _,
    TestSupportExt as _, Window, div, px,
};

use crate::{
    gallery::{
        ButtonVariant, Gallery, button_demo, checkbox_demo, select_demo, styled_button,
        styled_switch, switch_demo, tabs_demo,
    },
    palette::{self, BLACK},
    text::{self, Label},
};

pub const ROWS: usize = 400;
const PLACEHOLDER: &str = "Type here";

pub struct BenchState {
    rows: Vec<bool>,
    pub(crate) input: String,
    pub(crate) input_focus: FocusHandle,
    pub(crate) list_scroll: ScrollHandle,
}

impl BenchState {
    pub fn new(cx: &mut Context<Gallery>) -> Self {
        Self {
            rows: (1..=ROWS).map(|row| row % 3 == 0).collect(),
            input: String::new(),
            input_focus: cx.focus_handle(),
            list_scroll: ScrollHandle::new(),
        }
    }
}

/// `<label className="flex items-center gap-3">` around a control and its caption.
fn label_row(control: AnyElement, caption: &str, window: &mut Window) -> impl IntoElement {
    div()
        .flex()
        .items_center()
        .gap(px(12.))
        .child(control)
        .child(Label::new(caption.to_owned(), text::BASE).build(window))
}

/// `Input` of `packages/ui`: `h-10 rounded-xl border-2 border-black/80 bg-[#121218] px-3.5
/// text-sm text-gray-100 placeholder:text-gray-400`.
fn input(gallery: &Gallery, window: &mut Window) -> impl IntoElement {
    let surface = palette::CONTROL_SURFACE;
    let (value, color) = if gallery.bench.input.is_empty() {
        (PLACEHOLDER.to_owned(), palette::GRAY_400)
    } else {
        (gallery.bench.input.clone(), palette::GRAY_100)
    };
    div()
        .id("input")
        .test_support()
        .track_focus(&gallery.bench.input_focus)
        .h(px(40.))
        .w_full()
        .flex()
        .items_center()
        .px(px(14.))
        .rounded(px(11.2))
        .border_2()
        .border_color(BLACK.alpha(0.8).over(surface))
        .bg(surface)
        .focus(|style| style.border_color(palette::DBZ_ORANGE))
        .child(Label::new(value, text::SM).color(color).build(window))
}

/// The scrolling list: `w-[640px] h-[900px] overflow-y-auto rounded-xl border-2
/// border-black/80`, rows `flex items-center gap-3 border-b border-black/40 px-4 py-2`.
fn list(gallery: &Gallery, entity: &Entity<Gallery>, window: &mut Window) -> impl IntoElement {
    let rows = gallery.bench.rows.iter().enumerate().map(|(index, on)| {
        let entity = entity.clone();
        div()
            .flex()
            .items_center()
            .gap(px(12.))
            .px(px(16.))
            .py(px(8.))
            .border_b_1()
            .border_color(BLACK.alpha(0.4).over(palette::BACKGROUND))
            .child(styled_switch(
                ("row", index).into(),
                *on,
                false,
                None,
                move |checked, cx: &mut App| {
                    entity.update(cx, |gallery, cx| {
                        if let Some(row) = gallery.bench.rows.get_mut(index) {
                            *row = checked;
                        }
                        cx.notify();
                    });
                },
            ))
            .child(Label::new(format!("Row {}", index + 1), text::BASE).build(window))
    });

    div()
        .id("list")
        .test_support()
        .w(px(640.))
        .h(px(900.))
        .flex_none()
        .overflow_y_scroll()
        .track_scroll(&gallery.bench.list_scroll)
        .rounded(px(11.2))
        .border_2()
        .border_color(BLACK.alpha(0.8).over(palette::BACKGROUND))
        .children(rows)
}

pub(crate) fn page(gallery: &Gallery, entity: &Entity<Gallery>, window: &mut Window) -> AnyElement {
    let open_dialog = {
        let entity = entity.clone();
        move |_: &gpui_kit::ClickEvent, _: &mut Window, cx: &mut App| {
            entity.update(cx, |gallery, cx| gallery.open_dialog(cx));
        }
    };
    let checkbox = checkbox_demo(gallery, entity, window);
    let switch = switch_demo(gallery, entity, window);

    div()
        .flex()
        .gap(px(48.))
        .w(px(1792.))
        .h(px(952.))
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(24.))
                .w(px(560.))
                .flex_none()
                .child(button_demo(gallery, window))
                .child(label_row(checkbox, "Checkbox", window))
                .child(label_row(switch, "Switch", window))
                .child(tabs_demo(gallery, entity, window))
                .child(select_demo(gallery, entity, window))
                .child(input(gallery, window))
                .child(
                    styled_button(
                        "dialog-trigger",
                        "Open dialog",
                        ButtonVariant::Outline,
                        false,
                        None,
                        palette::FOREGROUND,
                        palette::BACKGROUND,
                        gallery.theme(),
                        window,
                    )
                    .on_click(open_dialog),
                ),
        )
        .child(list(gallery, entity, window))
        .into_any_element()
}
