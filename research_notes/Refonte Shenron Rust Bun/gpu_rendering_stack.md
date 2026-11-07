# 2026 Rust GPU Rendering and Layout Stack for UI (state as of 2026-11-04)

Snapshot of repo metadata gathered with authenticated `gh api` on 2026-11-04:

| Repo | Stars | License | Latest release (date) | crates.io version (updated) |
|---|---|---|---|---|
| gfx-rs/wgpu | 18,463 | Apache-2.0 (dual MIT in-tree) | v30.0.1 (2026-08-22); v30.0.0 (2026-07-01) | wgpu 30.0.1 (2026-08-22), 47.2M downloads |
| linebender/vello | 4,465 | Apache-2.0 OR MIT | v0.11.0 (2026-10-02); sparse-strips-v0.3.0 (2026-10-02); glifo-v0.4.0 (2026-10-02) | vello 0.11.0; vello_cpu 0.3.0 (2026-10-02), 9.9M downloads |
| linebender/parley | 775 | Apache-2.0 OR MIT | v0.12.0 (2026-10-09) | parley 0.12.0, 5.3M downloads |
| rust-skia/rust-skia | 1,836 | MIT | 0.157.0 (2026-11-03) | skia-safe 0.157.0 (2026-11-03), 5.0M downloads |
| DioxusLabs/taffy | 3,732 | MIT (Apache dual) | v0.15.1 (2026-10-25); v0.15.0 (2026-10-17) | taffy 0.15.1, 18.7M downloads |
| DioxusLabs/anyrender | 118 | Apache-2.0 OR MIT | v0.13.0 (2026-08-16) | anyrender 0.14.0 (2026-10-03), 260k downloads |
| DioxusLabs/blitz | 4,341 | Apache-2.0 OR MIT (+MPL for stylo_taffy) | — | — |
| zed-industries/zed (crates/gpui) | 92,694 | gpui crate Apache-2.0; Zed app GPL-3.0 | Zed v1.27.0 (2026-11-04) | gpui 0.2.2 (published 2025-10-22) |
| emilk/egui | 31,997 | Apache-2.0 OR MIT | 0.37.0 (2026-10-15) | egui 0.37.0, 29.9M downloads |
| AccessKit/accesskit | 1,552 | BSD-3-Clause (+Apache/MIT files) | accesskit_winit v0.34.2, accesskit_windows v0.35.2, accesskit_unix v0.24.1, accesskit_macos v0.27.2 (2026-10-25) | accesskit 0.25.2 (2026-10-25), 33.1M downloads |
| linebender/xilem | 5,591 | Apache-2.0 | v0.4.0 (2025-10-29) | workspace version 0.4.0 |
| Aiving/material-colors | 47 | Apache-2.0 (README: MIT OR Apache-2.0) | — | material-colors 0.5.0 (2026-10-01), 163k downloads |

