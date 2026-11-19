// SPDX-License-Identifier: Apache-2.0
//! Drift gate of `deploy/environment.json`: every consumer of a pin (rust-toolchain.toml,
//! package.json, Dockerfile.build, the Dockerfiles under deploy/docker) must agree with the single
//! definition, so a pin changed in one place fails here instead of building another environment.
//! Port of `scripts/deploy/environment.ts --check` and `--verify-host`, same rules and same messages.

use std::path::Path;
use std::process::{Command, ExitCode};

use anyhow::{Context, Result};
use serde::Deserialize;
use serde::de::{Deserializer, MapAccess, Visitor};
use serde_json::Value;

/// Triad facts the definition must carry: node, field, value.
const TRIAD: [(&str, &str, &str); 9] = [
    ("vps", "meshIp", "10.200.77.1"),
    ("vps", "publicIp", "51.77.147.152"),
    ("cdn", "meshIp", "10.200.77.3"),
    ("cdn", "publicIp", "51.255.162.6"),
    ("cdn", "legacyAlias", "bunos"),
    ("prod", "meshIp", "10.200.77.5"),
    ("prod", "publicIp", "72.60.186.43"),
    ("prod", "os", "Arch Linux 7.2.11"),
    ("prod", "domain", "dragonballfr.com"),
];

/// `ARG` of Dockerfile.build and the toolchain key of the definition it must equal.
const BUILD_ARGUMENTS: [(&str, &str); 5] = [
    ("BASE_IMAGE", "baseImage"),
    ("RUST_VERSION", "rust"),
    ("BUN_VERSION", "bun"),
    ("BUN_LINUX_SHA256", "bunLinuxSha256"),
    ("BUN_WINDOWS_SHA256", "bunWindowsSha256"),
];

/// A JSON object of strings with its keys in file order: serde_json's own map is sorted, and the
/// order of an `ENV` block is part of what the factory and release images must share.
#[derive(Debug, Default)]
struct Pairs(Vec<(String, String)>);

impl Pairs {
    fn insert(&mut self, key: String, value: String) {
        match self.0.iter_mut().find(|(existing, _)| *existing == key) {
            Some(entry) => entry.1 = value,
            None => self.0.push((key, value)),
        }
    }

    fn to_json(&self) -> String {
        let fields: Vec<String> =
            self.0.iter().map(|(key, value)| format!("{}:{}", quote(key), quote(value))).collect();
        format!("{{{}}}", fields.join(","))
    }
}

impl<'de> Deserialize<'de> for Pairs {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct PairsVisitor;

        impl<'de> Visitor<'de> for PairsVisitor {
            type Value = Pairs;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("an object of strings")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Pairs, A::Error> {
                let mut pairs = Pairs::default();
                while let Some((key, value)) = map.next_entry::<String, String>()? {
                    pairs.insert(key, value);
                }
                Ok(pairs)
            }
        }

        deserializer.deserialize_map(PairsVisitor)
    }
}

#[derive(Deserialize)]
struct OrderedDefinition {
    runtime: Option<OrderedRuntime>,
}

#[derive(Deserialize)]
struct OrderedRuntime {
    env: Option<Pairs>,
}

/// The definition twice: as a loose document (every field optional, like the script's optional
/// chaining) and with `runtime.env` in file order.
struct Definition {
    document: Value,
    environment: Option<Pairs>,
}

impl Definition {
    fn load(root: &Path) -> Result<Self> {
        let text = read(root, "deploy/environment.json")?;
        let document: Value =
            serde_json::from_str(&text).context("parsing deploy/environment.json")?;
        let ordered: OrderedDefinition = serde_json::from_str(&text)
            .context("reading runtime.env of deploy/environment.json")?;
        Ok(Self { document, environment: ordered.runtime.and_then(|runtime| runtime.env) })
    }

    fn at(&self, pointer: &str) -> Option<&Value> {
        self.document.pointer(pointer)
    }

    fn toolchain(&self, key: &str) -> Option<&Value> {
        self.at(&format!("/toolchain/{key}"))
    }
}

