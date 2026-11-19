// SPDX-License-Identifier: Apache-2.0
//! `shenron-edge --config <file>` runs the proxy; `--check` validates the file and exits.

use std::path::PathBuf;
use std::process::ExitCode;

use tracing_subscriber::EnvFilter;

fn usage() -> ExitCode {
    eprintln!("usage: shenron-edge [--check] --config <file>   (or SHENRON_EDGE_CONFIG)");
    ExitCode::from(2)
}

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let mut config = std::env::var_os("SHENRON_EDGE_CONFIG").map(PathBuf::from);
    let mut check_only = false;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--check" => check_only = true,
            "--config" | "-c" => match args.next() {
                Some(path) => config = Some(PathBuf::from(path)),
                None => return usage(),
            },
            _ => return usage(),
        }
    }
    let Some(config) = config else { return usage() };

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let result = if check_only {
        shenron_edge::server::check(config).map(|()| println!("configuration ok"))
    } else {
        shenron_edge::server::run(config)
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(err) => {
            eprintln!("shenron-edge: {err:#}");
            ExitCode::FAILURE
        },
    }
}
