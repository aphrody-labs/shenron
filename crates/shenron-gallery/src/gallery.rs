//! The gallery view: one component state on the page anchored like the web stage, or the bench
//! page of the frame-time run. Controls are the unstyled `gpui_base` parts with the Toriyama skin
//! of `packages/ui` applied explicitly; their state changes go through the parts' own handlers,
//! and hover and focus come from the window's real input state.

use gpui_kit::{
    AnyElement, App, BoxShadow, ColorSpace, Context, Entity, FocusHandle, InteractiveElement as _,
    IntoElement, ParentElement as _, Pixels, Point, Render, StatefulInteractiveElement as _,
    Styled, TestSupportExt as _, Window, anchored,
    base::{
        Button, Checkbox, CheckboxState, Dialog, DialogBackdrop, DialogClose, DialogPopup, Select,
        Switch, Tab, Tabs,
        actions::{SelectDown, SelectUp},
    },
    deferred, div, linear_color_stop, linear_gradient, point,
    prelude::FluentBuilder as _,
    px, svg,
};

use crate::{
    bench,
    contract::{Component, Origin, Scene, StateId},
    icons,
    palette::{self, BLACK, Color, Theme, WHITE},
    text::{self, Label},
};

/// Parts the harness reports bounds for, with the element id each one has in this view.
pub const PARTS: &[(&str, &str)] = &[
    ("button", "button"),
    ("checkbox", "checkbox"),
    ("switch", "switch"),
    ("tab-1", "tab-1"),
    ("tab-2", "tab-2"),
    ("tab-3", "tab-3"),
    ("select-trigger", "select-trigger"),
    ("select-icon", "select-icon"),
    ("select-popup", "select-popup"),
    ("select-item-1", "select-item-1"),
    ("select-item-2", "select-item-2"),
    ("select-item-3", "select-item-3"),
    ("dialog-backdrop", "dialog-backdrop"),
    ("dialog-popup", "dialog-popup"),
    // `DialogClose::trigger` names its button `close`.
    ("dialog-close", "close"),
    ("dialog-cancel", "dialog-cancel"),
    ("dialog-confirm", "dialog-confirm"),
];

/// The element id of a contract part.
pub fn element_id(part: &str) -> Option<&'static str> {
    PARTS.iter().find(|(name, _)| *name == part).map(|(_, id)| *id)
}

const TABS: [(&str, &str); 3] = [("tab-1", "Alpha"), ("tab-2", "Beta"), ("tab-3", "Gamma")];
const SELECT_ITEMS: [&str; 3] = ["Alpha", "Beta", "Gamma"];
const SELECT_WIDTH: f32 = 240.;

/// Base UI's `alignItemWithTrigger` lays the open popup over the trigger so the selected item's
/// text sits on the value: horizontally the value inset (border 2 + `px-3.5`) minus the item
/// text inset (border 2 + `p-1.5` + `pl-9`), vertically as measured in the web capture
/// (popup at y 58 for a trigger at y 64).
fn select_popup_offset() -> Point<Pixels> {
    point(px(16. - 44.), px(-6.))
}

pub struct Gallery {
    scene: Scene,
    theme: Theme,
    origin: Origin,
    /// The page itself, focused first as the document body is, so Tab enters the tab order
    /// through the root's key bindings.
    page_focus: FocusHandle,
    button_focus: FocusHandle,
    checkbox_focus: FocusHandle,
    switch_focus: FocusHandle,
    trigger_focus: FocusHandle,
    close_focus: FocusHandle,
    checkbox: CheckboxState,
    switch_on: bool,
    selected_tab: usize,
    dialog_open: bool,
    select_open: bool,
    selected_item: usize,
    /// Highlighted option of the open select, moved by the arrow keys.
    pub(crate) highlighted_item: Option<usize>,
    pub(crate) bench: bench::BenchState,
}

impl Gallery {
    pub fn new(scene: Scene, theme: Theme, origin: Origin, cx: &mut Context<Self>) -> Self {
        let state = scene.state();
        Self {
            scene,
            theme,
            origin,
            page_focus: cx.focus_handle().tab_stop(false),
            button_focus: cx.focus_handle(),
            checkbox_focus: cx.focus_handle(),
            switch_focus: cx.focus_handle(),
            trigger_focus: cx.focus_handle(),
            close_focus: cx.focus_handle(),
            checkbox: if state == Some(StateId::CheckboxChecked) {
                CheckboxState::Checked
            } else {
                CheckboxState::Unchecked
            },
            switch_on: state == Some(StateId::SwitchOn),
            selected_tab: usize::from(state == Some(StateId::TabsSecondActive)),
            dialog_open: scene.component() == Some(Component::Dialog),
            select_open: false,
            selected_item: 0,
            highlighted_item: None,
            bench: bench::BenchState::new(cx),
        }
    }