fn read(root: &Path, path: &str) -> Result<String> {
    std::fs::read_to_string(root.join(path)).with_context(|| format!("reading {path}"))
}

fn read_json(root: &Path, path: &str) -> Result<Value> {
    serde_json::from_str(&read(root, path)?).with_context(|| format!("parsing {path}"))
}

fn quote(text: &str) -> String {
    Value::from(text).to_string()
}

/// `JSON.stringify` of a string that may be absent (`undefined` has no JSON text).
fn text(value: Option<&str>) -> Option<String> {
    value.map(quote)
}

fn json(value: Option<&Value>) -> Option<String> {
    value.map(Value::to_string)
}

fn list_json(items: Vec<String>) -> String {
    Value::from(items).to_string()
}

/// How a JavaScript template literal prints a value, for the labels built from the definition.
fn template(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        Some(other) => other.to_string(),
        None => "undefined".to_string(),
    }
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(flag) => *flag,
        Value::Number(number) => number.as_f64().is_some_and(|number| number != 0.0),
        Value::String(text) => !text.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

struct Drift {
    problems: Vec<String>,
}

impl Drift {
    fn expect(&mut self, label: &str, actual: Option<String>, wanted: Option<String>) {
        if actual != wanted {
            self.problems.push(format!(
                "{label}: found {}, the definition says {}",
                actual.as_deref().unwrap_or("undefined"),
                wanted.as_deref().unwrap_or("undefined"),
            ));
        }
    }
}

/// Value of `ARG <name>=<value>` in a Dockerfile.
fn argument_of(dockerfile: &str, name: &str) -> Option<String> {
    let prefix = format!("ARG {name}=");
    dockerfile.lines().find_map(|line| {
        line.strip_prefix(&prefix)
            .filter(|value| !value.is_empty())
            .map(|value| value.trim().to_string())
    })
}

/// The text of one stage: from its `FROM` line (the first one, or the one `AS <name>`) to the next
/// `FROM`.
fn stage_of(dockerfile: &str, name: Option<&str>) -> String {
    let lines: Vec<&str> = dockerfile.lines().collect();
    let suffix = name.map(|name| format!(" AS {name}"));
    let starts_stage = |line: &str| match &suffix {
        Some(suffix) => line
            .strip_prefix("FROM ")
            .and_then(|rest| rest.strip_suffix(suffix.as_str()))
            .is_some_and(|image| !image.is_empty()),
        None => line.starts_with("FROM "),
    };
    let Some(start) = lines.iter().position(|line| starts_stage(line)) else {
        return String::new();
    };
    let end = lines
        .iter()
        .enumerate()
        .skip(start + 1)
        .find(|(_, line)| line.starts_with("FROM "))
        .map_or(lines.len(), |(index, _)| index);
    lines.iter().take(end).skip(start).copied().collect::<Vec<_>>().join("\n")
}

/// `KEY=value` pairs of the first (possibly multi-line) `ENV` instruction of a stage.
fn environment_of(stage: &str) -> Pairs {
    let mut pairs = Pairs::default();
    let Some(start) = stage.lines().position(|line| line.starts_with("ENV ")) else {
        return pairs;
    };
    let mut block = String::new();
    for (offset, row) in stage.lines().skip(start).enumerate() {
        let row = if offset == 0 { row.strip_prefix("ENV ").unwrap_or(row) } else { row };
        match row.strip_suffix('\\') {
            Some(continued) => {
                block.push_str(continued);
                block.push(' ');
            },
            None => {
                block.push_str(row);
                break;
            },
        }
    }
    for token in block.split_whitespace() {
        let (key, value) = token.split_once('=').unwrap_or((token, ""));
        pairs.insert(key.to_string(), value.to_string());
    }
    pairs
}

fn packages_of(stage: &str) -> Vec<String> {
    const INSTALL: &str = "apt-get install -y --no-install-recommends ";
    stage
        .split(INSTALL)
        .skip(1)
        .map(|rest| rest.split(['\\', '&', '\r', '\n']).next().unwrap_or_default())
        .find(|captured| !captured.is_empty())
        .map(|captured| captured.split_whitespace().map(str::to_string).collect())
        .unwrap_or_default()
}

