# Rust compiler and pinned toolchain

Latest upstream release: check `gh api repos/rust-lang/rust/releases/latest` (pipe to `jaq -r .tag_name`).

## Pinned toolchain

Defined in `rust-toolchain.toml` at the repo root:

```toml
[toolchain]
channel = "chromium-<milestone>"
components = ["rustfmt", "clippy", "rust-src"]
profile = "minimal"
```

- Installed and linked via `bun scripts/toolchain.ts install`.

## Cross-Language Linker-Plugin LTO

When linking Rust `staticlib` crates with C/C++ compiled by `clang` on the shared LLVM toolchain, pass `-C linker-plugin-lto` and align LTO modes:

| Compiler            | Thin LTO      | Fat LTO      |
| :------------------ | :------------ | :----------- |
| `rustc`             | `-C lto=thin` | `-C lto=fat` |
| `clang` / `clang++` | `-flto=thin`  | `-flto=full` |

Example linking a Clang thin-LTO static library into a Rust binary via `lld`:

```bash
clang ./clib.c -flto=thin -c -o ./clib.o -O2
ar crus ./libxyz.a ./clib.o
RUSTFLAGS="-Clinker-plugin-lto -Clinker=clang -Clink-arg=-fuse-ld=lld" cargo build --release
```

Note on `-C lto`: omitting `-C lto` performs thin local LTO on the local crate unless `codegen-units=1` or `opt-level=0` is set.

## Windows Native Stack

- Use `windows` and `windows-bindgen` (versions in the root `Cargo.toml` `[workspace.dependencies]`) for Win32/NT APIs.
- If `just install-ay` fails with `rustc` exit `0xfffffffe` under `sccache`, retry with `RUSTC_WRAPPER=""`.
