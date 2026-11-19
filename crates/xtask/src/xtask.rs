// SPDX-License-Identifier: Apache-2.0
//! `cargo xtask`: repository tasks that read only the commit (`git ls-tree`, `git show`), so their
//! output depends on the commit and not on build outputs, caches or uncommitted edits.

use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

use anyhow::{Context, Result, bail};
use clap::{Parser, Subcommand};

mod environment;
mod workflows;

#[derive(Parser)]
#[command(name = "xtask", about = "Shenron repository tasks")]
struct Cli {
    #[command(subcommand)]
    task: Task,
}

#[derive(Subcommand)]
enum Task {
    /// Write MAP.tsv (areas, tracked files, bytes, tier, gate); with --check, fail when it is stale.
    Map {
        #[arg(long)]
        check: bool,
    },
    /// Classify every script under scripts/ by what references it; with --orphans, list only the
    /// scripts nothing references and exit 1 when there are any.
    Scripts {
        #[arg(long)]
        orphans: bool,
    },
    /// Write .github/workflows/*.yml from crates/xtask/src/workflows.rs; with --check, fail when a
    /// file differs from its definition or has none.
    Workflows {
        #[arg(long)]
        check: bool,
    },
    /// Fail when a consumer of a pin (rust-toolchain.toml, package.json, Dockerfile.build,
    /// deploy/docker) disagrees with deploy/environment.json.
    EnvCheck,
    /// Fail when this host's rustc or Bun (version, channel, revision) differs from
    /// deploy/environment.json.
    EnvVerifyHost,
}

fn main() -> ExitCode {
    match run(Cli::parse()) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("xtask: {error:#}");
            ExitCode::FAILURE
        },
    }
}

fn run(cli: Cli) -> Result<ExitCode> {
    let root = repository_root()?;
    match cli.task {
        Task::Map { check } => map(&root, check),
        Task::Scripts { orphans } => scripts(&root, orphans),
        Task::Workflows { check } => workflows::run(&root, check),
        Task::EnvCheck => environment::check(&root),
        Task::EnvVerifyHost => environment::verify_host(&root),
    }
}

fn repository_root() -> Result<PathBuf> {
    let output = git(Path::new("."), &["rev-parse", "--show-toplevel"])?;
    Ok(PathBuf::from(String::from_utf8(output)?.trim()))
}

fn git(root: &Path, arguments: &[&str]) -> Result<Vec<u8>> {
    let output = Command::new("git")
        .args(arguments)
        .current_dir(root)
        .output()
        .with_context(|| format!("running git {}", arguments.join(" ")))?;
    if !output.status.success() {
        bail!("git {} failed: {}", arguments.join(" "), String::from_utf8_lossy(&output.stderr));
    }
    Ok(output.stdout)
}

/// One tracked blob of HEAD: its path and size in bytes (0 for submodules).
struct Blob {
    path: String,
    bytes: u64,
}

fn head_blobs(root: &Path) -> Result<Vec<Blob>> {
    let listing = git(root, &["ls-tree", "-r", "-l", "-z", "HEAD"])?;
    let mut blobs = Vec::new();
    for record in listing.split(|byte| *byte == 0).filter(|record| !record.is_empty()) {
        let record = String::from_utf8_lossy(record);
        let Some((meta, path)) = record.split_once('\t') else { continue };
        // "<mode> <type> <object> <size>"; submodules report "-" as size.
        let bytes = meta.split_whitespace().nth(3).and_then(|size| size.parse().ok()).unwrap_or(0);
        blobs.push(Blob { path: path.to_string(), bytes });
    }
    Ok(blobs)
}

const SPLIT: [&str; 3] = ["apps", "crates", "packages"];

fn area_of(path: &str) -> String {
    let parts: Vec<&str> = path.split('/').collect();
    match parts.as_slice() {
        [top, name, _, ..] if SPLIT.contains(top) => format!("{top}/{name}"),
        [top, _, ..] => (*top).to_string(),
        _ => "(root)".to_string(),
    }
}

fn tier(area: &str) -> &'static str {
    let top = area.split('/').next().unwrap_or(area);
    match top {
        "(root)" => "config",
        "data" | "themes" | "templates" => "content",
        "docs" | "research_notes" | "reports" | "replica" => "docs",
        "deploy" | "scripts" | ".github" | "migration" => "ops",
        _ if top.starts_with('.') => "config",
        _ => "first-party",
    }
}

fn gate(area: &str) -> String {
    let mut parts = area.splitn(2, '/');
    match (parts.next(), parts.next()) {
        (Some("crates"), Some(name)) => {
            format!("cargo clippy -p {name} --all-targets -- -D warnings (fr1)")
        },
        (Some("apps" | "packages"), Some(_)) => format!("bun test {area}"),
        (Some("scripts"), None) => "bun test scripts".to_string(),
        (Some("docs"), None) => "link check".to_string(),
        _ => "just check".to_string(),
    }
}

