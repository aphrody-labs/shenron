// SPDX-License-Identifier: Apache-2.0
//! The ledger of the TypeScript to Rust migration (`migration/rust.toml`) and its gate.
//!
//! Every TypeScript file of the repository belongs to one unit (the longest matching path). A
//! unit's `ts_lines` is a ratchet: its TypeScript may shrink, never grow. `dual` units name the
//! golden cases both implementations replay; `rust` units have no TypeScript left. The HTTP
//! contract coverage is the share of OpenAPI operations `shenron_api::OPERATIONS` serves.

use std::{
    collections::BTreeMap,
    fmt::Write as _,
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

pub const LEDGER: &str = "migration/rust.toml";
pub const OPENAPI: &str = "packages/api/openapi/public.json";

#[derive(Deserialize)]
pub struct Ledger {
    pub ledger: Settings,
    #[serde(rename = "unit")]
    pub units: Vec<Unit>,
}

#[derive(Deserialize)]
pub struct Settings {
    pub exclude: Vec<String>,
}

#[derive(Deserialize, Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum State {
    Ts,
    Dual,
    Rust,
}

#[derive(Deserialize)]
pub struct Unit {
    pub name: String,
    pub ts: Vec<String>,
    pub rust: String,
    pub state: State,
    #[serde(default)]
    pub parity: Vec<String>,
    pub ts_lines: u64,
    #[serde(default)]
    pub note: String,
}

/// One unit as measured now.
#[derive(Serialize)]
pub struct UnitStatus {
    pub name: String,
    pub state: State,
    pub rust: String,
    pub rust_exists: bool,
    pub ts_files: u64,
    pub ts_lines: u64,
    pub ts_lines_max: u64,
}

#[derive(Serialize)]
pub struct Status {
    pub units: Vec<UnitStatus>,
    pub ts_lines: u64,
    pub api_operations: usize,
    pub api_operations_rust: usize,
    /// Problems the gate reports (empty: the gate passes).
    pub problems: Vec<String>,
}

/// The repository root: the first ancestor of `start` holding the ledger.
pub fn find_root(start: &Path) -> Option<PathBuf> {
    start.ancestors().find(|dir| dir.join(LEDGER).is_file()).map(Path::to_path_buf)
}

pub fn load(root: &Path) -> Result<Ledger, String> {
    let text = fs::read_to_string(root.join(LEDGER)).map_err(|e| format!("{LEDGER}: {e}"))?;
    toml::from_str(&text).map_err(|e| format!("{LEDGER}: {e}"))
}

fn is_typescript(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| matches!(e, "ts" | "tsx" | "mts" | "cts"))
}

/// Lines as the ledger counts them: newline bytes, plus a last line without one.
fn count_lines(bytes: &[u8]) -> u64 {
    let newlines = bytes.iter().filter(|&&b| b == b'\n').count() as u64;
    newlines + u64::from(bytes.last().is_some_and(|&b| b != b'\n'))
}

/// `path` relative to the root with `/` separators.
fn relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/")
}

fn owner<'a>(units: &'a [Unit], file: &str) -> Option<&'a Unit> {
    units
        .iter()
        .flat_map(|unit| unit.ts.iter().map(move |prefix| (unit, prefix.trim_end_matches('/'))))
        .filter(|(_, prefix)| file == *prefix || file.starts_with(&format!("{prefix}/")))
        .max_by_key(|(_, prefix)| prefix.len())
        .map(|(unit, _)| unit)
}

/// Operations of the OpenAPI document, as `(method, path)`.
fn contract_operations(root: &Path) -> Result<Vec<(String, String)>, String> {
    let text = fs::read_to_string(root.join(OPENAPI)).map_err(|e| format!("{OPENAPI}: {e}"))?;
    let document: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("{OPENAPI}: {e}"))?;
    let paths = document["paths"].as_object().ok_or_else(|| format!("{OPENAPI}: no paths"))?;
    let methods = ["get", "post", "put", "patch", "delete"];
    Ok(paths
        .iter()
        .flat_map(|(path, item)| {
            methods
                .iter()
                .filter(|m| item.get(**m).is_some())
                .map(|m| ((*m).to_owned(), path.clone()))
        })
        .collect())
}