/// Destinations of the `COPY` instructions of a stage, in order.
fn copies_of(stage: &str) -> Vec<String> {
    stage
        .lines()
        .filter_map(|line| {
            let (_, destination) = line.strip_prefix("COPY ")?.rsplit_once(' ')?;
            let absolute = destination.len() > 1 && destination.starts_with('/');
            (absolute && !destination.contains(char::is_whitespace))
                .then(|| destination.to_string())
        })
        .collect()
}

/// Image of the first `FROM` line.
fn base_image_of(dockerfile: &str) -> Option<String> {
    dockerfile.lines().find_map(|line| {
        let image: String = line
            .strip_prefix("FROM ")?
            .chars()
            .take_while(|letter| !letter.is_whitespace())
            .collect();
        (!image.is_empty()).then_some(image)
    })
}

/// `<version>` of the first `FROM oven/bun:<version>-debian` line.
fn bun_image_version_of(dockerfile: &str) -> Option<String> {
    dockerfile.lines().find_map(|line| {
        let token = line.strip_prefix("FROM oven/bun:")?.split(char::is_whitespace).next()?;
        token
            .match_indices("-debian")
            .map(|(index, _)| token.split_at(index))
            .find(|(version, rest)| {
                let after = rest.strip_prefix("-debian").and_then(|after| after.chars().next());
                !version.is_empty()
                    && after.is_none_or(|next| !(next.is_ascii_alphanumeric() || next == '_'))
            })
            .map(|(version, _)| version.to_string())
    })
}

fn channel_of(toolchain: &str) -> Option<String> {
    toolchain.lines().find_map(|line| {
        line.strip_prefix("channel = \"")?
            .strip_suffix('"')
            .filter(|channel| !channel.is_empty())
            .map(str::to_string)
    })
}

fn drift_problems(root: &Path, definition: &Definition) -> Result<Vec<String>> {
    let mut drift = Drift { problems: Vec::new() };
    for (node, field, wanted) in TRIAD {
        drift.expect(
            &format!("triad.{node} {field}"),
            json(definition.at(&format!("/triad/{node}/{field}"))),
            text(Some(wanted)),
        );
    }

    let checkouts = read_json(root, "deploy/checkouts.json")?;
    let specs = checkouts.get("checkouts").and_then(Value::as_array);
    for spec in specs.into_iter().flatten() {
        let bunos = spec.pointer("/paths/bunos");
        let cdn = spec.pointer("/paths/cdn");
        if bunos.is_some_and(truthy) && cdn != bunos {
            drift.problems.push(format!(
                "deploy/checkouts.json {}: cdn path {} must match legacy bunos path {}",
                template(spec.get("name")),
                json(cdn).as_deref().unwrap_or("undefined"),
                json(bunos).as_deref().unwrap_or("undefined"),
            ));
        }
    }

    let toolchain = read(root, "rust-toolchain.toml")?;
    drift.expect(
        "rust-toolchain.toml channel",
        text(channel_of(&toolchain).as_deref()),
        json(definition.toolchain("rust")),
    );
    let package = read_json(root, "package.json")?;
    let bun = template(definition.toolchain("bun"));
    drift.expect(
        "package.json#packageManager",
        json(package.get("packageManager")),
        text(Some(&format!("bun@{bun}"))),
    );

    let build = read(root, "Dockerfile.build")?;
    for (name, key) in BUILD_ARGUMENTS {
        drift.expect(
            &format!("Dockerfile.build {name}"),
            text(argument_of(&build, name).as_deref()),
            json(definition.toolchain(key)),
        );
    }
    drift.expect(
        "Dockerfile.build bun channel",
        text(Some("stable")),
        json(definition.toolchain("bunChannel")),
    );
    let revision = definition.toolchain("bunRevision");
    if !revision.and_then(Value::as_str).is_some_and(is_commit) {
        drift.problems.push(format!(
            "toolchain.bunRevision: found {}, the definition says a 7 to 40 digit lowercase hex commit",
            json(revision).as_deref().unwrap_or("undefined"),
        ));
    }
    let all_in_one = read(root, "deploy/docker/all-in-one/Dockerfile")?;
    drift.expect(
        "deploy/docker/all-in-one/Dockerfile BUN_VERSION",
        text(argument_of(&all_in_one, "BUN_VERSION").as_deref()),
        json(definition.toolchain("bun")),
    );
    let games_engine = read(root, "deploy/docker/Dockerfile.games-engine")?;
    drift.expect(
        "deploy/docker/Dockerfile.games-engine bun image",
        text(bun_image_version_of(&games_engine).as_deref()),
        json(definition.toolchain("bun")),
    );
    drift.expect(
        "package.json#engines.bun",
        json(package.pointer("/engines/bun")),
        text(Some(&format!(">={bun}"))),
    );
    drift.expect(
        "Dockerfile.build SCCACHE_VERSION",
        text(argument_of(&build, "SCCACHE_VERSION").as_deref()),
        json(definition.toolchain("sccache")),
    );

    let factory = read(root, "deploy/docker/Dockerfile")?;
    drift.expect(
        "deploy/docker/Dockerfile base",
        text(base_image_of(&factory).as_deref()),
        json(definition.toolchain("baseImage")),
    );
    let images = [
        ("deploy/docker/Dockerfile", stage_of(&factory, None)),
        ("Dockerfile.build release-linux", stage_of(&build, Some("release-linux"))),
    ];
    for (label, stage) in &images {
        drift.expect(
            &format!("{label} ENV"),
            Some(environment_of(stage).to_json()),
            definition.environment.as_ref().map(Pairs::to_json),
        );
        drift.expect(
            &format!("{label} packages"),
            Some(list_json(packages_of(stage))),
            json(definition.at("/runtime/packages")),
        );
        drift.expect(
            &format!("{label} files"),
            Some(list_json(copies_of(stage))),
            json(definition.at("/runtime/files")),
        );
    }
    Ok(drift.problems)
}