fn map(root: &Path, check: bool) -> Result<ExitCode> {
    let mut areas: BTreeMap<String, (u64, u64)> = BTreeMap::new();
    for blob in head_blobs(root)?.into_iter().filter(|blob| blob.path != "MAP.tsv") {
        let entry = areas.entry(area_of(&blob.path)).or_default();
        entry.0 += 1;
        entry.1 += blob.bytes;
    }
    let mut output = String::from("area\tfiles\tbytes\ttier\tgate\n");
    for (area, (files, bytes)) in &areas {
        output.push_str(&format!("{area}\t{files}\t{bytes}\t{}\t{}\n", tier(area), gate(area)));
    }
    let target = root.join("MAP.tsv");
    if check {
        let current = std::fs::read_to_string(&target).unwrap_or_default();
        if current != output {
            eprintln!("MAP.tsv is stale: run `just map`");
            return Ok(ExitCode::FAILURE);
        }
        println!("MAP.tsv up to date ({} areas)", areas.len());
    } else {
        std::fs::write(&target, &output).context("writing MAP.tsv")?;
        println!("MAP.tsv: {} areas, {} bytes", areas.len(), output.len());
    }
    Ok(ExitCode::SUCCESS)
}

const SCRIPT_EXTENSIONS: [&str; 5] = ["ts", "sh", "mjs", "js", "py"];
const CORPUS_EXTENSIONS: [&str; 15] = [
    "ts", "tsx", "mjs", "js", "json", "toml", "yml", "yaml", "md", "sh", "service", "timer", "in",
    "hcl", "rs",
];

fn extension(path: &str) -> Option<&str> {
    let name = path.rsplit('/').next()?;
    name.rsplit_once('.').map(|(_, extension)| extension)
}

/// Where a reference comes from, from strongest to weakest.
fn reference_kind(referrer: &str) -> &'static str {
    if referrer == "justfile" {
        "just"
    } else if referrer.ends_with("package.json") {
        "package"
    } else if referrer.starts_with(".github/") {
        "ci"
    } else if referrer.starts_with("deploy/") {
        "deploy"
    } else if referrer.ends_with(".test.ts") {
        "test"
    } else if referrer.ends_with(".md") {
        "doc"
    } else {
        "code"
    }
}

fn scripts(root: &Path, orphans_only: bool) -> Result<ExitCode> {
    let blobs = head_blobs(root)?;
    let scripts: Vec<&str> = blobs
        .iter()
        .map(|blob| blob.path.as_str())
        .filter(|path| path.starts_with("scripts/") && !path.ends_with(".test.ts"))
        .filter(|path| extension(path).is_some_and(|extension| SCRIPT_EXTENSIONS.contains(&extension)))
        .collect();
    let mut corpus = Vec::new();
    for blob in &blobs {
        let path = blob.path.as_str();
        let candidate = path == "justfile"
            || path.contains("Dockerfile")
            || extension(path).is_some_and(|extension| CORPUS_EXTENSIONS.contains(&extension));
        if !candidate {
            continue;
        }
        let text = git(root, &["show", &format!("HEAD:{path}")])?;
        corpus.push((path, String::from_utf8_lossy(&text).into_owned()));
    }

    let mut counts: BTreeMap<&str, usize> = BTreeMap::new();
    let mut lines = vec!["script\tclass\treferenced_by".to_string()];
    for script in &scripts {
        let stem = script.rsplit('/').next().unwrap_or(script);
        let stem = stem.rsplit_once('.').map_or(stem, |(stem, _)| stem);
        let relative = script.trim_start_matches("scripts/");
        let needles = [script.to_string(), relative.to_string(), format!("/{stem}."), format!("./{stem}\"")];
        let kinds: BTreeSet<&str> = corpus
            .iter()
            .filter(|(path, _)| path != script)
            .filter(|(_, text)| needles.iter().any(|needle| text.contains(needle.as_str())))
            .map(|(path, _)| reference_kind(path))
            .collect();
        let class = if ["just", "package", "ci", "deploy"].iter().any(|kind| kinds.contains(kind)) {
            "entry"
        } else if kinds.contains("code") {
            "library"
        } else if kinds.contains("test") {
            "tested-only"
        } else if kinds.contains("doc") {
            "doc-only"
        } else {
            "orphan"
        };
        *counts.entry(class).or_default() += 1;
        if !orphans_only || class == "orphan" {
            let kinds: Vec<&str> = kinds.into_iter().collect();
            lines.push(format!("{script}\t{class}\t{}", kinds.join(",")));
        }
    }
    for line in &lines {
        println!("{line}");
    }
    eprintln!("{} scripts: {counts:?}", scripts.len());
    let orphans = counts.get("orphan").copied().unwrap_or(0);
    Ok(if orphans_only && orphans > 0 { ExitCode::FAILURE } else { ExitCode::SUCCESS })
}