/// Measure the repository against the ledger.
pub fn status(root: &Path, ledger: &Ledger) -> Result<Status, String> {
    let mut problems = Vec::new();
    let mut measured: BTreeMap<&str, (u64, u64)> = BTreeMap::new();
    let walker = WalkDir::new(root).into_iter().filter_entry(|entry| {
        !(entry.file_type().is_dir()
            && entry.depth() > 0
            && ledger.ledger.exclude.iter().any(|name| entry.file_name() == name.as_str()))
    });
    let mut unowned = Vec::new();
    for entry in walker {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().is_file() || !is_typescript(entry.path()) {
            continue;
        }
        let file = relative(root, entry.path());
        let Some(unit) = owner(&ledger.units, &file) else {
            unowned.push(file);
            continue;
        };
        let bytes = fs::read(entry.path()).map_err(|e| format!("{file}: {e}"))?;
        let slot = measured.entry(unit.name.as_str()).or_default();
        slot.0 += 1;
        slot.1 += count_lines(&bytes);
    }
    if !unowned.is_empty() {
        unowned.sort();
        problems.push(format!(
            "{} TypeScript file(s) in no unit of {LEDGER} (add a unit or a path): {}",
            unowned.len(),
            unowned.iter().take(10).cloned().collect::<Vec<_>>().join(", ")
        ));
    }
    let mut names = BTreeMap::new();
    let mut units = Vec::new();
    for unit in &ledger.units {
        if names.insert(unit.name.as_str(), ()).is_some() {
            problems.push(format!("unit {:?} is declared twice", unit.name));
        }
        let (files, lines) = measured.get(unit.name.as_str()).copied().unwrap_or_default();
        let rust_exists = root.join(&unit.rust).join("Cargo.toml").is_file();
        if lines > unit.ts_lines {
            problems.push(format!(
                "{}: {lines} TypeScript lines, ratchet {} (+{}): move the new code to {} or lower another unit",
                unit.name,
                unit.ts_lines,
                lines - unit.ts_lines,
                unit.rust
            ));
        }
        match unit.state {
            State::Ts => {},
            State::Dual | State::Rust if !rust_exists => {
                problems.push(format!(
                    "{}: state {:?} but {} has no Cargo.toml",
                    unit.name, unit.state, unit.rust
                ));
            },
            State::Dual => {
                if unit.parity.is_empty() {
                    problems.push(format!("{}: dual without parity paths", unit.name));
                }
                for path in &unit.parity {
                    if !root.join(path).exists() {
                        problems.push(format!("{}: parity path {path} is missing", unit.name));
                    }
                }
            },
            State::Rust => {
                if lines > 0 {
                    problems.push(format!(
                        "{}: state rust but {lines} TypeScript lines remain",
                        unit.name
                    ));
                }
            },
        }
        units.push(UnitStatus {
            name: unit.name.clone(),
            state: unit.state,
            rust: unit.rust.clone(),
            rust_exists,
            ts_files: files,
            ts_lines: lines,
            ts_lines_max: unit.ts_lines,
        });
    }
    let contract = contract_operations(root)?;
    for (method, path) in shenron_api::OPERATIONS {
        if !contract.iter().any(|(m, p)| m == method && p == path) {
            problems.push(format!("shenron-api serves {method} {path}, absent from {OPENAPI}"));
        }
    }
    Ok(Status {
        ts_lines: units.iter().map(|u| u.ts_lines).sum(),
        units,
        api_operations: contract.len(),
        api_operations_rust: shenron_api::OPERATIONS.len(),
        problems,
    })
}