    pub fn scene(&self) -> Scene {
        self.scene
    }

    pub fn theme(&self) -> Theme {
        self.theme
    }

    /// The page's focus handle: focusing it puts keyboard focus where a freshly loaded document
    /// has it, on the body.
    pub fn page_focus(&self) -> FocusHandle {
        self.page_focus.clone()
    }

    /// Opens or closes the dialog and the select from outside, for the scripted window run.
    pub fn toggle_overlays(&mut self, cx: &mut Context<Self>) {
        match self.scene.component() {
            Some(Component::Dialog) => self.dialog_open = !self.dialog_open,
            Some(Component::Select) => self.select_open = !self.select_open,
            _ => return,
        }
        cx.notify();
    }

    pub(crate) fn disabled(&self) -> bool {
        matches!(
            self.scene.state(),
            Some(
                StateId::ButtonDisabled
                    | StateId::CheckboxDisabled
                    | StateId::SwitchDisabled
                    | StateId::SelectDisabled
            )
        )
    }

    pub(crate) fn open_dialog(&mut self, cx: &mut Context<Self>) {
        self.dialog_open = true;
        cx.notify();
    }
}

impl Render for Gallery {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let entity = cx.entity();
        let stage = match self.scene.component() {
            Some(Component::Button) => button_demo(self, window).into_any_element(),
            Some(Component::Checkbox) => checkbox_demo(self, &entity, window),
            Some(Component::Switch) => switch_demo(self, &entity, window),
            Some(Component::Tabs) => tabs_demo(self, &entity, window),
            Some(Component::Dialog) => div().into_any_element(),
            Some(Component::Select) => select_demo(self, &entity, window),
            None => bench::page(self, &entity, window),
        };

        div()
            .id("page")
            .track_focus(&self.page_focus)
            .relative()
            .size_full()
            .bg(palette::BACKGROUND)
            .text_color(palette::FOREGROUND)
            .child(div().absolute().left(px(self.origin.x)).top(px(self.origin.y)).child(stage))
            .when(self.dialog_open, |page| page.child(dialog_demo(self, &entity, window, cx)))
            .when(self.select_open, |page| page.child(select_popup(self, &entity, window)))
    }
}

/// GPUI's own `:focus-visible` predicate (`Interactivity::focus_visible_style`): focused, and
/// the last input came from the keyboard.
pub(crate) fn focus_visible(handle: &FocusHandle, window: &Window) -> bool {
    handle.is_focused(window) && window.last_input_was_keyboard()
}

pub(crate) fn hard_shadow(offset: f32) -> BoxShadow {
    BoxShadow::new(px(offset), px(offset), BLACK.hsla())
}

/// A CSS focus ring outside the border box: `outline` with an offset, or a `ring` spread shadow,
/// whose corners follow the element radius grown by the offset and width. It is an absolute
/// child, placed from the padding box of a parent with a `border-wide border.
fn focus_ring(border: f32, offset: f32, width: f32, radius: f32, color: Color) -> impl IntoElement {
    let outset = border + offset + width;
    div()
        .absolute()
        .top(px(-outset))
        .left(px(-outset))
        .right(px(-outset))
        .bottom(px(-outset))
        .rounded(px(radius + offset + width))
        .border(px(width))
        .border_color(color)
}

