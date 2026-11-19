//! `shenron-gallery`: the GPUI side of the pixel-parity harness (`scripts/parity`). It renders
//! the component states of `scripts/parity/states.json` with the unstyled `gpui_base` parts and
//! the Toriyama skin of `packages/ui`, headlessly to PNG, or live in a window (a state or the
//! bench page) for frame timing.

mod bench;
mod contract;
mod gallery;
#[cfg(any(target_os = "linux", target_os = "macos"))]
mod headless;
mod icons;
mod live;
mod palette;
mod text;

use std::{
    borrow::Cow,
    path::{Path, PathBuf},
    process::ExitCode,
    time::Duration,
};

use anyhow::{Context as _, Result, anyhow};
use clap::{Parser, Subcommand};
use gpui_kit::{App, component::ThemeMode};

use crate::{
    contract::{CONTRACT_PATH, Contract, Scene, StateId},
    palette::Theme,
};

#[derive(Parser)]
#[command(name = "shenron-gallery", version, about)]
struct Cli {
    /// Print the state ids of the contract and exit.
    #[arg(long)]
    list: bool,
    /// Repository root holding scripts/parity/states.json and the font files it lists
    /// (default: the nearest ancestor of the working directory that has the contract).
    #[arg(long = "font-dir", global = true, value_name = "REPO_ROOT")]
    font_dir: Option<PathBuf>,
    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand)]
enum Command {
    /// Render states offscreen to `<out>/<theme>/<id with / as __>.png` and `bounds.json`.
    Render {
        #[arg(long)]
        out: PathBuf,
        #[arg(long, default_value = "dark")]
        theme: Theme,
        /// States to render (default: every state of the contract).
        #[arg(long = "id")]
        ids: Vec<StateId>,
    },
    /// Open a 1920x1080 window running one state, or `bench`, with a scripted interaction.
    Window {
        #[arg(long)]
        id: Scene,
        #[arg(long, default_value = "dark")]
        theme: Theme,
        /// Length of the scripted run.
        #[arg(long = "duration-ms", default_value_t = 10_000)]
        duration_ms: u64,
        /// Print `{"frames_ms": [...], "refresh_hz": .., "adapter": ..}` on stdout at the end.
        #[arg(long)]
        json: bool,
        /// Exit once the first frame is drawn (startup measurements).
        #[arg(long)]
        exit_after_first_frame: bool,
    },
}

fn main() -> ExitCode {
    match run(Cli::parse()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("shenron-gallery: {error:#}");
            ExitCode::FAILURE
        },
    }
}

fn run(cli: Cli) -> Result<()> {
    let root = repo_root(cli.font_dir)?;
    let contract = Contract::load(&root)?;

    if cli.list {
        for state in &contract.states {
            println!("{}", state.id);
        }
        return Ok(());
    }

    match cli.command {
        None => Err(anyhow!("nothing to do: pass --list, `render` or `window`")),
        Some(Command::Render { out, theme, ids }) => {
            contract.check_theme(theme.as_str())?;
            render(&contract, &root, &out, theme, &ids)
        },
        Some(Command::Window { id, theme, duration_ms, json, exit_after_first_frame }) => {
            contract.check_theme(theme.as_str())?;
            live::run(live::WindowRequest {
                contract: &contract,
                root: &root,
                scene: id,
                theme,
                duration: Duration::from_millis(duration_ms),
                exit_after_first_frame,
                json,
            })
        },
    }
}

/// The contract states to render: `ids`, or all of them.
fn selected_states(
    contract: &Contract,
    ids: &[StateId],
) -> Result<Vec<(StateId, contract::Interaction)>> {
    let states = contract
        .resolved_states()?
        .into_iter()
        .filter(|(state, _)| ids.is_empty() || ids.contains(state))
        .collect::<Vec<_>>();
    if let Some(missing) = ids.iter().find(|id| !states.iter().any(|(state, _)| state == *id)) {
        return Err(anyhow!("state `{missing}` is not in {CONTRACT_PATH}"));
    }
    Ok(states)
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn render(
    contract: &Contract,
    root: &Path,
    out: &Path,
    theme: Theme,
    ids: &[StateId],
) -> Result<()> {
    let states = selected_states(contract, ids)?;
    let written =
        headless::render(&headless::RenderRequest { contract, root, out, theme, states })?;
    for path in written {
        println!("{}", path.display());
    }
    Ok(())
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn render(contract: &Contract, _: &Path, _: &Path, _: Theme, ids: &[StateId]) -> Result<()> {
    let states = selected_states(contract, ids)?;
    Err(anyhow!(
        "GPUI has no headless renderer on this platform (WGPU on Linux, Metal on macOS): {} \
         states not rendered; use `window`",
        states.len()
    ))
}

/// The repository root: `--font-dir`, or the nearest ancestor of the working directory holding
/// the contract.
fn repo_root(explicit: Option<PathBuf>) -> Result<PathBuf> {
    if let Some(root) = explicit {
        return Ok(root);
    }
    let cwd = std::env::current_dir()?;
    cwd.ancestors()
        .find(|dir| dir.join(CONTRACT_PATH).is_file())
        .map(Path::to_path_buf)
        .ok_or_else(|| anyhow!("no {CONTRACT_PATH} above {}; pass --font-dir", cwd.display()))
}

/// The Inter files of the contract, read for the text system.
fn read_fonts(contract: &Contract, root: &Path) -> Result<Vec<Cow<'static, [u8]>>> {
    if contract.font.family != text::FAMILY {
        return Err(anyhow!(
            "the contract font is `{}`, not {}",
            contract.font.family,
            text::FAMILY
        ));
    }
    contract
        .font_paths(root)
        .into_iter()
        .map(|path| {
            std::fs::read(&path)
                .map(Cow::Owned)
                .with_context(|| format!("reading font {}", path.display()))
        })
        .collect()
}

/// Initializes GPUI Kit and the Shenron theme mode matching the page's color scheme.
fn init(cx: &mut App, theme: Theme) {
    gpui_kit::init(cx);
    shenron_theme::init(
        cx,
        match theme {
            Theme::Dark => ThemeMode::Dark,
            Theme::Light => ThemeMode::Light,
        },
    );
}