/// The status as a table.
pub fn render(status: &Status) -> String {
    let mut out = String::new();
    let _ = writeln!(out, "{:<14} {:<5} {:>8} {:>8}  rust", "unit", "state", "ts", "max");
    for unit in &status.units {
        let state = match unit.state {
            State::Ts => "ts",
            State::Dual => "dual",
            State::Rust => "rust",
        };
        let mark = if unit.rust_exists { "" } else { " (planned)" };
        let _ = writeln!(
            out,
            "{:<14} {:<5} {:>8} {:>8}  {}{mark}",
            unit.name, state, unit.ts_lines, unit.ts_lines_max, unit.rust
        );
    }
    let _ = writeln!(
        out,
        "TypeScript left: {} lines; HTTP contract in Rust: {}/{} operations",
        status.ts_lines, status.api_operations_rust, status.api_operations
    );
    out
}

/// Lower every `ts_lines` to what is left; returns the new ledger text.
pub fn ratchet(text: &str, status: &Status) -> String {
    let left: BTreeMap<&str, u64> =
        status.units.iter().map(|u| (u.name.as_str(), u.ts_lines)).collect();
    let mut current: Option<String> = None;
    let mut out = String::with_capacity(text.len());
    for line in text.split_inclusive('\n') {
        let trimmed = line.trim();
        if trimmed == "[[unit]]" {
            current = None;
        } else if let Some(name) = trimmed.strip_prefix("name = ").map(|v| v.trim_matches('"')) {
            current = Some(name.to_owned());
        } else if let (Some(name), Some(value)) = (&current, trimmed.strip_prefix("ts_lines = "))
            && let (Some(&now), Ok(max)) = (left.get(name.as_str()), value.parse::<u64>())
            && now < max
        {
            let ending = if line.ends_with('\n') { "\n" } else { "" };
            let _ = write!(out, "ts_lines = {now}{ending}");
            continue;
        }
        out.push_str(line);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lines_count_a_last_line_without_newline() {
        assert_eq!(count_lines(b""), 0);
        assert_eq!(count_lines(b"a\nb\n"), 2);
        assert_eq!(count_lines(b"a\nb"), 2);
    }

    #[test]
    fn the_longest_path_owns_a_file() {
        let unit = |name: &str, ts: &str| Unit {
            name: name.into(),
            ts: vec![ts.into()],
            rust: String::new(),
            state: State::Ts,
            parity: Vec::new(),
            ts_lines: 0,
            note: String::new(),
        };
        let units = [unit("scripts", "scripts"), unit("deep", "scripts/deploy")];
        assert_eq!(owner(&units, "scripts/deploy/lanes.ts").map(|u| u.name.as_str()), Some("deep"));
        assert_eq!(owner(&units, "scripts/x.ts").map(|u| u.name.as_str()), Some("scripts"));
        assert!(owner(&units, "scriptsx/a.ts").is_none());
    }

    #[test]
    fn ratchet_only_lowers() {
        let text =
            "[[unit]]\nname = \"a\"\nts_lines = 10\n\n[[unit]]\nname = \"b\"\nts_lines = 5\n";
        let status = Status {
            units: vec![
                UnitStatus {
                    name: "a".into(),
                    state: State::Ts,
                    rust: String::new(),
                    rust_exists: false,
                    ts_files: 1,
                    ts_lines: 7,
                    ts_lines_max: 10,
                },
                UnitStatus {
                    name: "b".into(),
                    state: State::Ts,
                    rust: String::new(),
                    rust_exists: false,
                    ts_files: 1,
                    ts_lines: 9,
                    ts_lines_max: 5,
                },
            ],
            ts_lines: 16,
            api_operations: 0,
            api_operations_rust: 0,
            problems: Vec::new(),
        };
        assert_eq!(
            ratchet(text, &status),
            "[[unit]]\nname = \"a\"\nts_lines = 7\n\n[[unit]]\nname = \"b\"\nts_lines = 5\n"
        );
    }
}
