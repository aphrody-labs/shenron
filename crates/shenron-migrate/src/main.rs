// SPDX-License-Identifier: Apache-2.0
//! `shenron-migrate status [--json] | check | ratchet` over `migration/rust.toml`.

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let command = args.first().map_or("status", String::as_str);
    let json = args.iter().any(|a| a == "--json");
    let cwd = std::env::current_dir().unwrap_or_default();
    let Some(root) = shenron_migrate::find_root(&cwd) else {
        eprintln!("shenron-migrate: no {} above {}", shenron_migrate::LEDGER, cwd.display());
        return ExitCode::from(2);
    };
    let ledger = match shenron_migrate::load(&root) {
        Ok(ledger) => ledger,
        Err(error) => {
            eprintln!("shenron-migrate: {error}");
            return ExitCode::from(2);
        },
    };
    let status = match shenron_migrate::status(&root, &ledger) {
        Ok(status) => status,
        Err(error) => {
            eprintln!("shenron-migrate: {error}");
            return ExitCode::from(2);
        },
    };
    match command {
        "status" if json => {
            println!("{}", serde_json::to_string_pretty(&status).unwrap_or_default())
        },
        "status" => print!("{}", shenron_migrate::render(&status)),
        "check" => {
            print!("{}", shenron_migrate::render(&status));
            if !status.problems.is_empty() {
                for problem in &status.problems {
                    eprintln!("migrate: {problem}");
                }
                return ExitCode::FAILURE;
            }
            println!("migrate: ledger ok");
        },
        "ratchet" => {
            let path = root.join(shenron_migrate::LEDGER);
            let text = std::fs::read_to_string(&path).unwrap_or_default();
            let next = shenron_migrate::ratchet(&text, &status);
            if next != text {
                if let Err(error) = std::fs::write(&path, next) {
                    eprintln!("shenron-migrate: {}: {error}", path.display());
                    return ExitCode::FAILURE;
                }
                println!("migrate: ratchet lowered in {}", shenron_migrate::LEDGER);
            } else {
                println!("migrate: ratchet unchanged");
            }
        },
        other => {
            eprintln!("usage: shenron-migrate status [--json] | check | ratchet (got {other:?})");
            return ExitCode::from(2);
        },
    }
    ExitCode::SUCCESS
}
