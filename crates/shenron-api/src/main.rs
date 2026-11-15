// SPDX-License-Identifier: Apache-2.0
//! `shenron-api [--listen <addr>]`: serve the ported route groups (default `127.0.0.1:5013`,
//! `SHENRON_API_LISTEN`). The front proxy sends only the paths of `shenron_api::OPERATIONS` here.

use std::process::ExitCode;

#[tokio::main]
async fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let mut listen =
        std::env::var("SHENRON_API_LISTEN").unwrap_or_else(|_| "127.0.0.1:5013".into());
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--listen" => match args.next() {
                Some(value) => listen = value,
                None => return usage("--listen needs an address"),
            },
            "--operations" => {
                for (method, path) in shenron_api::OPERATIONS {
                    println!("{} {path}", method.to_uppercase());
                }
                return ExitCode::SUCCESS;
            },
            "-h" | "--help" => return usage(""),
            other => return usage(&format!("unknown argument {other:?}")),
        }
    }
    let listener = match tokio::net::TcpListener::bind(&listen).await {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("shenron-api: bind {listen}: {error}");
            return ExitCode::FAILURE;
        },
    };
    eprintln!("shenron-api: listening on http://{listen}");
    match axum::serve(listener, shenron_api::router(shenron_api::Ports::default())).await {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("shenron-api: {error}");
            ExitCode::FAILURE
        },
    }
}

fn usage(error: &str) -> ExitCode {
    if !error.is_empty() {
        eprintln!("shenron-api: {error}");
    }
    eprintln!("usage: shenron-api [--listen <addr>] | --operations");
    if error.is_empty() { ExitCode::SUCCESS } else { ExitCode::from(2) }
}
