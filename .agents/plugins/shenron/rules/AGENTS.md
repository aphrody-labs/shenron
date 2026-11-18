# Shenron Autonomous Agent Rules (`rules/AGENTS.md`)

## 1. Stack & Runtime

- 100% Upstream Bun v1.4.4+ and Rust 2024.
- Zero npm, node, yarn, or pnpm commands.
- Zero emojis in all code, comments, logs, and commit messages.

## 2. Safety & Host Integrity

- Never execute destructive host or remote container commands (`rm -rf $SHENRON_ROOT`, `docker rm`, `docker system prune`).
- Never log or commit raw secrets.
- Respect the `migration/rust.toml` TypeScript line ratchet (`ts_lines` must never increase) and `[lints] workspace = true` crate inheritance (`just align-check`).
- Always validate modifications with `bun check`, `just lint`, and `just migrate-check` (running heavy Rust gates on `fr1`).
