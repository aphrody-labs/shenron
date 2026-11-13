# AOT, LTO and zero-copy audit, 2026-11-05

Branch `claude-aot-lto` (from `claude-aot-build` 6c2eebed, merged with `claude-cargo`).
All builds and measurements ran on the OVH build hub (`ssh vps`, 12 cores, 45 GB, Linux x64),
never on the owner PC.

## Measurement conditions

The hub is shared (20 to 30 interactive sessions). The 1-minute load average during the runs was
10 to 30, so absolute numbers are noisy and a "quiet machine" was not available. Every comparison
below interleaves or alternates the two variants on the same host in the same minutes, reports the
median, and keeps the minimum next to it. Treat differences under about 10% as noise.

Tools: `hyperfine -N --warmup 3` (30 runs for `--version`, 20 for `--smoke`, 30 for the CLI),
`/usr/bin/time -f %M` for peak RSS (median of 20), `oha -z 8s -c 16` for HTTP throughput, wall
clock around `cargo build` for build times.

## 1. What AOT and bytecode are, and which Bun does what

| Mode     | Flag                      | What it does                                                 | Limit                                                                                                        |
| -------- | ------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| bundle   | none                      | JavaScript source is embedded and parsed at start            | slowest start                                                                                                |
| bytecode | `--bytecode --format=esm` | JavaScriptCore bytecode cache embedded, no parse at start    | valid for the JSC of the Bun that wrote it                                                                   |
| aot      | `--aot`                   | JavaScript/TypeScript compiled to machine code at build time | no cross-compile; no Bun command line inside the executable; type errors in generated entries fail the build |

Bun toolchain facts verified on the hub (`bun build --help`, Bun 1.4.4-canary.1):

- Exists: `--aot`, `--aot-allow-code-from-disk`, `--aot-log-type-mismatches`, `--explain`,
  `--aot-huge-heap`, `--no-compile-function-source`, `--compile-in-place`, `--trim`,
  `--trim-locales`, `--obfuscate`, `--compile-inspector`, `--disallow-code-generation-from-strings`,
  `--bytecode`, `--bytecode-depth`, `--bytecode-order`, `--no-optimize-bytecode`,
  `--compile-jit-policy`, `--compile-exec-argv`, `--asset`, `--compile-autoload-*`,
  `Bun.build({ compile: { aot: true } })`, `Bun.Image`, `Bun.Archive`. `bun install` has
  `--linker=isolated|hoisted`, `--cache-dir`, `--offline`; there is no global-store flag in the
  installed help.
- Does not exist: any LTO flag. Bun compiles JavaScript; link-time optimization applies to the
  Rust side only (section 3).
- Two canary builds are installed with the same version string. `~/.bun/bin/bun` is
  `1.4.4-canary.1+11c367163`; `~/.bun-aot/bin/bun` is `1.4.4-canary.1+5b598476c`. Prod host Bun is a
  third build (`+a4c3a5eee`). The container images embed the Aphrody runtime `1.4.3-aphrody.2`.

### Linux AOT status (blocker found and worked around)

`+11c367163` panics in `LinkAndEmit` on Linux for the bot and for the server module graph:

```
panic: index out of bounds: the len is 4807 but the index is 3151114
Stopped while compiling in LinkAndEmit.
```

The same source compiled with AOT on Windows in the previous slice. On Linux, a script of a few
lines compiles, each of the 57 bot command modules compiles alone, but the whole graph does not
(`TrainingService` plus any other module is enough). `--trim`, `--no-compile-function-source`,
`--aot-huge-heap`, `--compile-in-place`, minify off and source maps off make no difference. The
`+5b598476c` build links the bot (48 s) and the server (19 s) without error. This is a Bun bug, not
a Shenron one.

Consequences implemented:

