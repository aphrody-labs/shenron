// SPDX-License-Identifier: Apache-2.0
use std::{env, fs, path::PathBuf, process::ExitCode};

use shenron_re::world::xenoverse3::xenoverse3_prototype_map;

fn main() -> ExitCode {
    let mut args = env::args_os().skip(1);
    match args.next().as_deref() {
        Some(arg) if arg == "map" => {
            let result = xenoverse3_prototype_map();
            match args.next() {
                Some(path) if path == "--output" => match args.next() {
                    Some(path) if args.next().is_none() => write_json(PathBuf::from(path), &result),
                    _ => usage(),
                },
                None => print_json(&result),
                _ => usage(),
            }
        },
        Some(arg) if arg == "catalog" => {
            if args.next().is_some() {
                return usage();
            }
            let catalog = shenron_re::get_dragon_ball_catalog();
            print_json(&catalog)
        },
        _ => usage(),
    }
}

fn print_json(value: &impl serde::Serialize) -> ExitCode {
    match serde_json::to_string_pretty(value) {
        Ok(json) => {
            println!("{json}");
            ExitCode::SUCCESS
        },
        Err(error) => {
            eprintln!("shenron-re: could not encode JSON: {error}");
            ExitCode::FAILURE
        },
    }
}

fn write_json(path: PathBuf, value: &impl serde::Serialize) -> ExitCode {
    let json = match serde_json::to_vec_pretty(value) {
        Ok(json) => json,
        Err(error) => {
            eprintln!("shenron-re: could not encode JSON: {error}");
            return ExitCode::FAILURE;
        },
    };
    match fs::write(&path, json) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("shenron-re: could not write {}: {error}", path.display());
            ExitCode::FAILURE
        },
    }
}

fn usage() -> ExitCode {
    eprintln!("Usage: shenron-re map [--output <file>] | catalog");
    ExitCode::from(2)
}
