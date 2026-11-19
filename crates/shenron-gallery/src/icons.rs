//! The lucide icons the six components draw, served to GPUI's SVG renderer. Paths and stroke
//! widths are those of lucide-react as `packages/ui` renders them (`stroke-[3.5]` on the
//! checkbox mark, `stroke-[3]` on the select item mark).

use std::borrow::Cow;

use gpui_kit::{AssetSource, Result, SharedString};

pub const CHECK: &str = "icons/check.svg";
pub const CHECK_SELECT: &str = "icons/check-select.svg";
pub const CHEVRON_DOWN: &str = "icons/chevron-down.svg";
pub const X: &str = "icons/x.svg";

/// A lucide icon: 24-unit view box, round caps and joins, the stroke painted as a mask.
fn svg(stroke_width: &str, paths: &str) -> String {
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="{stroke_width}" stroke-linecap="round" stroke-linejoin="round">{paths}</svg>"##
    )
}

/// Serves the icons above; every other path is absent.
pub struct Icons;

impl AssetSource for Icons {
    fn load(&self, path: &str) -> Result<Option<Cow<'static, [u8]>>> {
        let source = match path {
            CHECK => svg("3.5", r#"<path d="M20 6 9 17l-5-5"/>"#),
            CHECK_SELECT => svg("3", r#"<path d="M20 6 9 17l-5-5"/>"#),
            CHEVRON_DOWN => svg("2", r#"<path d="m6 9 6 6 6-6"/>"#),
            X => svg("2", r#"<path d="M18 6 6 18"/><path d="m6 6 12 12"/>"#),
            _ => return Ok(None),
        };
        Ok(Some(Cow::Owned(source.into_bytes())))
    }

    fn list(&self, path: &str) -> Result<Vec<SharedString>> {
        Ok([CHECK, CHECK_SELECT, CHEVRON_DOWN, X]
            .into_iter()
            .filter(|icon| icon.starts_with(path))
            .map(SharedString::from)
            .collect())
    }
}
