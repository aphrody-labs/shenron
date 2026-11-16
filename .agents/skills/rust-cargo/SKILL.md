---
name: rust-cargo
description: Rust and Cargo reference for shenron, grounded in upstream rust-lang/cargo, rust-lang/rust and crates.io : Edition 2024, resolver v3, workspace inheritance, sparse registry and credential providers, cargo-deny, crates.io sparse index and live API, publishing, the pinned Chromium nightly toolchain (rust-toolchain.toml) with LLVM cross-language LTO and lld, windows-rs, plus jj, gix, just, sccache, nextest, binstall, xwin and xtask. Use for any Cargo.toml, rust-toolchain, crate lookup or publish, Rust build speed or Rust VCS/task tooling question.
---

# Rust Cargo (2026)

Upstream docs: `https://doc.rust-lang.org/cargo/reference/`.

## Edition 2024 and Resolver v3

Virtual workspaces have `[workspace]` without `[package]`, so `resolver` must be set explicitly in `[workspace]` (cannot be inferred from `package.edition`):

```toml
[workspace]
resolver = "3"
members = ["src/ay", "src/core"]   # the root Cargo.toml lists members explicitly

[workspace.package]
edition = "2024"
rust-version = "1.85"
```

- `resolver = "3"` (default for `edition = "2024"`, requires Rust 1.84+): changes `resolver.incompatible-rust-versions` default from `allow` to `fallback`.
- In the root `Cargo.toml`, `resolver = "3"` and `edition = "2024"` are set at workspace root, with `cargo-features = ["codegen-backend", "panic-immediate-abort"]`.

## Workspace Dependency Inheritance

Members inherit from `[workspace.dependencies]` via `workspace = true`. Edition 2024 supports `features`, `default-features`, and `optional` alongside `workspace = true` (overriding `version` is disallowed):

```toml
[dependencies]
serde = { workspace = true, default-features = false }
regex = { workspace = true, features = ["unicode"] }

[build-dependencies]
cc.workspace = true
```

## Sparse Registry and Credential Providers

Cargo uses the sparse HTTP protocol (`sparse+https://index.crates.io/`) by default for crates.io. Custom registries can be configured in `.cargo/config.toml`:

```toml
[registries.my-registry]
index = "sparse+https://example.com/path/to/index"

[registry]
global-credential-providers = [
  "cargo:token",
  "cargo:libsecret",
  "cargo:macos-keychain",
  "cargo:wincred",
]
```

Later entries in `global-credential-providers` take higher precedence; `cargo:wincred` stores tokens in Windows Credential Manager instead of plaintext `credentials.toml`.

## Dependency Auditing with cargo-deny

`cargo-deny` (`cargo info cargo-deny` for the version; config `deny.toml`) checks advisories, licenses, banned crates, and allowed sources:

```bash
cargo deny check advisories bans sources
cargo deny check licenses
```

## Monorepo Execution Rules

- Do not run heavy Rust builds on the workstation; compile in CI or on `fr1` via `just` or `ay`.
- Single workspace `Cargo.lock` and target directory at the repo root.

## References

- [references/crates-io.md](references/crates-io.md): crates.io sparse index paths, live REST API, publishing checklist.
- [references/compiler-toolchain.md](references/compiler-toolchain.md): pinned Chromium nightly (rust-toolchain.toml), linker-plugin LTO with clang/lld, windows-rs.
- [references/monorepo-tooling.md](references/monorepo-tooling.md): jj, gix, just, sccache, nextest, binstall, xwin, xtask.
