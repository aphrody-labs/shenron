// SPDX-License-Identifier: Apache-2.0
//! `cargo xtask workflows`: renders `.github/workflows/*.yml` from the definitions at the end of
//! this file, one function per workflow, so the action versions, runner labels and shared steps
//! exist once. With `check`, it fails when a checked-in file differs from what the definitions
//! render, or when a workflow file has no definition.

use std::path::Path;
use std::process::ExitCode;

use anyhow::{Context, Result};

/// One YAML value: a plain scalar, a block or folded scalar, a mapping or a sequence.
enum Node {
    Scalar(String),
    Text { style: &'static str, lines: Vec<String> },
    Map(Vec<Entry>),
    Sequence(Vec<Item>),
}

/// A mapping entry. `before` holds the comment lines (`# ...`) and blank lines (empty strings)
/// written above the key, at the key's indentation.
struct Entry {
    before: Vec<String>,
    key: String,
    value: Node,
}

/// What a sequence item holds: a plain scalar or a mapping written after the `- `.
enum ItemValue {
    Scalar(String),
    Map(Vec<Entry>),
}

struct Item {
    before: Vec<String>,
    value: ItemValue,
}

impl Entry {
    fn blank(mut self) -> Self {
        self.before.push(String::new());
        self
    }

    fn comment(mut self, text: &str) -> Self {
        self.before.extend(comment_block(text));
        self
    }
}

impl Item {
    fn comment(mut self, text: &str) -> Self {
        self.before.extend(comment_block(text));
        self
    }
}

/// Lines of `text` without the indentation they share and without the first and last blank
/// lines, so multi-line literals can be indented with the code around them.
fn dedent(text: &str) -> Vec<String> {
    let text = text.strip_prefix('\n').unwrap_or(text).trim_end();
    let indent = text
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| line.len() - line.trim_start().len())
        .min()
        .unwrap_or(0);
    text.lines()
        .map(|line| {
            if line.trim().is_empty() {
                String::new()
            } else {
                line.get(indent..).unwrap_or_default().to_string()
            }
        })
        .collect()
}

fn comment_block(text: &str) -> Vec<String> {
    dedent(text)
        .into_iter()
        .map(|line| if line.is_empty() { "#".to_string() } else { format!("# {line}") })
        .collect()
}

fn field(key: &str, value: &str) -> Entry {
    Entry { before: Vec::new(), key: key.to_string(), value: Node::Scalar(value.to_string()) }
}

fn quoted_field(key: &str, value: &str) -> Entry {
    field(key, &format!("\"{value}\""))
}

/// A key with no value (`workflow_dispatch:`).
fn bare(key: &str) -> Entry {
    field(key, "")
}

fn group(key: &str, entries: Vec<Entry>) -> Entry {
    Entry { before: Vec::new(), key: key.to_string(), value: Node::Map(entries) }
}

fn list(key: &str, items: Vec<Item>) -> Entry {
    Entry { before: Vec::new(), key: key.to_string(), value: Node::Sequence(items) }
}

/// A block (`|`) or folded (`>-`) scalar.
fn lines(key: &str, style: &'static str, text: &str) -> Entry {
    Entry {
        before: Vec::new(),
        key: key.to_string(),
        value: Node::Text { style, lines: dedent(text) },
    }
}

fn mapping(entries: Vec<Entry>) -> Item {
    Item { before: Vec::new(), value: ItemValue::Map(entries) }
}

fn plain_items(values: &[&str]) -> Vec<Item> {
    values
        .iter()
        .map(|value| Item { before: Vec::new(), value: ItemValue::Scalar((*value).to_string()) })
        .collect()
}

fn quoted_items(values: &[&str]) -> Vec<Item> {
    values
        .iter()
        .map(|value| Item { before: Vec::new(), value: ItemValue::Scalar(format!("\"{value}\"")) })
        .collect()
}

/// A workflow step. The keys render in a fixed order: name, id, if, uses, with, shell,
/// working-directory, env, run.
#[derive(Default)]
struct Step {
    before: Vec<String>,
    name: Option<String>,
    id: Option<String>,
    condition: Option<String>,
    uses: Option<String>,
    with: Vec<Entry>,
    shell: Option<String>,
    working_directory: Option<String>,
    env: Vec<Entry>,
    run: Option<Node>,
}

impl Step {
    fn uses(action: &str) -> Self {
        Self { uses: Some(action.to_string()), ..Self::default() }
    }

    /// A shell step; a command of several lines renders as a `|` block.
    fn run(command: &str) -> Self {
        let mut lines = dedent(command);
        let run = if lines.len() == 1 {
            Node::Scalar(lines.swap_remove(0))
        } else {
            Node::Text { style: "|", lines }
        };
        Self { run: Some(run), ..Self::default() }
    }

    /// A shell step written as a `>-` folded scalar.
    fn run_folded(command: &str) -> Self {
        Self { run: Some(Node::Text { style: ">-", lines: dedent(command) }), ..Self::default() }
    }

    fn named(mut self, name: &str) -> Self {
        self.name = Some(name.to_string());
        self
    }

    fn id(mut self, id: &str) -> Self {
        self.id = Some(id.to_string());
        self
    }

    fn when(mut self, condition: &str) -> Self {
        self.condition = Some(condition.to_string());
        self
    }

    fn with(mut self, entry: Entry) -> Self {
        self.with.push(entry);
        self
    }

    fn shell(mut self, shell: &str) -> Self {
        self.shell = Some(shell.to_string());
        self
    }

    fn directory(mut self, directory: &str) -> Self {
        self.working_directory = Some(directory.to_string());
        self
    }

    fn env(mut self, entry: Entry) -> Self {
        self.env.push(entry);
        self
    }

    fn blank(mut self) -> Self {
        self.before.push(String::new());
        self
    }

    fn comment(mut self, text: &str) -> Self {
        self.before.extend(comment_block(text));
        self
    }

    fn into_item(self) -> Item {
        let mut entries = Vec::new();
        if let Some(name) = &self.name {
            entries.push(field("name", name));
        }
        if let Some(id) = &self.id {
            entries.push(field("id", id));
        }
        if let Some(condition) = &self.condition {
            entries.push(field("if", condition));
        }
        if let Some(uses) = &self.uses {
            entries.push(field("uses", uses));
        }
        if !self.with.is_empty() {
            entries.push(group("with", self.with));
        }
        if let Some(shell) = &self.shell {
            entries.push(field("shell", shell));
        }
        if let Some(directory) = &self.working_directory {
            entries.push(field("working-directory", directory));
        }
        if !self.env.is_empty() {
            entries.push(group("env", self.env));
        }
        if let Some(run) = self.run {
            entries.push(Entry { before: Vec::new(), key: "run".to_string(), value: run });
        }
        Item { before: self.before, value: ItemValue::Map(entries) }
    }
}

/// A job: its keys in the order written, then its steps.
struct Job {
    id: String,
    entries: Vec<Entry>,
    steps: Vec<Step>,
}

impl Job {
    fn new(id: &str) -> Self {
        Self { id: id.to_string(), entries: Vec::new(), steps: Vec::new() }
    }

    fn entry(mut self, entry: Entry) -> Self {
        self.entries.push(entry);
        self
    }

    fn step(mut self, step: Step) -> Self {
        self.steps.push(step);
        self
    }

    fn into_entry(self, first: bool) -> Entry {
        let mut children = self.entries;
        children.push(list("steps", self.steps.into_iter().map(Step::into_item).collect()));
        let before = if first { Vec::new() } else { vec![String::new()] };
        Entry { before, key: self.id, value: Node::Map(children) }
    }
}

/// One workflow file: the comment above `name`, the top-level sections after it and the jobs.
struct Workflow {
    file: &'static str,
    name: String,
    header: Vec<String>,
    sections: Vec<Entry>,
    jobs: Vec<Job>,
}

impl Workflow {
    fn new(file: &'static str, name: &str) -> Self {
        Self {
            file,
            name: name.to_string(),
            header: Vec::new(),
            sections: Vec::new(),
            jobs: Vec::new(),
        }
    }