- `scripts/build/compile-mode.ts`: `SHENRON_AOT_BUN=<path>` names the Bun that does the AOT compile
  (`aotBun`), and `supportsAot(bun)` reads `bun build --help`. The Aphrody 1.4.3 runtime of the
  images does not know `--aot` and silently ignores it (it writes a plain bundle), so the exit code
  cannot be trusted; such a Bun now selects `bytecode` and the log says why.
- The existing fallback (AOT compile fails, retry as bytecode) stays for bot and server.
- Release hosts that want AOT must export `SHENRON_AOT_BUN` (or run the build with a good Bun). The
  Docker images (`Dockerfile.build`, runtime 1.4.3-aphrody.2) stay on bytecode until the runtime
  is upgraded to a build that has `--aot`.

## 2. Linux measurements

### Bot (`apps/bot`, target linux-x64, same source commit)

Bytecode built with `+11c367163` (AOT panics there), AOT built with `+5b598476c`.

| Metric                              | bytecode               | aot                    | change                          |
| ----------------------------------- | ---------------------- | ---------------------- | ------------------------------- |
| `--version` median (n=30), min, p90 | 77.4 ms, 67.4, 92.2    | 35.6 ms, 32.8, 41.3    | -54%                            |
| `--smoke` median (n=20), min, p90   | 514.4 ms, 376.2, 777.5 | 410.8 ms, 324.5, 569.5 | -20%                            |
| RSS `--version` median (n=20)       | 60.5 MB                | 43.6 MB                | -28%                            |
| RSS `--smoke` median (n=20)         | 139.9 MB               | 113.6 MB               | -19%                            |
| Executable size                     | 235,137,736 B          | 238,373,688 B          | +1.4% (Windows: +22%)           |
| Compile time (`bun build`)          | 5.7 s                  | 48.0 s                 | AOT is about 8x slower to build |

Both binaries print `"smoke":"ok"` (115 slash commands, 11 canvas fonts, indexer worker ready).
Linux behavior: the canvas native addon is loaded from `skia.linux-x64-gnu.node` beside the binary
through `--aot-allow-code-from-disk`, as on Windows; `SHENRON_BOT_ASSETS_DIR` must point to the
`share` directory (not `share/assets`). No path or loader fix was needed on Linux.

Opt-in `SHENRON_AOT_TRIM=1` adds `--trim`: 192.8 MB (-45 MB, "67.5 MB of unused Bun APIs removed"),
`--smoke` still ok. Not the default: `--smoke` does not exercise the gateway or the database, and
`GuildMirror.ts` calls `eval`/`new Function`, which makes `--trim` keep some APIs.

### Server (`apps/server` + Next standalone, desktop flavor, `--no-vfs`)

Real build with `scripts/build/server.ts` (Next build 79 s, whole script 5 min 38 s).
`bytecode` compiled from the same generated entry with the default Bun.

| Metric                                                                | bytecode                               | aot (+ runtime/bun)                    | change                                     |
| --------------------------------------------------------------------- | -------------------------------------- | -------------------------------------- | ------------------------------------------ |
| Executable size (payload embedded)                                    | 321,649,352 B                          | 313,613,112 B                          | -2.5% (plus the 100 MB `runtime/bun` file) |
| Time to first 200 on `/robots.txt`, warm payload cache, median (n=11) | 1582 ms                                | 1588 ms                                | none (Next child dominates)                |
| RSS of the server process                                             | 78.7 MB                                | 59.1 MB                                | -25%                                       |
| RSS of the Next child                                                 | 149.3 MB                               | 148.3 MB                               | none                                       |
| `GET /api/local/health` (oha 8 s, 16 conns)                           | 16,168 req/s, p50 0.90 ms, p99 2.37 ms | 22,637 req/s, p50 0.61 ms, p99 1.93 ms | +40% req/s                                 |
| `GET /robots.txt` (proxied to Next)                                   | 1,044 req/s, p50 13.2 ms               | 1,047 req/s, p50 12.8 ms               | none (Next is the limit)                   |