fn is_commit(text: &str) -> bool {
    (7..=40).contains(&text.len())
        && text.chars().all(|digit| matches!(digit, '0'..='9' | 'a'..='f'))
}

/// What this host runs, as printed by `rustc -V`, `bun --version` and `bun --revision`; an empty
/// string stands for a tool that did not run.
struct HostToolchain<'a> {
    rustc: &'a str,
    bun: &'a str,
    revision: &'a str,
}

/// Channel and commit of `bun --revision`: `1.4.5+a7733435c` is stable and
/// `1.4.5-canary.1+6db952080` canary; `bun --version` shows neither.
fn bun_build_of(revision: &str) -> (&'static str, &str) {
    let revision = revision.trim();
    if revision.is_empty() {
        return ("", "");
    }
    let channel = if revision.contains("-canary") { "canary" } else { "stable" };
    let commit = revision.split_once('+').map_or("", |(_, commit)| commit.trim());
    (channel, commit)
}

/// A commit is the same one when either abbreviation is a prefix of the other.
fn same_commit(found: &str, wanted: &str) -> bool {
    !found.is_empty()
        && !wanted.is_empty()
        && (found.starts_with(wanted) || wanted.starts_with(found))
}

fn host_problems(definition: &Definition, host: &HostToolchain) -> Vec<String> {
    let mut problems = Vec::new();
    let rust = template(definition.toolchain("rust"));
    if !host.rustc.starts_with(&format!("rustc {rust} ")) {
        problems.push(format!("rustc: found \"{}\", wanted {rust}", host.rustc));
    }
    let bun = template(definition.toolchain("bun"));
    if host.bun != bun {
        problems.push(format!("bun: found \"{}\", wanted {bun}", host.bun));
    }
    let (channel, commit) = bun_build_of(host.revision);
    let wanted_channel = template(definition.toolchain("bunChannel"));
    if channel != wanted_channel {
        problems.push(format!("bun channel: found \"{channel}\", wanted {wanted_channel}"));
    }
    let wanted_commit = template(definition.toolchain("bunRevision"));
    if !same_commit(commit, &wanted_commit) {
        problems.push(format!("bun revision: found \"{commit}\", wanted {wanted_commit}"));
    }
    problems
}

