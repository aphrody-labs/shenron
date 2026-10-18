# SPDX-License-Identifier: Apache-2.0
# One entry point for the common Bun and Rust tasks of Shenron: `just` lists them.
# Recipes call the existing scripts (package.json, scripts/, the cargo aliases of
# .cargo/config.toml) and never duplicate their logic. Names follow package.json
# (`format:check` -> `format-check`); Rust-only tasks start with `rust-`, and `check`, `lint`,
# `test` and `format-check` run the Bun side then the Rust side. See docs/development/rust.md.

# Bun Shell runs every recipe line, on Linux, WSL and Windows alike.
set shell := ["bun", "exec"]
set windows-shell := ["bun", "exec"]

# Cargo, serialized through APHRODY_CARGO_SERIAL when it is set.
cargo := "bun scripts/build/rust/cargo.ts"

alias check-rust := rust-check
alias clippy-rust := rust-lint
alias test-rust := rust-test
alias deny-rust := rust-deny
alias fmt-rust := rust-fmt-check

[private]
default:
    @just --list --unsorted

# Type-check everything: native bun check (packages and scripts), then cargo check (all crates and targets)
[group('all')]
check: typecheck rust-check

# Lint everything: native bun lint, then clippy with warnings denied
[group('all')]
lint: bun-lint rust-lint

# Test everything: Bun packages, root scripts, then the Rust crates (nextest)
[group('all')]
test: bun-test test-scripts rust-test

# Check formatting: native bun fmt, then rustfmt
[group('all')]
format-check: bun-format-check rust-fmt-check

# Generated files are up to date (OpenAPI, UI tokens, AI contracts, Cargo workspace dependencies)
[group('all')]
drift: deps-check
    bun packages/api/scripts/openapi.ts --check
    bun packages/ui/scripts/generate-tokens.ts --check
    bun packages/pipeline/scripts/ai/check-contracts.ts

# What the CI runs (ci.yml and rust.yml), in one go
[group('all')]
ci: drift typecheck bun-lint bun-test test-scripts rust-fmt-check rust-lint koharu wasm rust-deny
    bun scripts/build/rust/test.ts --profile ci

# Install the Bun dependencies from the lockfile
[group('bun')]
install:
    BUN_INSTALL_GLOBAL_STORE=0 bun install --frozen-lockfile

# bun check on the 13 packages, then scripts/
[group('bun')]
typecheck:
    bun run typecheck

# bun lint on apps, packages and scripts
[group('bun')]
bun-lint:
    bun run lint

# bun test of every package (live suites excluded)
[group('bun')]
bun-test:
    bun run test

# Tests of the root scripts (scripts/)
[group('bun')]
test-scripts:
    bun run test:scripts

# Live suites against real services (SHENRON_LIVE=1)
[group('bun')]
test-live:
    bun run test:live

# bun fmt --check on apps, packages and scripts
[group('bun')]
bun-format-check:
    bun run format:check

# Next dev server of the site
[group('bun')]
dev-site:
    bun --filter @aphrody/shenron-site dev

# Remote dev on the build VPS: up | gates [--rust] | dev | stop | sync | doctor | clean-wsl | backup
[group('bun')]
remote *args="up":
    bun scripts/dev/remote-dev.ts {{args}}

[group('bun')]
env *args="pull":
    bun scripts/dev/env-pull.ts {{args}}

# Discord bot in watch mode
[group('bun')]
dev-bot:
    bun --filter @aphrody/shenron-bot dev

# shenron-server binary (--target linux-x64|windows-x64, --flavor desktop|production, --skip-site)
[group('bun')]
build-server *args:
    bun scripts/build/server.ts {{ args }}

# shenron-bot binary
[group('bun')]
build-bot *args:
    bun scripts/build/bot.ts {{ args }}

# Regenerate the discordx barrel apps/bot/src/_entries.ts
[group('bun')]
entries:
    bun --filter @aphrody/shenron-bot gen:entries

# Regenerate packages/koharu/src/protocol.ts from koharu-app (Specta)
[group('rust')]
protocol:
    bun --filter @aphrody/shenron-koharu protocol

# cargo check of every crate and target (`cargo ck`)
[group('rust')]
rust-check:
    {{ cargo }} ck

# clippy of the workspace, warnings denied (`cargo lint`)
[group('rust')]
rust-lint:
    {{ cargo }} lint

# Tests of every workspace crate through nextest; arguments go to the runner (--profile ci, -E …)
[group('rust')]
rust-test *args:
    bun scripts/build/rust/test.ts {{ args }}

# rustfmt over the workspace
[group('rust')]
rust-fmt:
    cargo fmt --all

# rustfmt --check over the workspace
[group('rust')]
rust-fmt-check:
    cargo fmt --all --check

