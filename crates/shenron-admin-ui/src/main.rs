//! Pure GPUI Kit entrypoint for `shenron-admin-ui` (desktop + wasm32-unknown-unknown).

use gpui_kit::component::{Root, ThemeMode};
use gpui_kit::{App, AppContext, WindowOptions};
use shenron_admin_ui::view::AdminWorkspace;

fn main() {
    gpui_kit::application().with_assets(gpui_kit::assets::Assets::new("")).run(|cx: &mut App| {
        gpui_kit::init(cx);
        shenron_theme::init(cx, ThemeMode::Dark);
        let opened = gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| {
            let workspace = cx.new(|cx| AdminWorkspace::new(window, cx));
            cx.new(|cx| Root::new(workspace, window, cx))
        });
        if let Err(error) = opened {
            eprintln!("failed to open the window: {error:#}");
            cx.quit();
        }
    });
}
