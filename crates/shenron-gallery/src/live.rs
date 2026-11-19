//! A real window running one scene with a scripted interaction, for frame-time measurements on
//! the native renderer (DirectX on Windows, Metal on macOS, WGPU on Linux).
//!
//! Frame times are the intervals between consecutive `Window::on_next_frame` callbacks: each
//! callback runs once a frame has been drawn, applies the next scripted input through
//! `Window::dispatch_event` and requests the following frame, so the window renders continuously
//! at the display's pace.

use std::{
    cell::RefCell,
    path::Path,
    rc::Rc,
    time::{Duration, Instant},
};

use anyhow::Result;
use gpui_kit::{
    App, AppContext as _, Bounds, Entity, InputEvent as _, KeyDownEvent, KeyUpEvent, Keystroke,
    Modifiers, MouseButton, MouseDownEvent, MouseMoveEvent, MouseUpEvent, Pixels, Point,
    ScrollDelta, ScrollEvent, ScrollSource, TouchPhase, Window, WindowBounds, WindowOptions, point,
    px, size, test::TestWindowExt as _,
};
use serde::Serialize;

use crate::{
    contract::{Component, Contract, Scene},
    gallery::{self, Gallery},
    icons::Icons,
    palette::Theme,
};

pub struct WindowRequest<'a> {
    pub contract: &'a Contract,
    pub root: &'a Path,
    pub scene: Scene,
    pub theme: Theme,
    pub duration: Duration,
    pub exit_after_first_frame: bool,
    pub json: bool,
}

/// Interval between two Tab presses of the focus cycle of a state scene.
const TAB_INTERVAL: Duration = Duration::from_millis(250);
/// Interval between two openings or closings of the dialog or the select of a state scene.
const TOGGLE_INTERVAL: Duration = Duration::from_millis(1000);
/// Duration of one pointer sweep across the stage of a state scene.
const SWEEP_PERIOD: f32 = 2.;
/// Interval between two commands of the bench script.
const STEP_INTERVAL: Duration = Duration::from_millis(100);

/// One command of the bench script, after `SCRIPT` in `scripts/parity/fps.ts`.
#[derive(Clone, Copy, Debug)]
enum Step {
    Hover(&'static str),
    /// Wheel over the pointer position, in CSS pixels (positive scrolls down).
    Wheel(f32),
    Click(&'static str),
    Press(&'static str),
    Type(&'static str),
    Wait,
}

const BENCH_SCRIPT: &[Step] = &[
    Step::Hover("list"),
    Step::Wheel(300.),
    Step::Wheel(300.),
    Step::Wheel(300.),
    Step::Wheel(300.),
    Step::Wheel(300.),
    Step::Wheel(300.),
    Step::Wheel(300.),
    Step::Wheel(300.),
    Step::Hover("button"),
    Step::Hover("tab-2"),
    Step::Click("switch"),
    Step::Click("checkbox"),
    Step::Click("tab-2"),
    Step::Click("tab-1"),
    Step::Click("dialog-trigger"),
    Step::Wait,
    Step::Click("close"),
    Step::Wait,
    Step::Wait,
    Step::Wait,
    Step::Click("select-trigger"),
    Step::Press("down"),
    Step::Press("down"),
    Step::Press("enter"),
    Step::Wait,
    Step::Wait,
    Step::Wait,
    Step::Click("input"),
    Step::Type("Dragon Ball"),
    Step::Hover("list"),
    Step::Wheel(-300.),
    Step::Wheel(-300.),
    Step::Wheel(-300.),
    Step::Wheel(-300.),
    Step::Wheel(-300.),
    Step::Wheel(-300.),
    Step::Wheel(-300.),
    Step::Wheel(-300.),
];

#[derive(Serialize)]
struct Report {
    scene: &'static str,
    frames_ms: Vec<f64>,
    refresh_hz: Option<u32>,
    adapter: Option<String>,
    driver: Option<String>,
    software_emulated: Option<bool>,
    commands: usize,
}

struct Driver {
    view: Entity<Gallery>,
    origin: Point<Pixels>,
    duration: Duration,
    exit_after_first_frame: bool,
    json: bool,
    started: Option<Instant>,
    last_frame: Option<Instant>,
    last_tab: Duration,
    last_toggle: Duration,
    last_step: Duration,
    step: usize,
    pointer: Point<Pixels>,
    frames_ms: Vec<f64>,
}

pub fn run(request: WindowRequest<'_>) -> Result<()> {
    let fonts = crate::read_fonts(request.contract, request.root)?;
    let viewport = request.contract.viewport;
    let origin = request.contract.origin;
    let scene = request.scene;
    let theme = request.theme;
    let duration = request.duration;
    let exit_after_first_frame = request.exit_after_first_frame;
    let json = request.json;
    let failure: Rc<RefCell<Option<anyhow::Error>>> = Rc::default();
    let failed = failure.clone();

    gpui_kit::application().with_assets(Icons).run(move |cx| {
        let opened = (|| -> Result<()> {
            cx.text_system().add_fonts(fonts)?;
            crate::init(cx, theme);
            let window_size = size(px(viewport.width as f32), px(viewport.height as f32));
            // The measurement is of the renderer, not of GPUI's power policy: the frame-rate
            // caps for inactive windows, Low Power Mode and thermal pressure are lifted.
            let options = WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                    None,
                    window_size,
                    cx,
                ))),
                inactive_frame_interval: None,
                low_power_frame_interval: None,
                thermal_frame_interval: None,
                ..Default::default()
            };
            let (handle, view) = gpui_kit::open_window(options, cx, |_, cx| {
                cx.new(|cx| Gallery::new(scene, theme, origin, cx))
            })?;
            let page = view.read(cx).page_focus();
            let driver = Rc::new(RefCell::new(Driver {
                view,
                origin: point(px(origin.x), px(origin.y)),
                duration,
                exit_after_first_frame,
                json,
                started: None,
                last_frame: None,
                last_tab: Duration::ZERO,
                last_toggle: Duration::ZERO,
                last_step: Duration::ZERO,
                step: 0,
                pointer: point(window_size.width - px(10.), window_size.height - px(10.)),
                frames_ms: Vec::new(),
            }));
            handle.update(cx, |_, window, cx| {
                window.activate_window();
                page.focus(window, cx);
                window.on_next_frame(move |window, cx| tick(&driver, window, cx));
                window.refresh();
            })?;
            Ok(())
        })();
        if let Err(error) = opened {
            *failed.borrow_mut() = Some(error);
            cx.quit();
        }
    });

