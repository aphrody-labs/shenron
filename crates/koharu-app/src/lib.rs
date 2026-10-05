//! Koharu's Tauri command layer: the editor commands (Specta) over the engine of
//! [`koharu_library::Editor`], mounted by the Shenron desktop app.

mod app;
mod commands;

pub use app::{Options, on_window_event, setup};
pub use commands::{COMMAND_NAMES, bindings};
