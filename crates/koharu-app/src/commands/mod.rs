//! The Koharu editor commands: Tauri (Specta) signatures over [`koharu_library::Editor`].
//! Their names, arguments and results are the frontend contract
//! (`packages/koharu/src/protocol.ts`); `koharu_library::editor::dispatch` answers the same
//! commands outside Tauri.

pub(crate) mod agent;
pub(crate) mod canvas;
pub(crate) mod editing;
pub(crate) mod lifecycle;
pub(crate) mod output;

use std::sync::Arc;

use koharu_library::editor::Sink;
use serde::Serialize;
use specta::Type;
use tauri::ipc::{Channel, IpcResponse};

#[derive(Debug, Type)]
#[specta(transparent)]
pub(crate) struct Error(#[specta(type = String)] anyhow::Error);

impl<E> From<E> for Error
where
    E: Into<anyhow::Error>,
{
    fn from(error: E) -> Self {
        Self(error.into())
    }
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&format!("{:#}", self.0))
    }
}

pub(crate) type Result<T> = std::result::Result<T, Error>;

/// An editor receiver over a Tauri channel.
pub(crate) fn sink<T: IpcResponse + Send + Sync + 'static>(channel: Channel<T>) -> Sink<T> {
    Arc::new(move |value| channel.send(value).is_ok())
}

/// Raw bytes answered as an `ArrayBuffer` (typed `number[]` by Specta).
macro_rules! byte_responses {
    ($($(#[$meta:meta])* $name:ident),* $(,)?) => {$(
        $(#[$meta])*
        #[derive(Type)]
        #[specta(transparent)]
        pub(crate) struct $name(#[specta(type = Vec<u8>)] pub(crate) Vec<u8>);

        impl IpcResponse for $name {
            fn body(self) -> tauri::Result<tauri::ipc::InvokeResponseBody> {
                Ok(self.0.into())
            }
        }
    )*};
}

byte_responses![
    /// Prepared canvas manifest or resource packet.
    CanvasBytes,
    /// WebP thumbnail of a page source.
    ThumbnailBytes,
    /// Rendered font sample.
    FontPreviewBytes,
];

/// Defines the Koharu command list once: [`COMMAND_NAMES`], the [`bindings`] a host app
/// (the Shenron desktop app, dynamic runtime) mounts.
/// Commands generic over the Tauri runtime carry an `<Rt>` marker, resolved to each builder's
/// local `Rt` alias (specta needs a concrete runtime).
macro_rules! koharu_commands {
    ($($module:ident :: $command:ident $(<$runtime:ident>)?),* $(,)?) => {
        /// Names of every Koharu IPC command, in registration order.
        pub const COMMAND_NAMES: &[&str] = &[$(stringify!($command)),*];

        /// tauri-specta builder for every Koharu IPC command on a host app's dynamic runtime.
        pub fn bindings() -> tauri_specta::Builder<tauri::DynRuntime> {
            use tauri_specta::{Builder, ErrorHandlingMode, collect_commands};
            type Rt = tauri::DynRuntime;
            Builder::new()
                .commands(collect_commands![$($module::$command $(::<$runtime>)?),*])
                .disable_serde_phases()
                .error_handling(ErrorHandlingMode::Throw)
        }
    };
}

koharu_commands![
    agent::get_agent_status,
    agent::login_agent,
    agent::logout_agent,
    agent::save_agent_config,
    agent::run_agent,
    agent::cancel_agent,
    lifecycle::subscribe,
    lifecycle::get_project,
    lifecycle::get_pages,
    lifecycle::get_page,
    lifecycle::list_projects,
    lifecycle::create_project,
    lifecycle::open_project,
    lifecycle::delete_project,
    lifecycle::close_project,
    lifecycle::import<Rt>,
    lifecycle::select_page,
    editing::rename_page,
    editing::delete_pages,
    editing::move_page,
    editing::set_source_text,
    editing::set_translation,
    editing::set_typography,
    editing::set_geometry,
    editing::set_visibility,
    editing::delete_layers,
    editing::move_layer,
    editing::undo,
    editing::redo,
    editing::process,
    editing::stop_job,
    output::export<Rt>,
    output::get_thumbnail,
    output::get_page_result,
    output::get_page_source_sha256,
    output::get_fonts,
    output::get_font_preview,
    output::save_preferences,
    output::get_preferences,
    output::get_translation_models,
    canvas::get_canvas_manifest,
    canvas::get_canvas_resource,
    canvas::prepare_canvas_page,
    canvas::get_canvas_page_manifest,
    canvas::get_canvas_page_resource,
    canvas::add_point_text,
    canvas::add_text_box,
    canvas::commit_paint,
    canvas::commit_erase,
    canvas::commit_transform,
    canvas::commit_inpaint,
];

#[cfg(test)]
mod tests {
    use super::COMMAND_NAMES;

    /// The Tauri commands and the commands answered outside Tauri are the same set.
    #[test]
    fn every_command_is_dispatched_outside_tauri() {
        let mut tauri = COMMAND_NAMES.to_vec();
        let mut dispatched = koharu_library::editor::dispatch::COMMANDS.to_vec();
        tauri.sort_unstable();
        dispatched.sort_unstable();
        assert_eq!(tauri, dispatched);
    }
}
