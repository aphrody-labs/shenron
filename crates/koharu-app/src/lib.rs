//! Koharu's Tauri-managed application state, commands, and lifecycle.

mod app;
mod commands;

pub use app::{on_window_event, setup};
pub use commands::{COMMAND_NAMES, bindings};
