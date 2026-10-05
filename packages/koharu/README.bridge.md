# @shenron/koharu

This package owns the browser/native boundary of the Shenron Studio editor (engine code name Koharu):

- `src/protocol.ts` is generated from the Rust Tauri command surface (`koharu-app`);
- `src/transport.ts` gives the protocol its `invoke` and `Channel`: Tauri IPC in Shenron Studio, the `/api/local/koharu` bridge of `shenron-server` (POST `invoke`, server-sent `events`) in a browser;
- `src/canvas.ts` adapts that protocol and `koharu-canvas` to the browser;
- `src/wasm` is ignored derived output of `scripts/build-wasm.ts`.

`bun run build:wasm` builds `crates/koharu-canvas` with `cargo build --target wasm32-unknown-unknown` and the `wasm-bindgen` CLI (no wasm-pack) into `src/wasm`, rebuilding only when an input changed (`--force`, `--check`); `src/canvas.ts` streams and compiles the module (`preloadCanvasModule` starts it early).

Regenerate the protocol with `bun --filter @shenron/koharu protocol` (`cargo run -p koharu-app --example protocol`). Do not edit generated protocol or WASM output by hand.