    fn header(mut self, text: &str) -> Self {
        self.header = comment_block(text);
        self
    }

    fn section(mut self, entry: Entry) -> Self {
        self.sections.push(entry);
        self
    }

    fn job(mut self, job: Job) -> Self {
        self.jobs.push(job);
        self
    }

    fn render(self) -> String {
        let mut name = field("name", &self.name);
        name.before = self.header;
        let mut entries = vec![name];
        entries.extend(self.sections);
        let jobs = self
            .jobs
            .into_iter()
            .enumerate()
            .map(|(index, job)| job.into_entry(index == 0))
            .collect();
        entries.push(Entry {
            before: vec![String::new()],
            key: "jobs".to_string(),
            value: Node::Map(jobs),
        });
        let mut output = String::new();
        render_map(&entries, 0, &mut output);
        output
    }
}

fn render_lines(before: &[String], indent: usize, output: &mut String) {
    for line in before {
        if !line.is_empty() {
            output.push_str(&" ".repeat(indent));
            output.push_str(line);
        }
        output.push('\n');
    }
}

fn render_map(entries: &[Entry], indent: usize, output: &mut String) {
    let pad = " ".repeat(indent);
    for entry in entries {
        render_lines(&entry.before, indent, output);
        let key = &entry.key;
        match &entry.value {
            Node::Scalar(value) if value.is_empty() => output.push_str(&format!("{pad}{key}:\n")),
            Node::Scalar(value) => output.push_str(&format!("{pad}{key}: {value}\n")),
            Node::Text { style, lines } => {
                output.push_str(&format!("{pad}{key}: {style}\n"));
                render_lines(lines, indent + 2, output);
            },
            Node::Map(children) => {
                output.push_str(&format!("{pad}{key}:\n"));
                render_map(children, indent + 2, output);
            },
            Node::Sequence(items) => {
                output.push_str(&format!("{pad}{key}:\n"));
                render_sequence(items, indent + 2, output);
            },
        }
    }
}

fn render_sequence(items: &[Item], indent: usize, output: &mut String) {
    let pad = " ".repeat(indent);
    for item in items {
        render_lines(&item.before, indent, output);
        match &item.value {
            ItemValue::Scalar(value) => output.push_str(&format!("{pad}- {value}\n")),
            ItemValue::Map(entries) => {
                // The first key shares the line of the dash, the others align under it.
                let mut inner = String::new();
                render_map(entries, indent + 2, &mut inner);
                output.push_str(&pad);
                output.push_str("- ");
                output.push_str(inner.trim_start_matches(' '));
            },
        }
    }
}

/// Writes every workflow under `.github/workflows`; with `check`, writes nothing and fails when
/// a file differs from its definition or has none.
pub fn run(root: &Path, check: bool) -> Result<ExitCode> {
    let directory = root.join(".github").join("workflows");
    let rendered = render_all();
    if !check {
        std::fs::create_dir_all(&directory)
            .with_context(|| format!("creating {}", directory.display()))?;
        for (file, content) in &rendered {
            std::fs::write(directory.join(file), content)
                .with_context(|| format!("writing {file}"))?;
        }
        println!("workflows: {} files written", rendered.len());
        return Ok(ExitCode::SUCCESS);
    }
    let stale = stale_files(&directory, &rendered)?;
    if stale.is_empty() {
        println!("workflows up to date ({} files)", rendered.len());
        return Ok(ExitCode::SUCCESS);
    }
    for message in &stale {
        eprintln!("{message}");
    }
    eprintln!("workflows are stale: run `just workflows`");
    Ok(ExitCode::FAILURE)
}

fn render_all() -> Vec<(String, String)> {
    definitions()
        .into_iter()
        .map(|workflow| (format!("{}.yml", workflow.file), workflow.render()))
        .collect()
}

fn stale_files(directory: &Path, rendered: &[(String, String)]) -> Result<Vec<String>> {
    let mut stale = Vec::new();
    for (file, content) in rendered {
        let current = std::fs::read_to_string(directory.join(file)).unwrap_or_default();
        if current != *content {
            stale.push(format!("{file} differs from its definition"));
        }
    }
    let listing =
        std::fs::read_dir(directory).with_context(|| format!("reading {}", directory.display()))?;
    for entry in listing {
        let file = entry.context("reading a workflow entry")?.file_name();
        let file = file.to_string_lossy();
        if file.ends_with(".yml") && !rendered.iter().any(|(name, _)| *name == file) {
            stale.push(format!("{file} has no definition in crates/xtask/src/workflows.rs"));
        }
    }
    Ok(stale)
}

// Definitions: the builders above, then one function per workflow, in file order.

const CHECKOUT: &str = "actions/checkout@v7";
const SETUP_BUN: &str = "./.github/actions/setup-bun";
const CACHE: &str = "actions/cache@v6";
const UPLOAD_ARTIFACT: &str = "actions/upload-artifact@v7";
const UBUNTU_24: &str = "ubuntu-24.04";
const UBUNTU_26: &str = "ubuntu-26.04";
const FACTORY: &str = "[self-hosted, Linux, X64, shenron-factory]";
const TAG_REF: &str = "${{ github.event.inputs.tag || github.ref }}";
const PRODUCTION: &str = "[self-hosted, Linux, X64, shenron-prod]";

fn checkout() -> Step {
    Step::uses(CHECKOUT)
}

fn checkout_clean() -> Step {
    Step::uses(CHECKOUT).with(field("persist-credentials", "false"))
}

fn setup_bun() -> Step {
    Step::uses(SETUP_BUN)
}

fn setup_uv() -> Step {
    Step::uses("astral-sh/setup-uv@68559e99cc807c1eb7e9238fd43a15bba460eec2 # v10.3.3")
        .named("Setup uv")
        .with(quoted_field("version", "0.13.8"))
        .with(field("enable-cache", "false"))
}

fn bun_cache() -> Step {
    Step::uses(CACHE)
        .named("Cache ~/.bun")
        .with(field("path", "~/.bun/install/cache"))
        .with(field("key", "bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}"))
        .with(field("restore-keys", "bun-${{ runner.os }}-"))
}

fn bun_install() -> Step {
    Step::run("bun ci").named("Install exact dependencies")
}

