// SPDX-License-Identifier: Apache-2.0
use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    process::ExitCode,
};

use shenron_re::{
    formats::emb::EmbFile,
    inventory::inventory_install,
    text::{extract_msg_text, extract_msg_tree},
    world::xenoverse3::xenoverse3_prototype_map,
};

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
        Some(arg) if arg == "emb" => {
            let Some(input) = args.next() else {
                return usage();
            };
            let input = PathBuf::from(input);
            if !input.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("emb")) {
                eprintln!("shenron-re: emb input must have a .emb extension");
                return ExitCode::FAILURE;
            }
            let Some(option) = args.next() else {
                return usage();
            };
            let Some(destination) = args.next() else {
                return usage();
            };
            if option != "--output-dir" || args.next().is_some() {
                return usage();
            }
            let archive_bytes = match fs::read(&input) {
                Ok(bytes) => bytes,
                Err(error) => {
                    eprintln!("shenron-re: could not read {}: {error}", input.display());
                    return ExitCode::FAILURE;
                },
            };
            let archive = match EmbFile::parse(&archive_bytes) {
                Ok(archive) => archive,
                Err(error) => {
                    eprintln!("shenron-re: invalid EMB {}: {error}", input.display());
                    return ExitCode::FAILURE;
                },
            };
            let destination = PathBuf::from(destination);
            if destination.exists() {
                eprintln!("shenron-re: output directory already exists: {}", destination.display());
                return ExitCode::FAILURE;
            }
            if let Err(error) = fs::create_dir(&destination) {
                eprintln!("shenron-re: could not create {}: {error}", destination.display());
                return ExitCode::FAILURE;
            }
            let mut outputs = Vec::with_capacity(archive.entries.len());
            let mut total_bytes = 0u64;
            for (index, entry) in archive.entries.iter().enumerate() {
                let bytes = match archive.entry_bytes(&archive_bytes, index) {
                    Ok(bytes) => bytes,
                    Err(error) => {
                        eprintln!("shenron-re: invalid EMB entry {}: {error}", entry.name);
                        return ExitCode::FAILURE;
                    },
                };
                let output = destination.join(&entry.name);
                let result = OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&output)
                    .and_then(|mut file| file.write_all(bytes));
                if let Err(error) = result {
                    eprintln!("shenron-re: could not create {}: {error}", output.display());
                    return ExitCode::FAILURE;
                }
                total_bytes = total_bytes.saturating_add(bytes.len() as u64);
                outputs.push(serde_json::json!({ "file": entry.name, "sizeBytes": bytes.len() }));
            }
            let summary = serde_json::json!({
                "archive": input.file_name().map(|name| name.to_string_lossy()),
                "entryCount": outputs.len(),
                "totalBytes": total_bytes,
                "files": outputs,
            });
            print_json(&summary)
        },
        Some(arg) if arg == "inventory" => {
            let Some(root) = args.next() else {
                return usage();
            };
            let inventory = match inventory_install(&PathBuf::from(root)) {
                Ok(inventory) => inventory,
                Err(error) => {
                    eprintln!("shenron-re: inventory failed: {error}");
                    return ExitCode::FAILURE;
                },
            };
            match args.next() {
                Some(option) if option == "--output" => match args.next() {
                    Some(path) if args.next().is_none() => {
                        write_json(PathBuf::from(path), &inventory)
                    },
                    _ => usage(),
                },
                None => print_json(&inventory),
                _ => usage(),
            }
        },
        Some(arg) if arg == "text" => {
            let Some(input) = args.next() else {
                return usage();
            };
            let input = PathBuf::from(input);
            if input.is_dir() {
                let Some(option) = args.next() else {
                    return usage();
                };
                let Some(destination) = args.next() else {
                    return usage();
                };
                if option != "--output-dir" || args.next().is_some() {
                    return usage();
                }
                let manifest = match extract_msg_tree(&input, &PathBuf::from(destination)) {
                    Ok(manifest) => manifest,
                    Err(error) => {
                        eprintln!("shenron-re: text batch failed: {error}");
                        return ExitCode::FAILURE;
                    },
                };
                return print_json(&manifest);
            }
            if !input.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("msg")) {
                eprintln!("shenron-re: text input must have a .msg extension");
                return ExitCode::FAILURE;
            }
            let bytes = match fs::read(&input) {
                Ok(bytes) => bytes,
                Err(error) => {
                    eprintln!("shenron-re: could not read {}: {error}", input.display());
                    return ExitCode::FAILURE;
                },
            };
            let text = extract_msg_text(&input, &bytes);
            match args.next() {
                Some(option) if option == "--output" => match args.next() {
                    Some(path) if args.next().is_none() => {
                        write_json_new(PathBuf::from(path), &text)
                    },
                    _ => usage(),
                },
                None => print_json(&text),
                _ => usage(),
            }
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

fn write_json_new(path: PathBuf, value: &impl serde::Serialize) -> ExitCode {
    let json = match serde_json::to_vec_pretty(value) {
        Ok(json) => json,
        Err(error) => {
            eprintln!("shenron-re: could not encode JSON: {error}");
            return ExitCode::FAILURE;
        },
    };
    let result = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .and_then(|mut output| output.write_all(&json));
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("shenron-re: could not create {}: {error}", path.display());
            ExitCode::FAILURE
        },
    }
}

fn usage() -> ExitCode {
    eprintln!(
        "Usage: shenron-re map [--output <file>] | catalog | inventory <game-root> [--output <file>] | text <file.msg> [--output <new-file>] | text <input-dir> --output-dir <new-dir> | emb <file.emb> --output-dir <new-dir>"
    );
    ExitCode::from(2)
}