The first start (payload extraction) took 18.4 s for bytecode and 37.3 s for AOT; it is dominated by
disk and load at that minute (one sample each), not a mode property.

### Other compiled CLIs

| Target                                          | plain    | bytecode | aot     |
| ----------------------------------------------- | -------- | -------- | ------- |
| `packages/crunchyroll` `cli help` median (n=30) | 10.2 ms  | 7.8 ms   | 7.1 ms  |
| same, RSS median                                | 16.8 MB  | 16.0 MB  | 19.6 MB |
| same, size                                      | 140.5 MB | 142.0 MB | 69.0 MB |
| `apps/activity` size                            | 140.7 MB | n/a      | 71.3 MB |

The Crunchyroll CLI gains nothing at runtime, so its `package.json` build is unchanged. The Activity
server (`apps/activity/scripts/compile.ts`) now compiles with `Bun.build({ compile: { aot: true } })`
when the running Bun supports it (native target only, `--no-aot` / `SHENRON_AOT=0` to opt out, plain
bundle on failure). AOT type-checks the generated entry, which flagged the `.html` file import typed
as `HTMLBundle`; the entry now casts it. The AOT Activity binary serves the same page (200, 738
bytes) as the plain one.

## 3. Server and AOT: Next child

Cause of the earlier "never AOT": an AOT executable has no Bun command line, so
`BUN_BE_BUN=1` makes it exit with `error: BUN_BE_BUN is set, but this executable doesn't include the
Bun command line`. Verified: the previous code with an AOT server fails at startup with
"Next standalone server exited with 70".

Implemented and verified: `apps/server/src/next-startup.ts` `resolveNextRuntime()` runs the Next
`server.js` with, in order, `SHENRON_NEXT_BUN`, a real Bun at `runtime/bun[.exe]` beside the
executable, or the executable itself with `BUN_BE_BUN=1` (bytecode builds, unchanged behavior).
`scripts/build/server.ts` tries AOT first, copies the building Bun to `dist/server/<target>/runtime/`,
and falls back to bytecode on any AOT failure. Evidence:

- Synthetic fixture (child prints `process.execPath`): AOT server answers 200 through the front
  proxy and the child ran `runtime/bun`.
- Real build (table above): server AOT with the real Next payload serves `/api/local/health` and
  `/robots.txt`.
- `apps/server` tests: 98 pass, 2 skip, 0 fail, including the new `resolveNextRuntime` test.

Cost: one 100 MB `runtime/bun` file ships next to the server in AOT mode. The Next child could be
avoided entirely only by moving the site to `Bun.serve` routes, which is out of scope. Not verified:
Windows (`runtime/bun.exe`) and the container image build (the image runtime has no `--aot`, so it
stays on bytecode and ships no `runtime/`).

## 4. Rust: LTO profile and WASM

Root `Cargo.toml`:

- `[profile.production]` = release plus `lto = "fat"`, `codegen-units = 1`, `strip = "symbols"`.
  `panic` stays `unwind`: `shenron-ffi` contains panics with `catch_unwind` at the FFI boundary and
  the tokio-based crates rely on unwinding for task panics.
- `[profile.production-abort]` inherits `production` with `panic = "abort"`, for standalone
  executables with no threads and no panic catcher. Only `shenron-video` uses it
  (`scripts/ops/build-shenron-video.sh`).
- `release` stays the quick lane (thin LTO, 16 codegen units).

Wiring: `scripts/deploy/build-image.sh` (`SHENRON_CARGO_PROFILE`, default `production`; lane stamp
includes the profile), `Dockerfile.build` (`--build-arg CARGO_PROFILE=production|release`, Linux and
the xwin Windows stage), `scripts/ops/build-shenron-video.sh` (`SHENRON_VIDEO_PROFILE`),
`scripts/build/server.ts` and `packages/native/src/re.ts` (library lookup checks
`target/production` first). Sccache and the `/work/target` cache mounts are unchanged; the profile
only changes the output directory. `bench-old-pipeline.sh` is a historical benchmark and keeps
`--release` on purpose.