    match failure.borrow_mut().take() {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

fn tick(driver: &Rc<RefCell<Driver>>, window: &mut Window, cx: &mut App) {
    let now = Instant::now();
    let (elapsed, finished) = {
        let mut state = driver.borrow_mut();
        let started = *state.started.get_or_insert(now);
        if let Some(last) = state.last_frame.replace(now) {
            state.frames_ms.push((now - last).as_secs_f64() * 1000.);
        }
        let elapsed = now - started;
        (elapsed, state.exit_after_first_frame || elapsed >= state.duration)
    };
    if finished {
        finish(&driver.borrow(), window, cx);
        return;
    }

    let scene = driver.borrow().view.read(cx).scene();
    match scene {
        Scene::Bench => bench_script(driver, elapsed, window, cx),
        Scene::State(_) => state_script(driver, elapsed, window, cx),
    }
    let next = driver.clone();
    window.on_next_frame(move |window, cx| tick(&next, window, cx));
    window.refresh();
}

fn move_pointer(window: &mut Window, cx: &mut App, position: Point<Pixels>) {
    window.dispatch_event(
        MouseMoveEvent { position, pressed_button: None, modifiers: Modifiers::default() }
            .to_platform_input(),
        cx,
    );
}

fn press_key(window: &mut Window, cx: &mut App, key: &'static str) {
    let Ok(keystroke) = Keystroke::parse(key) else {
        return;
    };
    window.dispatch_event(
        KeyDownEvent {
            keystroke: keystroke.clone(),
            is_held: false,
            prefer_character_input: false,
        }
        .to_platform_input(),
        cx,
    );
    window.dispatch_event(KeyUpEvent { keystroke }.to_platform_input(), cx);
}

fn click(window: &mut Window, cx: &mut App, position: Point<Pixels>) {
    move_pointer(window, cx, position);
    let modifiers = Modifiers::default();
    window.dispatch_event(
        MouseDownEvent {
            button: MouseButton::Left,
            position,
            modifiers,
            click_count: 1,
            first_mouse: false,
        }
        .to_platform_input(),
        cx,
    );
    window.dispatch_event(
        MouseUpEvent { button: MouseButton::Left, position, modifiers, click_count: 1 }
            .to_platform_input(),
        cx,
    );
}

/// The state scenes: a pointer sweep over the stage on every frame, Tab focus cycling, and the
/// dialog or the select opened and closed in turn.
fn state_script(
    driver: &Rc<RefCell<Driver>>,
    elapsed: Duration,
    window: &mut Window,
    cx: &mut App,
) {
    let (origin, view, press_tab, toggle) = {
        let mut state = driver.borrow_mut();
        let press_tab = elapsed - state.last_tab >= TAB_INTERVAL;
        if press_tab {
            state.last_tab = elapsed;
        }
        let toggle = elapsed - state.last_toggle >= TOGGLE_INTERVAL;
        if toggle {
            state.last_toggle = elapsed;
        }
        (state.origin, state.view.clone(), press_tab, toggle)
    };
    let component = view.read(cx).scene().component();

    // Sweep the row of the component back and forth; the dialog sweeps its popup instead.
    let phase = (elapsed.as_secs_f32() / SWEEP_PERIOD).fract();
    let along = 1. - (2. * phase - 1.).abs();
    let (start, span, row) = match component {
        Some(Component::Dialog) => (px(700.), 520., px(560.)),
        _ => (origin.x - px(16.), 360., origin.y + px(16.)),
    };
    move_pointer(window, cx, point(start + px(span * along), row));
    if press_tab {
        press_key(window, cx, "tab");
    }
    if toggle {
        view.update(cx, |gallery, cx| gallery.toggle_overlays(cx));
    }
}

/// The bench scene: the commands of `fps.ts`, one every `STEP_INTERVAL`, in a loop.
fn bench_script(
    driver: &Rc<RefCell<Driver>>,
    elapsed: Duration,
    window: &mut Window,
    cx: &mut App,
) {
    let (step, view, pointer) = {
        let mut state = driver.borrow_mut();
        if elapsed - state.last_step < STEP_INTERVAL {
            return;
        }
        state.last_step = elapsed;
        let step = BENCH_SCRIPT[state.step % BENCH_SCRIPT.len()];
        state.step += 1;
        (step, state.view.clone(), state.pointer)
    };
    let center = |window: &Window, id: &'static str| {
        let id = gallery::element_id(id).unwrap_or(id);
        window.try_find(id).map(|element| element.bounds().center())
    };

    match step {
        Step::Wait => {},
        Step::Hover(id) => {
            if let Some(position) = center(window, id) {
                driver.borrow_mut().pointer = position;
                move_pointer(window, cx, position);
            }
        },
        Step::Click(id) => {
            if let Some(position) = center(window, id) {
                driver.borrow_mut().pointer = position;
                click(window, cx, position);
            }
        },
        Step::Wheel(delta) => {
            window.dispatch_event(
                ScrollEvent {
                    position: pointer,
                    // GPUI scrolls content down for a negative delta.
                    delta: ScrollDelta::Pixels(point(px(0.), px(-delta))),
                    modifiers: Modifiers::default(),
                    touch_phase: TouchPhase::Moved,
                    source: ScrollSource::default(),
                }
                .to_platform_input(),
                cx,
            );
        },
        Step::Press(key) => press_key(window, cx, key),
        Step::Type(text) => {
            view.update(cx, |gallery, cx| {
                gallery.bench.input = text.to_owned();
                cx.notify();
            });
        },
    }
}

fn finish(driver: &Driver, window: &mut Window, cx: &mut App) {
    if driver.json {
        let specs = window.gpu_specs();
        let report = Report {
            scene: driver.view.read(cx).scene().as_str(),
            frames_ms: driver.frames_ms.clone(),
            refresh_hz: refresh_hz(),
            adapter: specs.as_ref().map(|specs| specs.device_name.clone()),
            driver: specs.as_ref().map(|specs| specs.driver_name.clone()),
            software_emulated: specs.as_ref().map(|specs| specs.is_software_emulated),
            commands: driver.step,
        };
        match serde_json::to_string(&report) {
            Ok(line) => println!("{line}"),
            Err(error) => eprintln!("shenron-gallery: {error}"),
        }
    }
    cx.quit();
}

/// Refresh rate of the primary display, from the display mode the OS reports.
#[cfg(target_os = "windows")]
fn refresh_hz() -> Option<u32> {
    use windows::{
        Win32::Graphics::Gdi::{DEVMODEW, ENUM_CURRENT_SETTINGS, EnumDisplaySettingsW},
        core::PCWSTR,
    };

    let mut mode =
        DEVMODEW { dmSize: std::mem::size_of::<DEVMODEW>() as u16, ..Default::default() };
    // SAFETY: `mode` is a valid, sized DEVMODEW; a null device name selects the primary display.
    let found = unsafe { EnumDisplaySettingsW(PCWSTR::null(), ENUM_CURRENT_SETTINGS, &mut mode) };
    (found.as_bool() && mode.dmDisplayFrequency > 1).then_some(mode.dmDisplayFrequency)
}

#[cfg(not(target_os = "windows"))]
fn refresh_hz() -> Option<u32> {
    None
}
