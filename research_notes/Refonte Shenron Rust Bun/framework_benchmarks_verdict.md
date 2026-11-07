# Leptos vs Dioxus vs TanStack (Start/Router/Query on Bun) — benchmarks, capabilities, verdict

State as of 2026-11-04. Consumer constraints: 100% upstream Bun 1.4.4+ (latest Bun release tag `bun-v1.4.4`, published 2026-10-22 — [oven-sh/bun releases via gh api](https://github.com/oven-sh/bun/releases)), pure Rust, no Node.js/npm/Next.js/Tailwind/Base UI/shadcn. Target: dragonballfr.com rebuild (wiki, manga reader, databooks, admin, editor; fr/en/ja).

## Project vitals (gh api, 2026-11-04)

### Takeaway
Dioxus is the biggest Rust UI project (39.6k stars) but ships slower (0.7.10 is the last stable, 2026-07-30; 0.8 still alpha). Leptos is smaller (21.5k) but releases continuously (0.8.23 on 2026-10-31, 0.9.0-rc1 the same day). TanStack Router/Query dwarf both in commit velocity but are TypeScript and release daily patch versions.

### Cited Findings
- leptos-rs/leptos: 21,461 stars, 923 forks, 108 open issues, 388 contributors, 182 commits in last 90 days, latest release v0.8.23 (2026-10-31); v0.9.0-rc1 also published 2026-10-31, v0.9.0-rc0 2026-10-15 — [gh api repos/leptos-rs/leptos](https://github.com/leptos-rs/leptos), [releases](https://github.com/leptos-rs/leptos/releases)
- leptos-rs/cargo-leptos: 548 stars, 108 contributors, 41 commits/90d, latest v0.3.11 (2026-10-02) — [gh api](https://github.com/leptos-rs/cargo-leptos)
- DioxusLabs/dioxus: 39,598 stars, 1,958 forks, 896 open issues, 420 contributors, 71 commits/90d, latest stable v0.7.10 (2026-07-30); prereleases v0.8.0-alpha.0 (2026-05-19) through v0.8.0-alpha.3 (2026-10-16) — [gh api repos/DioxusLabs/dioxus](https://github.com/DioxusLabs/dioxus), [releases](https://github.com/DioxusLabs/dioxus/releases)
- TanStack/router (hosts TanStack Start): 15,281 stars, 812 open issues, 463 contributors, 274 commits/90d, latest tag v1.166.7 / release 2026-10-22 — [gh api](https://github.com/TanStack/router)
- TanStack/query: 50,525 stars, 112 open issues, 462 contributors, 1,107 commits/90d, latest tag v5.90.3, release 2026-11-04 — [gh api](https://github.com/TanStack/query)
- npm latest: `@tanstack/react-start` 1.169.4 (published 2026-10-22), peerDependencies `vite`, `react`, `react-dom`, `@rsbuild/core`; `@tanstack/solid-start` 1.169.4 (peer `vite`, `solid-js`, `@rsbuild/core`); `@tanstack/react-router` 1.170.46; `@tanstack/react-query` 5.106.0 — [registry.npmjs.org](https://registry.npmjs.org/@tanstack/react-start/latest)
- crates.io: `leptos` 0.8.23 (5.77M downloads), `leptos_router` 0.8.17, `leptos-use` 0.20.0 (2026-10-20), `leptos_i18n` 0.6.2 (2026-04-14), `thaw` 0.4.8 (2025-08-03), `leptonic` 0.5.0 (2024-02-01), `dioxus` 0.7.10 (3.53M downloads), `dioxus-i18n` 0.6.0 (2026-10-15), `taffy` 0.15.1 (2026-10-25, 18.7M downloads) — [crates.io API](https://crates.io/api/v1/crates/leptos)
- Ecosystem repos: thaw-ui/thaw 614 stars (last push 2026-05-07); lpotthast/leptonic 302 stars (push 2026-10-22); Synphonyte/leptos-use 496 stars; DioxusLabs/components 355 stars (push 2026-10-24); DioxusLabs/blitz 4,341 stars (push 2026-11-04); DioxusLabs/taffy 3,732 stars; Baptistemontan/leptos_i18n 168; mondeja/leptos-fluent 92 (push 2026-04-24); dioxus-community/dioxus-i18n 69; tauri-apps/tauri 112,500 — [gh api repos/*](https://github.com/thaw-ui/thaw)

### Inferences
- Dioxus' 896 open issues vs Leptos' 108 and a 14-month-old stable major (0.7.0 was 2025-09-08) suggest a wider surface area with slower stabilisation; Leptos 0.9 is about to land with a "mostly compatible" upgrade.
- TanStack's 1,100+ commits/90d on Query reflect a monorepo with automated releases; it does not indicate API churn for consumers but it does mean constant dependency updates in a Bun lockfile.

### Gaps
- GitHub contributor counts come from the `Link: rel=last` header with `per_page=1` (anonymous contributors excluded); exact numbers may differ slightly from the GitHub UI.

## Q1. Which is fastest in js-framework-benchmark (keyed) and by how much; what are the WASM sizes?

### Takeaway
In the current krausest run (Chrome 156, published 2026-10-25, 201 keyed frameworks, non-keyed retired), Dioxus 0.7.2 (weighted CPU geomean 1.30) and Leptos 0.7.0 (1.32) are neck-and-neck on CPU and both beat React 19.2 hooks (1.56) by ~17%, but both trail Solid 1.9.3 (1.14) by ~14%. On transfer size they are in a different league: Leptos ships 189.6 kB / 48.8 kB gz, Dioxus 419.6 kB / 114.9 kB gz, vs Solid 11.5 kB / 4.5 kB gz and React 190.3 kB / 51.4 kB gz. There is no TanStack entry; TanStack Start inherits React (or Solid) numbers.

### Cited Findings
- Benchmark run: "Results for chrome 156 are published ... We're now at 201 from 196 (chrome 154) ... From this runs on we'll no longer benchmark non-keyed implementations." Release "Chrome 156", published 2026-10-25 — [krausest release chrome156](https://github.com/krausest/js-framework-benchmark/releases/tag/chrome156); results page [chrome156.html](https://krausest.github.io/js-framework-benchmark/2026/chrome156.html)
- Methodology: "Starting with chrome 118 the overall performance is computed as a weighted geometric mean" — [krausest README](https://github.com/krausest/js-framework-benchmark/blob/master/README.md); CPU weights [0.643, 0.561, 0.564, 0.193, 0.132, 0.528, 0.564, 0.551, 0.423] in `computeGeometricMean` — [webdriver-ts-results/src/Common.ts](https://github.com/krausest/js-framework-benchmark/blob/master/webdriver-ts-results/src/Common.ts)
- Versions actually benchmarked: `leptos = { version = "0.7", features = ["csr", "nightly", "delegation"] }` and `dioxus = "0.7.2"` — [frameworks/keyed/leptos/Cargo.toml](https://github.com/krausest/js-framework-benchmark/blob/master/frameworks/keyed/leptos/Cargo.toml), [frameworks/keyed/dioxus/Cargo.toml](https://github.com/krausest/js-framework-benchmark/blob/master/frameworks/keyed/dioxus/Cargo.toml). NOTE: the Leptos entry is 0.7.0, not 0.8.x.
- Recomputed from the published raw data (`webdriver-ts-results/src/results.ts`, medians, factor vs. fastest keyed framework, krausest weights; 207 keyed entries) — [results.ts](https://github.com/krausest/js-framework-benchmark/blob/master/webdriver-ts-results/src/results.ts):

| rank | framework | CPU geomean (weighted) | memory geomean | size uncompressed kB | size compressed kB | first paint ms | ready mem MB | run1k ms | create10k ms |
|---|---|---|---|---|---|---|---|---|---|
| 2 | vanillajs-keyed | 1.02 | 1.06 | 11.3 | 2.5 | 42.1 | 0.56 | 19.9 | 205.5 |
| 48 | solid-v1.9.3 | 1.14 | 1.29 | 11.5 | 4.5 | 53.5 | 0.58 | 21.4 | 225.9 |
| 52 | solid-next-v2.0.0-rc.18 | 1.15 | 1.64 | 59.5 | 20.3 | 79.0 | 0.73 | 21.6 | 224.0 |
| 60 | svelte-v5.42.1 | 1.19 | 1.49 | 26.6 | 9.7 | 65.5 | 0.67 | 21.8 | 228.8 |
| 93 | vue-v3.5.39 | 1.30 | 1.93 | 64.3 | 23.3 | 95.8 | 0.86 | 23.9 | 244.3 |
| 94 | dioxus-v0.7.2 | 1.30 | 1.83 | 419.6 | 114.9 | 536.9 | 0.76 | 23.6 | 251.0 |
| 95 | sycamore-v0.9.0-beta.2 | 1.31 | 1.24 | 157.5 | 47.2 | 215.3 | 0.64 | 24.6 | 260.2 |
| 102 | leptos-v0.7.0 | 1.32 | 1.46 | 189.6 | 48.8 | 236.4 | 0.64 | 25.0 | 262.8 |
| 139 | angular-cf-new-nozone-v22.2.2 | 1.52 | 2.30 | 108.9 | 33.2 | 139.3 | 1.13 | 33.0 | 288.9 |
| 144 | yew-v0.23.0 | 1.54 | 1.47 | 202.3 | 56.8 | 259.8 | 0.73 | 30.9 | 316.0 |
| 147 | react-hooks-v19.2.0 | 1.56 | 2.64 | 190.3 | 51.4 | 228.1 | 1.18 | 24.7 | 344.6 |
| 157 | react-compiler-hooks-v19.0.0 | 1.61 | 2.65 | 183.0 | 50.0 | 223.6 | 1.16 | 25.0 | 347.1 |

- No framework named "tanstack" exists in the result set (grep of parsed results = 0 hits) — [results.ts](https://github.com/krausest/js-framework-benchmark/blob/master/webdriver-ts-results/src/results.ts)
- Dioxus README claims "Build WebApps weighing less than 50kb and desktop/mobile apps less than 5mb" (linking a minimal `tiny-dioxus` demo) — [DioxusLabs/dioxus README](https://github.com/DioxusLabs/dioxus/blob/main/README.md)
- Leptos islands book: hello-world "24kb of WASM (uncompressed), compared to 274kb in non-islands mode"; a single HomePage island "166kb uncompressed in release mode" vs 355kb fully hydrated; tabs demo "about 200kb uncompressed" vs "over 400kb"; summary "50% WASM binary size reduction" — [book.leptos.dev/islands](https://book.leptos.dev/islands.html)
- Anecdotal third-party: a personal dashboard measured 210 KB (Dioxus), 180 KB (Yew), 86 KB (Leptos) gzip release — [pistack.xyz 2026-08-29](https://www.pistack.xyz/posts/2026-08-29-dioxus-vs-yew-vs-leptos-rust-wasm-frameworks-comparison/) (single unverified blog; no build settings given)
- Dioxus 0.7 added `#[wasm_split]` per-route code splitting; the official post gives no size figures — [Dioxus 0.7 release post](https://dioxuslabs.com/blog/release-070)

### Inferences
- CPU: Dioxus and Leptos differ by ~1.5% geomean, inside run-to-run noise; both are ~17% faster than React 19 hooks and ~14% slower than Solid 1.9. Memory: Leptos (1.46) beats Dioxus (1.83) and React (2.64).
- The dominant cost of Rust/WASM in this benchmark is payload and first paint: Dioxus first-paint 537 ms vs Leptos 236 ms vs Solid 54 ms. Dioxus' 115 kB gz is 2.4x Leptos' 49 kB gz for the same benchmark app. For an SEO content site the WASM payload matters more than keyed-row CPU; islands (Leptos) is the lever that keeps it under control.
- TanStack Start with React inherits React 19's 1.56 geomean and 51 kB gz runtime; with Solid Start (`@tanstack/solid-start`) it would inherit Solid's 1.14 / 4.5 kB gz. Those are the only "TanStack" numbers available.

### Gaps
- No krausest entry for Leptos 0.8.x; the 0.7.0 entry uses `nightly` + `delegation`. Leptos 0.8/0.9 have not been re-measured publicly.
- No official Leptos-vs-Dioxus WASM size benchmark on an identical real app; the 86 vs 210 kB number is a single blog.
- The krausest startup set in Chrome 156 is reduced to size-uncompressed / size-compressed / first-paint (TBT / script bootup columns are not in the current results.ts).

## Q2. SSR/SSG/islands for SEO on thousands of fr/en/ja pages: Leptos vs dioxus-fullstack vs TanStack Start on Bun

### Takeaway
Leptos has the most complete rendering matrix for a content site: five `SsrMode`s (out-of-order streaming default, partially blocked, in-order, async, `Static(StaticRoute)` with regeneration), islands with an islands router, and a 24 kB WASM floor. Dioxus fullstack has SSR + out-of-order streaming + incremental rendering + `dx bundle --web --ssg`, but no islands/partial hydration (the only PR, #1758, was closed unmerged). TanStack Start 1.0 (stable 2026-10-13) has SSR, selective SSR, SPA mode, prerendering with `crawlLinks`, and sitemap generation; it runs on Bun via Vite/Nitro but remains a TypeScript + Vite 8/Rsbuild toolchain.

### Cited Findings
Leptos
- Rendering modes: "Leptos supports all the major ways of rendering HTML that includes asynchronous data: Synchronous Rendering, Async Rendering, In-Order streaming, Out-of-Order Streaming (and a partially-blocked variant)"; per-route `ssr=SsrMode::Async` to "set the title and metadata after loading the data" — [Leptos book, SSR modes](https://github.com/leptos-rs/book/blob/main/src/ssr/23_ssr_modes.md)
- `pub enum SsrMode { #[default] OutOfOrder, PartiallyBlocked, InOrder, Async, Static(StaticRoute) }` — [leptos_router ssr_mode.rs](https://github.com/leptos-rs/leptos/blob/main/router/src/ssr_mode.rs); `static_routes` module exposes `StaticRoute`, `StaticParamsMap`, `RegenerationFn` ("A function that defines when a statically-generated page should be regenerated") — [docs.rs leptos_router::static_routes](https://docs.rs/leptos_router/latest/leptos_router/static_routes/index.html); example `examples/static_routing` "generate the HTML content for some routes before a request" — [leptos repo](https://github.com/leptos-rs/leptos/blob/main/examples/static_routing/README.md)
- Islands: "Only code for what's inside this `<leptos-island>` is compiled to WASM"; islands router adds "a small amount of JavaScript on the frontend to fetch new server-rendered pages" with link and form navigation; guidance "Ideally, you don't want to slap an `#[island]` around a whole chunk of your page" — [book.leptos.dev/islands](https://book.leptos.dev/islands.html); enable with `features = ["islands"]`, `hydrate_islands()`, `<HydrationScripts options islands=true/>` — [book islands.md](https://github.com/leptos-rs/book/blob/main/src/islands.md)
- Islands router landed in 0.8 (PR #3502) with `islands_router` example; 0.8.0 also introduced `--cfg=erase_components` compile-time mode — [leptos v0.8.0 release](https://github.com/leptos-rs/leptos/releases/tag/v0.8.0); 0.9.0-rc1 continues islands fixes ("Island state is disposed when the islands router removes the island", hydration scripts sent once), moves lazy-loading behind a `lazy` feature that "saves binary size", enforces server-fn body limits ("Axum defaults to 2 megabytes") — [v0.9.0-rc1](https://github.com/leptos-rs/leptos/releases/tag/v0.9.0-rc1); recent merged islands fixes #4953 (2026-10-18), #4939 (2026-10-15) — [leptos PR #4953](https://github.com/leptos-rs/leptos/pull/4953)
- Toolchain: cargo-leptos does "automatic recompilation of client and server code, wasm optimisation, CSS minification"; `cargo leptos build --release` yields server binary + `target/site` — [SSR_NOTES.md](https://github.com/leptos-rs/leptos/blob/main/examples/SSR_NOTES.md)

Dioxus
- "Dioxus Fullstack allows you to render your app on the server ... improving your site's discoverability for search engines"; `ServeConfig::builder().enable_out_of_order_streaming()`; incremental rendering via `IncrementalRendererConfig` with `static_dir` — [dioxuslabs.com/learn/0.7](https://dioxuslabs.com/learn/0.7/llms-full.txt)
- SSG: "The CLI looks for a server function at the endpoint `"static_routes"` that returns a list of all static urls. It will call this server function at build time and pre-render all of the routes"; "bundle your site with `dx bundle --web --ssg`" — [dioxuslabs.com/learn/0.7](https://dioxuslabs.com/learn/0.7/llms-full.txt)
- Islands/partial hydration: PR #1758 "Partial hydration" closed 2024-07-24, `merged: false`; no other open islands issue found — [DioxusLabs/dioxus#1758](https://github.com/DioxusLabs/dioxus/pull/1758)
- 0.7 (2025-09-08): server functions "built on Axum and support websockets, server-sent events, streaming, and typed forms"; "over 350 pull requests merged" — [Dioxus 0.7 post](https://dioxuslabs.com/blog/release-070); 0.8.0-alpha.3 (2026-10-16): axum-server 0.8, h2 DoS fix, rustls `ring` provider installed by `dioxus::launch`, known issue "`dx components` fails with 'there is no TLS stream available'" — [v0.8.0-alpha.3](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.3)

TanStack Start
- "TanStack Start 1.0 is finally stable." dated Tuesday, October 13, 2026; RSC was built then "I decided to stop using it on tanstack.com"; "we support Rsbuild too"; Solid support exists ("Supporting Solid will teach you pretty quickly" which code assumes React) — [tanstack.com/blog/tanstack-start-1-0](https://tanstack.com/blog/tanstack-start-1-0); RC was 2025-09-23 — [announcing-tanstack-start-v1](https://tanstack.com/blog/announcing-tanstack-start-v1)
- Third-party: 1.0 "requires Vite 8", `@tanstack/react-start` 1.168.61 is the last Vite 7 release; CVE-2026-102989 fix — [Appwrite blog](https://appwrite.io/blog/post/tanstack-start-stable-appwrite-sites); official blog index lists a security advisory dated Oct 13, 2026 for a reflected XSS (CVE-2026-102989) — [tanstack.com/start blog index](https://tanstack.com/start/v1/docs/blog)
- Prerendering: `tanstackStart({ prerender: { enabled, crawlLinks: true, concurrency: 14, autoStaticPathsDiscovery, filter, retryCount, failOnError, onSuccess }, pages: [...] })`; "When `crawlLinks` is enabled (default: true), TanStack Start will extract links from prerendered pages and prerender those linked pages as well"; `sitemap: { enabled: true, host }`; SPA mode `spa: { enabled: true }` — [TanStack Start static-prerendering / seo / spa-mode guides](https://tanstack.com/start/latest/docs/framework/react/guide/static-prerendering)
- Hosting page lists Cloudflare Workers, Netlify, Railway, Nitro, Vercel, Node.js/Docker, Bun, Appwrite; "Currently, the Bun specific deployment guidelines only work with React 19"; Nitro is "an agnostic layer that allows you to deploy TanStack Start applications"; Start "supports Vite and Rsbuild" — [hosting guide](https://tanstack.com/start/latest/docs/framework/react/guide/hosting)
- Bun's official guide: "prefix the Vite CLI commands with `bun --bun` so that Bun runs the Vite CLI for dev, build, and preview"; `nitro({ preset: "bun" })` is optional; production `bun run .output/server/index.mjs` or custom `server.ts` with `Bun.serve`, `Bun.file`, `Bun.gzipSync` — [bun.sh/guides/ecosystem/tanstack-start](https://bun.sh/guides/ecosystem/tanstack-start)
- Known Bun friction: HMR under Bun taking "2 to 10 minutes" (Bun 1.2/1.3) — [TanStack/router#6034](https://github.com/TanStack/router/issues/6034); Nitro bun preset breaks on Vercel (Bun 1.3.2) — [nitrojs/nitro#3806](https://github.com/nitrojs/nitro/issues/3806); Vite 8 dev middleware regression — [TanStack/router#7614](https://github.com/TanStack/router/issues/7614)

i18n
- `leptos_i18n` "loads locales at compile time and provides compile time checks for translation keys, interpolation keys and the selected locale" — [Baptistemontan/leptos_i18n](https://github.com/Baptistemontan/leptos_i18n); `leptos-fluent` uses Fluent `.ftl`, multiple contexts, more locale-detection strategies than leptos_i18n (maintainer's own comparison) — [mondeja.github.io/leptos-fluent](https://mondeja.github.io/leptos-fluent)
- `dioxus-i18n`: "Dioxus internationalization powered by Project Fluent", supports Dioxus v0.7, loads resources from filesystem on native targets, compiles for wasm32 — [dioxus-community/dioxus-i18n](https://github.com/dioxus-community/dioxus-i18n)

SSR throughput
- Leptos+Axum SSR load test: "about 10x more requests per second than a JS version on the same hardware ... a good portion of this comes from how performant Axum is" (author: no optimisations on either) — [benw.is Full Stack Rust with Leptos](https://benw.is/posts/full-stack-rust-with-leptos) (direct fetch returned only the page shell; figures via search snippet)
- Informal Leptos(Actix) vs React/Fastify: Node ~38 rps vs Leptos "hundreds", ~15x at 300 connections, single Linode — [ThePrimeagen video summary](https://rosetta.to/u/theprimeagen/react-is-this-fast)
- Bun 1.2.0 ~58,000 rps vs Node 22 ~30,000 rps on a bare HTTP server (not SSR) — [dev.to Deno vs Bun vs Node](https://dev.to/yogeshhrathod/deno-vs-bun-vs-nodejs-performance-benchmarks-3e1n)
- Axum maintainers: framework benchmarks "are optimized in all sorts of unrealistic ways and rarely represent real world performance" — [tokio-rs/axum discussion #2566](https://github.com/tokio-rs/axum/discussions/2566)

### Inferences
- For thousands of wiki/databook/manga pages in 3 locales: Leptos `SsrMode::Static` + `RegenerationFn` gives ISR-like behaviour natively, and islands keep interactive bits (reader controls, search box, editor) as small WASM; Dioxus can SSG/ISR but every page with any interactivity hydrates the whole app WASM (115 kB gz in krausest, 420 kB raw).
- TanStack Start's prerender crawler (concurrency 14) is adequate for thousands of pages but is a Vite build step, i.e. a JS toolchain under Bun; SSR throughput then is React streaming SSR on Bun, with no public measurement comparable to Axum.
- No controlled Leptos+Axum vs Bun-SSR benchmark exists; the defensible statement is: Axum raw HTTP is top-tier; Bun raw HTTP is ~2x Node; React SSR render cost dominates on the JS side.

### Gaps
- No same-hardware SSR benchmark Leptos/Axum vs TanStack Start on Bun; TechEmpower Round 23 Fortunes numbers for axum vs Bun not retrieved (JS-rendered site; search produced no numbers).
- Dioxus docs returned 404 for the standalone SSG guide URL; content taken from the 0.7 llms-full.txt mirror.
- benw.is post body could not be fetched directly (figures from search snippet only).

## Q3. Native desktop/mobile

### Takeaway
Only Dioxus ships first-party desktop (webview or experimental WGPU), iOS/Android webview, and a GPU-native renderer; Leptos reaches desktop/mobile only through Tauri (community templates; SSR requires a sidecar); TanStack Start reaches them only through Tauri/Capacitor-style webviews.

### Cited Findings
- Dioxus features: "`web`, `desktop`, `mobile` (ios + android webview), `server` (axum + server-side-rendering), `liveview`, `native` (wgpu + winit renderer)"; "If 'desktop' and 'native' are enabled, then the native renderer will be used" — [dioxus launch.rs](https://github.com/dioxuslabs/dioxus/blob/main/packages/dioxus/src/launch.rs); desktop "Portable <3mb binaries", "Render using Webview or - experimentally - with WGPU or Freya (Skia)", "`dx serve --platform android`" — [Dioxus README](https://github.com/DioxusLabs/dioxus/blob/main/README.md)
- Dioxus 0.7 Subsecond hot-patching covers "Web (WASM), Desktop (macOS, Linux, Windows), iOS, and Android" — [Dioxus 0.7 post](https://dioxuslabs.com/blog/release-070); 0.8-alpha.3: tao 0.37 / wry 0.57, Windows 7 dropped — [v0.8.0-alpha.3](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.3)
- Leptos + Tauri: community templates only, e.g. "csr and ssr leptos with tauri for ios/android/windows/macos/linux" (Alt-iOS), and "Leptos SSR runs embedded as external binary (sidecar) on tauri" (codeitlikemiley/tauri-leptos-ssr); `create-tauri-app` lists Leptos as a template — [tauri-leptos-ssr listing](https://awesome.ecosyste.ms/projects/github.com%2Fcodeitlikemiley%2Ftauri-leptos-ssr), [Alt-iOS template](https://relatedrepos.com/gh/Alt-iOS/tailwind-leptos-tauri-template)
- Tauri: "Build smaller, faster, and more secure desktop and mobile applications with a web frontend", 112.5k stars — [tauri-apps/tauri](https://github.com/tauri-apps/tauri)

### Inferences
- Leptos-in-Tauri is a CSR WASM app inside a system webview, the same deployment shape as TanStack-in-Tauri; neither has GPU-native rendering. Dioxus is the only option where the same RSX runs through a non-browser renderer.

### Gaps
- No official Leptos mobile guide; the Tauri templates are unofficial and their currency vs Leptos 0.8 was not verified.

## Q4. Integration with a wgpu/WebGPU canvas renderer and Taffy layout

### Takeaway
Dioxus owns Taffy and Blitz (Stylo + Taffy + Parley + Vello on wgpu, AccessKit via blitz-shell), so a Dioxus app can be composed with a wgpu scene natively; Leptos and TanStack can only host a `<canvas>` driven by wgpu-on-WebGPU (wgpu compiled to wasm) or a JS WebGPU context, with Taffy usable in Rust (Leptos) but with no DOM integration.

### Cited Findings
- Blitz "uses Taffy for flexbox layout, Stylo for CSS resolution, and Vello as the GPU renderer"; "We have not focused on performance"; Blitz "still very young" — [Dioxus 0.7 post](https://dioxuslabs.com/blog/release-070); Blitz README: "Blitz is currently in a beta state", goal "Accessibility using AccessKit", blitz-shell "integrates a Winit event loop, AccessKit, Muda" — [DioxusLabs/blitz](https://github.com/DioxusLabs/blitz); dioxus-native `accessibility` feature "Enables accesskit accessibility support" — [docs.rs dioxus-native](https://docs.rs/crate/dioxus-native/latest)
- Dioxus renderer architecture: "Blitz layout engine for CSS layout; Vello for GPU-accelerated vector rendering; Winit for cross-platform window management; Not a browser engine" — [notes/architecture/06-RENDERERS.md](https://github.com/dioxuslabs/dioxus/blob/main/notes/architecture/06-RENDERERS.md); README: "Embed Dioxus in Bevy, WGPU, or even run on embedded Linux!" — [Dioxus README](https://github.com/DioxusLabs/dioxus/blob/main/README.md)
- Taffy: DioxusLabs/taffy, 3,732 stars, crate 0.15.1 (2026-10-25), 18.7M downloads — [gh api](https://github.com/DioxusLabs/taffy), [crates.io](https://crates.io/api/v1/crates/taffy)
- wgpu "runs natively on Vulkan, Metal, D3D12, and OpenGL; and on top of WebGL2 and WebGPU on wasm" — [gfx-rs/wgpu README](https://github.com/gfx-rs/wgpu/blob/main/README.md)
- Dioxus 0.8-alpha.3 native: "Mutations are now buffered and applied after the VirtualDOM runs, as on web and desktop"; blitz 0.3.0-beta.4 — [v0.8.0-alpha.3](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.3)

### Inferences
- In the browser all three are equal: a manga-reader canvas is a `<canvas>` + wgpu (Rust/WASM) or WebGPU JS context regardless of framework; Leptos and Dioxus share the wgpu crate in-process with no JS bridge, TanStack would need a JS<->WASM boundary.
- Taffy 0.15 as a layout engine for canvas-drawn UI is framework-agnostic Rust; only Dioxus Native uses it as the layout engine of the UI tree itself.

### Gaps
- No published performance numbers for Dioxus Native/Blitz (the team states it has not focused on performance); CSS support matrix at blitz.is/status/css was not fetched.

## Q5. Reactivity model: Leptos 0.8 signals vs Dioxus 0.7 VirtualDOM + signals

### Takeaway
Leptos components run once and return real DOM nodes wired to fine-grained effects (no VDOM); Dioxus uses signals to mark components dirty and re-runs the component function, diffing the VirtualDom into mutations. In krausest this yields equal CPU (1.30 vs 1.32) but lower memory for Leptos (1.46 vs 1.83).

### Cited Findings
- Leptos: "Components run once, creating (and returning) actual DOM nodes and setting up a reactive system to update those DOM nodes"; on Dioxus: "While Dioxus has a performant virtual DOM (VDOM), it still uses coarse-grained/component-scoped reactivity: changing a stateful value reruns the component function and diffs the old UI against the new one" — [Leptos README](https://github.com/leptos-rs/leptos/blob/main/README.md); the renderer "essentially creates an effect wrapping this update" per text node — [book 14_create_effect.md](https://github.com/leptos-rs/book/blob/main/src/reactivity/14_create_effect.md)
- Dioxus: "Because signal is never read in this component, this component will not rerun when the signal changes ... This component does read from the signal, so when the signal changes it will rerun"; memos "will only rerun values/component that depend on them if the value of the memo changes" — [dioxus signals README](https://github.com/dioxuslabs/dioxus/blob/main/packages/signals/README.md), [hooks derived_state.md](https://github.com/dioxuslabs/dioxus/blob/main/packages/hooks/docs/derived_state.md); 0.7 added "Stores primitive for nested reactive state" — [Dioxus 0.7 post](https://dioxuslabs.com/blog/release-070)
- Leptos 0.9-rc1: "Signal read calls with function syntax now work on stable Rust"; some `Signal<T>` trait impls changed (`foo=*signal`) — [v0.9.0-rc1](https://github.com/leptos-rs/leptos/releases/tag/v0.9.0-rc1)
- Compile-time: cargo-leptos "erased components mode ... optimizes for compile speed, at the cost of a runtime/binary size overhead per component", default for debug builds only — [cargo-leptos README](https://github.com/leptos-rs/cargo-leptos); Dioxus "Subsecond Rust hot-patching", "`dx serve --hotpatch`" experimental; Subsecond "does not automatically migrate your state for you when you add or remove a struct field" — [Dioxus README](https://github.com/DioxusLabs/dioxus/blob/main/README.md), [v0.7.0-alpha.0](https://github.com/dioxuslabs/dioxus/releases/tag/v0.7.0-alpha.0)
- A developer on a ~20k-line Leptos project found backend rebuilds "almost 95% link time" and hot-reload "didn't make a perceptible impact" — [bitemyapp: rebuilding rust leptos quickly](https://bitemyapp.com/blog/rebuilding-rust-leptos-quickly)

### Inferences
- Dioxus' hot-patching is the stronger inner-loop DX story; Leptos' erase_components addresses compile time but not link time. Neither project publishes build-time figures.

### Gaps
- No published wall-clock build times for comparable apps in either framework.

## Q6. UI component ecosystem without Tailwind, accessibility

### Takeaway
Both Rust ecosystems are thin. Leptos: thaw (Fluent-design, Leptos 0.8 on main, last push 2026-05), leptonic (0.5.0 from 2024-02, repo still pushed 2026-10), leptos-use (0.20.0, active). Dioxus: dioxus-primitives/dioxus-components (unstyled, "accessible", shadcn-style styled layer, 355 stars, active). None depends on Tailwind at the primitive level; Dioxus' styled layer is explicitly shadcn-inspired (conflicts with the ban on shadcn aesthetics, not a hard dependency). Accessibility for web targets is plain HTML/ARIA in all three; only Dioxus Native has an AccessKit tree.

### Cited Findings
- thaw: "A UI component based on Fluent Design and Leptos"; compatibility table "0.5-beta / main branch -> Leptos 0.8" — [thaw-ui/thaw README](https://github.com/thaw-ui/thaw); crate `thaw` 0.4.8 (2025-08-03), repo 614 stars, last push 2026-05-07 — [crates.io](https://crates.io/api/v1/crates/thaw), [gh api](https://github.com/thaw-ui/thaw)
- leptonic: "Component library for the Leptos framework", SSR and tailwind templates; crate 0.5.0 (2024-02-01), 302 stars, push 2026-10-22 — [lpotthast/leptonic](https://github.com/lpotthast/leptonic)
- leptos-use: "Collection of essential Leptos utilities inspired by React-Use / VueUse", 0.20.0 (2026-10-20), 1.56M downloads — [Synphonyte/leptos-use](https://github.com/Synphonyte/leptos-use)
- Dioxus Components: "a shadcn style component library for Dioxus built on top of the unstyled Dioxus primitives library. The unstyled primitives serve as the foundation for building accessible and customizable UI components" — [DioxusLabs/components README](https://github.com/DioxusLabs/components); "Dioxus Primitives implements 28 foundational components" — [Dioxus 0.7 post](https://dioxuslabs.com/blog/release-070)
- Dioxus README: "Dioxus apps are styled with HTML and CSS. Use the built-in TailwindCSS support or load your favorite CSS library" (Tailwind optional) — [Dioxus README](https://github.com/DioxusLabs/dioxus/blob/main/README.md)
- AccessKit via blitz-shell / `accessibility` feature (see Q4) — [docs.rs dioxus-native](https://docs.rs/crate/dioxus-native/latest)

### Inferences
- With a custom HCT/CAM16 design system and Phosphor vectors, the consumer will author its own components anyway; the deciding factor is primitives quality (focus management, keyboard, ARIA). Dioxus primitives are the only Rust set explicitly built around accessibility; for Leptos the team would build on raw HTML + leptos-use.

### Gaps
- No audit of ARIA/keyboard coverage for thaw, leptonic or dioxus-primitives was found.

## Verdict

### Takeaway
Pick Leptos 0.8 (migrate to 0.9 on release) with cargo-leptos + Axum for dragonballfr.com. Use Dioxus only if a GPU-native desktop/mobile app or a Blitz/Taffy-rendered surface is a hard requirement, accepting no islands and a 2.4x larger WASM payload. TanStack Start on Bun is viable technically but violates the "pure Rust + Bun" doctrine (TypeScript, Vite 8/Rsbuild, Nitro, React 19) and its only quantified advantage (Solid variant's 4.5 kB runtime) comes with the least mature Start flavour.

### Cited Findings
- Leptos: islands cut WASM to a 24 kB floor / "50% WASM binary size reduction" — [book.leptos.dev/islands](https://book.leptos.dev/islands.html); five SSR modes incl. `Static(StaticRoute)` + `RegenerationFn` — [ssr_mode.rs](https://github.com/leptos-rs/leptos/blob/main/router/src/ssr_mode.rs), [docs.rs static_routes](https://docs.rs/leptos_router/latest/leptos_router/static_routes/index.html); CPU 1.32 / memory 1.46 / 48.8 kB gz in krausest Chrome 156 — [results.ts](https://github.com/krausest/js-framework-benchmark/blob/master/webdriver-ts-results/src/results.ts); 182 commits/90d, 0.8.23 + 0.9.0-rc1 on 2026-10-31 — [gh api](https://github.com/leptos-rs/leptos/releases)
- Dioxus: CPU 1.30 / memory 1.83 / 114.9 kB gz / first paint 537 ms — [results.ts](https://github.com/krausest/js-framework-benchmark/blob/master/webdriver-ts-results/src/results.ts); partial hydration PR closed unmerged — [#1758](https://github.com/DioxusLabs/dioxus/pull/1758); native renderer "experimental", Blitz "beta", "We have not focused on performance" — [README](https://github.com/DioxusLabs/dioxus/blob/main/README.md), [0.7 post](https://dioxuslabs.com/blog/release-070); stable 0.7.10 since 2026-07-30, 0.8 alpha — [releases](https://github.com/DioxusLabs/dioxus/releases)
- TanStack Start: stable 2026-10-13 — [blog](https://tanstack.com/blog/tanstack-start-1-0); requires `vite` or `@rsbuild/core` as peer deps — [npm](https://registry.npmjs.org/@tanstack/react-start/latest); Bun path is `bun --bun vite build` + Nitro `bun` preset or custom `Bun.serve` server — [bun.sh guide](https://bun.sh/guides/ecosystem/tanstack-start); Bun-only guidelines need React 19 — [hosting](https://tanstack.com/start/latest/docs/framework/react/guide/hosting); HMR-under-Bun regression report — [#6034](https://github.com/TanStack/router/issues/6034); CVE-2026-102989 reflected XSS, Oct 2026 — [blog index](https://tanstack.com/start/v1/docs/blog)

### Inferences
- Architecture for Shenron on Leptos: Axum server (shares the Rust backend), `SsrMode::Static` + regeneration for wiki/databook/manga chapter pages per locale (fr/en/ja URL prefixes via leptos_router), out-of-order streaming for search/admin, islands for reader controls/comments/editor widgets, full `hydrate` mode only for the admin/editor SPA shell; `leptos_i18n` (compile-time key checking, fits a three-locale content site; leptos-fluent if ICU plural/gender rules in ja/fr matter more). wgpu/Taffy stay in Rust crates shared with any future Dioxus Native or Bevy surface.
- Where TanStack still makes sense: (a) a Bun-side admin tool or internal dashboard where the team already has TypeScript components and wants TanStack Query/Router without SSR, run as `bun --bun vite build` + `Bun.serve`; (b) TanStack Query alone as a client cache inside any Bun TSX surface. It should not be the SEO frontend for thousands of pages in a Node-free, Rust-first stack.
- Where Dioxus still makes sense: a companion desktop/mobile reader app (webview or Blitz) sharing Rust domain crates with the Leptos site; not the SEO web frontend because of payload and missing islands.

### Gaps
- No benchmark of Leptos 0.8/0.9 islands on a real content site at scale; the 24-200 kB figures are the book's demos.
- Bun-native (non-Vite) SSR for TanStack Start does not exist; "runs on Bun" always means Vite/Rsbuild building and a Nitro or hand-written `Bun.serve` runtime.