/// Standard output of a command, empty when it is missing or fails.
fn output_of(program: &str, arguments: &[&str]) -> String {
    Command::new(program)
        .args(arguments)
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
        .unwrap_or_default()
}

/// Report every difference between this host's toolchain and `deploy/environment.json`; fail when
/// there is one.
pub fn verify_host(root: &Path) -> Result<ExitCode> {
    let definition = Definition::load(root)?;
    let compile = std::env::var("SHENRON_COMPILE_BUN").unwrap_or_else(|_| "bun".to_string());
    let host = HostToolchain {
        rustc: &output_of("rustc", &["-V"]),
        bun: &output_of(&compile, &["--version"]),
        revision: &output_of(&compile, &["--revision"]),
    };
    let problems = host_problems(&definition, &host);
    for problem in &problems {
        eprintln!("{problem}");
    }
    if !problems.is_empty() {
        return Ok(ExitCode::FAILURE);
    }
    println!("environment: this host matches deploy/environment.json");
    Ok(ExitCode::SUCCESS)
}

/// Report every consumer that disagrees with `deploy/environment.json`; fail when there is one.
pub fn check(root: &Path) -> Result<ExitCode> {
    let definition = Definition::load(root)?;
    let problems = drift_problems(root, &definition)?;
    for problem in &problems {
        eprintln!("{problem}");
    }
    if !problems.is_empty() {
        return Ok(ExitCode::FAILURE);
    }
    println!("environment: every consumer matches deploy/environment.json");
    Ok(ExitCode::SUCCESS)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn repository_root() -> std::path::PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../..")
    }

    #[test]
    fn every_consumer_of_this_repository_matches_the_definition() {
        let root = repository_root();
        let definition = Definition::load(&root).expect("definition loads");
        assert_eq!(
            drift_problems(&root, &definition).expect("consumers load"),
            Vec::<String>::new()
        );
    }

    #[test]
    fn a_pin_changed_in_the_definition_alone_is_reported() {
        let root = repository_root();
        let mut definition = Definition::load(&root).expect("definition loads");
        *definition.document.pointer_mut("/toolchain/rust").expect("rust pin") =
            Value::from("0.0.0");
        let problems = drift_problems(&root, &definition).expect("consumers load");
        assert!(problems.iter().any(|problem| problem.starts_with("rust-toolchain.toml channel")));
        assert!(
            problems.iter().any(|problem| problem.starts_with("Dockerfile.build RUST_VERSION"))
        );
    }

    fn host_with(revision: &str) -> Vec<String> {
        let definition = Definition::load(&repository_root()).expect("definition loads");
        let rustc =
            format!("rustc {} (abcdef012 2026-01-01)", template(definition.toolchain("rust")));
        let bun = template(definition.toolchain("bun"));
        host_problems(&definition, &HostToolchain { rustc: &rustc, bun: &bun, revision })
    }

    #[test]
    fn the_definition_pins_the_bun_channel_and_revision() {
        let definition = Definition::load(&repository_root()).expect("definition loads");
        assert_eq!(definition.toolchain("bunChannel"), Some(&Value::from("stable")));
        assert!(definition.toolchain("bunRevision").and_then(Value::as_str).is_some_and(is_commit));
        assert_eq!(bun_build_of("1.4.5+a7733435c"), ("stable", "a7733435c"));
        assert_eq!(bun_build_of("1.4.5-canary.1+6db952080"), ("canary", "6db952080"));
        assert_eq!(bun_build_of(""), ("", ""));
    }

    #[test]
    fn a_host_on_the_pinned_channel_and_revision_reports_nothing() {
        assert_eq!(host_with("1.4.5+a7733435c"), Vec::<String>::new());
        assert_eq!(host_with("1.4.5+a7733435cf40429e3b"), Vec::<String>::new());
    }

    #[test]
    fn a_canary_host_against_the_stable_pin_reports_the_channel_and_the_revision() {
        assert_eq!(
            host_with("1.4.5-canary.1+6db952080"),
            [
                "bun channel: found \"canary\", wanted stable",
                "bun revision: found \"6db952080\", wanted a7733435c",
            ]
        );
    }

    #[test]
    fn a_stable_host_on_another_revision_reports_the_revision_alone() {
        assert_eq!(
            host_with("1.4.5+0123456ab"),
            ["bun revision: found \"0123456ab\", wanted a7733435c"]
        );
    }

    #[test]
    fn a_missing_bun_is_reported_with_an_empty_channel_and_revision() {
        let problems = host_with("");
        assert!(problems.contains(&"bun channel: found \"\", wanted stable".to_string()));
        assert!(problems.contains(&"bun revision: found \"\", wanted a7733435c".to_string()));
    }

    #[test]
    fn a_definition_pinning_canary_or_a_malformed_revision_fails_the_drift_gate() {
        let root = repository_root();
        let mut definition = Definition::load(&root).expect("definition loads");
        *definition.document.pointer_mut("/toolchain/bunChannel").expect("channel pin") =
            Value::from("canary");
        *definition.document.pointer_mut("/toolchain/bunRevision").expect("revision pin") =
            Value::from("HEAD");
        let problems = drift_problems(&root, &definition).expect("consumers load");
        assert!(
            problems.contains(
                &"Dockerfile.build bun channel: found \"stable\", the definition says \"canary\""
                    .to_string()
            )
        );
        assert!(problems.contains(
            &"toolchain.bunRevision: found \"HEAD\", the definition says a 7 to 40 digit lowercase hex commit"
                .to_string()
        ));
    }

    #[test]
    fn an_absent_value_prints_as_undefined() {
        let mut drift = Drift { problems: Vec::new() };
        drift.expect("label", None, text(Some("1")));
        assert_eq!(drift.problems, ["label: found undefined, the definition says \"1\""]);
    }

    #[test]
    fn arguments_and_channel_are_read_per_line() {
        let dockerfile = "ARG A=\nARG A= 1.2 \r\nARG B=3\n";
        assert_eq!(argument_of(dockerfile, "A").as_deref(), Some("1.2"));
        assert_eq!(argument_of(dockerfile, "C"), None);
        assert_eq!(channel_of("[toolchain]\nchannel = \"1.100.0\"\n").as_deref(), Some("1.100.0"));
        assert_eq!(channel_of("channel = \"\"\n"), None);
    }

    #[test]
    fn a_stage_runs_from_its_from_line_to_the_next_one() {
        let dockerfile =
            "FROM a AS first\nRUN one\nFROM ${BASE} AS second\nRUN two\nFROM c\nRUN three";
        assert_eq!(stage_of(dockerfile, Some("second")), "FROM ${BASE} AS second\nRUN two");
        assert_eq!(stage_of(dockerfile, None), "FROM a AS first\nRUN one");
        assert_eq!(stage_of(dockerfile, Some("missing")), "");
    }

    #[test]
    fn a_multi_line_env_keeps_its_order() {
        let stage = "FROM x\nENV B=1 \\\n    A=2 \\\n    C=3\nRUN y";
        let pairs = environment_of(stage);
        assert_eq!(pairs.to_json(), "{\"B\":\"1\",\"A\":\"2\",\"C\":\"3\"}");
    }

    #[test]
    fn packages_copies_and_images_are_extracted() {
        let stage = "RUN apt-get update \\\n && apt-get install -y --no-install-recommends curl jq \\\n && true\n\
                     COPY --chown=1:1 dist/a /usr/local/bin/a\nCOPY /nowhere\nCOPY . /work";
        assert_eq!(packages_of(stage), ["curl", "jq"]);
        assert_eq!(copies_of(stage), ["/usr/local/bin/a", "/work"]);
        assert_eq!(
            base_image_of("# note\nFROM ubuntu:26.10 AS base\n").as_deref(),
            Some("ubuntu:26.10")
        );
        assert_eq!(
            bun_image_version_of("FROM oven/bun:1.4.5-debian AS base\n").as_deref(),
            Some("1.4.5")
        );
        assert_eq!(bun_image_version_of("FROM oven/bun:1.4.5-debianx\n"), None);
    }
}