Source for all rows: `gh api repos/<owner>/<repo>` and `gh api repos/<owner>/<repo>/releases`, plus `https://crates.io/api/v1/crates/<name>` on 2026-11-04. Repo URLs: [wgpu](https://github.com/gfx-rs/wgpu), [vello](https://github.com/linebender/vello), [parley](https://github.com/linebender/parley), [rust-skia](https://github.com/rust-skia/rust-skia), [taffy](https://github.com/DioxusLabs/taffy), [anyrender](https://github.com/DioxusLabs/anyrender), [blitz](https://github.com/DioxusLabs/blitz), [zed](https://github.com/zed-industries/zed), [egui](https://github.com/emilk/egui), [accesskit](https://github.com/AccessKit/accesskit), [xilem](https://github.com/linebender/xilem), [material-colors](https://github.com/Aiving/material-colors).

---

## Q1. wgpu 30: WebGPU/WebGL2 story and minimal wasm bundle weight

### Takeaway
wgpu 30.0.x (July/Aug 2026) runs natively on Vulkan/Metal/D3D12/GL and on wasm via the browser WebGPU API (feature `webgpu`) or a WebGL2 translation layer (feature `webgl`). WebGPU-in-browser is the first-class web path; WebGL2 is a size-heavy fallback (roughly 3 MB extra wasm per Vello's own measurement), and no authoritative current minimal-bundle number exists.

### Cited Findings
- "`wgpu` is a cross-platform, safe, pure-Rust graphics API. It runs natively on Vulkan, Metal, D3D12, and OpenGL; and on top of WebGL2 and WebGPU on wasm." It "serves as the core of the WebGPU integration in Firefox, Servo, and Deno." — [wgpu README](https://github.com/gfx-rs/wgpu/blob/trunk/README.md)
- Backend support matrix in the README lists the WebGPU backend as fully supported on Web (wasm) and OpenGL as "OK (WebGL2)" on Web (wasm). — [wgpu README](https://github.com/gfx-rs/wgpu/blob/trunk/README.md)
- MSRV: "If you're using `wgpu`, our MSRV is 1.87"; `wgpu-core` MSRV is tied to Firefox's nightly MSRV, `wgpu` MSRV tied to Servo's. — [wgpu README](https://github.com/gfx-rs/wgpu/blob/trunk/README.md)
- Cargo features in `wgpu/Cargo.toml`: `dx12`, `metal`, `vulkan`, `gles`, `webgpu`, `webgl = ["web", "wgpu-core/webgl", "dep:wgpu-hal", "dep:smallvec"]`, `wgsl`. The `webgl` path pulls in `wgpu-core`/`wgpu-hal` (full native stack compiled to wasm), while `webgpu` binds to the browser API via web-sys. — [wgpu/Cargo.toml](https://github.com/gfx-rs/wgpu/blob/trunk/wgpu/Cargo.toml)
- v30.0.0 (2026-07-01) breaking changes: `VertexState::buffers` is now `&[Option<VertexBufferLayout>]`; integer shader I/O must explicitly declare `@interpolate(flat)`; empty buffer slices permitted; new `SurfaceConfiguration::color_space` field (HDR/wide-gamut output; `SurfaceColorSpace::Auto` default) with per-backend table showing WebGPU supports `Srgb`, `ExtendedSrgb`, `DisplayP3`, `ExtendedDisplayP3` but not scRGB/PQ/HLG; new `naga-types` crate; `InstanceFlags::STRICT_WEBGPU_COMPLIANCE`; `Surface::display_hdr_info` populated "on DX12 and Vulkan on Windows, Metal on macOS, and the web". — [wgpu CHANGELOG v30.0.0](https://github.com/gfx-rs/wgpu/blob/trunk/CHANGELOG.md)
- v30.0.1 (2026-08-21) WebGPU fix: "Upgrade vendored WebGPU bindings and `wasm-bindgen` to 0.2.127. This fixes a panic ... when using the WebGPU backend and `requestAdapter()` fails." Also GLES: `Adapter::new_external()` for WebGL2 to import an external WebGL2 context (v30.0.0). — [wgpu CHANGELOG](https://github.com/gfx-rs/wgpu/blob/trunk/CHANGELOG.md)
- Bundle size (anecdotal, old wgpu): one user reported a WebGL build at ~1.6 MB uncompressed (571 KB gzip) vs a WebGPU build at ~708 KB uncompressed (222 KB compressed); maintainers had not measured. — [wgpu issue #1464](https://github.com/gfx-rs/wgpu/issues/1464)
- Vello's own motivation for a native WebGL renderer bypassing wgpu: "The primary motivation of using a custom webgl renderer is binary size, allowing 3mb to be removed when targeting WebGL2 natively." — [vello_hybrid PR #1011 mirror](https://skia.googlesource.com/external/github.com/linebender/vello/+/refs/heads/ajakubowicz-fix-wgsl-source%5E)
- anyrender 0.14 release line pins wgpu 30; anyrender 0.10–0.13 pinned wgpu 29. — [anyrender README compatibility table](https://github.com/DioxusLabs/anyrender/blob/main/README.md)
- Xilem/Masonry workspace is still on `wgpu = "28.0.0"` (lagging). — [xilem Cargo.toml](https://github.com/linebender/xilem/blob/main/Cargo.toml)

### Inferences
- For a browser target, compile wgpu with `webgpu` only (no `webgl`) to avoid shipping wgpu-core/wgpu-hal/naga in wasm; the WebGL2 fallback is where the multi-MB cost comes from. Vello GPU's independent WebGL2 backend exists precisely to sidestep that.
- Expect ~200–600 KB compressed for a wgpu-WebGPU-only wasm core based on the only published datapoints, but this must be re-measured on wgpu 30 with `wasm-opt -Oz` + brotli.
- Ecosystem churn: wgpu major-bumps about every 2–3 months (v29 May 2026, v30 July 2026); pick crates on the same wgpu line (anyrender 0.14 / vello_gpu 0.3 / wgpu 30).

### Gaps
- No authoritative measured wasm size for a minimal wgpu 30 WebGPU-only or WebGL2 bundle was found; the only figures are a 2021-era issue and Vello's "3 MB" statement.
- Did not verify whether wgpu 31 has shipped (releases API shows v30.0.1 as latest on 2026-11-04).

---

## Q2. WebGPU in browsers, November 2026 (Chrome/Firefox/Safari) and WebGL2 fallback

### Takeaway
WebGPU is shipped in Chrome/Edge (113+, Android 121+), Safari 26+ (macOS/iOS/iPadOS/visionOS; caniuse marks macOS "partial"), and Firefox on Windows (141, July 2025) and Apple Silicon macOS (147, Jan 2026); Firefox Linux remains Nightly-only per the sources found, and Firefox Android is disabled by default. Caniuse reports ~87.8% global usage (85.8% full + 2.0% partial) as of September 2026, so a WebGL2 fallback is still required for Firefox-on-Linux and legacy Safari.

### Cited Findings
- caniuse WebGPU table (fetched 2026-11-04): Chrome supported 113–159; Edge 113–155; Opera 99–135; Safari macOS "partial" 26.0–26.6, 27, 27.1 TP, "disabled by default" 17.4–18.7; Safari iOS supported 26.0–27.2 (disabled by default 17.4–18.7); Chrome Android 156 supported; Samsung Internet 24–30 supported; Firefox desktop "disabled by default" 63–162 with no version marked fully supported; Firefox Android 159 disabled by default. Global usage: 87.82% (85.8% full + 2.02% partial), Sept 2026 data. — [caniuse.com/webgpu](https://caniuse.com/webgpu)
- Firefox 147 release notes (2026-01-13): "WebGPU support is now enabled for devices with Apple Silicon processors on all supported macOS versions." — [Firefox 147 release notes](https://www.firefox.com/firefox/147.0/releasenotes/); coverage at [Neowin](https://www.neowin.net/amp/firefox-147-is-out-with-video-playback-improvements-better-picture-in-picture-and-more/) and [Linuxiac](https://linuxiac.com/firefox-147-now-available-for-download/)
- Firefox 141 (July 2025) shipped WebGPU on Windows only, with Mac/Linux "in the coming months". — [Simon Willison, 2025-07-16](https://simonwillison.net/2025/Jul/16/webgpu-firefox)
- gpuweb Implementation Status wiki: WebGPU "enabled by default in Nightly Firefox builds on Linux and Mac, but not on Android"; Mozilla "expects to ship on Mac and Linux in the coming months, with Android coming later" (wiki snapshot of uncertain date). — [gpuweb wiki Implementation-Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status/745e8c516411d62a3b56f2c46bb62f856b15b7be)
- Current Firefox stable is 159.0.1, "first offered to Release channel users on November 3, 2026"; its notes do not mention WebGPU (only a Linux WebGL color-swap fix). — [Firefox release notes](https://www.firefox.com/en-US/firefox/releasenotes/)
- MDN GPU interface page: status "Limited availability", not Baseline, secure context (HTTPS) only, available in Web Workers. — [MDN: GPU](https://developer.mozilla.org/en-US/docs/Web/API/GPU)
- Secondary 2026 guides agree WebGPU is in all three engines and that "WebGL 2 remains the safe fallback"; details on Firefox platform coverage conflict between them. — [webo360solutions](https://webo360solutions.com/blog/webgpu-browser-support), [cinevva](https://app.cinevva.com/guides/webgpu-vs-webgl-games), [svilenkovic](https://svilenkovic.com/3d/webgpu-adoption-2026)
- Conflict: caniuse lists Firefox desktop as "disabled by default" through v162, whereas Mozilla's own notes say WebGPU is enabled on Windows (141+) and Apple Silicon macOS (147+). caniuse appears to treat partial-platform shipping as not-supported. — [caniuse](https://caniuse.com/webgpu) vs [Firefox 147 notes](https://www.firefox.com/firefox/147.0/releasenotes/)

### Inferences
- A manga reader targeting the general public in Nov 2026 can make WebGPU the default path and must keep a WebGL2 fallback (Firefox Linux, Firefox Android, Safari < 26, Intel-Gen<12 Linux Chrome). Roughly 10–12% of global users still lack WebGPU.
- Vello GPU's native WebGL2 backend (no wgpu) is the lowest-cost fallback for 2D; using wgpu's `webgl` feature costs multiple MB of wasm.

### Gaps
- Could not confirm from a primary Mozilla source whether Firefox has enabled WebGPU by default on Linux in any stable release up to 159 (Nov 2026); evidence found says Nightly only.
- MDN compatibility table could not be extracted via fetch (rendered client-side).

---

## Q3. Vello 0.11 and the Sparse Strips renderers (vello_cpu / vello_gpu): capabilities, compute requirement, WebGL, text, images, filters, CPU fallback

### Takeaway
As of Oct 2026 the Linebender repo was restructured: the compute-shader `vello` crate (0.11.0, 2026-10-02, requires compute-capable GPU) is now "experimental"/research, while the recommended renderers are the Sparse Strips family: `vello_cpu` 0.3 (SIMD + multithreaded CPU, most mature) and `vello_gpu` 0.3 (formerly `vello_hybrid`; CPU preprocessing + GPU raster via wgpu or a native WebGL2 backend, no compute shaders required). Text goes through `glifo` 0.4 (+ Parley for layout); images, gradients (incl. sweep), blend modes, clipping, blurred rounded rects and Gaussian blur filters are supported; complex filter graphs are not yet supported on CPU.

### Cited Findings
- README: "`vello_cpu` is a CPU-only renderer optimized for multithreading and SIMD. It is the most mature choice when predictable CPU rendering, software fallback ... are required." "`vello_gpu` is a renderer that preprocesses paths on the CPU and uses the GPU for rasterization and compositing. It supports a native WebGL2 backend and a wgpu backend without requiring compute shaders." "CPU is currently overall more mature." The `vello` crate "performs most rendering work in GPU compute shaders and remains an experimental implementation for compute-capable GPUs." — [vello README](https://github.com/linebender/vello/blob/main/README.md)
- ARCHITECTURE.md: Sparse Strips "wgpu and WebGL2 backends use vertex and fragment rendering rather than requiring compute shaders"; the compute renderer "requires compute shader support and has different compatibility and memory trade-offs" and "remains under `research/`". CPU kernels in research "do not provide a complete standalone CPU renderer. Use `vello_cpu` for that." — [vello ARCHITECTURE.md](https://github.com/linebender/vello/blob/main/ARCHITECTURE.md)
- vello 0.11.0 (2026-10-02): MSRV 1.89; "Updated `wgpu` and `naga` to v30"; re-exports `vello_encoding` from `low_level`; fixes sbix (bitmap emoji) glyph placement. Coincides with vello_shaders 0.11.0 and vello_encoding 0.11.0. — [vello v0.11.0 release](https://github.com/linebender/vello/releases/tag/v0.11.0)
- vello_gpu 0.3.0 (2026-10-02): "Vello Hybrid has been renamed into Vello GPU"; wgpu v30; non-blocking WebGL init (`WebGlRenderer::begin`); `Scene::push_clip_rect`; `ImageSampler::alpha`; external textures via `Scene::set_paint` (incl. YCbCr video via `wgpu::ExternalTexture`); optional depth buffer; `u16` render sizes/atlases; WebGL requests `failIfMajorPerformanceCaveat`; fixes for Safari 15 probe crashes, Intel WebGL hangs, Apple Silicon/Chrome layer bugs; shader minification to reduce embedded size. Unreleased: anisotropic Gaussian blur (`FilterPrimitive::GaussianBlur`), `fill_blurred_rounded_rect_in` with `invert` for inset box shadows, WebGL shader precompile before wasm instantiation. — [vello_gpu CHANGELOG](https://github.com/linebender/vello/blob/main/vello_gpu/CHANGELOG.md)
- vello_gpu feature flags: `wgpu`, `wgpu_default`, `text` (glyph rendering via `Scene::glyph_run`), `blurred_rounded_rect`, `full_image_support` (uploaded images, glyph atlas caching, bicubic sampling, cropped external textures, tints), `gradient_sweep`, `wgpu_external_texture`, `webgl` ("WebGL rendering backend for browser support, using GLSL shaders"). — [vello_gpu README](https://github.com/linebender/vello/blob/main/vello_gpu/README.md)
- vello_cpu 0.3.0 (2026-10-02): features `png`, `multithreading`, `text`; "optimized SIMD implementations for all major architectures" incl. "WASM SIMD"; limitation: "Complex filter graphs are currently not supported at all and will panic. In multi-threaded mode, even simple filters are currently unsupported." — [vello_cpu README](https://github.com/linebender/vello/blob/main/vello_cpu/README.md), [vello_cpu CHANGELOG](https://github.com/linebender/vello/blob/main/vello_cpu/CHANGELOG.md)
- Text/glyph support shared via `glifo` crate (glifo-v0.4.0, 2026-10-02). — [vello releases](https://github.com/linebender/vello/releases)
- Hinting in vello_common/glifo: "performs vertical hinting only ... applies only if the combined transform and glyph_transform have a uniform scale and no vertical skew or rotation." — [vello_common glyph.rs](https://docs.rs/crate/vello_common/0.0.7/source/src/glyph.rs)
- Xilem/Masonry expose `imaging_vello`, `imaging_vello_hybrid`, `imaging_vello_cpu` backends (0.0.1) on wgpu 28. — [xilem Cargo.toml](https://github.com/linebender/xilem/blob/main/Cargo.toml), [masonry Cargo.toml](https://github.com/linebender/xilem/blob/main/masonry/Cargo.toml)
- Dioxus Native defaults to the `vello-hybrid` feature (vello_gpu via anyrender). — [dioxus packages/native/Cargo.toml](https://github.com/DioxusLabs/dioxus/blob/main/packages/native/Cargo.toml)

### Inferences
- For a browser manga reader, `vello_gpu` with `wgpu`+`webgpu` for the main path and the native `webgl` feature as fallback is the intended Linebender configuration in late 2026; the compute `vello` crate is not advisable for shipping to browsers (WebGPU-only, experimental status).
- `vello_cpu` provides a true software fallback (also usable on wasm with SIMD) and headless/server-side rendering (e.g., thumbnails, OG images).
- Blur/shadow/inset-shadow primitives are now first-class in both Sparse Strips renderers (pending next release after 0.3.0), covering design-system needs without custom SDF shaders.

### Gaps
- No published performance benchmarks comparing vello_gpu vs Skia for UI workloads were found.
- Exact wasm size of vello_gpu(webgl) + glifo + parley not found.

---

## Q4. Skia via rust-skia: wasm + WebGPU viability in 2026, build time, binary size, GPU backends, licensing

### Takeaway
rust-skia (skia-safe 0.157.0, Skia m157, MIT) is excellent natively (Ganesh and Graphite; Vulkan/Metal/GL/D3D12) with prebuilt binaries, but on the web it supports only `wasm32-unknown-emscripten` (WebGL via Emscripten; `wasm32-unknown-unknown` is "unsupported"), has no WebGPU/Dawn path in a release, and Skia upstream itself does not test its Graphite/Dawn WebGPU path in wasm. A `wgpu`-backed Graphite Dawn shim is an open PR (#1367, 2026-11-04) targeting native wgpu 30, not browsers.

### Cited Findings
- rust-skia "provides up to date safe bindings ... including GPU rendering backends for Vulkan, Metal, OpenGL, and Direct3D." Tracks Skia `chrome/m157`. — [rust-skia README](https://github.com/rust-skia/rust-skia/blob/master/README.md)
- "Because building Skia takes a lot of time and needs tools that may be missing, the skia-bindings crate's `build.rs` attempts to download prebuilt binaries ... using the `curl` command line tool." Prebuilt targets include Linux x86_64/aarch64, Windows, macOS, Android, iOS, and WebAssembly `wasm32-unknown-emscripten`. Source builds require LLVM, Python 3, Ninja; `FORCE_SKIA_BUILD=1` forces source build. — [rust-skia README](https://github.com/rust-skia/rust-skia/blob/master/README.md)
- Wasm: requires "emscripten version 5.0 or newer" (emsdk 4.x not supported); "Build with the `wasm32-unknown-emscripten` target (`wasm32-unknown-unknown` is unsupported because it is fundamentally incompatible with linking C code)"; WebGL requires `EMCC_CFLAGS="-s ERROR_ON_UNDEFINED_SYMBOLS=0 -s MAX_WEBGL_VERSION=2"` and `--features gl`. — [rust-skia README](https://github.com/rust-skia/rust-skia/blob/master/README.md)
- skia-safe features: `ganesh`, `graphite`, `gl`, `egl`, `x11`, `wayland`, `vulkan`, `metal`, `d3d`, `textlayout`, `svg`, `skottie`, `pdf`, `webp`, `embed-freetype`, `binary-cache`; `all-windows` = ganesh, gl, vulkan, d3d, textlayout, svg, skottie, webp, graphite. No `webgpu`/`dawn` feature in 0.157.0. — [skia-safe Cargo.toml](https://github.com/rust-skia/rust-skia/blob/master/skia-safe/Cargo.toml)
- Open PR #1367 "Run Skia's Graphite Dawn backend on wgpu" (created 2026-11-04): "Skia cannot run inside a `wgpu` application and share its device, queue, and textures. Graphite has native backends only for Metal and Vulkan, so `wgpu` applications on Direct3D 12 or OpenGL ES cannot use Skia's GPU rendering at all." Proposes `skia-wgpu` crate on wgpu 30 shimming Dawn's WebGPU calls to wgpu; open points: "naga is not yet verified to accept the WGSL that Skia's SkSL compiler emits". Marked "created with AI assistance". — [rust-skia #1367](https://github.com/rust-skia/rust-skia/issues/1367)
- Skia upstream: a June 2026 skia-discuss post says the Graphite/Dawn WebGPU path for wasm "is somewhat a dead code and there is no official support for it yet" and Skia "doesn't currently test the WebGPU/Graphite backend in tests or even compilation for it"; CanvasKit "currently uses Ganesh, not Graphite, for WASM". — [skia-discuss: Graphite & emdawnwebgpu](https://groups.google.com/g/skia-discuss/c/5_6hbA_an9A), [skia-discuss: prebuilt canvaskit for webgpu](https://groups.google.com/g/skia-discuss/c/V9ecYV47-t0)
- CanvasKit (Skia's own wasm build) size: largest file in canvaskit-wasm 0.40.0 is ~24.9 MB uncompressed (unpacked package 25.3 MB); Flutter's trimmed CanvasKit downloads are 1.54 MB (Chromium variant) / 2.26 MB (full) brotli-compressed per a 2026 comparison. — [unpkg canvaskit-wasm 0.40.0](https://app.unpkg.com/canvaskit-wasm@0.40.0), [startdebugging.net 2026](https://startdebugging.net/2026/09/canvaskit-vs-skwasm-for-flutter-web-in-2026/)
- anyrender ships an `anyrender_skia` backend via skia-safe. — [anyrender README](https://github.com/DioxusLabs/anyrender/blob/main/README.md)
- rust-skia release cadence: 0.153.x (Sept 2026), 0.156.0 (2026-10-26), 0.157.0 (2026-11-03); cross-compile regression issue #1337 open. — [rust-skia releases](https://github.com/rust-skia/rust-skia/releases), [rust-skia #1337](https://github.com/rust-skia/rust-skia/issues/1337)

### Inferences
- Skia on the web from Rust is viable only via Emscripten + WebGL2 and a large binary (CanvasKit-class, multi-MB even compressed); it is not viable with WebGPU/wgpu in the browser in 2026. Treat rust-skia as native-only for this project.
- Native: build pain is mitigated by prebuilt binaries, but CI must have `curl`, and any non-standard feature combo or glibc mismatch triggers a full Skia source build (LLVM + Python + Ninja; tens of minutes). Windows requires LLVM installed at a known path.
- Licensing is clean (MIT bindings, BSD-3 Skia).

### Gaps
- No measured rust-skia build time or native binary size figures were found in primary sources.
- No measured wasm size for a rust-skia Emscripten build (CanvasKit numbers used as proxy).

---

## Q5. Parley 0.12 text layout: CJK/Japanese, bidi, emoji, vertical text, ruby

### Takeaway
Parley 0.12.0 (2026-10-09; MSRV 1.88) is a CSS-faithful rich-text layout engine (Fontique fallback + HarfRust shaping + Skrifa + ICU4X), now with CSS `line-break` (CJK), whitespace collapse, vertical-align, grapheme-cluster cursors, and a lower-level `parley_engine`. CJK line breaking requires the non-default `complex-scripts` feature; vertical writing and ruby annotations are not implemented.

### Cited Findings
- Stack: Fontique (enumeration + fallback), HarfRust (HarfBuzz port, shaping incl. ligatures and emoji modifiers), Skrifa (OpenType parsing, hinted outlines), ICU4X (bidi, segmentation, emoji recognition, normalisation). Parley does layout, selection and editing utilities. — [parley README](https://github.com/linebender/parley/blob/main/README.md)
- 0.12.0 highlights: `parley_engine` crate ("analyzes paragraphs of text, resolving details like line break opportunities, grapheme boundaries, bidirectional text embedding levels, and emoji presentation"); CSS Text 4 whitespace hanging and `white-space-collapse`; CSS line box model and `vertical-align`; `Cluster` spans extended grapheme clusters; "Support for the CSS `line-break` style. This controls line-breaking behaviour of CJK text."; `set_base_direction` for paragraphs; accessibility hooks (`Cursor::upstream_cluster`, `PlainEditorDriver::set_selection`, public `Style::locale`) "make it possible to build an accessibility integration outside of Parley." — [parley CHANGELOG 0.12.0](https://github.com/linebender/parley/blob/main/CHANGELOG.md)
- Issue #773 (closed 2026-10-19): with default features "parley's line segmentation has no dictionary model for Chinese/Japanese ... `ICU4X data error: No segmentation model for complex script: Chinese/Japanese`"; fix is `parley = { features = ["complex-scripts"] }`. — [parley #773](https://github.com/linebender/parley/issues/773)
- Open issues: #634 "Implement `parley_core` (analysis, shaping, reshaping breaks, vertical text, inline objects)"; #255 "Find some reasonable way to render interlinear/inline annotations (a.k.a. ruby)"; #301 "East Asian line breaking rules"; #930 "Reshape after line breaking"; #337 "On Android, no font is selected for Japanese kana"; #928 fontique fallback for tracked non-default locale (ja) ignores script default. — [parley issues](https://github.com/linebender/parley/issues)
- Xilem pins `parley 0.8.0` with `accesskit` feature (Masonry lags Parley by 4 minors). — [xilem Cargo.toml](https://github.com/linebender/xilem/blob/main/Cargo.toml)
- Dioxus Native exposes `complex-scripts` and `text-transform-icu` features via blitz-dom. — [dioxus native Cargo.toml](https://github.com/DioxusLabs/dioxus/blob/main/packages/native/Cargo.toml)
- egui 0.37 uses `fontique` for system font discovery (`egui_system_font_provider`) and can "render any glyph that is supported on your system, including colored emojis and non-Latin scripts". — [egui CHANGELOG 0.37.0](https://github.com/emilk/egui/blob/main/CHANGELOG.md)

### Inferences
- For a Japanese translation editor: enable `complex-scripts`, set `line-break`/`locale: ja`, bundle a Japanese font (Fontique fallback on Android/Linux is unreliable for kana), and expect horizontal layout only. Vertical Japanese (tategaki) and furigana/ruby would need a custom layer on `parley_engine` or a separate renderer path; this is a real gap for manga typesetting.
- Bidi and emoji presentation are handled (ICU4X + HarfRust); color emoji (COLRv1, sbix) rendering is via glifo/vello.

### Gaps
- No benchmark data for Parley shaping/layout throughput on large CJK documents.
- No source found confirming a timeline for vertical text support.

---

## Q6. Taffy 0.15: API shape, grid support, performance, adopters

### Takeaway
Taffy 0.15.1 (2026-10-25; MSRV 1.71) implements CSS Block, Flexbox and Grid with CSS-correct `position: static/relative/absolute/fixed` hoisting, `normal` alignment, floats, calc(), and strong performance (Grid +60%, Flexbox +15–35% across 0.15.0/0.15.1; beats Yoga by 7–100x on deep auto-sized trees). It is the layout engine of Servo, Blitz/Dioxus Native, Bevy UI, Floem/Lapce and GPUI/Zed.

### Cited Findings
- "Taffy is a flexible, high-performance, cross-platform UI layout library written in Rust. It currently implements the CSS Block, Flexbox and CSS Grid layout algorithms." Users listed: Servo, Blitz, Bevy, Lapce via Floem, Zed via GPUI. WIP C and WASM bindings. — [taffy README](https://github.com/DioxusLabs/taffy/blob/main/README.md)
- Benchmarks vs Yoga 3.2.1 (layout only): "big trees (deep, auto size)" 100,000 nodes: Yoga 2.3502 s vs Taffy 164.24 ms; "super deep" 300 nodes depth 100: Yoga did not finish (>9 min) vs Taffy 366.89 µs; "yoga huge nested" 10,000 nodes: Yoga 3.29 ms vs Taffy 2.69 ms; wide trees roughly parity (10k nodes: 4.87 vs 4.80 ms). — [taffy README benchmarks](https://github.com/DioxusLabs/taffy/blob/main/README.md)
- 0.15.0 (2026-10-17): `Position::Static` is now default; `Position::Fixed` added (and `Sticky` placeholder, laid out as static); absolute/fixed boxes hoisted to containing block via `compute_oof_layout`; `align-self`/`justify-self` on abspos; `normal` alignment keyword (alignment fields no longer `Option`); `fit-content(calc())`; `transpose()` helpers for vertical writing modes; no-alloc mode removed; "Grid layout is now ~60% faster, and Flexbox layout ~15% faster." Many BREAKING trait changes for custom trees (`LayoutContainingBlock`, `RoundTree::is_out_of_flow`, etc.). — [taffy CHANGELOG](https://github.com/DioxusLabs/taffy/blob/main/CHANGELOG.md)
- 0.15.1 (2026-10-25): "Flexbox layout is ~15-20% faster for deep trees"; many block/float/grid fixes. Unreleased: `ScrollableOverflow` type, float context API changes. — [taffy CHANGELOG](https://github.com/DioxusLabs/taffy/blob/main/CHANGELOG.md)
- Bevy UI depends on `taffy = { version = "0.15", default-features = false, ... }`. — [bevy_ui Cargo.toml](https://github.com/bevyengine/bevy/blob/main/crates/bevy_ui/Cargo.toml)
- Servo depends on `taffy = { version = "0.15.1", default-features = false, features = ["calc", "grid", "std"] }`. — [servo Cargo.toml](https://github.com/servo/servo/blob/main/Cargo.toml)
- GPUI wraps `TaffyTree<NodeContext>` in `crates/gpui/src/taffy.rs`, calls `compute_layout_with_measure` and `taffy::compute_leaf_layout`, and has a `grid_layout` example and `GridTemplate` type. GPUI Cargo enables taffy features including `taffy_tree`. — [gpui taffy.rs](https://github.com/zed-industries/zed/blob/main/crates/gpui/src/taffy.rs), [gpui Cargo.toml](https://github.com/zed-industries/zed/blob/main/crates/gpui/Cargo.toml)
- Blitz uses Stylo (CSS), Taffy (box layout), Parley (text) and exposes `stylo_taffy` triple-licensed (Apache/MIT/MPL) for Servo interop. — [blitz README](https://github.com/DioxusLabs/blitz/blob/main/README.md)

### Inferences
- API shape: a `TaffyTree` arena (NodeId, `Style` struct with CSS-named fields, `compute_layout_with_measure` for text/leaf measurement) plus low-level traits (`LayoutPartialTree`, `CacheTree`, `LayoutContainingBlock`) for embedding in your own DOM. 0.15 is a breaking release for custom trees; GPUI/Bevy/Servo are already on it.
- Suitable for the design-system layout of both the web reader shell (if canvas-drawn) and the desktop editor; grid is production-grade (used by Servo).

### Gaps
- Benchmarks in README are against commit `e747f6e`, not explicitly 0.15.1; no separate 0.15-specific absolute numbers besides the relative speedups.

---

## Q7. anyrender: abstraction over vello / vello_cpu / vello_gpu / skia

### Takeaway
anyrender (DioxusLabs, Apache/MIT, 0.14.0 on crates.io 2026-10-03) is a trait-only 2D drawing abstraction (`PaintScene`, `WindowRenderer`, `ImageRenderer`) with backends `anyrender_vello` (compute vello 0.11), `anyrender_vello_hybrid` (vello_gpu 0.3), `anyrender_vello_cpu` (vello_cpu 0.3) and `anyrender_skia` (skia-safe), plus `anyrender_svg` and `blitz-paint`; the 0.14 line pins wgpu 30.

### Cited Findings
- "AnyRender is a 2D drawing abstraction that allows applications/frameworks to support many rendering backends through a unified API." Core crate defines `PaintScene` ("accepts drawing commands"), `WindowRenderer`, `ImageRenderer` ("render to a `Vec<u8>` image buffer"). — [anyrender README](https://github.com/DioxusLabs/anyrender/blob/main/README.md)
- Backends: `anyrender_vello_hybrid` (vello_gpu, "formerly vello_hybrid"), `anyrender_vello_cpu`, `anyrender_vello`, `anyrender_skia` (skia-safe). "Contributions for other backends (tiny-skia, femtovg, etc) would be very welcome." Content renderers: `anyrender_svg` (usvg), `blitz-paint` (HTML/CSS/markdown), `polymorpher` (Material Design 3 shape morphing). Utilities: `wgpu_context`, `pixels_window_renderer`, `softbuffer_window_renderer`. — [anyrender README](https://github.com/DioxusLabs/anyrender/blob/main/README.md)
- Compatibility table: anyrender 0.14 = kurbo 0.13, peniko 0.6, wgpu 30, wgpu_context 0.10, anyrender_vello 0.15 / vello 0.11, vello_gpu 0.3 / anyrender_vello_hybrid 0.11, vello_cpu 0.3 / anyrender_vello_cpu 0.18. "Use the same release line across all AnyRender crates in your project." — [anyrender README](https://github.com/DioxusLabs/anyrender/blob/main/README.md)
- Repo stars 118; GitHub release tags lag crates.io (latest tag v0.13.0 2026-08-16 vs crate 0.14.0 2026-10-03). — gh api on 2026-11-04 ([anyrender releases](https://github.com/DioxusLabs/anyrender/releases))
- Dioxus Native ("Native renderer for Dioxus based on blitz") defaults to `vello-hybrid`. — [dioxus native Cargo.toml](https://github.com/DioxusLabs/dioxus/blob/main/packages/native/Cargo.toml)

### Inferences
- anyrender lets the same scene code target vello_gpu (web/native GPU), vello_cpu (headless/fallback) and Skia (native, if ever needed) without rewriting draw calls; it is the pragmatic abstraction layer for Dioxus 0.8 native (Blitz) apps.
- Small community (118 stars) but maintained by the Dioxus/Blitz team and co-released with Blitz.

### Gaps
- No performance overhead measurements of the abstraction were found.

---

## Q8. GPUI (Zed): standalone usability, platform support, web, Taffy, SDF rendering, license, AccessKit

### Takeaway
GPUI is Apache-2.0, uses Taffy for layout and SDF-based quad/shadow shaders, integrates AccessKit, and in Zed main (Nov 2026) is split into `gpui` + `gpui_platform` (macOS Metal, Windows Win32/DirectWrite, Linux wayland/x11 via `gpui_wgpu`) + `gpui_web` (one canvas, WebGPU preferred with automatic WebGL2 fallback). However crates.io has only `gpui 0.2.2` (published 2025-10-22, Blade-era), and `gpui_platform`/`gpui_web` are not on crates.io, so standalone use requires a git dependency; the official site says "For the near future, GPUI is tied to Zed".

### Cited Findings
- "GPUI is a hybrid immediate and retained mode, GPU accelerated, UI framework for Rust ... still pre-1.0. There will often be breaking changes between versions." Install: `gpui = { version = "*" }`, `gpui_platform = { version = "*", features = ["font-kit", "wayland", "x11"] }`; macOS "Rendering uses Metal"; Linux/FreeBSD "enable at least one windowing backend ... `wayland`, `x11`"; Windows "no features are required. Windowing uses Win32 and text uses DirectWrite." — [gpui README (Zed main)](https://github.com/zed-industries/zed/blob/main/crates/gpui/README.md)
- gpui.rs: "A fast, hybrid immediate and retained mode, GPU-accelerated UI framework for Rust", "For the near future, GPUI is tied to Zed, so contributions will need to be made there and kept in sync with it." No platform/license/wasm statements. — [gpui.rs](https://www.gpui.rs/)
- crates.io: `gpui` max version 0.2.2 (created 2025-10-22, Apache-2.0); `gpui_macros` 0.2.2; `gpui_platform` and `gpui_web` NOT on crates.io (checked 2026-11-04). — [crates.io gpui](https://crates.io/crates/gpui)
- Zed main `crates/gpui/Cargo.toml`: `version = "0.2.2"`, `license = "Apache-2.0"`, `publish = true`, default features `font-kit, wayland, x11, windows-manifest`, depends on `taffy` (features incl. `taffy_tree`) and `accesskit`. Zed repo has `LICENSE-APACHE` and `LICENSE-GPL` (GPL-3.0); `crates/gpui` contains only `LICENSE-APACHE`. — [gpui Cargo.toml](https://github.com/zed-industries/zed/blob/main/crates/gpui/Cargo.toml), [zed LICENSE-GPL](https://github.com/zed-industries/zed/blob/main/LICENSE-GPL)
- Zed main crate split: `gpui, gpui_apple, gpui_ios, gpui_linux, gpui_macos, gpui_macros, gpui_platform, gpui_shared_string, gpui_tokio, gpui_util, gpui_web, gpui_wgpu, gpui_windows`. `gpui_wgpu` 0.1.0 depends on wgpu with features `["std","metal","gles","vulkan","wgsl","webgpu"]` natively and `["webgl"]` on wasm, with `cosmic_text_system.rs`, `shaders.wgsl`, `shaders_subpixel.wgsl`, `shaders_webgl.wgsl`. — [zed crates listing](https://github.com/zed-industries/zed/tree/main/crates), [gpui_wgpu Cargo.toml](https://github.com/zed-industries/zed/blob/main/crates/gpui_wgpu/Cargo.toml)
- `gpui_web` 0.1.0 doc: "GPUI's browser platform uses one document-owned canvas and supports one top-level window. Browser WebGPU is preferred by default, with an automatic WebGL2 fallback. Applications can force either backend with `WebBackendPreference`. Opening a second top-level window ... returns `WebWindowError`." Depends on `gpui_wgpu`, `wasm-bindgen`, `wasm_thread` (multithreaded feature). — [gpui_web.rs](https://github.com/zed-industries/zed/blob/main/crates/gpui_web/src/gpui_web.rs)
- SDF rendering in `gpui_wgpu/src/shaders.wgsl`: `quad_sdf(point, bounds, corner_radii)` ("Signed distance of the point to the quad's border"), `quad_sdf_impl` with "Fast path for unrounded corners", `gaussian(x, sigma)`, `blur_along_x(...)` with error-function approximation for shadows, `distance_from_clip_rect`. — [gpui_wgpu shaders.wgsl](https://github.com/zed-industries/zed/blob/main/crates/gpui_wgpu/src/shaders.wgsl)
- Accessibility: "GPUI integrates with AccessKit to provide programmatic accessibility features"; element IDs (`GlobalElementId`) drive the accessibility tree; example in `examples/a11y`. — [gpui _accessibility.rs](https://github.com/zed-industries/zed/blob/main/crates/gpui/src/_accessibility.rs)
- Secondary: crates.io gpui 0.2.2 is "roughly 11 months behind Zed main"; the crates.io build "uses Blade/Vulkan on Linux, while the git build uses wgpu"; community republishes exist (gpui-unofficial, gpui-kit, gpui-ce, gpui-pre, xgpui). — [baeseokjae blog](https://baeseokjae.github.io/posts/native-app-for-coding-agents-rust-gpui/), [docs.rs gpui-pre-web](https://docs.rs/crate/gpui-pre-web/0.3.7), [xgpui](https://docs.rs/xgpui/=1.2.0/)
- Taffy README lists "The Zed text editor via the GPUI UI framework" as a user. — [taffy README](https://github.com/DioxusLabs/taffy/blob/main/README.md)

### Inferences
- GPUI is technically the closest existing match to the "SDF rounded rects/shadows + Taffy + GPU text" brief and now has an official (unreleased) web platform on wgpu. But depending on it means pinning a Zed git revision (no crates.io releases for the modern split; breaking changes frequent), and its text system is platform-native (CoreText/DirectWrite/cosmic-text), not Parley, so CJK behavior differs per OS.
- The Apache-2.0 license on `crates/gpui` is clear; only Zed the application is GPL-3.0.

### Gaps
- No official Zed statement found on when `gpui_platform`/`gpui_web` will be published to crates.io, nor on gpui_web stability.
- Unknown whether `gpui_web` text rendering (cosmic-text) handles Japanese fallback in-browser.

---

## Q9. egui 0.37 and Xilem/Masonry status

### Takeaway
egui 0.37.0 (2026-10-15) added system-font discovery via fontique and color emoji / any-script glyph rendering, has AccessKit on native and an experimental built-in web screen reader; Xilem/Masonry remain "experimental" (last release 0.4.0, 2025-10-29; wgpu 28 / parley 0.8) but are the reference Vello + Parley + AccessKit stack with a web backend (xilem_web, DOM-based).

### Cited Findings
- egui 0.37.0 "Colored emojis!": "egui can now render any glyph that is supported on your system, including colored emojis and non-Latin scripts" via `Context::add_glyph_rasterizer` (eframe web renders glyphs to an off-screen canvas) or `Context::add_font_provider` (native, `egui_system_font_provider` using fontique); new `CompletionPopup`; experimental `StyleProvider` theme system. — [egui CHANGELOG](https://github.com/emilk/egui/blob/main/CHANGELOG.md)
- egui README: "egui includes optional support for AccessKit, which currently implements the native accessibility APIs on Windows and macOS ... For platforms that AccessKit doesn't yet support, including web, there is an experimental built-in screen reader". — [egui README](https://github.com/emilk/egui/blob/main/README.md)
- Xilem: "An experimental Rust architecture for reactive UI"; "Masonry is a foundational crate for building natively compiled GUIs"; Xilem "has a web backend and a Masonry backend"; built on "Vello and wgpu", "Parley and Fontique", "AccessKit". — [xilem README](https://github.com/linebender/xilem/blob/main/README.md)
- Xilem releases: v0.4.0 (2025-10-29), v0.3.0 (2025-05-10); workspace pins `wgpu = "28.0.0"`, `parley = "0.8.0"` with `accesskit` feature, `accesskit = "0.24.0"`; Masonry features `imaging_vello`, `imaging_vello_hybrid`, `imaging_vello_cpu`. — [xilem releases](https://github.com/linebender/xilem/releases), [xilem Cargo.toml](https://github.com/linebender/xilem/blob/main/Cargo.toml)

### Inferences
- egui is the most battle-tested pure-Rust UI on web+native but its look is hard to brand and its text stack is its own (epaint), so it suits tooling rather than a premium design system.
- Masonry is the canonical example of wiring Parley + AccessKit + Vello and is useful as a reference implementation for a custom Dioxus/Blitz-style stack, though it lags upstream crate versions.

### Gaps
- Masonry CHANGELOG could not be fetched (path not found); exact Masonry 0.4 feature list not captured.

---

## Q10. AccessKit for canvas-rendered UIs (web and native)

### Takeaway
AccessKit 0.25.2 (Oct 2026) provides native adapters for Windows (UIA), macOS, iOS, Android, Unix (AT-SPI) and a winit adapter, used by egui, Blitz/Dioxus Native, Masonry/Xilem and GPUI; a web adapter is still only "planned", so canvas-rendered UIs in browsers must synthesize their own hidden DOM/ARIA tree (Flutter-style) or use a DOM-based shell.

### Cited Findings
- "AccessKit makes it easier to implement accessibility, for screen readers and other assistive technologies, in toolkits that render their own user interface elements." Push-based tree model inspired by Chromium; "suitable for immediate-mode GUI toolkits, as long as they can provide a stable ID for each UI element." Released adapters "don't yet support all types of UI elements ... They don't yet support rich text or hypertext." Available: Android, iOS, macOS, Unix (AT-SPI via zbus), Windows (UI Automation); "Planned adapters: web (for applications that render their own UI elements to a canvas)". Also C and Python bindings and `accesskit_consumer` for embedded screen readers. — [accesskit README](https://github.com/AccessKit/accesskit/blob/main/README.md)
- Repo `adapters/` directory: `android atspi-common ios macos unix windows winit` (no web). — [accesskit adapters](https://github.com/AccessKit/accesskit/tree/main/adapters)
- Latest adapter releases 2026-10-25: accesskit_winit v0.34.2, accesskit_windows v0.35.2, accesskit_unix v0.24.1, accesskit_macos v0.27.2; core `accesskit` 0.25.2 on crates.io. — [accesskit releases](https://github.com/AccessKit/accesskit/releases)
- Third-party web bridging: `argui-accessibility` 0.2.1 lists a wasm32 build using `wasm-bindgen`, `web-sys`, `accesskit_consumer` (a DOM/ARIA bridge built on AccessKit's consumer crate). — [docs.rs argui-accessibility](https://docs.rs/crate/argui-accessibility/latest/source/Cargo.toml.orig)
- Flutter's canvas renderer "approaches this by managing hidden, unrendered DOM elements with ARIA attributes" (cited in Avalonia discussion). — [Avalonia issue #15453](https://github.com/AvaloniaUI/Avalonia/issues/15453)
- Blitz shell "integrates a Winit event loop, AccessKit, Muda"; Dioxus Native has an `accessibility` default feature. — [blitz README](https://github.com/DioxusLabs/blitz/blob/main/README.md), [dioxus native Cargo.toml](https://github.com/DioxusLabs/dioxus/blob/main/packages/native/Cargo.toml)
- Parley 0.12 exposes cursor/selection APIs "to build an accessibility integration outside of Parley". — [parley CHANGELOG](https://github.com/linebender/parley/blob/main/CHANGELOG.md)

### Inferences
- Desktop (Koharu/Shenron Studio): AccessKit via `accesskit_winit` is the standard path and works with Vello/GPUI/Blitz today.
- Web canvas (manga reader): there is no AccessKit web adapter; accessible canvas requires mirroring the tree into off-screen DOM with ARIA roles (Flutter pattern), or keeping chrome/navigation in real DOM and reserving the canvas for the image surface only.

### Gaps
- No timeline or tracking issue for the AccessKit web adapter was found via search.

---

## Q11. SEO implications of canvas-rendered content and the hybrid DOM/SSR + wgpu canvas pattern

### Takeaway
Canvas-only UIs are invisible to crawlers (no DOM text), so content pages must be real DOM, server-rendered or prerendered, with the GPU canvas confined to interactive surfaces (reader, editor, effects). This is the pattern Flutter Web users converge on.

### Cited Findings
- Default Flutter web "draws its UI to a canvas, so the DOM contains no readable text, so crawlers that do not run the app see nothing"; readable nodes appear only after the engine's accessibility placeholder is activated. — [itnext: Flutter Web SEO](https://itnext.io/flutter-web-should-i-use-it-part-1-seo-842d87ff9d28)
- "With the CanvasKit renderer, Googlebot often struggles to read text content"; recommended fix is prerendering/SSR for crawlers and verifying with Search Console URL Inspection. — [dev.to Flutter web SEO guide](https://dev.to/kanta13jp1/flutter-web-seo-guide-meta-tags-sitemaps-and-structured-data-that-actually-work-18ha), [flutter_prerender](https://pub.dev/documentation/flutter_prerender/1.3.5/)
- As of Flutter 3.22, Flutter Web "lacks native server-side rendering support, native heading tag output, route-level meta tag management". — [fbipool Flutter web SEO](https://fbipool.com/real-challenges-in-flutter-web-seo-and-how-to-solve-them/)
- Xilem's web backend (`xilem_web`) is DOM-based, and Blitz/Dioxus render HTML/CSS natively; Dioxus Native defaults to vello_gpu. — [xilem README](https://github.com/linebender/xilem/blob/main/README.md), [dioxus native Cargo.toml](https://github.com/DioxusLabs/dioxus/blob/main/packages/native/Cargo.toml)
- WebGPU requires a secure context (HTTPS). — [MDN: GPU](https://developer.mozilla.org/en-US/docs/Web/API/GPU)

### Inferences
- Hybrid architecture: SSR/DOM (Dioxus 0.8 fullstack or Bun-served TSX) for chapter lists, wiki, articles, metadata, `<img>` fallbacks and JSON-LD; a `<canvas>` island running wgpu/vello_gpu wasm for the reader with pan/zoom, dual-page, OCR overlays. Provide `<noscript>`/`<img>` page fallbacks and alt text so page images remain indexable.
- Keep navigation chrome, bubble/translation text, and headings in DOM so they are both indexable and screen-reader accessible; the canvas becomes an `role="img"`/application region.

### Gaps
- No Google-official 2026 statement specifically about WebGPU canvas content was found (sources are Flutter-centric secondary posts).

---

## Q12. Skia vs Vello: text quality, build/CI pain, wasm size, licensing

### Takeaway
Skia has mature subpixel/hinted text and full filter graphs but costs a C++ toolchain (or prebuilt download) in CI, Emscripten-only wasm at CanvasKit-class size, and no WebGPU/wgpu interop today; Vello (Sparse Strips) is pure Rust, ~instant to build, runs on wgpu/WebGPU and WebGL2 with CPU fallback, has vertical-only hinting and no subpixel AA, and both are permissively licensed (Skia BSD-3 / bindings MIT; Vello Apache-2.0 OR MIT).

### Cited Findings
- Vello text: original plan rendered glyphs "with no hinting, stem darkening, or RGB subpixel rendering" ("pretty good on high-dpi screens, but definitely suboptimal on low-dpi"); current code does vertical hinting only under uniform scale. — [vello issue #204 mirror](https://scriptagc.wasmer.app/https_github_com/linebender/vello/issues/204), [vello_common glyph.rs](https://docs.rs/crate/vello_common/0.0.7/source/src/glyph.rs)
- egui PR #7694 author comparing Skrifa+vello_cpu to Skia: unhinted Skrifa "looks almost identical, but there are some subpixel differences"; adding "font embolden (aka stem darkening) ... is (subjectively) a big additional improvement, at least on macOS", tuning could bring output "very close if not identical to Skia/Chrome". — [egui PR #7694 mirror](https://github.bileizhen.workers.dev/emilk/egui/pull/7694)
- Dioxus Native exposes an `apple-font-embolden` default feature (stem darkening on macOS). — [dioxus native Cargo.toml](https://github.com/DioxusLabs/dioxus/blob/main/packages/native/Cargo.toml)
- Vello GPU/CPU filters: Gaussian blur (anisotropic), blurred rounded rects incl. inset, blend modes (incl. Color/Luminosity fixes), gradients incl. sweep; CPU: "Complex filter graphs are currently not supported at all". — [vello_gpu CHANGELOG](https://github.com/linebender/vello/blob/main/vello_gpu/CHANGELOG.md), [vello_cpu README](https://github.com/linebender/vello/blob/main/vello_cpu/README.md)
- Skia build: prebuilt binaries via curl; source build needs LLVM + Python 3 + Ninja; Windows LLVM paths; Emscripten 5.0+ for wasm; `wasm32-unknown-unknown` unsupported. — [rust-skia README](https://github.com/rust-skia/rust-skia/blob/master/README.md)
- Skia wasm size proxy: canvaskit-wasm 0.40.0 ~24.9 MB uncompressed; Flutter CanvasKit 1.54–2.26 MB brotli. — [unpkg](https://app.unpkg.com/canvaskit-wasm@0.40.0), [startdebugging.net](https://startdebugging.net/2026/09/canvaskit-vs-skwasm-for-flutter-web-in-2026/)
- Vello wasm: native WebGL2 backend saves ~3 MB vs wgpu-webgl; shader minification work in 0.3.0. — [vello_hybrid PR #1011](https://skia.googlesource.com/external/github.com/linebender/vello/+/refs/heads/ajakubowicz-fix-wgsl-source%5E), [vello_gpu CHANGELOG](https://github.com/linebender/vello/blob/main/vello_gpu/CHANGELOG.md)
- Licensing: rust-skia MIT; vello/parley/anyrender Apache-2.0 OR MIT; accesskit BSD-3-Clause; taffy MIT; gpui Apache-2.0; egui Apache-2.0 OR MIT. — gh api license fields (table above)
- Skia GPU in Rust cannot share a wgpu device/queue/textures today (PR #1367 open). — [rust-skia #1367](https://github.com/rust-skia/rust-skia/issues/1367)

### Inferences
- Text quality: Skia wins on low-DPI desktop (subpixel positioning, platform-style hinting, LCD AA); Vello is close on HiDPI, improving via stem darkening, and gives you one identical text rasterizer across web/desktop/headless.
- CI pain: Vello is `cargo build` on stable Rust 1.89+; Skia needs curl + prebuilt cache per target triple/feature set and a 30+ minute source build if cache misses (Windows CI especially).
- For a wgpu-centric stack (GPUI, Dioxus Native, custom), Vello integrates zero-copy; Skia would need a separate GPU context until #1367 lands.

### Gaps
- No quantitative text-quality comparison (e.g., MOS or pixel-diff study) between Vello and Skia was found.
- No measured build-time numbers for rust-skia from source in 2026.

---

## Q13. Material 3 color science in Rust (HCT / CAM16)

### Takeaway
`material-colors` 0.5.0 (Aiving, 2026-10-01, 163k downloads) is an up-to-date port of Google's material-color-utilities with HCT, CAM16, dynamic color schemes, palettes, contrast, blend, quantize/score (image extraction), no_std via libm, and serde; older `material-color-utilities-rs` (0.2.1, 2023) is stale.

### Cited Findings
- crates.io: `material-colors` 0.5.0 updated 2026-10-01, "Up-to-date material-color-utilities port", 162,770 downloads; `material-color-utilities-rs` 0.2.1 last updated 2023-02-04, 20,909 downloads; `material-color-utilities` 1.0.0-dev.18 (2025-10-19), 8,875 downloads. — crates.io API ([material-colors](https://crates.io/crates/material-colors), [material-color-utilities-rs](https://crates.io/crates/material-color-utilities-rs), [material-color-utilities](https://crates.io/crates/material-color-utilities))
- material-colors README: "An unofficial port of the material-color-utilities library for creating Material You themes and color schemes." Features: `std`, `libm` (no_std), `quantize` (image color extraction), `serde`. Usage `ThemeBuilder::with_source(Rgb::from_u32(0xaae5a4)).build()`. Modules: `blend, color, contrast, dislike, dynamic_color, hct, image, palette, quantize, scheme, score, temperature, theme, utils`. GitHub 47 stars, Apache-2.0 (README says MIT or Apache-2.0). — [material-colors README](https://github.com/Aiving/material-colors/blob/main/README.md)
- `polymorpher` (same author) implements Material Design 3 shape morphing usable with anyrender via the `kurbo` feature. — [anyrender README](https://github.com/DioxusLabs/anyrender/blob/main/README.md)
- Linebender `color` crate (0.3.3, 2026-05-05) provides CSS Color 4 spaces (Oklab/Oklch etc.) used by peniko/vello; it does not include HCT/CAM16. — [linebender/color releases](https://github.com/linebender/color/releases)

### Inferences
- Use `material-colors` for HCT/CAM16 tonal palettes and the 7 brand presets (dynamic schemes), convert to `peniko::Color`/linebender `color` for painting. For SDF rounded rects and shadows, either Vello's built-in `fill_blurred_rounded_rect(_in)` or GPUI-style `quad_sdf` WGSL in a custom wgpu pass.

### Gaps
- No source confirming which material-color-utilities upstream revision material-colors 0.5.0 tracks.

---

## Q14. Recommended composition (synthesis)

### Takeaway
(1) Web manga reader: Dioxus 0.8 (SSR/DOM shell) + wasm island on wgpu 30 `webgpu` + vello_gpu 0.3 (wgpu backend, with `webgl` native fallback) via anyrender 0.14, Parley 0.12 (`complex-scripts`) for overlay text, hidden-DOM ARIA mirror for a11y. (2) Desktop editor: pure Rust on wgpu 30 + vello_gpu/vello_cpu + Parley 0.12 + Taffy 0.15 + AccessKit winit, either through Dioxus Native/Blitz (anyrender) or a GPUI git pin if Zed-like chrome is wanted. (3) Design system: Taffy 0.15 layout, Vello blurred-rounded-rect/SDF quads, material-colors 0.5 for HCT/CAM16.

### Cited Findings
- Component versions and compatibility lines as cited above: wgpu 30.0.1 ([wgpu](https://github.com/gfx-rs/wgpu/releases)), vello_gpu 0.3 / vello_cpu 0.3 / glifo 0.4 ([vello releases](https://github.com/linebender/vello/releases)), anyrender 0.14 pinned to wgpu 30 ([anyrender README](https://github.com/DioxusLabs/anyrender/blob/main/README.md)), parley 0.12 ([parley](https://github.com/linebender/parley/releases)), taffy 0.15.1 ([taffy](https://github.com/DioxusLabs/taffy/releases)), accesskit 0.25.2 ([crates.io](https://crates.io/crates/accesskit)), material-colors 0.5.0 ([crates.io](https://crates.io/crates/material-colors)).
- Dioxus Native already composes Blitz (Stylo + Taffy + Parley) + anyrender vello_gpu + AccessKit with `complex-scripts` and `apple-font-embolden` toggles. — [dioxus native Cargo.toml](https://github.com/DioxusLabs/dioxus/blob/main/packages/native/Cargo.toml), [blitz README](https://github.com/DioxusLabs/blitz/blob/main/README.md)
- vello_gpu supports external textures and YCbCr video frames via `wgpu::ExternalTexture`, cropped texture regions, bilinear/bicubic sampling — relevant to large scan pan/zoom. — [vello_gpu README](https://github.com/linebender/vello/blob/main/vello_gpu/README.md)
- GPUI web platform exists in Zed main (WebGPU preferred, WebGL2 fallback) but not on crates.io. — [gpui_web.rs](https://github.com/zed-industries/zed/blob/main/crates/gpui_web/src/gpui_web.rs), [crates.io gpui](https://crates.io/crates/gpui)
- Skia not viable for wasm+WebGPU; native-only via Emscripten/WebGL or prebuilt native binaries. — [rust-skia README](https://github.com/rust-skia/rust-skia/blob/master/README.md), [skia-discuss](https://groups.google.com/g/skia-discuss/c/5_6hbA_an9A)

### Inferences
- Reader (web): render pages as wgpu textures sampled through vello_gpu `set_paint` with image paints (bilinear for zoom-out, bicubic for zoom-in), draw speech-bubble overlays/translations with glifo+Parley; keep chapter navigation, title, alt text in DOM for SEO/a11y; ship WebGPU-only wasm by default and lazy-load the WebGL2 build for Firefox-Linux/older Safari.
- Editor (desktop): wgpu 30 native backends (Vulkan/Metal/D3D12), vello_gpu for canvas, vello_cpu for export/thumbnail, Parley with `complex-scripts` + bundled Japanese fonts, Taffy for panels, AccessKit winit adapter; avoid rust-skia unless Skia-only features (full filter graphs, PDF, Skottie) are required, in which case use it natively through anyrender_skia.
- Design primitives: implement rounded-rect/shadow via Vello `fill_blurred_rounded_rect_in` (inset+outset) or a custom WGSL `quad_sdf` pass modeled on GPUI; derive tones with material-colors HCT and store as peniko colors; layout with Taffy 0.15 (grid for dashboards, flex for toolbars).
- Risk register: Parley lacks vertical text/ruby (manga typesetting), AccessKit lacks web adapter, GPUI not on crates.io, Firefox Linux WebGPU not shipped, vello compute crate downgraded to research.

### Gaps
- No end-to-end reference project combining exactly wgpu 30 + vello_gpu 0.3 + Dioxus 0.8 web island was found; integration cost is an estimate.
