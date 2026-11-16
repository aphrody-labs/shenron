# VCS, task runner and Cargo acceleration tooling

Tools expected on the PC (jj, gix, just, sccache, xwin, cargo-nextest, cargo-binstall).

## Jujutsu (`jj`)

- Working copy is a commit (`@`), stable change IDs across rebases, first-class conflicts, `jj undo` / `jj op restore <op-id>`.
- Colocate in a git repo: `jj git init`. Common: `jj log`, `jj new -m "msg"`, `jj edit <change-id>`, `jj rebase -s <change-id> -d trunk()`, `jj squash`.
- Repo rule still wins: commits go directly on `main`, never branches or worktrees.

## Gitoxide (`gix`)

Pure-Rust git: `gix status`, `gix verify`, `gix commit-graph verify`, `gix dirwalk`.

## `just`

Deterministic command recipes in `justfile` (`just --list`, recipes take parameters: `recipe target="x":`). Check the root `justfile` before adding a recipe.

## Cargo acceleration

- `sccache`: `rustc-wrapper = "sccache"` in `~/.cargo/config.toml`, overridden to `""` for this repo by `.cargo/config.toml`; `sccache --show-stats` to verify hits. If `just install-ay` fails with rustc exit `0xfffffffe`, retry with `RUSTC_WRAPPER=""`.
- `cargo nextest` (alias `cargo nt` -> `nextest run`), `cargo binstall --no-confirm <crate>` for prebuilt binaries, `xwin` to fetch the MSVC CRT and Windows SDK for cross-compiling Windows targets.
- `cargo xtask`: workspace task crate at `src/xtask`.
- Heavy workspace builds run on `fr1` or CI, not on the PC.
