# DioxusLabs ecosystem (state as of 2026-11-04) — candidate for a pure-Rust rebuild of a large content site + desktop/mobile tooling

Scope: Dioxus 0.7.x / 0.8 alpha, dioxus-fullstack (SSR/SSG/streaming/SEO), Blitz / dioxus-native, anyrender + Vello/wgpu, dioxus-components (dioxus-primitives), dioxus-cli (hot-patching, bundling, WASM size), Taffy 0.15, Parley, project health/funding. Primary sources: GitHub REST API via `gh` (DioxusLabs/dioxus, blitz, taffy, components, anyrender, docsite; linebender/parley, vello; krausest/js-framework-benchmark), dioxuslabs.com, blitz.is, crates.io API. Items older than 2026 are marked.

## Key Question 0 — Project health: versions, cadence, stars, contributors, funding (Dioxus / Blitz / Taffy / anyrender)

### Takeaway

Dioxus is a 39.6k-star, 460+-contributor project with a stable 0.7.x line (0.7.0 on 2025-10-31, last patch 0.7.10 on 2026-07-30) and an active 0.8 alpha series (alpha.3 on 2026-10-16). In September 2026 the whole Dioxus Labs team was hired by Cognition (Devin); the stated effect is that Dioxus/Blitz/Taffy/Subsecond continue as open source without monetization pressure, with Nico Burns full time on Blitz/Dioxus. This is a sustainability positive but also a single-sponsor dependency.

### Cited Findings

