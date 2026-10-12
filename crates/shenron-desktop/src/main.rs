// SPDX-License-Identifier: Apache-2.0
//! Shenron Studio (`shenron-desktop`), the only desktop app: one native window on the Shenron
//! front app (site, manga translation editor, studio and admin) served on loopback by the
//! `shenron-server` sidecar. The editor engine (`koharu-library`) runs in this process behind
//! the `koharu-app` command layer: no second app, binary or inter-process bridge.
//!
//! Start-up: the window opens on the bundled splash (`frontendDist`), the server
//! starts (or `SHENRON_DESKTOP_URL` names one already running), and the window
//! navigates to the manga editor at `/studio` once it answers. Without a local server the window shows the public site, which
//! receives no IPC access.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod server;

#[cfg(feature = "koharu")]
use std::sync::Arc;

#[cfg(feature = "koharu")]
use koharu_library::editor::knowledge::ShenronKnowledge;
use tauri::{Manager as _, WebviewUrl};

/// Public site shown when no local server can be started.
const PUBLIC_SITE: &str = "https://dragonballfr.com";

#[tauri_runtime_cef::cef_entry_point]
fn main() {
    // One Tokio runtime for Tauri and the in-process engines; the main thread enters it so
    // libraries that capture `Handle::current()` during setup (the Koharu renderer) find it.
    let runtime = match tokio::runtime::Builder::new_multi_thread().enable_all().build() {
        Ok(runtime) => runtime,
        Err(error) => {
            eprintln!("shenron-desktop: cannot start the async runtime: {error}");
            std::process::exit(1);
        },
    };
    tauri::async_runtime::set(runtime.handle().clone());
    let _runtime_context = runtime.enter();

    let builder = tauri::Builder::default()
        .runtime(tauri_runtime_cef::Cef::default())
        // A second launch focuses the existing window instead of starting a second server.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) { log::LevelFilter::Debug } else { log::LevelFilter::Info })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .manage(server::LocalServer::default())
        .setup(|app| {
            let window = tauri::WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Shenron Studio")
                .inner_size(1280.0, 860.0)
                .min_inner_size(900.0, 600.0)
                .center()
                // Frameless: the front app draws the Dragon Ball title bar (drag region, buttons).
                .decorations(false)
                .shadow(true)
                // Shown once the splash has painted: no white flash before the first frame.
                .visible(false)
                .on_page_load(|window, payload| {
                    if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                        let _ = window.show();
                    }
                })
                .build()?;
            // Fallback: never leave the window hidden if the splash load event is missed.
            let fallback = window.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                let _ = fallback.show();
            });
            // The Koharu editor engine (koharu-library) runs in this process behind koharu-app's
            // commands, its projects and models under the same home as the local server. Its
            // failure (no usable renderer) leaves the site, studio and local APIs running: the
            // editor reports itself unavailable.
            #[cfg(feature = "koharu")]
            let home = app.path().app_data_dir().ok();
            #[cfg(feature = "koharu")]
            let editor = match koharu_app::setup(
                app,
                koharu_app::Options { home, toolbox: Some(Arc::new(ShenronKnowledge::new(None))) },
            ) {
                Ok(editor) => Some(editor),
                Err(error) => {
                    log::error!("Koharu editor unavailable: {error:#}");
                    None
                },
            };
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let target = match server::start(&handle).await {
                    // The local site works offline (public VFS, local corpus, editor, studio, chat).
                    Ok(url) => {
                        // The editor's agent searches the local corpus of this server.
                        #[cfg(feature = "koharu")]
                        if let Some(editor) = &editor {
                            editor.set_toolbox(Some(Arc::new(ShenronKnowledge::new(Some(url.clone())))));
                        }
                        format!("{url}/studio")
                    },
                    Err(error) => {
                        log::error!("local Shenron server unavailable: {error}");
                        PUBLIC_SITE.to_owned()
                    },
                };
                match target.parse() {
                    Ok(url) => {
                        if let Err(error) = window.navigate(url) {
                            log::error!("navigation to {target} failed: {error}");
                        }
                    },
                    Err(error) => log::error!("invalid server URL {target}: {error}"),
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            #[cfg(feature = "koharu")]
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                koharu_app::on_window_event(window, event);
            }
            if window.label() == "main" && matches!(event, tauri::WindowEvent::Destroyed) {
                window.state::<server::LocalServer>().stop();
            }
        });

    #[cfg(feature = "koharu")]
    let builder = builder.invoke_handler({
        let shenron_commands: Box<dyn Fn(tauri::ipc::Invoke) -> bool + Send + Sync> =
            Box::new(tauri::generate_handler![
                server::shenron_desktop_info,
                shenron_studio::studio::studio_shenron_health,
                shenron_studio::studio::studio_shenron_rag_stats,
                shenron_studio::studio::studio_shenron_rag_search,
                shenron_studio::studio::studio_shenron_training,
                shenron_studio::studio::studio_native_ai_status,
                shenron_studio::studio::studio_native_chat,
                shenron_studio::studio::studio_open_shenron_admin,
                shenron_studio::studio::studio_shenron_train_start,
                shenron_studio::studio::studio_corpus_info,
                shenron_studio::studio::studio_corpus_search,
                shenron_studio::studio::studio_corpus_ask,
                shenron_studio::shenron::shenron_chat,
            ]);
        // Koharu editor commands keep their own names (packages/koharu/src/protocol.ts).
        let koharu_commands = koharu_app::bindings().invoke_handler();
        move |invoke: tauri::ipc::Invoke| {
            if koharu_app::COMMAND_NAMES.contains(&invoke.message.command()) {
                koharu_commands(invoke)
            } else {
                shenron_commands(invoke)
            }
        }
    });
    #[cfg(not(feature = "koharu"))]
    let builder = builder.invoke_handler(tauri::generate_handler![server::shenron_desktop_info]);

    let app = match builder.build(tauri::generate_context!()) {
        Ok(app) => app,
        Err(error) => {
            eprintln!("shenron-desktop: {error}");
            std::process::exit(1);
        },
    };
    app.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            app.state::<server::LocalServer>().stop();
        }
    });
}