WASM: `packages/koharu/scripts/build-wasm.ts` already built with fat LTO, `opt-level=3`,
`panic=abort` through `CARGO_PROFILE_RELEASE_*` and wasm-bindgen. It now also runs `wasm-opt -O3` on
the bindgen output (part of the recipe, so the stamp changes); without `wasm-opt` it warns and skips
(`SHENRON_WASM_OPT=off` disables it, `WASM_OPT` names the binary). `binaryen` is added to the
`Dockerfile.build` apt list. The tracked module `packages/koharu/src/wasm/koharu_canvas_bg.wasm` and its stamp were regenerated
on the hub (rustc 1.99.1, wasm-bindgen 0.2.129, binaryen 131): 2,050,907 B to 1,898,117 B (-7.4%,
gzip 605.3 KiB to 603.8 KiB); `build-wasm.ts --check` passes and `packages/koharu` tests pass
(23 pass, 2 skip). `packages/pipeline/scripts/build-re-wasm.ts` (shenron_re) still builds with
`--release` and no `wasm-opt`; it was not touched.

### Build times and sizes (vps, cold `CARGO_TARGET_DIR`, no sccache)

| Build                                            | time    | size                | notes                               |
| ------------------------------------------------ | ------- | ------------------- | ----------------------------------- |
| `shenron-video` release, cold                    | 412 s   | 1,580,808 B         | load average 30 at the time         |
| `shenron-video` production-abort, cold           | 107.6 s | 994,248 B (-37%)    | load average 15                     |
| `shenron-video` release, warm (touch `lib.rs`)   | 9.9 s   |                     |                                     |
| `shenron-video` production-abort, warm           | 17.8 s  |                     | single codegen unit, fat LTO relink |
| `shenron-mcp` release, cold                      | 259.6 s | 26,495,088 B        |                                     |
| `shenron-mcp` production-abort, cold             | 470.4 s | 14,998,224 B (-43%) | measurement of the abort variant    |
| `shenron-mcp` production (shipped: unwind), cold | 574.8 s | 16,496,176 B (-38%) | load average 9                      |
| `shenron-mcp` production, warm (touch `main.rs`) | 147.0 s |                     | fat LTO relink of the whole graph   |

The cold release number for `shenron-video` is inflated by load (it includes compiling all
dependencies under a load of 30); compare cold times only with this caveat. The price of fat LTO is
build time: cold `shenron-mcp` about 2.2x the release build (574.8 s vs 259.6 s) and a warm relink
of 147 s, against 10 to 18 s for the small `shenron-video`. This is why `release` stays as the fast
lane. Not measured: a warm sccache run (sccache caches crate compilations, not the fat LTO link
step) and the Docker/xwin Windows stage.

## 5. Zero-copy audit

Audited: `apps/server/src`, `apps/bot/src/render`, `apps/bot/src/lib`, `packages/media/src`,
`packages/images/src`. Most hot paths already move bytes without copies: static files are served as
`new Response(Bun.file(...))` (`front.ts`), the render pool transfers the pixel `ArrayBuffer` from
the worker (`postMessage(reply, [data.buffer])`) and wraps it with `Buffer.from(buffer, offset,
length)`, `Buffer.from(await file.arrayBuffer())` is a view, not a copy.

Changed (each with a byte-identical-output test):

