// SPDX-License-Identifier: Apache-2.0
//! The `shenron` command and its library surface.
//!
//! - `shenron doctor|status|rag|train|ocr|web|infra|persona|auth`: the Shenron
//!   bridge ([`shenron_cmd`]): health, RAG, training, databooks OCR bridge.
//! - `shenron dbfr …`: the Dragon Ball FR databooks API (`ocr_dbfr`).
//! - `shenron manga …`: Koharu-backed manga detection, cleanup and PSD export.
//!
//! [`run_async`] is the single dispatcher shared by the binary, the C ABI
//! (`shenron-ffi`) and in-process hosts.

use std::ffi::OsString;

use clap::{Parser, Subcommand};

pub mod config;
mod manga_cmd;
#[cfg(feature = "koharu")]
mod manga_settings_cmd;
#[cfg(feature = "ocr")]
mod ocr_dbfr;
#[cfg(feature = "ocr")]
mod ocr_shenron;
mod output;
pub mod shenron_cmd;

/// Shenron (dragonballfr.com): Dragon Ball knowledge, databooks and manga tooling.
#[derive(Debug, Parser)]
#[command(name = "shenron", version, about, propagate_version = true)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    #[command(flatten)]
    Shenron(shenron_cmd::ShenronAction),
    /// Dragon Ball FR databooks API: list, progress, plates, transcriptions and deposits.
    #[cfg(feature = "ocr")]
    Dbfr {
        #[command(subcommand)]
        action: ocr_dbfr::DbfrAction,
    },
    /// Manga pages: detection, cleanup, scanlation and layered PSD export.
    Manga {
        #[command(subcommand)]
        action: manga_cmd::MangaAction,
    },
}

/// Parse `argv` (program name first) and run the command; returns the process exit code.
pub async fn run_async<I, T>(argv: I) -> i32
where
    I: IntoIterator<Item = T>,
    T: Into<OsString> + Clone,
{
    let cli = match Cli::try_parse_from(argv) {
        Ok(cli) => cli,
        Err(error) => {
            let code = error.exit_code();
            // `--help` and `--version` are successful parses printed on stdout.
            let _ = error.print();
            return code;
        },
    };
    let outcome = match cli.command {
        Command::Shenron(action) => shenron_cmd::run(action).await,
        #[cfg(feature = "ocr")]
        Command::Dbfr { action } => ocr_dbfr::run(action).await,
        Command::Manga { action } => manga_cmd::run(action).await,
    };
    match outcome {
        Ok(()) => 0,
        Err(report) => {
            eprintln!("{report:?}");
            1
        },
    }
}

/// Install the process-wide TLS provider used by every HTTP client of the command.
pub fn install_tls_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}
