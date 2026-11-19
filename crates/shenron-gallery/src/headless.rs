//! Offscreen rendering of the states to PNG through GPUI's real renderer: WGPU on Linux (any
//! Vulkan device, llvmpipe included), Metal on macOS. Every state renders in a fresh app with
//! the deterministic test dispatcher, so two runs produce the same bytes.

use std::{
    borrow::Cow,
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::Arc,
};

use anyhow::{Context as _, Result, anyhow, bail};
use gpui_kit::{
    App, AppContext as _, Bounds, HeadlessAppContext, MouseButton, PlatformTextSystem, Window,
    WindowBounds, WindowOptions, point, px, size,
    test::{TestEventExt as _, TestWindowExt as _},
};
use image::{ImageFormat, RgbaImage, imageops};
use serde::{Deserialize, Serialize};

use crate::{
    contract::{Contract, Interaction, Scene, StateId},
    gallery::{self, Gallery},
    icons::Icons,
    palette::Theme,
    text,
};

/// Tab presses tried before a focus-visible state is declared unreachable, as in capture.ts.
const MAX_TAB_PRESSES: usize = 8;

pub struct RenderRequest<'a> {
    pub contract: &'a Contract,
    pub root: &'a Path,
    pub out: &'a Path,
    pub theme: Theme,
    pub states: Vec<(StateId, Interaction)>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct StateBounds {
    pub parts: BTreeMap<String, Rect>,
}

/// Renders the requested states to `<out>/<theme>/<stem>.png` and merges their part bounds into
/// `<out>/<theme>/bounds.json`.
pub fn render(request: &RenderRequest<'_>) -> Result<Vec<PathBuf>> {
    let fonts = crate::read_fonts(request.contract, request.root)?;
    let dir = request.out.join(request.theme.as_str());
    std::fs::create_dir_all(&dir).with_context(|| format!("creating {}", dir.display()))?;
    let bounds_path = dir.join("bounds.json");
    let mut bounds: BTreeMap<String, StateBounds> = match std::fs::read(&bounds_path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .with_context(|| format!("parsing {}", bounds_path.display()))?,
        Err(_) => BTreeMap::new(),
    };

    let mut written = Vec::with_capacity(request.states.len());
    for (state, interaction) in &request.states {
        let (image, parts) = render_state(request, &fonts, *state, interaction)
            .with_context(|| format!("rendering {state}"))?;
        let path = dir.join(format!("{}.png", state.file_stem()));
        image
            .save_with_format(&path, ImageFormat::Png)
            .with_context(|| format!("writing {}", path.display()))?;
        bounds.insert(state.as_str().to_owned(), parts);
        written.push(path);
    }

    let mut json = serde_json::to_vec_pretty(&bounds)?;
    json.push(b'\n');
    std::fs::write(&bounds_path, json)
        .with_context(|| format!("writing {}", bounds_path.display()))?;
    Ok(written)
}

/// The platform text system with only the contract's Inter files: no system font database, so a
/// glyph missing from Inter cannot silently come from another family.
fn text_system() -> Arc<dyn PlatformTextSystem> {
    #[cfg(target_os = "linux")]
    {
        Arc::new(gpui_wgpu::CosmicTextSystem::new_without_system_fonts(text::FAMILY))
    }
    #[cfg(not(target_os = "linux"))]
    {
        gpui_kit::platform::current_platform(true).text_system()
    }
}

fn render_state(
    request: &RenderRequest<'_>,
    fonts: &[Cow<'static, [u8]>],
    state: StateId,
    interaction: &Interaction,
) -> Result<(RgbaImage, StateBounds)> {
    let viewport = request.contract.viewport;
    let origin = request.contract.origin;
    let theme = request.theme;
    let text_system = text_system();
    text_system.add_fonts(fonts.to_vec())?;
    let mut cx = HeadlessAppContext::with_platform(
        text_system,
        Arc::new(Icons),
        gpui_kit::platform::current_headless_renderer,
    );
    cx.update(|cx| crate::init(cx, theme));

    let window_size = size(px(viewport.width as f32), px(viewport.height as f32));
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds {
                    origin: point(px(0.), px(0.)),
                    size: window_size,
                })),
                focus: false,
                show: false,
                ..Default::default()
            },
            cx,
            |_, cx| cx.new(|cx| Gallery::new(Scene::State(state), theme, origin, cx)),
        )
    })?;

    let parts = cx.update_window(handle, |_, window, cx| -> Result<StateBounds> {
        // The test window reports a 2x display; the contract renders at scale 1. The scene is
        // laid out and rasterized at 1x and the capture cropped to the viewport below.
        window.set_scale_factor(viewport.scale);
        window.render_frame(cx);
        // Park the pointer away from every component before any interaction, as capture.ts does.
        let park = point(window_size.width - px(10.), window_size.height - px(10.));
        window.pointer_move(park, None, cx);
        let page = view.read(cx).page_focus();
        page.focus(window, cx);
        window.render_frame(cx);
        interact(window, cx, interaction, park)?;
        window.render_frame(cx);
        Ok(part_bounds(window))
    })??;
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| window.render_frame(cx))?;

    let capture = cx.capture_screenshot(handle)?;
    let image = imageops::crop_imm(&capture, 0, 0, viewport.width, viewport.height).to_image();
    if image.dimensions() != (viewport.width, viewport.height) {
        bail!("capture is {:?}, smaller than the viewport", capture.dimensions());
    }
    Ok((image, parts))
}

fn target(part: &str) -> Result<&'static str> {
    gallery::element_id(part).ok_or_else(|| anyhow!("no element for part `{part}`"))
}

/// Center of a part in the last frame.
fn center(window: &Window, part: &str) -> Result<gpui_kit::Point<gpui_kit::Pixels>> {
    let element = window
        .try_find(target(part)?)
        .ok_or_else(|| anyhow!("part `{part}` is not in the frame"))?;
    Ok(element.bounds().center())
}

/// Applies the state's interaction with native pointer and keyboard events.
fn interact(
    window: &mut Window,
    cx: &mut App,
    interaction: &Interaction,
    park: gpui_kit::Point<gpui_kit::Pixels>,
) -> Result<()> {
    match interaction {
        Interaction::None => {},
        Interaction::Hover(part) => {
            let center = center(window, part)?;
            window.pointer_move(center, None, cx);
        },
        Interaction::Click(part) => {
            let center = center(window, part)?;
            window.pointer_move(center, None, cx);
            window.pointer_down(center, MouseButton::Left, cx);
            window.pointer_up(center, MouseButton::Left, cx);
            window.pointer_move(park, None, cx);
        },
        Interaction::FocusVisible(part) => {
            let id = target(part)?;
            let reached = (0..MAX_TAB_PRESSES).any(|_| {
                window.press("tab", cx);
                window.try_find(id).is_some_and(|element| element.focused() == Some(true))
            });
            if !reached {
                bail!("Tab never reached `{part}`");
            }
            if !window.last_input_was_keyboard() {
                bail!("`{part}` is focused but not focus-visible");
            }
        },
    }
    Ok(())
}

fn part_bounds(window: &Window) -> StateBounds {
    let parts = gallery::PARTS
        .iter()
        .filter_map(|(part, id)| {
            let bounds = window.try_find(*id)?.bounds();
            Some((
                (*part).to_owned(),
                Rect {
                    x: f32::from(bounds.origin.x),
                    y: f32::from(bounds.origin.y),
                    w: f32::from(bounds.size.width),
                    h: f32::from(bounds.size.height),
                },
            ))
        })
        .collect();
    StateBounds { parts }
}