| Change                                                                                                                                                               | Evidence                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/server/src/payload.ts` `pack()` reads every file straight into its slot of one archive buffer (was: a `Buffer` per file, then a second copy into the archive). | Test compares the compressed bytes with the old packer (3 MB file, empty file, nested dirs). 382 MB tree: peak RSS 1073 MiB to 690 MiB (-36%), 1.12 s to 1.04 s, identical sha256. |
| `apps/bot/src/render/png.ts` `encodePngRgba()` writes signature, chunks and the zlib stream into one buffer (was: zlib copy, chunk copies, `Buffer.concat`).         | Test compares bytes with the old encoder on 5 sizes and levels. Timing: 21.3 ms vs 21.6 ms for 2000x720, no measurable change (deflate dominates); fewer allocations only.         |

Examined and left alone, with the cause:

- `studio.ts` CBZ export: `new Response(Bun.file(dest))` would stream a file that the `finally`
  block deletes before the body is read.
- `studio.ts` tar export: `Bun.Archive` ignores `Bun.file()` values in this canary (the archive
  entries come out with size 0: 124-byte archive for a 3 MB input, checked on the hub), so the files
  must still be read into `Blob`s. Reproducible with `new Bun.Archive({ "a": Bun.file(p) })`.
- `packages/images/src/webp.ts` and `apps/bot/src/render/images.ts`: `Bun.Image` exists on the hub
  (methods `resize`, `webp`, `png`, `jpeg`, `avif`, `metadata`, ...) but has no `.rgba`, and its
  WebP/PNG output is not byte- or PSNR-identical to sharp/Skia, so replacing them would change
  output. The PSNR guard in `toWebp` is the contract that blocks a silent swap.
- `mediabunny-pipeline.ts` base64 path is a browser-canvas fallback with no large server payload.
- `remote-ocr.ts` base64: required by the remote JSON API.

## 6. packageManager pin

`package.json#packageManager` is `bun@1.4.6`. Findings:

- Installed Bun: vps `1.4.4-canary.1` (two builds), prod host `1.4.4-canary.1+a4c3a5eee`.
- Compiled binaries in prod report `Bun 1.4.5` (runtime embedded from the Aphrody fork).
- Images: `BUN_RUNTIME_VERSION=1.4.3-aphrody.2` (`Dockerfile.build`, `all-in-one/Dockerfile`).
- `packageManager` is not read by Bun here; it is parsed by `.github/actions/setup-bun/action.yml`
  and `scripts/dev/cloud-setup.sh` as the fork release tag for CI. The URL
  `aphrody-v1.4.6/bun-linux-x64.zip` returns 404 from this host (no public release of that tag was
  reachable), `aphrody-v1.4.3-aphrody.2` resolves.

Not changed: the pin belongs to the CI fork-release lane and cannot be validated or tested from
here; `engines.bun >= 1.4.4` is the effective constraint. Needs an owner decision: either publish the
fork release 1.4.6 or set the pin to the qualified runtime. AOT builds do not depend on this pin:
they require `--aot` in the building Bun (`supportsAot`), which neither the fork 1.4.3-aphrody.2 nor
a pin to it provides.

## 7. Verification (hub)

- Rust: `cargo fmt --check` and `cargo clippy --locked -D warnings` on `shenron-video` and
  `koharu-library` (the crates changed by the merged `claude-cargo`): clean.
  `cargo build --profile production` of `shenron-mcp` and `--profile production-abort` of
  `shenron-video` succeed.
- `bun fmt --check` on touched files: ok. `oxlint -c .oxlintrc.json` on touched files: 0 errors.
- Typecheck: `apps/server`, `apps/bot`, `apps/activity` and `scripts` (`bun check -p scripts`): no errors.
- Tests: `apps/server` 98 pass / 2 skip / 0 fail; `apps/activity` 154 pass; `scripts/build` 60 pass;
  `packages/images` 18 pass; `packages/media` 30 pass / 7 skip; new bot test `render-png` pass.
- `apps/bot/tests` has 68 failures on the hub (database, `Bun.Image.rgba`, time budgets under load,
  Discord fixtures). The same suite on the base commit 6c2eebed has 78 failures; no test fails on this
  branch that does not fail on the base.
- Compiled binaries: bot `--version` and `--smoke` ok (bytecode and AOT); server `version` ok and
  served requests (AOT with `runtime/bun`, and bytecode).