- DioxusLabs/dioxus: 39,598 stars, 1,958 forks, 896 open issues+PRs (671 issues / 225 PRs), Apache-2.0, last push 2026-11-03 — [GitHub API repos/DioxusLabs/dioxus](https://api.github.com/repos/DioxusLabs/dioxus); issue/PR split from [GitHub search API](https://api.github.com/search/issues?q=repo:DioxusLabs/dioxus+is:issue+is:open)
- Contributors (incl. anonymous) paginate to 463 entries — [GitHub API contributors Link header](https://api.github.com/repos/DioxusLabs/dioxus/contributors?per_page=1&anon=true)
- Release timeline (published_at): v0.7.0 2025-10-31; v0.7.1 2025-11-06; v0.7.2 2025-12-05; v0.7.3 2026-01-17; v0.7.4 2026-03-28; v0.7.5 2026-04-06; v0.7.6 2026-04-22; v0.7.7 2026-05-01; v0.7.8 2026-05-07; v0.7.9 2026-05-08; v0.7.10 2026-07-30; v0.8.0-alpha.0 2026-05-19; alpha.1 2026-07-31; alpha.2 2026-10-14; alpha.3 2026-10-16 — [GitHub API releases](https://api.github.com/repos/DioxusLabs/dioxus/releases)
- The dioxuslabs.com blog dates the 0.7 announcement "Sep 8, 2025" (likely the RC/announcement date) while the GitHub v0.7.0 tag was published 2025-10-31; the blog says "over 350 pull requests merged" for 0.7 — [Dioxus 0.7 blog](https://dioxuslabs.com/blog/release-070); [GitHub releases](https://api.github.com/repos/DioxusLabs/dioxus/releases)
- crates.io `dioxus`: max_stable 0.7.10, max 0.8.0-alpha.3, 3,531,279 total downloads, 1,331,910 recent (90-day) downloads — [crates.io API](https://crates.io/api/v1/crates/dioxus)
- DioxusLabs/blitz: 4,341 stars, 260 forks, 370 open issues+PRs (104 open issues), Apache-2.0 (dual MIT), pushed 2026-11-04; description "A radically modular HTML/CSS rendering engine" — [GitHub API](https://api.github.com/repos/DioxusLabs/blitz)
- Blitz tags (annotated-tag dates): v0.1.0 2025-08-29; v0.2.0 2025-10-06; v0.3.0-beta.1 2026-07-10; v0.3.0-beta.3 2026-10-12; v0.3.0-beta.4 2026-10-16. Blitz publishes no GitHub Releases (release list empty) — [GitHub git/tags API](https://api.github.com/repos/DioxusLabs/blitz/tags)
- DioxusLabs/taffy: 3,732 stars, 271 forks, 189 open, MIT; v0.15.0 2026-10-17, v0.15.1 2026-10-25, v0.14.0 2026-08-24, v0.13.0 2026-08-08, v0.12.0 2026-07-03, v0.11.0 2026-06-12 — [GitHub API](https://api.github.com/repos/DioxusLabs/taffy/releases)
- DioxusLabs/components (repo renamed `dioxus-components`): 355 stars, 92 forks, 51 open, pushed 2026-10-24, no tags/releases; crates.io `dioxus-primitives` only has 0.0.0 (2025-04-13, 1,769 downloads) — distribution is via `dx components add` copying source, not crates.io — [GitHub API](https://api.github.com/repos/DioxusLabs/components); [crates.io API](https://crates.io/api/v1/crates/dioxus-primitives)
- DioxusLabs/anyrender: 118 stars, Apache/MIT; releases 0.6 through 0.13 all published 2026-08-16 (backfilled), README already documents a 0.14 line — [GitHub API](https://api.github.com/repos/DioxusLabs/anyrender/releases); [README](https://github.com/DioxusLabs/anyrender)
- DioxusLabs/stylo is a 4-star fork mirror of servo/stylo (Blitz pins `stylo` 0.23.0 at a servo/stylo git rev `2dca3459`) — [GitHub API](https://api.github.com/repos/DioxusLabs/stylo); [blitz Cargo.toml](https://github.com/DioxusLabs/blitz/blob/main/Cargo.toml)
- Funding history in README: "Thanks to the generous support of FutureWei, Satellite.im, the GitHub Accelerator program, we're able to work on Dioxus full-time. Our long term goal is for Dioxus to become self-sustaining by providing paid high-quality enterprise tools." (text predates 2026) — [dioxus README](https://github.com/DioxusLabs/dioxus/blob/main/README.md)
- 2026-09-10: "Dioxus Labs is joining Cognition" (author Jonathan Kelley). Team raised $3.5M venture funding (Y Combinator, Khosla Ventures named; Futurewei thanked as champion). "Nico Burns, lead engineer on Blitz, will be devoted full time to maintaining and improving Dioxus." Team will "invest heavily in Dioxus-Native and Blitz"; Cloudflare "recently used Blitz as the core engine of its new agentic web browser"; the Devin CLI terminal renderer is built with Dioxus; acquisition removes "financial pressure" to monetize — [dioxuslabs.com/blog/joining-cognition](https://dioxuslabs.com/blog/joining-cognition); corroborated by [Unite.ai](https://www.unite.ai/cognition-adds-dioxus-team-to-advance-devin-coding-agent/)
- Older third-party funding data (CB Insights: $500K across 3 rounds, Pioneer Fund, latest July 2023) conflicts with the $3.5M figure in the primary source; treat aggregator data as stale — [CB Insights](https://www.cbinsights.com/company/dioxus-labs/financials) vs [joining-cognition](https://dioxuslabs.com/blog/joining-cognition)
- Release engineering is now driven largely by nicoburns (alpha.3 lists ~25 PRs, nearly all by nicoburns) — [v0.8.0-alpha.3 notes](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.3)

### Inferences

- Cadence: 0.7 patch releases roughly monthly through mid-2026, then effort shifted to 0.8 alphas; no 0.8 stable or RC as of 2026-11-04, and no blog post for 0.8 exists yet.
- Blitz is still "beta" by its own label and ships only via crates.io version bumps synced into Dioxus alphas; it is not a standalone 1.0 product.
- Bus factor: core maintenance (Dioxus, Blitz, Taffy, Parley) concentrates on a few Cognition employees; the project is funded by an AI company whose core product is not a GUI framework.

### Gaps

- Exact team headcount at Cognition not disclosed.
- No written governance/licensing commitments beyond "we will keep maintaining"; no foundation or multi-vendor steering.
- Could not confirm the Blitz talk at RustWeek 2026 (referenced in alpha.0 notes) via search.

## Key Question 1 — dioxus-fullstack: SSR/SSG/ISR-like generation, streaming, head/SEO; can it replace a Next.js 16 app serving thousands of localized pages?

### Takeaway

dioxus-fullstack (Axum-based) provides SSR + hydration, server functions with HTTP routing attributes, out-of-order HTML streaming, an incremental renderer (file + memory cache with `invalidate_after`, i.e. ISR-like), and `dx bundle --web --ssg` static generation driven by a `static_routes` endpoint (static routes only; dynamic segments are excluded). Head management covers `document::Title/Meta/Link/Stylesheet/Script` with the caveat that Meta props are not updated after first render and head tags must be in the first streamed chunk to be seen by crawlers. There is no built-in sitemap generator, no hreflang/i18n routing, no image optimization and no ISR-on-demand revalidation API; those must be hand-built in Axum.

### Cited Findings

- Fullstack feature list (0.7 docs): SSR, server functions, typed routing, multipart forms, binary streams, SSE/WebSockets, asset management, WASM support, bundle splitting, static site generation; "Dioxus Fullstack has no built-in databases, caches, sessions, or mailers" — [learn/0.7/essentials/fullstack](https://dioxuslabs.com/learn/0.7/essentials/fullstack/llms.txt)
- Server functions use HTTP attribute routes, e.g. `#[get("/api/dog/{breed}")] async fn fetch_dog(breed: String) -> Result<String>`, consumed during SSR/hydration via `use_loader(|| fetch_dog(...))?` — [same](https://dioxuslabs.com/learn/0.7/essentials/fullstack/llms.txt)
- 0.7 docs pages that exist for fullstack: authentication, axum, errors, forms, headers, loading, middleware, native, project_setup, publishing, routes, routing, server_functions, ssr, static_site_generation, streaming, streams, websockets — [docsite tree docs-src/0.7/src/essentials/fullstack](https://github.com/DioxusLabs/docsite/tree/main/docs-src/0.7/src/essentials/fullstack)
- Streaming: default mode waits for all suspense boundaries then sends the whole page; `ServeConfig::enable_out_of_order_streaming()` streams chunks per resolved suspense boundary. "When streaming is enabled, all of the contents of the page are still rendered into the html document, so search engines can still crawl and index the full content of the page. However, the content will not be visible to users unless they have JavaScript enabled." — [streaming.md](https://github.com/DioxusLabs/docsite/blob/main/docs-src/0.7/src/essentials/fullstack/streaming.md)
- "Head elements can only be rendered in the initial HTML chunk that contains the `<head>` tag... If you have any head elements that are not included in the first chunk, they will be rendered by the client after hydration instead, which will not be visible to any search engines." Initial chunk is sent after `commit_initial_chunk()` (automatic with the Router once suspense above the router resolves). After commit, HTTP status/headers can no longer change (404 from a server function inside a nested SuspenseBoundary will not reach the response) — [streaming.md](https://github.com/DioxusLabs/docsite/blob/main/docs-src/0.7/src/essentials/fullstack/streaming.md)
- `StreamingMode` enum: Disabled ("all server futures should be resolved before hydrating") or OutOfOrder — [fullstack-server/src/config.rs](https://github.com/DioxusLabs/dioxus/blob/main/packages/fullstack-server/src/config.rs)
- Incremental renderer (ISR-like): `ServeConfig::incremental(IncrementalRendererConfig)` "caches the rendered html in memory and/or the file system"; config methods `clear_cache(bool)` (default true), `map_path(Fn(&str)->PathBuf)`, `static_dir(path)`, memory cache limit, `invalidate_after(Duration)` — [fullstack-server/src/isrg/config.rs](https://github.com/DioxusLabs/dioxus/blob/main/packages/fullstack-server/src/isrg/config.rs); [config.rs](https://github.com/DioxusLabs/dioxus/blob/main/packages/fullstack-server/src/config.rs)
- SSG: "the CLI runs your app locally, queries it for a sitemap, and fetches each page with curl"; output is "a hybrid app: static HTML that loads SPA content". Requires `IncrementalRendererConfig::static_dir(<exe dir>/public).clear_cache(false)` and `enable_out_of_order_streaming()`; a server fn with `endpoint = "static_routes"`, `output = server_fn::codec::Json` returning `Route::static_routes()`; "Any routes with no dynamic segments in your router will be included in the static routes list". Build: `dx bundle --web --ssg` -> `public` folder (HTML + wasm + assets) for any static host. Docs add: for many apps, "Cache-Control headers plus a CDN or reverse proxy may be enough" — [static_site_generation llms.txt](https://dioxuslabs.com/learn/0.7/essentials/fullstack/static_site_generation/llms.txt)
- 0.8 alpha.0 fixed "Respect https for ssg static routes" (#5553); alpha.1 fixed "duplicate SSG output on rebuild" (#5702) and SSR `#[css_module]` stylesheets "missing from the head after the first request" (#5707) — [alpha.0](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.0); [alpha.1](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.1)
- Head API (`dioxus-document`): elements link, meta, script, style, stylesheet, title. `document::Meta` doc: "Any updates to the props after the first render will not be reflected in the head." `document::Title`: web sets `<title>`, desktop sets window title; "can be modified after the first render"; children "must be a single static or formatted string" — [document/src/elements](https://github.com/DioxusLabs/dioxus/tree/main/packages/document/src/elements)
- Hydration internals changed in 0.8 alpha.2: "Dioxus no longer uses comment-node placeholders and markers, either at runtime or during hydration"; `rsx!` expands to a const builder; HTML elements are trait-based (`dioxus::html::define_elements!`); renderer IDs for portals/multi-window — [alpha.2](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.2)
- 0.8 alpha.3 security/ops: rustls 0.23.46, h2 0.4.20 ("DoS against fullstack servers"), reqwest 0.13, axum-server 0.8, axum-extra 0.12; `dioxus::launch` installs ring as rustls provider — [alpha.3](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.3)
- Third-party `dioxus-vercel` 0.1.1 (tested with Dioxus 0.7.10) supports only client-side apps; "static site generation (`dx bundle --ssg`) and fullstack apps with server functions" are unsupported — [docs.rs dioxus-vercel README](https://docs.rs/crate/dioxus-vercel/latest/source/README.md)
- i18n: community crate `dioxus-i18n` (Fluent-based) max version 0.7.0-alpha.1 updated 2026-10-15, 82,307 downloads — [crates.io API](https://crates.io/api/v1/crates/dioxus-i18n). No first-party i18n/hreflang support appears in the 0.7 docs tree — [docsite tree](https://github.com/DioxusLabs/docsite/tree/main/docs-src/0.7/src)
- WASM-split: "`dx` splits apps into chunks per route, loaded on demand via `#[wasm_split("/route")]`" — [Dioxus 0.7 blog](https://dioxuslabs.com/blog/release-070)

### Inferences

- Feature parity vs Next.js 16 for a content site: SSR yes; streaming yes (out-of-order only); ISR partially (time-based `invalidate_after`, file/memory cache; no tag-based or on-demand revalidation API found); SSG yes but only for enumerable static routes — thousands of `/{lang}/{slug}` pages would need either (a) a custom `static_routes` endpoint listing every concrete URL (the doc says dynamic segments are excluded by default, but the endpoint returns `Vec<String>` so a hand-built list may work; unverified), or (b) runtime SSR + incremental cache behind a CDN.
- SEO plumbing missing vs Next: no metadata API with per-locale alternates, no sitemap.xml/robots generators, no `<picture>`/image optimization, no canonical/hreflang helpers — all must be written as Axum handlers. The Meta "no update after first render" rule means per-route meta must be rendered by the page component on the server, not mutated client-side.
- For no-JS crawlers and users, disabling streaming is safer; streaming trades no-JS visibility for TTFB.
- Server side is plain Axum (Rust), so Bun is not needed; but the dx CLI downloads `esbuild` and wasm-bindgen/wasm-opt binaries (alpha.0 mentions `NPM_CONFIG_REGISTRY` for esbuild download) — not Node runtime, but a Node-ecosystem binary is fetched by the CLI.

### Gaps

- Could not fetch ssr.md/hydration.md/routes.md content (base64 decode errors via API); exact `use_server_future`/`use_loader` hydration semantics not quoted.
- No official benchmark of SSR throughput or SSG build time for thousands of pages.
- No documentation found on ISR cache invalidation by key/tag or on `memory_cache_limit` defaults.

## Key Question 2 — Blitz / dioxus-native maturity in 2026 (accessibility, IME, CJK/RTL text, forms, scroll, performance), GPU painting stack, Skia option

### Takeaway

Blitz 0.3.0-beta.4 (2026-10-16) self-describes as "beta": it renders Wikipedia/old Reddit, has flex/grid/block/floats, animations, 2D transforms, filters, text selection, nested documents, overlay scrollbars, basic AccessKit tree and inline text input; but accessibility is explicitly immature (no incremental updates, no ARIA attrs, no a11y events), IME/composition and clipboard events are 1.0 backlog, `<select>` dropdown/range/password inputs are not built in, `overflow:auto` and `unicode-bidi`/inline RTL/`text-orientation` are unsupported, and tables/3D transforms are partial/absent. Painting goes through the anyrender abstraction: default backend `vello-hybrid` (vello_gpu) on wgpu 30, with vello (full compute), vello_cpu, and Skia (skia-safe) as alternative backends.

### Cited Findings

- README status: "Blitz is currently in a **beta** state. It can already render many popular no-JS websites (Wikipedia, (Old) Reddit, etc), and is usable for making apps if you are an early adopter and willing to live on the bleeding edge. But there are also still many bugs and missing features." Goals include "Accessibility using AccessKit", HTML form controls; explicitly no webrtc/websockets/localstorage in the engine — [blitz README](https://github.com/DioxusLabs/blitz/blob/main/README.md)
- Architecture: `blitz-dom` (Stylo CSS, Taffy layout, Parley text), `blitz-html` (html5ever/xml5ever), `blitz-net` (reqwest), `blitz-paint` (-> anyrender), `blitz-shell` (winit + AccessKit + muda), `dioxus-native` / `dioxus-native-dom` wrappers, plus `stylo_taffy`, `accesskit_xplat`, `blitz-vibey-script` (new package) — [README](https://github.com/DioxusLabs/blitz/blob/main/README.md); [packages dir](https://github.com/DioxusLabs/blitz/tree/main/packages)
- Pinned stack (blitz main, 0.3.0-beta.4): rust-version 1.91; `stylo` 0.23.0 (servo git rev), `selectors` 0.42, `cssparser` 0.38, `html5ever` 0.40.1, `taffy` git rev, `parley` 0.12, `skrifa` 0.44, `peniko` 0.6, `kurbo` 0.13.1, `wgpu` 30, `winit` =0.31.0-beta.4, `accesskit` 0.25, anyrender crates from git main — [blitz Cargo.toml](https://github.com/DioxusLabs/blitz/blob/main/Cargo.toml)
- dioxus-native features: default = accessibility, hot-reload, net, html, svg, system-fonts, file-dialog, **vello-hybrid**, woff, text-transform-icu, apple-font-embolden. Renderer features: `vello` (anyrender_vello + wgpu_context), `vello-hybrid`, `skia`, `skia-pixels`, `skia-softbuffer`, `vello-cpu` (pixels/softbuffer). Optional: `complex-scripts` (dictionary-based line breaking, needed for Thai/Khmer-style scripts), `writing-mode` (vertical writing), `floats`, `scrollbars`. Note: "net" is a no-op on wasm32 — [dioxus-native Cargo.toml](https://github.com/DioxusLabs/blitz/blob/main/packages/dioxus-native/Cargo.toml)
- blitz-dom features: `accessibility = ["accesskit"]`, `system-fonts = ["parley/system"]`, `complex-scripts = ["parley/complex-scripts"]`, `writing-mode` ("layout runs in each box's writing-mode frame"), `custom-widget` (requires anyrender), `file-input`, `parallel-construct` — [blitz-dom Cargo.toml](https://github.com/DioxusLabs/blitz/blob/main/packages/blitz-dom/Cargo.toml)
- anyrender backends: `anyrender_vello_hybrid` (vello_gpu, formerly vello_hybrid), `anyrender_vello_cpu`, `anyrender_vello`, `anyrender_skia` (skia-safe); content renderers `anyrender_svg` (usvg), `blitz-paint`; utilities `wgpu_context`, `pixels_window_renderer`, `softbuffer_window_renderer`. Compatibility: anyrender 0.13 -> wgpu 29, vello 0.10, vello_hybrid 0.1, skia-safe 0.99; anyrender 0.14 -> wgpu 30, vello 0.11, vello_gpu 0.3, vello_cpu 0.3, skia-safe 0.156.0; MSRV Rust 1.90 — [anyrender README](https://github.com/DioxusLabs/anyrender/blob/main/README.md)
- Upstream: vello v0.11.0 released 2026-10-02 (with sparse-strips v0.3.0); wgpu v30.0.0 2026-07-01, v30.0.1 2026-08-22; parley v0.12.0 2026-10-09 — [vello releases](https://api.github.com/repos/linebender/vello/releases); [wgpu releases](https://api.github.com/repos/gfx-rs/wgpu/releases); [parley releases](https://api.github.com/repos/linebender/parley/releases)
- Roadmap (issue #119, updated 2026-10-28). 0.3 Beta items done: nested documents/iframes, imperative DOM access (`onmounted`), text selection + `user-select`, `touch-action`, `pointer-events`, winit 0.31, image cache, "Fix rendering CJK fonts on Apple platforms", FOUC fix, Custom Widget API, `<details>/<summary>`, overlay scrollbars, scrollbar styling, `scroll-behavior`/`overscroll-behaviour`, mouse/scroll/focus/pointer/touch events, `clip-path`, `mask`, `filter`, `backdrop-filter`, floats, box-level `direction: rtl`, `border-collapse`, intrinsic sizing keywords, `position:static/fixed`, box-level `writing-mode`, `vertical-align`. Still open in 0.3: Android app icon (cli), `<body>/<html>` events, Drag & Drop, `text-overflow`. 1.0 backlog: Devtools (CDP), `position:sticky`, table layout, `line-clamp`, font fallback reliability/`unicode-range`/`font-display`, text-shadow, Shadow DOM/custom elements, `<picture>/srcset`, `<select>` dropdown, range/color/password inputs (#482), animation events, "Clipboard? (cut, copy, paste)", "Composition / IME?", `beforeinput`, custom widget `accessibility` method, "Accessibility: Richer accessibility tree, Text layout / text input, Handling accessibility events". Backlog: Webdriver/Playwright automation, system compositor, "actually native" font rendering — [blitz issue #119](https://github.com/DioxusLabs/blitz/issues/119)
- Accessibility tracking #262 (open since 2025-09-12): "While Blitz exposes a basic accessibility tree (through accesskit), it's accessibility support needs a lot of work. [ ] Incremental updates [ ] Better text input support [ ] Support for aria attributes [ ] Responding to accessibility events" — [blitz #262](https://github.com/DioxusLabs/blitz/issues/262)
- IME: #272 "IME Commit doesn't trigger Input events (Chinese/Japanese/Korean input broken)" closed completed 2025-11-12; #287 "IME Candidate Window Appears at Incorrect Position" closed 2025-11-03. Composition events remain a 1.0 roadmap question mark — [blitz #272](https://github.com/DioxusLabs/blitz/issues/272); [#119](https://github.com/DioxusLabs/blitz/issues/119)
- Open text-input bugs: #894 (2026-09-18) "macOS text input: cursor jumps 2 characters, Cmd navigation and clipboard actions not working"; #925 (2026-09-23) `input[type=number]` height bug — [blitz #894](https://github.com/DioxusLabs/blitz/issues/894); [#925](https://github.com/DioxusLabs/blitz/issues/925)
- Open scrolling bugs (2026): #1182 "Hit-testing ignores the overflow clip" (2026-10-11); #1042 "Horizontal scrolling doesn't mesh with a desktop PC mouse"; #841 fixed/translate modal makes viewport scrollable; #444 "Incorrect scroll height calculation clamps overflow scrolling prematurely"; #597 "Inverted scroll compared to webview" — [blitz issues search](https://api.github.com/search/issues?q=repo:DioxusLabs/blitz+is:issue+in:title+scroll)
- blitz.is CSS status page: `overflow:scroll` Supported, `overflow:auto` Not supported, `overscroll-behavior` Not supported, `scroll-snap-type` Not supported; `writing-mode` Partial (block-level only), `text-orientation` Not supported; `direction` Partial (block-level, not inline), `unicode-bidi` Not supported; `line-break` Supported, `font-variant-east-asian` Supported, `text-justify` Not supported; `@font-face` Supported ("not yet possible to override the family name"), `font-display`/`font-kerning`/`font-synthesis` Not supported; flexbox Supported; grid Supported except `subgrid`; `display:table`/`border-collapse` Partial; 2D `transform` Supported, 3D/`perspective` Not supported; transitions/animations Supported; SVG rendering supported but CSS `fill`/`stroke` styling Not supported; `accent-color`, `appearance`, `field-sizing` Not supported; `caret-color` Supported — [blitz.is/status/css](https://blitz.is/status/css)
- Parley (text stack) provides font enumeration/fallback (fontique), shaping via HarfRust (HarfBuzz port), bidi resolution, line breaking, emoji — [parley README](https://github.com/linebender/parley/blob/main/README.md). Open Parley issue #291 on vertical alignment; no vertical-text issue found in title search — [parley issues](https://api.github.com/search/issues?q=repo:linebender/parley+is:issue+vertical+in:title)
- Dioxus side of native (0.8 alphas): alpha.0 "huge quality upgrade to dioxus-native... incremental rendering, custom elements"; alpha.2 fixed a leak "where removed nodes were never freed", falsy boolean attributes; alpha.3: `NodeHandle` `set_focus`/`scroll_to`/`get_client_rect` no longer panic from effects (mutations buffered) — [alpha.0](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.0); [alpha.2](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.2); [alpha.3](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.3)
- Blitz's `wgpu_texture` example demonstrates rendering a WGPU texture inside the document (`<canvas>` support was a 0.1 milestone) — [README "Trying it out"](https://github.com/DioxusLabs/blitz/blob/main/README.md); [#119](https://github.com/DioxusLabs/blitz/issues/119)
- 0.2 milestone (Oct 2025) included "Run WPT tests on every PR" and "CSS Animations and Transitions" — [#119](https://github.com/DioxusLabs/blitz/issues/119)
- Downloadable Browser UI builds exist for Windows/macOS/Linux/Android — [README](https://github.com/DioxusLabs/blitz/blob/main/README.md)

### Inferences

- For a desktop editor (b): text editing is the weakest area (macOS cursor bugs, no composition/IME events spec'd for 1.0, no clipboard events, no contenteditable found, `<select>` dropdown missing). A Japanese-input-heavy editor on dioxus-native would be high risk in Q4 2026; use dioxus-desktop (wry/tao webview) for the editor or wait for Blitz 1.0 items.
- Japanese typography: horizontal CJK works (CJK font fix on Apple, `line-break`, `font-variant-east-asian`), vertical text is opt-in and block-level only; inline bidi/RTL unsupported (fr/en/ja do not need RTL, so acceptable).
- Accessibility: a basic AccessKit tree exists, but no ARIA attributes pass-through means dioxus-primitives' WAI-ARIA semantics would be largely lost on native today; screen-reader parity with the web target is not achievable yet.
- GPU painting for (c): Blitz paints via anyrender on wgpu 30 by default (vello_gpu "hybrid"); a wgpu canvas can be embedded as a texture, so a Dioxus native app can host a custom wgpu scene. Skia is a supported alternate backend (skia-safe 0.156 in anyrender 0.14), useful where Vello's filter support is weaker ("Better filter support on Vello backends" is a 1.0 item).
- Performance is not quantified publicly; the roadmap shows incremental box-tree construction (0.2) and image cache / delayed first paint (0.3) as the main perf work.

### Gaps

- No published Blitz performance benchmarks (frame times, layout times) or memory figures.
- Could not read the Blitz CHANGELOG (API returned invalid base64); 0.3.0-beta.x per-release notes unavailable.
- Unknown: whether `contenteditable`/rich text editing exists (no issues with that title); whether the winit 0.31 beta IME API is wired beyond the 2025 commit fix.
- Cloudflare "agentic browser" built on Blitz mentioned only in Dioxus/Cognition announcements; no Cloudflare repo found via GitHub search.

## Key Question 3 — dioxus-components / dioxus-primitives: component list and styling without Tailwind

### Takeaway

`dioxus-primitives` is a Radix-style, WAI-ARIA-oriented unstyled primitive set (~37 public modules) with shadcn-style styled wrappers (43 components on the 0.8 branch) distributed by `dx components add <name>` which copies Rust + plain CSS files into the project and injects a `dx-components-theme.css` of CSS custom properties. Styling is plain CSS (CSS variables, data-theme light/dark), no Tailwind required; components spread attributes so any class/style system works. Caveats: no crates.io release (0.0.0 placeholder), repo pins Dioxus 0.7.8 on main with a separate `0.8` branch, `dx components` is broken in 0.8.0-alpha.3, and the repo's own lint/e2e tooling uses npm/stylelint/Playwright (dev-only).

### Cited Findings

- Description: "Accessible, unstyled, foundational components for Dioxus." README: "a shadcn style component library for Dioxus built on top of the unstyled Dioxus primitives library"; "The styled versions serve as a starting point to develop your own design system." Install: `cargo install dioxus-cli`, `dx components add button` -> creates `components/` folder and prompts to link `/assets/dx-components.css`. Contribution rule: primitives must adhere to "WAI-ARIA Authoring Practices" and "Every element should spread attributes and children from the props" — [components README](https://github.com/DioxusLabs/components/blob/main/README.md)
- Public primitive modules (main, `primitives/src/lib.rs`): accordion, alert_dialog, aspect_ratio, avatar, calendar, checkbox, collapsible, color_picker, combobox, context_menu, date_picker, dialog, drag_and_drop_list, dropdown_menu, hover_card, label, menubar, navbar (feature `router`), popover, progress, radio_group, scroll_area, select, separator, slider, switch, tabs, tag_group, toast, toggle, toggle_group, toolbar, tooltip, virtual_list; internal: collection, listbox, move_interaction, pointer, portal, selectable, selection, virtual. Uses a `focus-trap.js` asset and `use_server_cached` for SSR-stable ids — [primitives/src/lib.rs](https://github.com/DioxusLabs/components/blob/main/primitives/src/lib.rs)
- Styled components on the `0.8` branch (`preview/src/components`): accordion, alert_dialog, aspect_ratio, avatar, badge, button, calendar, card, checkbox, collapsible, color_picker, combobox, context_menu, date_picker, dialog, drag_and_drop_list, dropdown_menu, form, hover_card, input, item, label, menubar, navbar, pagination, popover, progress, radio_group, scroll_area, select, separator, sheet, sidebar, skeleton, slider, switch, tabs, textarea, toast, toggle, toggle_group, toolbar, tooltip, virtual_list — [components tree (0.8)](https://github.com/DioxusLabs/components/tree/0.8/preview/src/components)
- 0.7 blog claimed "Dioxus Primitives provides 28 foundational, Radix-UI-equivalent components" (Sep/Oct 2025) — [Dioxus 0.7 blog](https://dioxuslabs.com/blog/release-070)
- Theme CSS: `html[data-theme="dark"|"light"]` switches, `prefers-color-scheme` fallback, variables like `--primary-color-1..7`, `--secondary-color-1..6`, `--focused-border-color`; a `--dark/--light` toggle trick — [dx-components-theme.css (0.8)](https://github.com/DioxusLabs/components/blob/0.8/preview/assets/dx-components-theme.css)
- Workspace pins `dioxus = "0.7.8"` on main; `primitives` 0.8 branch: version 0.0.1, rust-version 1.92, deps dioxus-sdk-time, time, palette, serde, build-dep `lazy-js-bundle`; features `router` (default), `web` — [Cargo.toml main](https://github.com/DioxusLabs/components/blob/main/Cargo.toml); [primitives Cargo.toml (0.8)](https://github.com/DioxusLabs/components/blob/0.8/primitives/Cargo.toml)
- 0.8.0-alpha.3 known issue: "`dx components` doesn't work in this release" (TLS/libgit2 after cargo-generate 0.25; default branch still targets 0.7). Workaround: copy from the `0.8` branch and depend on `dioxus-primitives = { git = ..., branch = "0.8", default-features = false }` — [alpha.3](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.3)
- Dev tooling in the components repo uses `npm install && npx stylelint` and `npx playwright test` (contributor-only) — [components README](https://github.com/DioxusLabs/components/blob/main/README.md)
- Styling options from Dioxus itself: `asset!()`/manganis for CSS files (hashed assets), `#[css_module]` stylesheets (SSR head bug fixed in alpha.1), automatic Tailwind detection is optional ("`dx` detects a root `tailwind.css`") — [alpha.1](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.1); [0.7 blog](https://dioxuslabs.com/blog/release-070)
- In dioxus-native, CSS is resolved by Stylo (Firefox/Servo engine) — plain CSS files work natively; no Tailwind runtime is needed — [blitz README](https://github.com/DioxusLabs/blitz/blob/main/README.md)

### Inferences

- The copy-into-project model (like shadcn) suits a custom design system (HCT/CAM16 tokens, own fonts): replace `dx-components-theme.css` variables with your own, keep the primitives for ARIA/keyboard logic.
- Because primitives rely on a small `focus-trap.js` asset and `lazy-js-bundle`, "zero raw JS" is not strictly true on the web target; on dioxus-native there is no JS runtime, and primitive behaviors depending on JS (focus trap, portals) may not work.
- Component coverage is broad enough for a content site and an editor shell (dialog, sidebar, tabs, combobox, virtual_list, toast), but there is no data table/tree view/rich text editor primitive.

### Gaps

- No accessibility audit results (axe/Playwright a11y) published; the Playwright suite exists but no coverage numbers.
- Whether primitives are verified against dioxus-native (vs web) is undocumented.

## Key Question 4 — dioxus-cli: hot-reload / Subsecond hot-patching, build/bundle pipeline, WASM sizes, js-framework-benchmark

### Takeaway

`dx serve` combines RSX/asset hot-reload with Subsecond binary hot-patching (incremental linking of Rust code into the running process on web/desktop/mobile; enabled by default since 0.8 alpha.0), `dx bundle` produces platform bundles and `--ssg` output, and `#[wasm_split]` does per-route WASM code splitting. In krausest's js-framework-benchmark the dioxus-v0.7.2-keyed entry ships 419.6 KB uncompressed / 114.9 KB compressed and is 10-25% slower than vanilla JS on most DOM ops (create10k 251 ms vs 205.5 ms), competitive with Leptos, faster than Yew, but with a 536.9 ms first paint vs 236 ms for Leptos and 53 ms for Solid.

### Cited Findings

- Subsecond: "Dioxus now supports hot-patching of Rust code at runtime... without losing app state... works across all major platforms: Web (WASM), Desktop (macOS, Linux, Windows), and even mobile (iOS, Android)". Mechanism: "a form of incremental linking / binary patching tailored for running apps". Explicit `subsecond::call(|| ...)` integration points; "If you add or remove a field of a struct between hot-patches, Subsecond does not automatically migrate your state"; engine ships inside the CLI, with Axum/Bevy/Ratatui integrations — [Dioxus 0.7 blog](https://dioxuslabs.com/blog/release-070)
- Docs caveat: "Only code at the 'tip' of the app is recommended for hot-reload. Code that runs only once is not hot-reloadable and requires an app restart." — [fullstack llms.txt](https://dioxuslabs.com/learn/0.7/essentials/fullstack/llms.txt)
- 0.8 alpha.0: "enable hotpatch by default, hotreload cargo.toml, dynamic file watcher" (#5506); "fix wasm hotpatching with c deps" (#5556); CLI must be installed with `--locked` from source — [alpha.0](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.0)
- 0.8 alpha.1/0.7.10: hot-patching fixes for crate name != package name (#5719/#5720), v0 symbol mangling on Linux beta (#5622), wasm-bindgen 0.2.128+ (#5843); "The 0.8 CLI can't run apps built with Dioxus older than 0.7.2" — [alpha.1](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.1); [v0.7.10](https://github.com/DioxusLabs/dioxus/releases/tag/v0.7.10)
- Bundling: `dx bundle --release` -> `dist/bundle/`; macOS desktop app example "only 4.8 Mb" thanks to native WebView; GitHub Pages flow (`out_dir`, `base_path`, copy `index.html` to `404.html`); `[bundle] resources` globs in Dioxus.toml — [deploy guide](https://dioxuslabs.com/learn/0.7/guides/deploy/llms.txt)
- Tooling: one-line installer `curl https://dioxus.dev/install.sh | sh`, `dx self-update`, integrated LLDB debugger (`d` key, VS Code only), anonymized telemetry (opt-out), `llms.txt` generation, `dx serve @client --package xyz @server --package xyz`, Android/iOS device support, `AndroidManifest.xml`/`Info.plist` customization — [0.7 blog](https://dioxuslabs.com/blog/release-070)
- CLI downloads esbuild (respects `NPM_CONFIG_REGISTRY`) — [alpha.0 #5558](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.0); wasm-opt is invoked by the CLI (SIGABRT fix #5736) — [alpha.2](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.2)
- 0.8 alpha.3 desktop stack: tao 0.37 / wry 0.57, windows 0.62 (drops Windows 7); `dx new` uses cargo-generate 0.25 — [alpha.3](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.3)
- WASM size (historical): Dioxus 0.6 docs describe the runtime as "approximately 60KB gzipped"; 0.4 cookbook: TodoMVC 2.36 MB debug -> 234 KB with release profile + wasm-opt (old) — [mintlify mirror of 0.6 platform docs](https://www.mintlify.com/DioxusLabs/dioxus/platforms/web); [0.4 cookbook](https://dioxuslabs.com/learn/0.4/cookbook/optimizing). Third-party 0.7 guide: a demo app at 1,018 KB uncompressed / ~350 KB gzipped, target 500-700 KB / 200-250 KB — [dioxus_components WASM_SIZE_OPTIMIZATION.md](https://docs.rs/crate/dioxus_components/0.1.1/source/WASM_SIZE_OPTIMIZATION.md)
- js-framework-benchmark (krausest master `webdriver-ts/results.json`, medians, ms unless noted), entry `dioxus-v0.7.2-keyed` (built with trunk, opt-level 3 + lto, flagged issue 1139 "Implementation doesn't pass strict CSP"): run1k 23.6, replace1k 26.6, update10th 12.0, select1k 3.0, swap1k 14.3, remove 10.9, create10k 251, append1k 27.8, clear1k 15.6; ready-memory 0.76 MB, run-memory 2.12 MB; size uncompressed 419.6 KB, compressed 114.9 KB; first-paint 536.9 ms. Comparators: vanillajs-keyed 19.9/21.2/9.2/2.7/10.9/9.6/205.5/23.0/7.9, size 11.3/2.5 KB, first-paint 42.1; leptos-v0.7.0 25.0/28.8/11.3/3.2/12.2/10.1/262.8/28.7/15.5, size 189.6/48.8, first-paint 236.4; sycamore-0.9.0-beta.2 24.6/29.0/.../260.2, size 157.5/47.2, fp 215.3; yew-0.23.0 30.9/34.6/13.0/4.6/13.6/10.5/316/34.9/15.7, size 202.3/56.8, fp 259.8; solid-1.9.3 21.4/23.5/10.4/3.2/12.5/10.0/225.9/24.8/10.4, size 11.5/4.5, fp 53.5 — [results.json](https://raw.githubusercontent.com/krausest/js-framework-benchmark/master/webdriver-ts/results.json); [dioxus package.json](https://github.com/krausest/js-framework-benchmark/blob/master/frameworks/keyed/dioxus/package.json); [issue 1139](https://github.com/krausest/js-framework-benchmark/issues/1139)
- Dioxus's own bench: "6.2ms to create 10_000 rows" measuring framework overhead only — [docs.rs benches/jsframework.rs](https://docs.rs/crate/dioxus/latest/source/benches/jsframework.rs)

### Inferences

- The benchmark entry is 0.7.2 (Dec 2025); the 0.8 "markerless placeholders/const builder/optimized templates" rewrite (#5554) is not reflected; expect changes but no numbers yet.
- The ~115 KB gzipped benchmark payload vs ~49 KB for Leptos and the 537 ms first paint are the main web-perf costs; `wasm_split` per-route splitting and SSR/SSG mitigate for a content site.
- The CLI pulls esbuild/wasm-opt/wasm-bindgen binaries: not Node.js runtime, but not a "pure cargo" pipeline either.

### Gaps

- No official 2026 WASM size table from Dioxus Labs; the "60KB runtime" figure is from 0.6-era docs.
- Hot-reload guide page URL returned 404 (docs moved); detailed Subsecond limitations list not retrieved beyond the blog/fullstack intro.
- Benchmark Chrome version/date for results.json not captured.

## Key Question 5 — Taffy 0.15

### Takeaway

Taffy 0.15.0 (2026-10-17) / 0.15.1 (2026-10-25) is a mature CSS Block + Flexbox + Grid layout engine (MIT, MSRV 1.71) used by Servo, Blitz, Bevy, Slint, Zed/GPUI, Floem; 0.15 adds `position: static/fixed` with containing-block hoisting, `align-self/justify-self` for abspos, `normal` alignment keyword, ~60% faster grid and ~15-20% faster flexbox, and removes no-alloc mode. `position: sticky` and table layout are not implemented.

### Cited Findings

- "It currently implements the CSS Block, Flexbox and CSS Grid layout algorithms." Used by Servo, Blitz, Bevy, Takumi, iocraft, Slint, Lapce/Floem, Zed/GPUI — [taffy README](https://github.com/DioxusLabs/taffy/blob/main/README.md)
- 0.15.0: MSRV 1.71; `Position::Static` default (matches CSS), `Position::Fixed` added, abspos/fixed boxes hoisted to containing block, `align-self`/`justify-self` on abspos, `normal` alignment first-class (align/justify fields no longer `Option`), grid ~60% faster, flexbox ~15% faster, no-alloc build removed (no-std with alloc remains), `Position::Sticky` added but "Sticky positioning is not implemented", `fit-content(calc())`, `transpose()` helpers "for tree implementations laying out vertical writing modes" — [v0.15.0 notes](https://github.com/DioxusLabs/taffy/releases/tag/v0.15.0)
- 0.15.1: flexbox "~15-20% faster for deep trees", float/grid/baseline fixes — [v0.15.1 notes](https://github.com/DioxusLabs/taffy/releases/tag/v0.15.1)
- Release cadence 2026: 0.11 (Jun), 0.12 (Jul), 0.13 (Aug 8), 0.14 (Aug 24), 0.15 (Oct 17) — frequent breaking minors — [taffy releases](https://api.github.com/repos/DioxusLabs/taffy/releases)
- Blitz tracks Taffy from a git rev, not the crates.io release — [blitz Cargo.toml](https://github.com/DioxusLabs/blitz/blob/main/Cargo.toml)

### Inferences

- For a custom wgpu/GPUI-style renderer (c), Taffy is a safe shared layout core (same as Zed's GPUI); expect API churn roughly every 1-2 months on minor versions.

### Gaps

- No table layout or `sticky`; Blitz lists both under 1.0.

## Key Question 6 — How the pieces fit for (a) SEO content site fr/en/ja, (b) native desktop editor, (c) wgpu canvas rendering

### Takeaway

(a) Web/SSR: dioxus-fullstack on Axum with SSR + incremental cache (+ optional `dx bundle --ssg` for enumerable routes), `document::*` for head, hand-written sitemap/hreflang handlers, `dioxus-i18n` (Fluent) for fr/en/ja; viable but requires building the SEO/i18n layer Next.js provides out of the box. (b) Desktop editor: dioxus-desktop (wry/tao webview, tao 0.37/wry 0.57) is production-grade today; dioxus-native/Blitz is beta with text-input/IME/accessibility gaps, so it is an R&D track, not the editor substrate for 2026. (c) wgpu canvas: Blitz paints via anyrender (vello_gpu on wgpu 30, Skia optional) and supports embedding a wgpu texture (`<canvas>`), while Taffy can be used standalone for a GPUI-style custom renderer.

### Cited Findings

- SSR "improves load times and search-engine discoverability"; hybrid SSG output "static HTML that loads SPA content" — [fullstack llms.txt](https://dioxuslabs.com/learn/0.7/essentials/fullstack/llms.txt); [SSG llms.txt](https://dioxuslabs.com/learn/0.7/essentials/fullstack/static_site_generation/llms.txt)
- Head components must be in the first streamed chunk for crawlers; `Meta` props frozen after first render — [streaming.md](https://github.com/DioxusLabs/docsite/blob/main/docs-src/0.7/src/essentials/fullstack/streaming.md); [meta.rs](https://github.com/DioxusLabs/dioxus/blob/main/packages/document/src/elements/meta.rs)
- `dioxus-i18n` 0.7.0-alpha.1 (Fluent), updated 2026-10-15 — [crates.io](https://crates.io/api/v1/crates/dioxus-i18n)
- Desktop webview stack: tao 0.37 / wry 0.57 in 0.8 alpha.3; `linux-libxdo` removed; Windows 7 dropped — [alpha.3](https://github.com/DioxusLabs/dioxus/releases/tag/v0.8.0-alpha.3)
- dioxus-native: default renderer `vello-hybrid` over `wgpu_context`; `skia` feature; Blitz `wgpu_texture` example; custom widget API done in 0.3 — [dioxus-native Cargo.toml](https://github.com/DioxusLabs/blitz/blob/main/packages/dioxus-native/Cargo.toml); [blitz README](https://github.com/DioxusLabs/blitz/blob/main/README.md); [#119](https://github.com/DioxusLabs/blitz/issues/119)
- Native accessibility/IME/clipboard gaps per #262 and #119; macOS text-input bug #894 open — [#262](https://github.com/DioxusLabs/blitz/issues/262); [#119](https://github.com/DioxusLabs/blitz/issues/119); [#894](https://github.com/DioxusLabs/blitz/issues/894)
- Taffy is the layout engine of Zed's GPUI, so a wgpu-canvas renderer can share Taffy with Blitz — [taffy README](https://github.com/DioxusLabs/taffy/blob/main/README.md)
- Cognition commits to "invest heavily in Dioxus-Native and Blitz" — [joining-cognition](https://dioxuslabs.com/blog/joining-cognition)

### Inferences

- Version strategy for a Q4-2026 start: build on 0.7.10 (stable, components repo main targets 0.7.8) and track 0.8 alphas on a branch; 0.8 brings breaking changes (keyboard-types 0.8 `Key::Named`, `html::main` element namespacing, WriteMutations API) and a known-broken `dx components` in alpha.3.
- Mobile: dioxus-mobile (webview) exists with device support; Blitz Android builds exist for the browser UI but dioxus-native mobile is not positioned as production.
- Pure-Rust constraint is met at runtime (Axum server, WASM client, no Node); the exceptions are CLI-downloaded esbuild/wasm-opt binaries and a tiny `focus-trap.js` asset in primitives.

### Gaps

- No case study of a Dioxus fullstack site with thousands of localized pages; SSR throughput and SSG wall-time unknown.
- No first-party i18n routing (`/fr/...`, `/ja/...`) guidance found in 0.7 docs.
- Blitz WPT pass rates not published on the pages fetched.