/// A CSS gradient `to right in oklab` through equally spaced stops.
fn gradient_to_right(stops: &[Color]) -> impl IntoElement {
    div().size_full().flex().children(stops.windows(2).map(|pair| {
        div().flex_1().h_full().bg(linear_gradient(
            90.,
            linear_color_stop(pair[0], 0.),
            linear_color_stop(pair[1], 1.),
        )
        .color_space(ColorSpace::Oklab))
    }))
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(crate) enum ButtonVariant {
    Default,
    Outline,
}

/// `Button` of `packages/ui` at its default size: `h-8 px-2.5 rounded-lg border-2 text-sm
/// font-bold tracking-wide uppercase`. `color` is the inherited text color and `surface` the
/// opaque fill under the button.
#[allow(clippy::too_many_arguments)]
pub(crate) fn styled_button(
    id: &'static str,
    label: &str,
    variant: ButtonVariant,
    disabled: bool,
    focus: Option<&FocusHandle>,
    color: Color,
    surface: Color,
    theme: Theme,
    window: &mut Window,
) -> Button {
    let (border, fill, hover_fill) = match variant {
        // `bg-primary` and `hover:bg-primary/90` are transparent without `--primary`.
        ButtonVariant::Default => (BLACK, None, None),
        ButtonVariant::Outline if theme.dark_variants() => (
            palette::INPUT,
            Some(palette::INPUT.alpha(0.3).over(surface)),
            Some(palette::INPUT.alpha(0.5).over(surface)),
        ),
        // `border-current bg-background hover:bg-muted`; `--muted` is not defined either.
        ButtonVariant::Outline => (color, Some(palette::BACKGROUND), None),
    };
    let label = Label::new(label.to_owned(), text::SM)
        .uppercase()
        .weight(text::BOLD)
        .tracking(text::TRACKING_WIDE)
        .build(window);

    Button::new(id)
        .disabled(disabled)
        .when_some(focus, |button, focus| button.track_focus(focus))
        .h(px(32.))
        .px(px(10.))
        .flex_none()
        .rounded(px(8.))
        .border_2()
        .border_color(border)
        .text_color(color)
        .when_some(fill, |button, fill| button.bg(fill))
        .hover(move |style| {
            let style = style.border_color(palette::DBZ_YELLOW);
            match (variant, hover_fill) {
                (ButtonVariant::Outline, Some(fill)) => style.bg(fill),
                (ButtonVariant::Outline, None) => style.text_color(palette::FOREGROUND),
                _ => style,
            }
        })
        // `focus-visible:border-ring` computes to `currentColor`.
        .focus_visible(move |style| style.border_color(color))
        .styles(|styles| styles.disabled(|style| style.opacity(0.5)))
        .child(label)
}

pub(crate) fn button_demo(gallery: &Gallery, window: &mut Window) -> impl IntoElement {
    styled_button(
        "button",
        "Button",
        ButtonVariant::Default,
        gallery.disabled(),
        Some(&gallery.button_focus),
        palette::FOREGROUND,
        palette::BACKGROUND,
        gallery.theme,
        window,
    )
}

/// `Checkbox`: `size-5 rounded-md border-2 border-black bg-[#121218] shadow-[2px_2px_0px_#000]`,
/// in the flex row the gallery gives it.
pub(crate) fn checkbox_demo(
    gallery: &Gallery,
    entity: &Entity<Gallery>,
    window: &mut Window,
) -> AnyElement {
    let checked = gallery.checkbox == CheckboxState::Checked;
    let ring = focus_visible(&gallery.checkbox_focus, window);
    let entity = entity.clone();
    div()
        .flex()
        .child(
            Checkbox::new("checkbox")
                .state(gallery.checkbox)
                .disabled(gallery.disabled())
                .accessibility_label("Checkbox")
                .track_focus(&gallery.checkbox_focus)
                .on_change(move |state, _, _, cx| {
                    entity.update(cx, |gallery, cx| {
                        gallery.checkbox = state;
                        cx.notify();
                    });
                })
                .relative()
                .size(px(20.))
                .flex_none()
                .flex()
                .items_center()
                .justify_center()
                .rounded(px(6.4))
                .border_2()
                .border_color(BLACK)
                .bg(palette::CONTROL_SURFACE)
                .shadow(vec![hard_shadow(2.)])
                .hover(|style| style.border_color(palette::DBZ_ORANGE).shadow(vec![hard_shadow(3.)]))
                .styles(|styles| {
                    styles.checked(|style| style.bg(palette::DBZ_ORANGE).border_color(BLACK))
                })
                .when(checked, |checkbox| {
                    checkbox.child(svg().path(icons::CHECK).size(px(14.)).text_color(BLACK))
                })
                // `focus-visible:ring-2 ring-dbz-orange`.
                .when(ring, |checkbox| {
                    checkbox.child(focus_ring(2., 0., 2., 6.4, palette::DBZ_ORANGE))
                }),
        )
        .into_any_element()
}

pub(crate) fn switch_demo(
    gallery: &Gallery,
    entity: &Entity<Gallery>,
    _: &mut Window,
) -> AnyElement {
    let entity = entity.clone();
    styled_switch(
        "switch".into(),
        gallery.switch_on,
        gallery.disabled(),
        Some(&gallery.switch_focus),
        move |checked, cx| {
            entity.update(cx, |gallery, cx| {
                gallery.switch_on = checked;
                cx.notify();
            });
        },
    )
    .into_any_element()
}

/// `Switch`: `h-6 w-11 rounded-full border-2 border-black/80 p-0.5`, thumb `size-4.5` with a
/// 1px `border-black/80`. The track is painted as CSS paints it: the fill under the border, then
/// the translucent border over it. The checked gradient is sized to the padding box and repeats
/// under the border (`background-origin: padding-box`), so the left border shows its amber end and
/// the right border its orange start. Unchecked colors are composited opaque so `opacity-50` of
/// the disabled state fades the flattened control, as CSS group opacity does.
pub(crate) fn styled_switch(
    id: gpui_kit::ElementId,
    on: bool,
    disabled: bool,
    focus: Option<&FocusHandle>,
    on_change: impl Fn(bool, &mut App) + 'static,
) -> Switch {
    let backdrop = palette::BACKGROUND;
    let fade = |color: Color| if disabled { color.faded(0.5, backdrop) } else { color };
    let off_track = BLACK.alpha(0.8).over(backdrop);
    let border = BLACK.alpha(0.8);
    let thumb_fill = if on { palette::YELLOW_100 } else { WHITE };

    let fill = if on {
        div()
            .absolute()
            .inset_0()
            .rounded_full()
            .overflow_hidden()
            .flex()
            .child(div().w(px(2.)).h_full().bg(palette::AMBER_500))
            .child(
                div()
                    .flex_1()
                    .h_full()
                    .child(gradient_to_right(&[palette::DBZ_ORANGE, palette::AMBER_500])),
            )
            .child(div().w(px(2.)).h_full().bg(palette::DBZ_ORANGE))
    } else {
        div().absolute().inset_0().rounded_full().bg(fade(off_track))
    };
    let ring = div().absolute().inset_0().rounded_full().border_2().border_color(if on {
        border
    } else {
        fade(border.over(off_track))
    });

    Switch::new(id)
        .checked(on)
        .disabled(disabled)
        .accessibility_label("Switch")
        .when_some(focus, |switch, focus| switch.track_focus(focus))
        .on_change(move |checked, _, _, cx| on_change(checked, cx))
        .relative()
        .w(px(44.))
        .h(px(24.))
        .flex_none()
        .child(fill)
        .child(ring)
        .child(
            div()
                .absolute()
                .top(px(3.))
                .left(px(if on { 24. } else { 4. }))
                .size(px(18.))
                .rounded_full()
                .bg(fade(thumb_fill))
                .border_1()
                .border_color(fade(border.over(thumb_fill))),
        )
}

/// `TabsList` (`gap-2 rounded-xl p-1.5 bg-black/40 border-2 border-black/80`) with three
/// `TabsTab` (`min-h-9 rounded-lg px-4 py-1.5 border-2 text-xs font-extrabold uppercase
/// tracking-wider text-gray-300`) and the active panel `mt-4`.
pub(crate) fn tabs_demo(
    gallery: &Gallery,
    entity: &Entity<Gallery>,
    window: &mut Window,
) -> AnyElement {
    let list = BLACK.alpha(0.4).over(palette::BACKGROUND);
    let list_border = BLACK.alpha(0.8).over(list);
    let hover_border = BLACK.alpha(0.6).over(list);
    let hover_fill = WHITE.alpha(0.05).over(list);
    let selected = gallery.selected_tab;

    let tabs = TABS.iter().enumerate().map(|(index, (id, label))| {
        let entity = entity.clone();
        Tab::new(*id)
            .selected(index == selected)
            .set_position(index + 1, TABS.len())
            .on_click(move |_, _, cx| {
                entity.update(cx, |gallery, cx| {
                    gallery.selected_tab = index;
                    cx.notify();
                });
            })
            .min_h(px(36.))
            .px(px(16.))
            .py(px(6.))
            .rounded(px(8.))
            .border_2()
            .border_color(palette::TRANSPARENT)
            .text_color(palette::GRAY_300)
            .hover(move |style| style.border_color(hover_border).bg(hover_fill).text_color(WHITE))
            .styles(|styles| {
                styles.selected(|style| {
                    style.bg(palette::DBZ_ORANGE).border_color(BLACK).text_color(BLACK)
                })
            })
            .child(
                Label::new(*label, text::XS)
                    .uppercase()
                    .weight(text::EXTRABOLD)
                    .tracking(text::TRACKING_WIDER)
                    .build(window),
            )
    });
    let panel = format!("Panel {}", TABS[selected].1.to_lowercase());

    div()
        .flex()
        .flex_col()
        .items_start()
        .child(
            Tabs::new("tabs")
                .flex()
                .gap(px(8.))
                .p(px(6.))
                .rounded(px(11.2))
                .border_2()
                .border_color(list_border)
                .bg(list)
                .children(tabs),
        )
        .child(
            div()
                .mt(px(16.))
                .child(Label::new(panel, text::BASE).color(palette::FOREGROUND).build(window)),
        )
        .into_any_element()
}

/// `SelectTrigger` (`h-10 px-3.5 rounded-xl border-2 border-black bg-[#121218] font-semibold
/// uppercase tracking-wider text-xs shadow-[2.5px_2.5px_0px_#000]`) holding the `font-medium`
/// value and the chevron, in the 240px wrapper of the gallery.
pub(crate) fn select_demo(
    gallery: &Gallery,
    entity: &Entity<Gallery>,
    window: &mut Window,
) -> AnyElement {
    let surface = palette::CONTROL_SURFACE;
    let disabled = gallery.disabled();
    let ring = focus_visible(&gallery.trigger_focus, window);
    let open = gallery.select_open;
    let value = SELECT_ITEMS[gallery.selected_item];
    let toggle = {
        let entity = entity.clone();
        move |open: bool, cx: &mut App| {
            entity.update(cx, |gallery, cx| {
                gallery.select_open = open;
                cx.notify();
            });
        }
    };
    let on_open_change = toggle.clone();
    let step = |delta: isize| {
        let entity = entity.clone();
        move |_: &dyn std::any::Any, _: &mut Window, cx: &mut App| {
            entity.update(cx, |gallery, cx| {
                if gallery.select_open {
                    let from = gallery.highlighted_item.unwrap_or(gallery.selected_item);
                    let last = SELECT_ITEMS.len() - 1;
                    gallery.highlighted_item = Some(from.saturating_add_signed(delta).min(last));
                    cx.notify();
                }
            });
            // The select root opens a closed popup on the same action.
            cx.propagate();
        }
    };
    let move_down = step(1);
    let move_up = step(-1);
    let confirm = {
        let entity = entity.clone();
        move |_: &mut Window, cx: &mut App| {
            entity.update(cx, |gallery, cx| {
                if let Some(item) = gallery.highlighted_item.take() {
                    gallery.selected_item = item;
                }
                gallery.select_open = false;
                cx.notify();
            });
        }
    };

    let trigger = Button::new("select-trigger")
        .on_action(move |action: &SelectDown, window, cx| move_down(action, window, cx))
        .on_action(move |action: &SelectUp, window, cx| move_up(action, window, cx))
        .disabled(disabled)
        .track_focus(&gallery.trigger_focus)
        .on_click(move |_, _, cx| toggle(!open, cx))
        .relative()
        .w_full()
        .h(px(40.))
        .px(px(14.))
        .justify_between()
        .rounded(px(11.2))
        .border_2()
        .border_color(BLACK)
        .bg(surface)
        .text_color(palette::GRAY_100)
        .shadow(vec![hard_shadow(2.5)])
        .hover(move |style| {
            style
                .border_color(palette::DBZ_ORANGE.alpha(0.7).over(surface))
                .shadow(vec![hard_shadow(3.5)])
        })
        .focus_visible(|style| style.border_color(palette::DBZ_ORANGE))
        .child(
            Label::new(value, text::XS)
                .uppercase()
                .weight(text::MEDIUM)
                .tracking(text::TRACKING_WIDER)
                .build(window),
        )
        .child(
            div().id("select-icon").test_support().size(px(16.)).flex_none().child(
                svg()
                    .path(icons::CHEVRON_DOWN)
                    .size(px(16.))
                    .text_color(WHITE.alpha(0.6).over(surface)),
            ),
        )
        // `focus-visible:ring-2 ring-dbz-orange`.
        .when(ring, |trigger| trigger.child(focus_ring(2., 0., 2., 11.2, palette::DBZ_ORANGE)));

    div()
        .w(px(SELECT_WIDTH))
        .child(
            Select::new("select")
                .open(open)
                .disabled(disabled)
                .accessibility_label("Select")
                .accessibility_value(value)
                .on_open_change(move |open, _, cx| on_open_change(open, cx))
                .on_confirm(confirm)
                .w_full()
                .child(trigger),
        )
        .into_any_element()
}

/// `SelectPopup` (`rounded-xl border-2 border-black bg-[#0d0d14] p-1.5
/// shadow-[5px_5px_0px_#000]`, `h-1` gradient strip clipped by `overflow-y-auto`) and its
/// items (`py-2 pl-9 pr-3 rounded-lg text-xs font-semibold uppercase tracking-wider
/// text-gray-200`, the selected one marked by a `size-3.5 stroke-[3]` check at `left-2.5`).
fn select_popup(gallery: &Gallery, entity: &Entity<Gallery>, window: &mut Window) -> AnyElement {
    let origin = point(px(gallery.origin.x), px(gallery.origin.y)) + select_popup_offset();
    let selected = gallery.selected_item;
    let highlighted = gallery.highlighted_item;
    let items = SELECT_ITEMS.iter().enumerate().map(|(index, item)| {
        let entity = entity.clone();
        // `data-[highlighted]:bg-dbz-orange data-[highlighted]:text-black`.
        let lit = highlighted == Some(index);
        div()
            .id(format!("select-item-{}", index + 1))
            .test_support()
            .relative()
            .h(px(32.))
            .w_full()
            .flex()
            .items_center()
            .pl(px(36.))
            .pr(px(12.))
            .rounded(px(8.))
            .text_color(if lit { BLACK } else { palette::GRAY_200 })
            .when(lit, |row| row.bg(palette::DBZ_ORANGE))
            .on_click(move |_, _, cx| {
                entity.update(cx, |gallery, cx| {
                    gallery.selected_item = index;
                    gallery.select_open = false;
                    cx.notify();
                });
            })
            .when(index == selected, |row| {
                row.child(
                    div()
                        .absolute()
                        .left(px(10.))
                        .top(px(8.))
                        .size(px(16.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(svg().path(icons::CHECK_SELECT).size(px(14.)).text_color(if lit {
                            BLACK
                        } else {
                            palette::GRAY_200
                        })),
                )
            })
            .child(
                Label::new(*item, text::XS)
                    .uppercase()
                    .weight(text::SEMIBOLD)
                    .tracking(text::TRACKING_WIDER)
                    .build(window),
            )
    });

    deferred(
        anchored().position(origin).child(
            div()
                .id("select-popup")
                .test_support()
                .occlude()
                .w(px(SELECT_WIDTH))
                .p(px(2.))
                .rounded(px(11.2))
                .bg(BLACK)
                .shadow(vec![hard_shadow(5.)])
                .child(
                    div()
                        .relative()
                        .overflow_hidden()
                        .rounded(px(9.2))
                        .bg(palette::SELECT_SURFACE)
                        .p(px(6.))
                        .flex()
                        .flex_col()
                        .gap(px(2.))
                        .child(div().absolute().top_0().left_0().right_0().h(px(4.)).child(
                            gradient_to_right(&[
                                palette::DBZ_ORANGE,
                                palette::DBZ_YELLOW,
                                palette::DBZ_ORANGE,
                            ]),
                        ))
                        .children(items),
                ),
        ),
    )
    .with_priority(1)
    .into_any_element()
}

/// `DialogPopup`, Toriyama variant, centered over the `bg-black/80` backdrop: `max-w-lg
/// rounded-2xl p-8 border-3 border-black bg-[#0d0d12] shadow-[6px_6px_0px_#000]`, the `h-1.5`
/// aura strip, header, footer and the `size-11` close button at `top-4 right-4`.
///
/// The 3px border is the black fill showing around the inner surface, so children paint over
/// it as they do in CSS. GPUI has no blur filter: the title's `drop-shadow` glow and the
/// backdrop's `backdrop-blur-sm` are not drawn; over the uniform page the blur changes nothing.
fn dialog_demo(
    gallery: &Gallery,
    entity: &Entity<Gallery>,
    window: &mut Window,
    cx: &mut App,
) -> AnyElement {
    let surface = palette::DIALOG_SURFACE;
    let close_fill = BLACK.alpha(0.6).over(surface);
    let close_ring = focus_visible(&gallery.close_focus, window);
    let close_focus = gallery.close_focus.clone();
    let theme = gallery.theme;
    let close = |entity: &Entity<Gallery>| {
        let entity = entity.clone();
        move |_: &gpui_kit::ClickEvent, _: &mut Window, cx: &mut App| {
            entity.update(cx, |gallery, cx| {
                gallery.dialog_open = false;
                cx.notify();
            });
        }
    };

    let header = div()
        .flex()
        .flex_col()
        .child(
            Label::new("Dialog title", text::XL3)
                .uppercase()
                .weight(text::MEDIUM)
                .tracking(text::TRACKING_WIDER)
                .color(WHITE)
                .build(window),
        )
        .child(
            div().mt(px(8.)).child(
                Label::new("Dialog description text.", text::SM_RELAXED)
                    .weight(text::MEDIUM)
                    .color(palette::GRAY_300)
                    .build(window),
            ),
        );

    let footer = div()
        .mt(px(24.))
        .pt(px(16.))
        .border_t_1()
        .border_color(BLACK.alpha(0.4).over(surface))
        .flex()
        .justify_end()
        .gap(px(8.))
        .child(
            div().mr(px(12.)).child(
                styled_button(
                    "dialog-cancel",
                    "Cancel",
                    ButtonVariant::Outline,
                    false,
                    None,
                    palette::GRAY_100,
                    surface,
                    theme,
                    window,
                )
                .on_click(close(entity)),
            ),
        )
        .child(
            styled_button(
                "dialog-confirm",
                "Confirm",
                ButtonVariant::Default,
                false,
                None,
                palette::GRAY_100,
                surface,
                theme,
                window,
            )
            .on_click(close(entity)),
        );

    let close_button = DialogClose::new().absolute().top(px(16.)).right(px(16.)).trigger(|button| {
        button
            .track_focus(&close_focus)
            .relative()
            .size(px(44.))
            .rounded(px(8.))
            .border_2()
            .border_color(BLACK)
            .bg(close_fill)
            .shadow(vec![hard_shadow(2.)])
            .hover(|style| style.bg(palette::DBZ_ORANGE))
            .child(svg().path(icons::X).size(px(16.)).text_color(WHITE.alpha(0.7).over(close_fill)))
            // `focus-visible:outline-2 outline-offset-2 outline-dbz-yellow`.
            .when(close_ring, |button| button.child(focus_ring(2., 2., 2., 8., palette::DBZ_YELLOW)))
    });

    let popup = DialogPopup::new().child(
        div()
            .id("dialog-popup")
            .test_support()
            .w(px(512.))
            .p(px(3.))
            .rounded(px(16.))
            .bg(BLACK)
            .shadow(vec![hard_shadow(6.)])
            .child(
                div()
                    .relative()
                    .p(px(32.))
                    .rounded(px(13.))
                    .bg(surface)
                    .text_color(palette::GRAY_100)
                    .child(aura_strip())
                    .child(header)
                    .child(footer)
                    .child(close_button),
            ),
    );

    let entity = entity.clone();
    Dialog::new(cx)
        .open(gallery.dialog_open)
        .accessibility_label("Dialog title")
        .on_open_change(move |open, _, _, cx| {
            entity.update(cx, |gallery, cx| {
                gallery.dialog_open = open;
                cx.notify();
            });
        })
        .backdrop(
            DialogBackdrop::new().size_full().child(
                div()
                    .id("dialog-backdrop")
                    .test_support()
                    .size_full()
                    .bg(BLACK.alpha(0.8).over(palette::BACKGROUND)),
            ),
        )
        .popup(popup)
        .into_any_element()
}

/// `absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-dbz-orange via-dbz-yellow
/// to-dbz-orange rounded-t-xl`. CSS scales the 11.2px corners of a 6px-high box down to 6px;
/// the strip is the top half of a 12px box rounded at 6px, clipped to 6px.
fn aura_strip() -> impl IntoElement {
    div().absolute().top_0().left_0().right_0().h(px(6.)).overflow_hidden().child(
        div().h(px(12.)).w_full().rounded_t(px(6.)).overflow_hidden().child(gradient_to_right(&[
            palette::DBZ_ORANGE,
            palette::DBZ_YELLOW,
            palette::DBZ_ORANGE,
        ])),
    )
}
