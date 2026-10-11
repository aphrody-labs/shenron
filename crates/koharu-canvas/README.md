# koharu-canvas

`koharu-canvas` is Koharu's browser-only WebGPU/WASM editor viewport. It binds
the shared rasterizer to an `HTMLCanvasElement`, displays native-prepared frame
manifests, and owns only presentation resources, camera state, and transient
previews.

React owns tools, hit testing, selection, pointer gestures, and DOM controls.
The native application owns the scene, commits, undo, persistence, document
preparation, and durable validation. The browser never discovers fonts, decodes
document assets, or commits project state.

## Browser contract

`createCanvas(element)` initializes WebGPU asynchronously. A frame is installed
by staging a versioned manifest, fetching only its reported missing content
IDs, installing the independently encoded resources, and activating the stage
token. Resources are validated once and retained in bounded CPU and GPU caches
across page switches. Large resource decode and upload work is split across the
asynchronous per-resource calls. Raster packets are independently cached GPU-safe
tiles, so cold pages never require one page-sized WASM copy or WebGPU texture.

Activation is atomic: staging and resource delivery leave the current page
visible, a superseded token cannot activate, and an invalid or incomplete stage
does not replace the active frame. A replacement frame clears the pending
preview for the same page and a newer revision. `clear()` removes active and
staged presentation state without discarding reusable resources. Resize and
clear cancel color samples.

## Rendering and scheduling

The canvas uses `requestAnimationFrame` only while content is dirty or a GPU
readback needs polling. `render()` also provides a deterministic manual
presentation path for browser tests. Device loss is reported to JavaScript so
the frontend can dispose, recreate, and reinstall the last authoritative
frame.

## Build and delivery

`bun --filter @aphrody/shenron-koharu build:wasm` (`packages/koharu/scripts/build-wasm.ts`) builds the
crate with Rust tooling only: `cargo build -p koharu-canvas --target wasm32-unknown-unknown
--release` into `target/wasm` (fat LTO, one codegen unit, `panic=abort`, debuginfo stripped,
passed as `CARGO_PROFILE_RELEASE_*` so the shared `Cargo.toml` stays untouched), then the
`wasm-bindgen` CLI (`--target web`, name and producers sections removed, no default module
path) into `packages/koharu/src/wasm/`, ignored by Git. No wasm-pack, no binaryen. The script
adds the `wasm32-unknown-unknown` target and installs the `wasm-bindgen-cli` matching
`Cargo.lock` exactly when missing (in a per-version root, never over a global binary), and
keeps a stamp of its inputs (both crates, manifests, `Cargo.lock`, rustc and wasm-bindgen
versions) so an unchanged tree rebuilds nothing; `--force` rebuilds, `--check` exits non-zero
on a missing or stale output. The browser build uses the rasterizer without its `native`
feature.

Site builds (`scripts/build/build-site-external.ts`, `scripts/build/server.ts`) call it before
Next. Turbopack emits `koharu_canvas_bg.<hash>.wasm` under `_next/static/media/`, which is
published on the CDN and served as `application/wasm` with an immutable cache (probe in
`scripts/ops/release.ts`); `shenron-server` serves the same file from disk.

`@aphrody/shenron-koharu/canvas` compiles the module with `WebAssembly.compileStreaming` (falling back
to `WebAssembly.compile` when the response is not `application/wasm`), hands the
`WebAssembly.Module` to the glue, and exposes `preloadCanvasModule()` so the editor starts the
download early. Without `navigator.gpu` or a GPU adapter it throws `CanvasUnavailableError`
(`WebGPU indisponible : …`) before wgpu runs. `packages/koharu/test/canvas-wasm.test.ts`
validates the built module with the WebAssembly API of Bun and checks its exports and imports
against the glue.

The crate intentionally exports no native implementation. Native workspace
checks compile an empty shell; functional validation uses the
`wasm32-unknown-unknown` target and a WebGPU-capable browser.
