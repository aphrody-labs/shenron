//! Unified Pure GPUI Kit desktop shell composing Koharu, Studio, and Admin.

use gpui_kit::component::tab::{Tab, TabBar};
use gpui_kit::component::{ActiveTheme, Root, ThemeMode, v_flex};
use gpui_kit::{
    App, AppContext, Context, Entity, IntoElement, ParentElement, Render, Styled, Window,
    WindowOptions,
};
use koharu_app::KoharuWorkspace;
use shenron_admin_ui::view::AdminWorkspace;
use shenron_studio::StudioWorkspace;

struct DesktopShell {
    active_tab: usize,
    koharu: Entity<KoharuWorkspace>,
    studio: Entity<StudioWorkspace>,
    admin: Entity<AdminWorkspace>,
}

impl DesktopShell {
    fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        Self {
            active_tab: 0,
            koharu: cx.new(|cx| KoharuWorkspace::new(window, cx)),
            studio: cx.new(|cx| StudioWorkspace::new(window, cx)),
            admin: cx.new(|cx| AdminWorkspace::new(window, cx)),
        }
    }
}

impl Render for DesktopShell {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let theme = cx.theme();
        let active = self.active_tab;
        v_flex()
            .size_full()
            .bg(theme.background)
            .text_color(theme.foreground)
            .child(
                TabBar::new("desktop-tabs")
                    .selected_index(active)
                    .on_click(cx.listener(|this, ix: &usize, _, cx| {
                        this.active_tab = *ix;
                        cx.notify();
                    }))
                    .child(Tab::new().label("Koharu"))
                    .child(Tab::new().label("Studio"))
                    .child(Tab::new().label("Admin")),
            )
            .child(match active {
                0 => self.koharu.clone().into_any_element(),
                1 => self.studio.clone().into_any_element(),
                _ => self.admin.clone().into_any_element(),
            })
    }
}

fn main() {
    gpui_kit::application().with_assets(gpui_kit::assets::Assets::new("")).run(|cx: &mut App| {
        gpui_kit::init(cx);
        shenron_theme::init(cx, ThemeMode::Dark);
        let opened = gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| {
            let shell = cx.new(|cx| DesktopShell::new(window, cx));
            cx.new(|cx| Root::new(shell, window, cx))
        });
        if let Err(error) = opened {
            eprintln!("failed to open the window: {error:#}");
            cx.quit();
        }
    });
}