fn verify_release_version() -> Step {
    Step::run(r###"bun scripts/release/check-version.ts "$SHENRON_RELEASE_TAG""###)
        .named("Verify the one release version")
}

fn toolchain() -> Step {
    Step::run("rustup toolchain install").named("Toolchain")
}

fn rust_toolchain() -> Step {
    Step::run("rustup toolchain install").named("Rust toolchain").shell("bash")
}

fn rust_cache(key: &str) -> Step {
    Step::uses("Swatinem/rust-cache@v2").with(field("key", key))
}

fn install_tool(tool: &str) -> Step {
    Step::uses("taiki-e/install-action@v2").with(field("tool", tool))
}

fn factory_tools() -> Step {
    Step::run(
        r###"
        echo "$HOME/.cargo/bin" >> "$GITHUB_PATH"
        echo "$HOME/.local/bin" >> "$GITHUB_PATH"
        "###,
    )
    .named("Resolve qualified factory tools")
}

fn contents_read() -> Entry {
    group("permissions", vec![field("contents", "read")])
}

const NOT_FORK_PULL_REQUEST: &str = "github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository";

fn definitions() -> Vec<Workflow> {
    vec![
        beerus_sync(),
        ci(),
        codeql(),
        desktop(),
        edge(),
        migrate(),
        npm_publish(),
        release(),
        rust(),
        server_artifact(),
        store_sync(),
        update_deps(),
    ]
}

fn beerus_sync() -> Workflow {
    Workflow::new("beerus-sync", "Beerus episode sync")
        .section(
            group(
                "on",
                vec![
                    list(
                        "schedule",
                        vec![
                            mapping(vec![quoted_field("cron", "30 17 * * 0")]).comment(
                                "Crunchyroll France publishes a new episode on Sunday at 17:00 UTC.",
                            ),
                        ],
                    ),
                    group(
                        "workflow_dispatch",
                        vec![group(
                            "inputs",
                            vec![group(
                                "apply",
                                vec![
                                    field(
                                        "description",
                                        "Write to production (false prints the SQL only)",
                                    ),
                                    field("required", "false"),
                                    field("type", "boolean"),
                                    field("default", "true"),
                                ],
                            )],
                        )],
                    ),
                ],
            )
            .blank()
            .comment(
                r###"
                Adds each newly announced Dragon Ball Super: Beerus episode to production (bot.db_episodes) with its
                metadata only: titles (Wikipedia episode table, official site, Crunchyroll France titles kept in
                scripts/ops/beerus-sync.ts), air date, arc and the official source link. Existing values are never
                overwritten. No video is downloaded or published: the legal watch offer is Crunchyroll.
                Runs on the fr1 runner, which reaches prd Postgres over ssh under the deploy lock.
                "###,
            )
            .blank(),
        )
        .section(
            group(
                "concurrency",
                vec![field("group", "beerus-sync"), field("cancel-in-progress", "false")],
            )
            .blank(),
        )
        .section(contents_read().blank())
        .job(
            Job::new("sync")
                .entry(field("runs-on", FACTORY))
                .entry(field("timeout-minutes", "15"))
                .entry(group("env", vec![field("SHENRON_SSH_HOST", "prd")]))
                .step(checkout())
                .step(setup_bun())
                .step(Step::run(
                    "bun scripts/ops/beerus-sync.ts ${{ (github.event_name == 'schedule' || inputs.apply) && '--apply' || '' }}",
                )
                .named("Sync announced episodes"))
                .step(
                    Step::run(
                        r###"
                        latest=$(ssh "$SHENRON_SSH_HOST" "sudo -n docker exec -i shenron-postgres psql -U postgres -d shenron_site -At -c \"select max(id) from bot.db_episodes where series = 'DBS_BEERUS'\"")
                        body=$(curl -fsS --max-time 20 "https://dragonballfr.com/api/episodes/${latest}")
                        echo "$body" | bun -e 'const r = await Bun.stdin.json(); if (!r.id || !r.title) process.exit(1); console.log(JSON.stringify({ id: r.id, n: r.numberInSeries, title: r.title, titleJa: r.titleJa }))'
                        "###,
                    )
                    .named("Check the newest episode on the public API"),
                ),
        )
}

fn store_sync() -> Workflow {
    Workflow::new("store-sync", "Store sync")
        .section(
            group(
                "on",
                vec![
                    list(
                        "schedule",
                        vec![mapping(vec![quoted_field("cron", "17 * * * *")]).comment(
                            "Hourly: store catalogues change prices, ratings and release dates during the day.",
                        )],
                    ),
                    group(
                        "workflow_dispatch",
                        vec![group(
                            "inputs",
                            vec![group(
                                "apply",
                                vec![
                                    field(
                                        "description",
                                        "Write to production (false prints the listings only)",
                                    ),
                                    field("required", "false"),
                                    field("type", "boolean"),
                                    field("default", "true"),
                                ],
                            )],
                        )],
                    ),
                ],
            )
            .blank()
            .comment(
                r###"
                Reads the public catalogues of Steam, the Apple App Store, F-Droid and the Microsoft Store for
                the Dragon Ball ecosystem (packages/stores) and upserts bot.db_game_store_listings on prd under
                the deploy lock. A row's changed_at moves only when its title, release date, price or rating
                changes, and the table notifies shenron-mcp, so subscribers see real changes only.
                "###,
            )
            .blank(),
        )
        .section(
            group(
                "concurrency",
                vec![field("group", "store-sync"), field("cancel-in-progress", "false")],
            )
            .blank(),
        )
        .section(contents_read().blank())
        .job(
            Job::new("sync")
                .entry(field("runs-on", FACTORY))
                .entry(field("timeout-minutes", "10"))
                .entry(group("env", vec![field("SHENRON_SSH_HOST", "prd")]))
                .step(checkout())
                .step(setup_bun())
                .step(
                    Step::run(
                        "bun packages/stores/src/cli.ts ${{ (github.event_name == 'schedule' || inputs.apply) && '--apply' || '' }}",
                    )
                    .named("Sync store listings"),
                ),
        )
}

fn ci() -> Workflow {
    Workflow::new("ci", "CI")
        .section(
            group(
                "on",
                vec![
                    group("push", vec![field("branches", "[main]")]),
                    group("pull_request", vec![field("branches", "[main]")]),
                    bare("workflow_dispatch"),
                    bare("workflow_call"),
                ],
            )
            .blank(),
        )
        .section(contents_read().blank())
        .section(
            group(
                "concurrency",
                vec![
                    field("group", "ci-${{ github.workflow }}-${{ github.ref }}"),
                    field("cancel-in-progress", "true"),
                ],
            )
            .blank(),
        )
        .job(
            Job::new("paths")
                .entry(field("name", "No hardcoded absolute paths"))
                .entry(field("runs-on", UBUNTU_24))
                .entry(field("timeout-minutes", "10"))
                .entry(contents_read())
                .step(checkout_clean())
                .step(setup_bun())
                .step(
                    Step::run("bun scripts/audit/check-paths.ts").comment(
                        "The script fetches its pinned scanner into the gitignored .cache/ and skips when offline.",
                    ),
                ),
        )
        .job(
            Job::new("check")
                .entry(field("name", "Check (Bun)"))
                .entry(field("if", NOT_FORK_PULL_REQUEST))
                .entry(
                    field("runs-on", UBUNTU_24).comment(
                        r###"
                        Run checks on GitHub-hosted capacity so normal pushes do not consume the production VPS.
                        Rust's private-dependency build remains in rust.yml until its GitHub secret setup is migrated.
                        "###,
                    ),
                )
                .entry(field("timeout-minutes", "45"))
                .entry(group(
                    "env",
                    vec![
                        field("DISCORD_TOKEN", "test-token"),
                        quoted_field("GUILD_ID", "1497167233280118896"),
                        quoted_field("OWNER_ID", "11111111111111111"),
                        quoted_field("DATABASE_PATH", "./data/test-ci.db"),
                    ],
                ))
                .step(checkout_clean())
                .step(setup_bun())
                .step(install_tool("just"))
                .step(bun_cache())
                .step(
                    Step::run(
                        r###"
                        bun scripts/deploy/environment.ts --check
                        bun scripts/deploy/lanes.ts --check
                        "###,
                    )
                    .named("Deploy environment and change detection")
                    .blank()
                    .comment(
                        "Before install: both only need Git and Bun (deploy/environment.json, scripts/deploy).",
                    ),
                )
                .step(Step::run("bun ci").named("Install").blank())
                .step(
                    Step::run(
                        r###"
                        bun --filter @aphrody/shenron-bot gen:entries
                        git diff --exit-code -- apps/bot/src/_entries.ts
                        "###,
                    )
                    .named("Generate entries barrel")
                    .blank(),
                )
                .step(
                    Step::run("bun packages/api/scripts/openapi.ts --check")
                        .named("OpenAPI document is up to date")
                        .blank(),
                )
                .step(
                    Step::run("bun packages/ui/scripts/generate-tokens.ts --check")
                        .named("UI tokens are up to date")
                        .blank(),
                )
                .step(
                    Step::run("bun packages/db/scripts/agent-home-template.ts --check")
                        .named("Agent home template is embedded")
                        .blank(),
                )
                .step(
                    Step::run("bun apps/site/scripts/fonts.ts --check")
                        .named("CDN fonts are up to date")
                        .blank(),
                )
                .step(
                    Step::run("bun packages/pipeline/scripts/ai/check-contracts.ts")
                        .named("AI contracts")
                        .blank(),
                )
                .step(
                    Step::run("bun scripts/audit/check-workspace-packages.ts --strict")
                        .named("Workspace package graph and runtime classes")
                        .blank(),
                )
                .step(
                    Step::run("bun run --filter @aphrody/shenron-db audit:migrations")
                        .named("Migrations (offline audit)")
                        .blank(),
                )
                .step(
                    Step::run("bun scripts/plugin/sync.ts --check")
                        .named("Plugin offline snapshots are up to date")
                        .blank(),
                )
                .step(Step::run("bun check").named("Native type-check").blank())
                .step(Step::run("just bun-lint").named("Native lint").blank())
                .step(Step::run("just bun-format-check").named("Native format check").blank())
                .step(
                    Step::run("just bun-test").named("Tests").blank().comment(
                        "Les suites *.live.test.ts (services réels) restent hors CI : `just test-live`.",
                    ),
                )
                .step(setup_uv().blank().comment(
                    "scripts/design rebuilds the font faces with fontTools through uv (official Bun has no `bun uv`).",
                ))
                .step(
                    Step::run("just test-scripts").named("Tests des scripts racine").blank(),
                ),
        )
}

fn codeql() -> Workflow {
    Workflow::new("codeql", "CodeQL")
        .section(
            group(
                "on",
                vec![
                    bare("workflow_dispatch"),
                    group("push", vec![field("branches", "[main]")]),
                    group("pull_request", vec![field("branches", "[main]")]),
                    list(
                        "schedule",
                        vec![
                            mapping(vec![quoted_field("cron", "0 7 * * 2")])
                                .comment("Mardi 07:00 UTC"),
                        ],
                    ),
                ],
            )
            .blank(),
        )
        .section(
            group(
                "permissions",
                vec![
                    field("security-events", "write"),
                    field("contents", "read"),
                    field("actions", "read"),
                ],
            )
            .blank(),
        )
        .section(
            group(
                "concurrency",
                vec![field("group", "codeql-${{ github.ref }}"), field("cancel-in-progress", "true")],
            )
            .blank(),
        )
        .job(
            Job::new("analyze")
                .entry(field("name", "Analyze JavaScript/TypeScript"))
                .entry(
                    field(
                        "if",
                        "github.event.repository.private != true && (github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository)",
                    )
                    .comment(
                        "Code scanning uploads require Advanced Security, which is unavailable on this private repo.",
                    ),
                )
                .entry(field("runs-on", UBUNTU_24))
                .entry(field("timeout-minutes", "30"))
                .step(checkout_clean())
                .step(
                    Step::uses("github/codeql-action/init@v4")
                        .with(field("languages", "javascript-typescript"))
                        .with(field("queries", "security-and-quality")),
                )
                .step(
                    Step::uses("github/codeql-action/analyze@v4")
                        .with(quoted_field("category", "/language:javascript-typescript")),
                ),
        )
}

fn desktop() -> Workflow {
    Workflow::new("desktop", "Desktop")
        .header(
            r###"
            SPDX-License-Identifier: Apache-2.0
            Shenron Studio (crates/shenron-desktop, Tauri 3): builds the installers for windows-x64 (NSIS)
            and linux-x64 (deb, AppImage) through scripts/build/desktop.ts, which also builds the sidecars
            (shenron-server via scripts/build/server.ts, shenron-mcp, koharu-sdk) exactly as on a
            workstation, then attaches them to a draft GitHub release (private repository, nothing
            published elsewhere). Pattern: https://v2.tauri.app/fr/distribute/pipelines/github/ ; the
            repository script replaces tauri-action because it stages the sidecars and the bundle config.

            Secrets:
              TAURI_SIGNING_PRIVATE_KEY      optional: updater artifact signing (with _PASSWORD).
              TAURI_SIGNING_PRIVATE_KEY_PASSWORD
            "###,
        )
        .section(
            group(
                "on",
                vec![group(
                    "workflow_dispatch",
                    vec![group(
                        "inputs",
                        vec![group(
                            "chat_model",
                            vec![
                                quoted_field(
                                    "description",
                                    "Ship the local chat model runtime (llama-server + adapter)",
                                ),
                                field("type", "boolean"),
                                field("default", "false"),
                            ],
                        )],
                    )],
                )],
            )
            .blank(),
        )
        .section(contents_read().blank())
        .section(
            group(
                "concurrency",
                vec![
                    field("group", "desktop-${{ github.ref }}"),
                    field("cancel-in-progress", "false"),
                ],
            )
            .blank(),
        )
        .section(
            group(
                "env",
                vec![
                    field("CARGO_TERM_COLOR", "always"),
                    quoted_field("CARGO_INCREMENTAL", "0"),
                    quoted_field("NEXT_TELEMETRY_DISABLED", "1"),
                    quoted_field("SHENRON_CARGO_REMOTE", "off")
                        .comment("Build on the runner itself, never through the VPS tunnel."),
                ],
            )
            .blank(),
        )
        .job(
            Job::new("build")
                .entry(field("name", "Build (${{ matrix.target }})"))
                .entry(group(
                    "strategy",
                    vec![
                        field("fail-fast", "false"),
                        group(
                            "matrix",
                            vec![list(
                                "include",
                                vec![
                                    mapping(vec![
                                        field("target", "linux-x64"),
                                        field("os", UBUNTU_26),
                                    ]),
                                    mapping(vec![
                                        field("target", "windows-x64"),
                                        field("os", "windows-latest"),
                                    ]),
                                ],
                            )],
                        ),
                    ],
                ))
                .entry(field("runs-on", "${{ matrix.os }}"))
                .entry(field("timeout-minutes", "120"))
                .step(checkout_clean())
                .step(
                    Step::run(
                        r###"
                        sudo apt-get update
                        sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev \
                          patchelf libssl-dev build-essential file
                        "###,
                    )
                    .named("Linux system dependencies (WebKitGTK, AppImage)")
                    .when("runner.os == 'Linux'")
                    .blank(),
                )
                .step(
                    rust_toolchain()
                        .blank()
                        .comment("rust-toolchain.toml: channel and targets."),
                )
                .step(rust_cache("desktop-${{ matrix.target }}").blank())
                .step(install_tool("tauri-cli").blank())
                .step(
                    setup_bun()
                        .blank()
                        .comment("The fork release pinned by package.json#packageManager."),
                )
                .step(
                    Step::uses(CACHE)
                        .named("Cache Bun downloads")
                        .with(field("path", "~/.bun/install/cache"))
                        .with(field(
                            "key",
                            "desktop-bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}",
                        ))
                        .blank(),
                )
                .step(bun_install().blank())
                .step(
                    Step::run(
                        r###"
                        [ -n "$TAURI_SIGNING_PRIVATE_KEY" ] || unset TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD
                        extra=()
                        [ "$CHAT_MODEL" = "true" ] || extra+=(--skip-chat-model)
                        bun scripts/build/desktop.ts --target "${{ matrix.target }}" "${extra[@]}"
                        "###,
                    )
                    .named("Build Shenron Studio")
                    .shell("bash")
                    .env(field("TAURI_SIGNING_PRIVATE_KEY", "${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}"))
                    .env(field(
                        "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
                        "${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}",
                    ))
                    .env(field("CHAT_MODEL", "${{ inputs.chat_model && 'true' || 'false' }}"))
                    .blank(),
                )
                .step(
                    Step::uses(UPLOAD_ARTIFACT)
                        .with(field("name", "shenron-studio-${{ matrix.target }}"))
                        .with(field("path", "dist/desktop/${{ matrix.target }}/"))
                        .with(field("if-no-files-found", "error"))
                        .blank(),
                ),
        )
}

fn edge() -> Workflow {
    Workflow::new("edge", "edge")
        .section(
            group(
                "on",
                vec![
                    group(
                        "push",
                        vec![
                            field("branches", "[main]"),
                            list(
                                "paths",
                                quoted_items(&["deploy/cloudflare/**", ".github/workflows/edge.yml"]),
                            ),
                        ],
                    ),
                    bare("workflow_dispatch"),
                ],
            )
            .blank()
            .comment(
                r###"
                The shenron Cloudflare edge (deploy/cloudflare): deploys the shenron-cdn Worker on every push touching it. The account,
                its tunnels, buckets and the other projects are listed in aphrody-labs/ay device/cloudflare/projects.toml.
                --keep-vars: the MANIFEST_SHARD_HASHES_* bindings are written by the migration, not by this repository.
                "###,
            ),
        )
        .section(contents_read().blank())
        .section(
            group("concurrency", vec![field("group", "edge"), field("cancel-in-progress", "false")])
                .blank(),
        )
        .job(
            Job::new("deploy")
                .entry(field("runs-on", UBUNTU_24))
                .entry(group(
                    "env",
                    vec![
                        field("CLOUDFLARE_API_TOKEN", "${{ secrets.CLOUDFLARE_API_TOKEN }}"),
                        field("CLOUDFLARE_ACCOUNT_ID", "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"),
                    ],
                ))
                .step(checkout())
                .step(Step::uses("oven-sh/setup-bun@v2"))
                .step(
                    Step::run("bun test deploy/cloudflare/cdn-worker.test.ts")
                        .named("Verify the CDN Worker"),
                )
                .step(
                    Step::run("bun x wrangler@4.162.0 deploy -c wrangler.jsonc --keep-vars")
                        .named("Deploy shenron-cdn")
                        .directory("deploy/cloudflare"),
                ),
        )
}

fn migrate() -> Workflow {
    Workflow::new("migrate", "migrate")
        .header(
            r###"
            SPDX-License-Identifier: Apache-2.0
            TypeScript to Rust migration gate (docs/decisions/0004-migration-typescript-rust.md): on every push,
            since a TypeScript-only change can break the ratchet of migration/rust.toml.
              - every TypeScript file belongs to a unit, no unit grows past its ts_lines
              - dual units keep their golden cases, rust units have no TypeScript left
              - the golden HTTP cases are what the TypeScript host answers, and the Rust router answers the same
            "###,
        )
        .section(
            group(
                "on",
                vec![
                    group("push", vec![field("branches", "[main]")]),
                    bare("pull_request"),
                    bare("workflow_dispatch"),
                ],
            )
            .blank(),
        )
        .section(contents_read().blank())
        .section(
            group(
                "concurrency",
                vec![
                    field("group", "migrate-${{ github.ref }}"),
                    field("cancel-in-progress", "true"),
                ],
            )
            .blank(),
        )
        .section(
            group(
                "env",
                vec![
                    field("CARGO_TERM_COLOR", "always"),
                    quoted_field("CARGO_INCREMENTAL", "0"),
                    quoted_field("CARGO_PROFILE_DEV_DEBUG", "0"),
                    quoted_field("CARGO_PROFILE_TEST_DEBUG", "0"),
                ],
            )
            .blank(),
        )
        .job(
            Job::new("ledger")
                .entry(field("name", "Ledger, ratchet, HTTP parity"))
                .entry(field("if", NOT_FORK_PULL_REQUEST))
                .entry(field("runs-on", FACTORY))
                .entry(field("timeout-minutes", "30"))
                .entry(group(
                    "env",
                    vec![
                        field("RUSTC_WRAPPER", "sccache"),
                        field(
                            "CARGO_TARGET_DIR",
                            "${{ vars.SHENRON_CARGO_TARGET_DIR || format('{0}/target', github.workspace) }}",
                        ),
                        quoted_field("GIT_TERMINAL_PROMPT", "0"),
                    ],
                ))
                .step(checkout_clean())
                .step(factory_tools())
                .step(toolchain())
                .step(setup_bun())
                .step(Step::run("bun ci").named("Install"))
                .step(
                    Step::run("bun packages/api/scripts/api-fixtures.ts --check")
                        .named("Golden HTTP cases match the TypeScript host"),
                )
                .step(
                    Step::run("cargo run -q --locked -p shenron-migrate -- check")
                        .named("Migration ledger (shenron-migrate check)"),
                )
                .step(
                    Step::run("cargo test -q --locked -p shenron-api -p shenron-migrate")
                        .named("Rust router answers the golden cases"),
                ),
        )
}

fn npm_publish() -> Workflow {
    Workflow::new("npm-publish", "npm-publish")
        .header(
            "Publication npm sans jeton (trusted publisher): le trusted publisher npm de chaque paquet pointe sur ce fichier.",
        )
        .section(
            group(
                "on",
                vec![group(
                    "workflow_dispatch",
                    vec![group(
                        "inputs",
                        vec![
                            group(
                                "packages",
                                vec![
                                    quoted_field(
                                        "description",
                                        "Dossiers des paquets, relatifs au dépôt, séparés par des espaces",
                                    ),
                                    field("required", "true"),
                                ],
                            ),
                            group(
                                "dry_run",
                                vec![
                                    quoted_field("description", "npm publish --dry-run"),
                                    field("type", "boolean"),
                                    field("default", "true"),
                                ],
                            ),
                            group(
                                "tag",
                                vec![
                                    quoted_field("description", "dist-tag"),
                                    field("default", "latest"),
                                ],
                            ),
                        ],
                    )],
                )],
            )
            .blank(),
        )
        .section(
            group(
                "permissions",
                vec![field("contents", "read"), field("id-token", "write")],
            )
            .blank(),
        )
        .job(
            Job::new("publish")
                .entry(field("runs-on", UBUNTU_24))
                .step(checkout_clean())
                .step(setup_bun())
                .step(
                    Step::uses("actions/setup-node@v6")
                        .with(field("node-version", "lts/*"))
                        .with(field("registry-url", "https://registry.npmjs.org")),
                )
                .step(Step::run("bun install --frozen-lockfile"))
                .step(
                    Step::run(
                        r###"
                        for dir in $PACKAGES; do
                          (cd "$dir" && npm publish --provenance --access public --tag "$TAG" $([ "$DRY_RUN" = true ] && echo --dry-run))
                        done
                        "###,
                    )
                    .named("Publish")
                    .env(field("PACKAGES", "${{ inputs.packages }}"))
                    .env(field("DRY_RUN", "${{ inputs.dry_run }}"))
                    .env(field("TAG", "${{ inputs.tag }}")),
                ),
        )
}

fn release() -> Workflow {
    Workflow::new("release", "Release")
        .section(
            group(
                "on",
                vec![
                    group("push", vec![field("tags", r#"["v*"]"#)]),
                    group(
                        "workflow_dispatch",
                        vec![group(
                            "inputs",
                            vec![group(
                                "tag",
                                vec![
                                    quoted_field("description", "Tag à releaser (ex. v0.2.0)"),
                                    field("required", "true"),
                                ],
                            )],
                        )],
                    ),
                ],
            )
            .blank(),
        )
        .section(group("permissions", vec![field("contents", "write")]).blank())
        .section(
            group(
                "env",
                vec![field(
                    "SHENRON_RELEASE_TAG",
                    "${{ github.event.inputs.tag || github.ref_name }}",
                )],
            )
            .blank(),
        )
        .job(
            Job::new("build")
                .entry(field("name", "Compile (${{ matrix.target }})"))
                .entry(
                    field("runs-on", UBUNTU_26)
                        .comment("Bun compile en croisé : les deux cibles se construisent sur Linux."),
                )
                .entry(field("timeout-minutes", "60"))
                .entry(group(
                    "strategy",
                    vec![
                        field("fail-fast", "false"),
                        group(
                            "matrix",
                            vec![list(
                                "include",
                                plain_items(&[
                                    r#"{ target: linux-x64, ext: "" }"#,
                                    r#"{ target: windows-x64, ext: ".exe" }"#,
                                ]),
                            )],
                        ),
                    ],
                ))
                .step(Step::uses(CHECKOUT).with(field("ref", TAG_REF)))
                .step(setup_bun())
                .step(bun_cache())
                .step(Step::run("bun ci").named("Install").blank())
                .step(verify_release_version().blank())
                .step(
                    Step::run("bun scripts/build/server.ts --target ${{ matrix.target }} --flavor desktop")
                        .named("shenron-server")
                        .blank()
                        .comment(
                            r###"
                            Le WASM de crates/koharu-canvas est suivi par Git (packages/koharu/src/wasm/, contrôlé
                            par rust.yml) : aucun outillage Rust pour le site.
                            Application frontale (Next standalone, sans base) + API locales, un seul fichier.
                            "###,
                        ),
                )
                .step(
                    Step::run("bun scripts/build/bot.ts --target ${{ matrix.target }}")
                        .named("shenron-bot")
                        .blank()
                        .comment(
                            "Bot Discord + API publique ; les migrations SQL voyagent à côté du binaire.",
                        ),
                )
                .step(
                    Step::run("dist/bot/linux-x64/shenron-bot --smoke")
                        .named("Smoke test (bot, sans Discord ni base)")
                        .when("matrix.target == 'linux-x64'")
                        .blank(),
                )
                .step(
                    Step::run(
                        r###"
                        mkdir -p release
                        cp "dist/server/${{ matrix.target }}/shenron-server${{ matrix.ext }}" "release/shenron-server-${{ matrix.target }}${{ matrix.ext }}"
                        if [ "${{ matrix.target }}" = "windows-x64" ]; then
                          (cd dist/bot/windows-x64 && zip -qr "$GITHUB_WORKSPACE/release/shenron-bot-windows-x64.zip" .)
                        else
                          tar -C dist/bot/linux-x64 -czf release/shenron-bot-linux-x64.tar.gz .
                        fi
                        "###,
                    )
                    .named("Package")
                    .blank(),
                )
                .step(
                    Step::uses(UPLOAD_ARTIFACT)
                        .named("Upload binaries")
                        .with(field("name", "shenron-${{ matrix.target }}"))
                        .with(field("path", "release/*"))
                        .with(field("if-no-files-found", "error"))
                        .with(field("retention-days", "30"))
                        .blank(),
                ),
        )
        .job(
            Job::new("desktop")
                .entry(field("name", "Shenron Studio (${{ matrix.target }})"))
                .entry(field("runs-on", "${{ matrix.os }}"))
                .entry(field("timeout-minutes", "120"))
                .entry(group(
                    "strategy",
                    vec![
                        field("fail-fast", "false"),
                        group(
                            "matrix",
                            vec![list(
                                "include",
                                plain_items(&[
                                    "{ target: linux-x64, os: ubuntu-26.04 }",
                                    "{ target: windows-x64, os: windows-latest }",
                                ]),
                            )],
                        ),
                    ],
                ))
                .step(
                    Step::uses(CHECKOUT)
                        .with(field("ref", TAG_REF))
                        .with(field("persist-credentials", "false")),
                )
                .step(
                    Step::run("sudo apt-get update && sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev build-essential file")
                        .named("Linux system dependencies")
                        .when("runner.os == 'Linux'"),
                )
                .step(rust_toolchain())
                .step(rust_cache("release-desktop-${{ matrix.target }}"))
                .step(install_tool("tauri-cli"))
                .step(setup_bun())
                .step(
                    Step::uses(CACHE)
                        .with(field("path", "~/.bun/install/cache"))
                        .with(field(
                            "key",
                            "release-desktop-bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}",
                        )),
                )
                .step(bun_install())
                .step(verify_release_version())
                .step(
                    Step::run(
                        r###"
                        [ -n "$TAURI_SIGNING_PRIVATE_KEY" ] || unset TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD
                        bun scripts/build/desktop.ts --target "${{ matrix.target }}" --skip-chat-model
                        "###,
                    )
                    .named("Build Shenron Studio")
                    .shell("bash")
                    .env(field("TAURI_SIGNING_PRIVATE_KEY", "${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}"))
                    .env(field(
                        "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
                        "${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}",
                    )),
                )
                .step(
                    Step::uses(UPLOAD_ARTIFACT)
                        .with(field("name", "shenron-studio-${{ matrix.target }}"))
                        .with(field("path", "dist/desktop/${{ matrix.target }}/"))
                        .with(field("if-no-files-found", "error"))
                        .with(field("retention-days", "30")),
                ),
        )
        .job(
            Job::new("release")
                .entry(field("name", "Create GitHub Release (draft)"))
                .entry(field("needs", "[build, desktop]"))
                .entry(field("runs-on", UBUNTU_26))
                .step(
                    Step::uses(CHECKOUT)
                        .with(field("ref", TAG_REF))
                        .with(field("fetch-depth", "0")),
                )
                .step(
                    Step::uses("actions/download-artifact@v8")
                        .named("Download all artifacts")
                        .with(field("path", "artifacts"))
                        .with(field("merge-multiple", "true")),
                )
                .step(
                    Step::run(
                        r###"
                        cd artifacts
                        rm -f SHA256SUMS
                        sha256sum -- * > SHA256SUMS
                        cat SHA256SUMS
                        "###,
                    )
                    .named("Generate SHA256 sums")
                    .blank()
                    .comment(
                        "One checksum index covers every server, bot and Studio asset in this release.",
                    ),
                )
                .step(
                    Step::run(
                        r###"
                        TAG="$SHENRON_RELEASE_TAG"
                        echo "tag=$TAG" >> "$GITHUB_OUTPUT"
                        {
                          echo "changelog<<__EOF__"
                          echo "## Commits depuis la release précédente"
                          PREV=$(git tag --sort=-creatordate | grep -v "^$TAG$" | head -1 || echo "")
                          if [ -n "$PREV" ]; then
                            git log --pretty=format:"- %s (%h)" "$PREV..$TAG"
                          else
                            git log --pretty=format:"- %s (%h)" "$TAG"
                          fi
                          echo ""
                          echo "__EOF__"
                        } >> "$GITHUB_OUTPUT"
                        "###,
                    )
                    .named("Extract changelog")
                    .id("changelog")
                    .blank(),
                )
                .step(
                    Step::uses("softprops/action-gh-release@v3")
                        .named("Create draft release")
                        .with(field("tag_name", "${{ steps.changelog.outputs.tag }}"))
                        .with(field("name", "Shenron ${{ steps.changelog.outputs.tag }}"))
                        .with(lines(
                            "body",
                            "|",
                            r###"
                            ${{ steps.changelog.outputs.changelog }}

                            ## Binaires autonomes

                            | Binaire | Linux x64 | Windows x64 |
                            |---|---|---|
                            | `shenron-server` : application frontale + API locales | `shenron-server-linux-x64` | `shenron-server-windows-x64.exe` |
                            | `shenron-bot` : bot Discord + API publique (migrations incluses) | `shenron-bot-linux-x64.tar.gz` | `shenron-bot-windows-x64.zip` |

                            `shenron-server doctor` affiche le profil et la présence des secrets ; `shenron-bot --smoke`
                            vérifie le binaire sans Discord ni base. Intégrité : `SHA256SUMS`.

                            ## Shenron Studio

                            Installers and sidecars for Linux x64 and Windows x64 are built from this exact tag
                            and attached to this same release. `SHA256SUMS` covers the complete release.

                            ## Depuis les sources

                            ```bash
                            git clone https://github.com/aphrody-labs/shenron.git
                            cd shenron
                            bun install --frozen-lockfile
                            cp apps/bot/.env.example apps/bot/.env   # DISCORD_TOKEN / GUILD_ID / OWNER_ID
                            bun --filter @aphrody/shenron-bot dev
                            ```
                            "###,
                        ))
                        .with(field("files", "artifacts/*"))
                        .with(field("draft", "true"))
                        .with(field("prerelease", "${{ contains(steps.changelog.outputs.tag, '-') }}"))
                        .blank()
                        .comment(
                            "Keep a single reviewable draft until the owner publishes this complete release.",
                        ),
                ),
        )
}

const RUST_PATHS: [&str; 11] = [
    "crates/**",
    "Cargo.toml",
    "Cargo.lock",
    "rust-toolchain.toml",
    "rustfmt.toml",
    "clippy.toml",
    "deny.toml",
    ".cargo/config.toml",
    ".config/nextest.toml",
    "scripts/build/rust/**",
    ".github/workflows/rust.yml",
];

fn rust() -> Workflow {
    Workflow::new("rust", "Rust")
        .header(
            r###"
            SPDX-License-Identifier: Apache-2.0
            Rust gates of the Cargo workspace (crates/*): rustfmt, clippy with warnings denied, nextest,
            koharu-canvas on wasm32 and cargo-deny.

            Infra provisions the trusted factory's toolchain and read-only dependency access.
            Only this repository's branches may execute on that host. Cargo compilation uses
            the qualified factory wrapper and its shared locks. See docs/development/rust.md.
            "###,
        )
        .section(
            group(
                "on",
                vec![
                    group(
                        "push",
                        vec![
                            field("branches", "[main]"),
                            list("paths", quoted_items(&RUST_PATHS)),
                        ],
                    ),
                    group(
                        "pull_request",
                        vec![
                            field("branches", "[main]"),
                            list("paths", quoted_items(&RUST_PATHS)),
                        ],
                    ),
                    bare("workflow_dispatch"),
                ],
            )
            .blank(),
        )
        .section(contents_read().blank())
        .section(
            group(
                "concurrency",
                vec![field("group", "rust-${{ github.ref }}"), field("cancel-in-progress", "true")],
            )
            .blank(),
        )
        .section(
            group(
                "env",
                vec![
                    field("CARGO_TERM_COLOR", "always"),
                    quoted_field("CARGO_INCREMENTAL", "0"),
                    quoted_field("CARGO_PROFILE_DEV_DEBUG", "0")
                        .comment("No debug info on the runner: smaller target/ and caches."),
                    quoted_field("CARGO_PROFILE_TEST_DEBUG", "0"),
                ],
            )
            .blank(),
        )
        .job(
            Job::new("fmt")
                .entry(field("name", "rustfmt"))
                .entry(field("if", NOT_FORK_PULL_REQUEST))
                .entry(field("runs-on", FACTORY))
                .step(checkout_clean())
                .step(
                    Step::run(r###"echo "$HOME/.cargo/bin" >> "$GITHUB_PATH""###)
                        .named("Resolve the factory Rust toolchain"),
                )
                .step(
                    toolchain()
                        .comment("rust-toolchain.toml: channel, rustfmt and clippy, the three targets."),
                )
                .step(
                    Step::run("cargo fmt --all --check")
                        .named("cargo fmt --check")
                        .comment("rustfmt reads the workspace members only: no dependency, no token."),
                ),
        )
        .job(
            Job::new("check")
                .entry(field("name", "Clippy, nextest, wasm32, deny"))
                .entry(field("if", NOT_FORK_PULL_REQUEST))
                .entry(field("runs-on", FACTORY))
                .entry(field("timeout-minutes", "120"))
                .entry(group(
                    "env",
                    vec![
                        field("RUSTC_WRAPPER", "sccache"),
                        field(
                            "CARGO_TARGET_DIR",
                            "${{ vars.SHENRON_CARGO_TARGET_DIR || format('{0}/target', github.workspace) }}",
                        )
                        .comment(
                            "Runner variable SHENRON_CARGO_TARGET_DIR keeps target/ across jobs; default is per-workspace.",
                        ),
                        quoted_field("GIT_TERMINAL_PROMPT", "0"),
                    ],
                ))
                .step(checkout_clean())
                .step(factory_tools())
                .step(
                    Step::run(
                        r###"
                        set -euo pipefail
                        for tool in cargo rustup cargo-nextest cargo-deny sccache pkg-config clang cmake; do
                          command -v "$tool" >/dev/null
                        done
                        pkg-config --exists gtk4 fontconfig dbus-1 openssl
                        "###,
                    )
                    .named("Verify factory readiness")
                    .blank(),
                )
                .step(toolchain().blank())
                .step(
                    setup_bun().blank().comment(
                        "The factory's Cargo and sccache stores are managed by Infra, across jobs.",
                    ),
                )
                .step(Step::run("cargo fetch --locked").named("Fetch (Cargo.lock)").blank())
                .step(
                    Step::run("bun scripts/build/rust/cargo.ts clippy --workspace --all-targets --locked -- -D warnings")
                        .named("Clippy (cargo lint)")
                        .blank(),
                )
                .step(
                    Step::run_folded(
                        r###"
                        bun scripts/build/rust/cargo.ts clippy -p shenron-manga -p shenron-cli -p shenron-mcp --all-targets --locked
                        --features shenron-manga/koharu,shenron-cli/koharu,shenron-mcp/koharu -- -D warnings
                        "###,
                    )
                    .named("Clippy, koharu feature (cargo koharu)")
                    .blank(),
                )
                .step(
                    Step::run("bun scripts/build/rust/cargo.ts check -p koharu-canvas --lib --target wasm32-unknown-unknown --locked")
                        .named("koharu-canvas on wasm32 (cargo wasm)")
                        .blank(),
                )
                .step(
                    Step::run("bun packages/koharu/scripts/build-wasm.ts --check")
                        .named("Committed koharu-canvas WASM is up to date")
                        .blank()
                        .comment(
                            r###"
                            The committed module (packages/koharu/src/wasm/) matches its sources, Cargo.lock and
                            toolchain; rebuild it with `bun packages/koharu/scripts/build-wasm.ts` and commit it.
                            "###,
                        ),
                )
                .step(
                    Step::run("bun scripts/build/rust/cargo.ts nextest run --workspace --locked --profile ci")
                        .named("Tests (nextest, ci profile)")
                        .blank(),
                )
                .step(Step::run("cargo deny --locked check").named("cargo-deny").blank())
                .step(
                    Step::uses(UPLOAD_ARTIFACT)
                        .named("JUnit report")
                        .when("always()")
                        .with(field("name", "nextest-junit"))
                        .with(field("path", "target/nextest/ci/junit.xml"))
                        .with(field("if-no-files-found", "ignore"))
                        .with(field("retention-days", "14"))
                        .blank(),
                )
                .step(
                    Step::run("sccache --show-stats")
                        .named("sccache statistics")
                        .when("always()")
                        .blank(),
                ),
        )
}

fn server_artifact() -> Workflow {
    Workflow::new("server-artifact", "Production auto-deploy")
        .section(
            group(
                "on",
                vec![
                    group("push", vec![field("branches", r#"["main"]"#)]),
                    group(
                        "workflow_dispatch",
                        vec![group(
                            "inputs",
                            vec![
                                group(
                                    "revision",
                                    vec![
                                        field(
                                            "description",
                                            "Revision to release (default the pushed or dispatched commit)",
                                        ),
                                        field("required", "false"),
                                        quoted_field("default", ""),
                                    ],
                                ),
                                group(
                                    "plan_only",
                                    vec![
                                        field(
                                            "description",
                                            "Print the plan against production only (no build, no deploy)",
                                        ),
                                        field("required", "false"),
                                        field("type", "boolean"),
                                        field("default", "true"),
                                    ],
                                ),
                                group(
                                    "accept_holds",
                                    vec![
                                        field(
                                            "description",
                                            "Migrations of this diff are applied by Infra already (releases a HOLD)",
                                        ),
                                        field("required", "false"),
                                        field("type", "boolean"),
                                        field("default", "false"),
                                    ],
                                ),
                            ],
                        )],
                    ),
                ],
            )
            .blank()
            .comment(
                r###"
                Push to main -> plan against what production runs -> build only the changed lanes -> switch only
                the reached services (deploy/activation/activate.sh, --no-deps, automatic rollback).
                Runbook: docs/operations/AUTO-DEPLOY.md.

                INERT BY DEFAULT. Nothing runs on push unless the repository variable AUTO_DEPLOY_ENABLED is
                exactly "true" (Settings > Secrets and variables > Actions > Variables). A manual dispatch also
                needs it, except with plan_only. Flipping it is the owner's decision; unsetting it stops auto
                deploy at once. Never schedule pull-request code on the production runner.
                "###,
            )
            .blank(),
        )
        .section(contents_read().blank())
        .section(
            group(
                "concurrency",
                vec![
                    field("group", "shenron-production-deploy"),
                    field("cancel-in-progress", "false"),
                ],
            )
            .blank()
            .comment(
                r###"
                One release at a time; a newer push waits instead of cancelling a release mid-switch. The plan
                compares with the running revision, so a skipped commit is still deployed by the next one.
                "###,
            ),
        )
        .job(
            Job::new("release")
                .entry(field("name", "Plan, build changed lanes, switch reached services"))
                .entry(lines(
                    "if",
                    ">-",
                    r###"
                    vars.AUTO_DEPLOY_ENABLED == 'true' ||
                    (github.event_name == 'workflow_dispatch' && inputs.plan_only && vars.SHENRON_PROD_RUNNER_READY == 'true')
                    "###,
                ))
                .entry(field("runs-on", PRODUCTION).comment(
                    r###"
                    The production host is the build host (deploy/environment.json "primary": "native"):
                    its persistent checkout keeps target/, sccache, node_modules and the Turbopack cache.
                    "###,
                ))
                .entry(field("timeout-minutes", "90"))
                .entry(group(
                    "env",
                    vec![
                        field("SHENRON_SOURCE_REPO", "${{ github.workspace }}").comment(
                            "build-image.sh builds from a reusable worktree of this checkout (fetch).",
                        ),
                        field("SHENRON_BUILD_REPO", "${{ vars.SHENRON_BUILD_REPO }}"),
                        field("SHENRON_VFS_SOURCE", "${{ vars.SHENRON_VFS_SOURCE }}"),
                        field("SHENRON_DEPLOY_TARGET", "${{ vars.SHENRON_DEPLOY_TARGET || 'local' }}"),
                        field(
                            "SHENRON_DEPLOY_COMMAND",
                            "${{ vars.SHENRON_DEPLOY_COMMAND || 'bash ~/deploy-shenron-image.sh' }}",
                        ),
                        field("SHENRON_ACCEPT_HOLDS", "${{ inputs.accept_holds && '1' || '0' }}"),
                        field("REVISION", "${{ inputs.revision || github.sha }}"),
                    ],
                ))
                .step(
                    Step::uses(CHECKOUT)
                        .with(field("fetch-depth", "0"))
                        .with(field("persist-credentials", "false")),
                )
                .step(setup_bun().blank())
                .step(
                    Step::run(r###"bash scripts/deploy/release.sh --plan "$REVISION""###)
                        .named("Plan against production")
                        .shell("bash")
                        .blank(),
                )
                .step(
                    Step::run(
                        r###"
                        set -euo pipefail
                        for name in SHENRON_BUILD_REPO SHENRON_VFS_SOURCE; do
                          [ -n "${!name}" ] || unset "$name"
                        done
                        bash scripts/deploy/release.sh --auto "$REVISION"
                        "###,
                    )
                    .named("Build changed lanes and switch reached services")
                    .when("${{ !(github.event_name == 'workflow_dispatch' && inputs.plan_only) }}")
                    .shell("bash")
                    .blank(),
                ),
        )
}

fn update_deps() -> Workflow {
    Workflow::new("update-deps", "Update deps (weekly)")
        .section(
            group(
                "on",
                vec![
                    list(
                        "schedule",
                        vec![
                            mapping(vec![quoted_field("cron", "0 6 * * 1")])
                                .comment("Tous les lundis 06:00 UTC"),
                        ],
                    ),
                    bare("workflow_dispatch"),
                ],
            )
            .blank(),
        )
        .section(
            group(
                "permissions",
                vec![field("contents", "write"), field("pull-requests", "write")],
            )
            .blank(),
        )
        .job(
            Job::new("bun-update")
                .entry(field("name", "bun update + PR"))
                .entry(field("runs-on", UBUNTU_26))
                .entry(field("timeout-minutes", "45"))
                .entry(group(
                    "env",
                    vec![
                        field("DISCORD_TOKEN", "test-token"),
                        quoted_field("GUILD_ID", "1497167233280118896"),
                        quoted_field("OWNER_ID", "11111111111111111"),
                        quoted_field("DATABASE_PATH", "./data/test-ci.db"),
                    ],
                ))
                .step(checkout())
                .step(setup_bun())
                .step(install_tool("just"))
                .step(setup_uv().comment(
                    "scripts/design rebuilds the font faces with fontTools through uv (same pin as ci.yml).",
                ))
                .step(
                    Step::run(r###"cp bun.lock "$RUNNER_TEMP/bun.lock.before""###)
                        .named("Capture état avant")
                        .comment(
                            r###"
                            bun update moves the catalog ranges of the root package.json and bun.lock together
                            (an exact catalog pin stays put and skews against transitive ranges: keep families on ranges);
                            minimumReleaseAge of bunfig.toml is respected.
                            "###,
                        ),
                )
                .step(
                    Step::run("bun update")
                        .named("Update deps (semver-respecting)")
                        .blank(),
                )
                .step(
                    Step::run(
                        r###"
                        bun --filter @aphrody/shenron-bot gen:entries
                        bun packages/api/scripts/openapi.ts --check
                        bun packages/ui/scripts/generate-tokens.ts --check
                        bun packages/pipeline/scripts/ai/check-contracts.ts
                        bun scripts/plugin/sync.ts --check
                        bun check
                        just bun-lint
                        just bun-format-check
                        just bun-test
                        just test-scripts
                        "###,
                    )
                    .named("Verify")
                    .blank()
                    .comment("Mêmes portes que ci.yml."),
                )
                .step(
                    Step::run(
                        r###"
                        if cmp -s "$RUNNER_TEMP/bun.lock.before" bun.lock; then
                          echo "changed=false" >> "$GITHUB_OUTPUT"
                        else
                          echo "changed=true" >> "$GITHUB_OUTPUT"
                          {
                            echo "summary<<__EOF__"
                            echo "## Mises à jour appliquées"
                            echo ""
                            echo '```diff'
                            diff -u "$RUNNER_TEMP/bun.lock.before" bun.lock | grep -E '^[-+] +"[^"]+": \["' | head -60 || true
                            echo '```'
                            echo ""
                            echo "__EOF__"
                          } >> "$GITHUB_OUTPUT"
                        fi
                        "###,
                    )
                    .named("Diff")
                    .id("diff")
                    .blank(),
                )
                .step(
                    Step::uses("peter-evans/create-pull-request@v8")
                        .named("Create pull request")
                        .when("steps.diff.outputs.changed == 'true'")
                        .with(field("branch", "chore/weekly-deps-update"))
                        .with(field("delete-branch", "true"))
                        .with(quoted_field("title", "chore(deps): bun update hebdomadaire"))
                        .with(quoted_field("commit-message", "chore(deps): bun update"))
                        .with(lines(
                            "body",
                            "|",
                            r###"
                            Mise à jour automatique des dépendances via `bun update` (respect semver).

                            ${{ steps.diff.outputs.summary }}

                            Type-check, lint, tests et contrôles de dérive passent dans ce job.

                            _Si un conflit apparaît plus tard, fermer cette PR : elle est recréée lundi suivant._
                            "###,
                        ))
                        .with(field("labels", "dependencies,automated"))
                        .blank(),
                ),
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_sequences_of_mappings_and_block_scalars() {
        let workflow = Workflow::new("sample", "Sample")
            .section(group("on", vec![bare("workflow_dispatch")]).blank())
            .job(
                Job::new("one")
                    .entry(field("runs-on", UBUNTU_24))
                    .step(Step::run("echo a\necho b").named("Say").blank()),
            );
        let expected = "name: Sample\n\non:\n  workflow_dispatch:\n\njobs:\n  one:\n    runs-on: \
                        ubuntu-24.04\n    steps:\n\n      - name: Say\n        run: |\n          \
                        echo a\n          echo b\n";
        assert_eq!(workflow.render(), expected);
    }

    #[test]
    fn dedent_drops_the_shared_indent_and_the_outer_blank_lines() {
        assert_eq!(dedent("\n    a\n      b\n\n    c\n    "), vec!["a", "  b", "", "c"]);
    }

    #[test]
    fn checked_in_workflows_match_their_definitions() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
        let directory = root.join(".github").join("workflows");
        let stale = stale_files(&directory, &render_all()).expect("workflow directory is readable");
        assert!(stale.is_empty(), "{stale:?}");
    }
}