# cargo deny check: advisories, licences, bans, sources (deny.toml)
[group('rust')]
rust-deny:
    cargo deny check

# Clippy and tests of the `koharu` feature (Shenron adapters over the Koharu engine)
[group('rust')]
koharu:
    {{ cargo }} koharu
    {{ cargo }} koharu-test

# cargo check of koharu-canvas on wasm32-unknown-unknown (`cargo wasm`)
[group('rust')]
wasm:
    {{ cargo }} wasm

# Build the koharu-canvas WASM into packages/koharu/src/wasm
[group('rust')]
wasm-build:
    bun --filter @aphrody/shenron-koharu build:wasm

# Rustdoc of the workspace crates (`cargo docs`)
[group('rust')]
rust-doc:
    {{ cargo }} docs

# Run the MCP server (stdio by default; --http, --public …)
[group('rust')]
mcp *args:
    {{ cargo }} run -p shenron-mcp -- {{ args }}

# Run the shenron command
[group('rust')]
cli *args:
    {{ cargo }} run -p shenron-cli --bin shenron -- {{ args }}

# Build the desktop installer (--target windows-x64|linux-x64, --skip-server, --skip-mcp)
[group('rust')]
desktop *args:
    bun scripts/build/desktop.ts {{ args }}

# Regenerate [workspace.dependencies] from the pinned Aphrody revision (--rev <sha> to move it)
[group('rust')]
deps *args:
    bun scripts/build/rust/workspace-deps.ts {{ args }}

# The generated [workspace.dependencies] block is up to date
[group('rust')]
deps-check:
    bun scripts/build/rust/workspace-deps.ts --check

# Crate manifests inherit version, edition, rust-version and lints from the workspace
[group('rust')]
align-check:
    bun scripts/build/rust/align-crates.ts --check

# Build against a local Aphrody checkout, ~/aphrody by default (.cargo/local.toml, untracked)
[group('rust')]
aphrody-local *checkout:
    bun scripts/build/rust/local-aphrody-patch.ts {{ checkout }} --fetch

# Back to the pinned Aphrody revision (removes .cargo/local.toml)
[group('rust')]
aphrody-pinned:
    bun scripts/build/rust/local-aphrody-patch.ts --remove

# Container stack: prepare secrets and environment files (--prod|--dev)
[group('container')]
container-env *args="":
    bun scripts/ops/container.ts env {{args}}

# Container stack: build Docker image (--all-in-one)
[group('container')]
container-build *args="":
    bun scripts/ops/container.ts build {{args}}

# Container stack: start containers (--all-in-one)
[group('container')]
container-up *args="":
    bun scripts/ops/container.ts up {{args}}

# Container stack: stop containers
[group('container')]
container-down:
    bun scripts/ops/container.ts down

# Container stack: check service health and status
[group('container')]
container-status:
    bun scripts/ops/container.ts status

# Container stack: initialize database and apply migrations
[group('container')]
container-db-init *args="":
    bun scripts/ops/container.ts db-init {{args}}

# Container stack: OVH operations and DNS validation
[group('container')]
container-ovh *args="":
    bun scripts/ops/container.ts ovh {{args}}

# Container stack: backup container databases
[group('container')]
container-backup:
    bun scripts/ops/container.ts backup

# Connectors: generate ready-to-use configs for Codex, AGY, Claude Code, and Omar
[group('connectors')]
setup-connectors:
    bun scripts/ops/setup-agent-connectors.ts --write --status

# Connectors: verify connectivity to public and private MCP / A2A / LLM endpoints
[group('connectors')]
connectors-status:
    bun scripts/ops/setup-agent-connectors.ts --status


# Local Docker build into dist/local/ (site|bot|server|cli|mcp|desktop|wasm|image|all; --target linux-x64|windows-x64)
[group('build-local')]
build-local component="all" *args="":
    bun scripts/build/local.ts {{ component }} {{ args }}

# Local build: CLI and MCP for linux-x64 and windows-x64
[group('build-local')]
build-local-cli *args="":
    bun scripts/build/local.ts cli {{ args }}
    bun scripts/build/local.ts mcp {{ args }}

# Local build: Windows installer (Shenron Studio, NSIS) cross-built in Docker
[group('build-local')]
build-local-desktop *args="":
    bun scripts/build/local.ts desktop --target windows-x64 {{ args }}

# Private-data guard of the local build (--static --context --artifacts <dir>)
[group('build-local')]
build-local-guard *args="--static --context":
    bun scripts/build/local-guard.ts {{ args }}

# Native Windows steps (signing, NSIS on the host): pwsh scripts/build/local-windows.ps1
[group('build-local')]
build-local-windows *args="":
    pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/build/local-windows.ps1 {{ args }}
