# Shenron monorepo (C:\src\apps\shenron) — architecture inventory for a Rust + Bun refactor

Scope: read-only survey of the local repository at HEAD `f04de517` (2026-11-04, "fix(wiki): separate mobile controls…"). All sources are local file paths inside `C:\src\apps\shenron` unless stated. Counts were produced with `find`/`wc`/`grep` and `bun:sqlite`; they exclude `node_modules`, `.next*`, `dist`, `target`.

Global figures:

- Git: 2 186 commits, first commit dated 2026-09-29 — `git log --oneline | wc -l`, `git log --format=%ad | tail -1`.
- TypeScript: 3 388 `.ts/.tsx` files across `apps/*` + `packages/*`; `scripts/` adds 313 `.ts` files.
- Rust (excluding the `crates/filmcraft` submodule): 133 434 lines, 701 `#[test]` functions; `crates/filmcraft` alone is 993 `.rs` files / 400 700 lines.
- Tests: apps/site 439 test files (`apps/site/tests/`), apps/bot 162, packages/* 318, Rust 189 files with `#[test]`.

---

## Q1. Workspaces: apps/* and packages/* (purpose, runtime, deps, size, tests)

### Takeaway

15 packages + 4 apps, all Bun workspaces (`bun@1.4.6`, `engines.bun >= 1.4.4`). Only `apps/site` (and the React half of `packages/ui`) runs under Next; everything else is plain Bun (`Bun.serve`, `bun:ffi`, `bun:sqlite`, `bun build --compile`). The site is ~81 % of all TS lines (272 895 of ~335 k in apps; 580 k total with packages).

### Cited Findings

- Root manifest `C:\src\apps\shenron\package.json`: name `@aphrody/shenron` v1.4.5, workspaces `apps/*`, `packages/*`, Bun catalog pins `next 16.5.0-canary.5` (overridden by a vendored fork `vendor/next-fork/next-16.5.0-canary.5-dac376c6fe-ffbf5f76.tgz`), `react ^19.3.0`, `next-intl 4.14.7`, `better-auth 1.7.14`, `@base-ui/react ^1.8.0`, `tailwindcss ^4.3.3`, `shadcn ^4.21.0`, `drizzle-orm ^0.45.3`, `postgres ^3.4.9`, `discordx 11.13.3`, `discord.js ^14.27.0`, `@pothos/core`, `graphql-yoga`, `@napi-rs/canvas 1.0.9`, `sharp`, `@tiptap/* ^3.31.3`, `@codemirror/*`, `@tanstack/react-query ^5.104`, `@tanstack/react-virtual`, `stripe ^23`, `pixi.js 8.22`, `three 0.187`, `mediabunny`, `typescript 7.0.2`, `@types/bun` aliased to `@aphrody/bun-types@1.4.4`. Scripts: `typecheck` = `bun check`, `lint` = `bun lint`, `fmt` = `bun fmt` — [package.json](C:\src\apps\shenron\package.json).
- `bunfig.toml`: `linker = "isolated"`, only `react`/`react-dom` hoisted, `minimumReleaseAge = 259200` with an exclude list of `@aphrody/*` packages, `[run] bun = true` (node shebangs run under Bun) — [bunfig.toml](C:\src\apps\shenron\bunfig.toml).
- Per-workspace inventory (ts/tsx files · lines · test files · key deps) from each `package.json`:
  - `apps/site` `@aphrody/shenron-site` — 1 710 files · 272 895 lines · 439 tests. Next 16 App Router; deps: `@aphrody/next-bun`, `@aphrody/bun-video`, `@aphrody/bun-runtime-sdk`, next-intl, better-auth + `@better-auth/passkey`, Tiptap (16 packages), CodeMirror, react-query, `@sglkc/kuromoji`, `@t3-oss/env-nextjs`, `@next/third-parties`, all `@aphrody/shenron-*` workspaces — [apps/site/package.json](C:\src\apps\shenron\apps\site\package.json).
  - `apps/bot` `@aphrody/shenron-bot` — 536 · 110 722 · 162. Bun binary; `discordx`, `discord.js`, `@discordx/di`, `@discordx/pagination`, `tsyringe`, `reflect-metadata`, `@aphrody/discord-kit`, `@aphrody/messaging`, `@napi-rs/canvas`, `sharp`, `sqlite-vec`, `@pothos/core`, `graphql-yoga`, `better-auth`, `drizzle-orm`, `postgres`, `pino` — [apps/bot/package.json](C:\src\apps\shenron\apps\bot\package.json).
  - `apps/server` `@aphrody/shenron-server` — 38 · 6 889 · 16. "the Shenron front app (Next 16 standalone), the Shenron API and the local APIs in one autonomous Bun binary"; `src/` = `front.ts`, `local-api.ts`, `backend.ts`, `koharu.ts`, `next-startup.ts`, `openai.ts`, `studio.ts`, `web.ts` — [apps/server/package.json](C:\src\apps\shenron\apps\server\package.json), [apps/server/src](C:\src\apps\shenron\apps\server\src).
  - `apps/activity` `@aphrody/shenron-activity-app` — 50 · 7 431 · 12. "Arène Shenron: the Discord Activity server (Bun.serve, OAuth code exchange, WebSocket rooms, signed settlement) and its React client"; `@discord/embedded-app-sdk`, react; 7 `.tsx` in `client/` — [apps/activity/package.json](C:\src\apps\shenron\apps\activity\package.json).
  - `packages/ui` `@aphrody/shenron-ui` — 327 · 47 532 · 68; 113 `exports`. Deps: `@base-ui/react`, `@aphrody/m3-{ai,primitives,reader,theme,tokens}`, cva, clsx, cmdk, i18next + react-i18next, lucide-react, next-themes, react-colorful, react-markdown, react-resizable-panels, swiper, tailwind-merge, three, zustand, react-query, react-virtual — [packages/ui/package.json](C:\src\apps\shenron\packages\ui\package.json).
  - `packages/pipeline` `@aphrody/shenron-pipeline` — 229 · 48 180 · 82. "Shenron compute clients and Dragon Ball data pipeline: AI, Aphrody services, crawl, OCR and RAG workflows"; `ai`, `@ai-sdk/openai-compatible`, `@aphrody/inference`, `@aphrody/runtime-sdk`, `@aphrody/typesafe-sdk`, `sharp`, `sqlite-vec`, `postgres` — [packages/pipeline/package.json](C:\src\apps\shenron\packages\pipeline\package.json).
  - `packages/api` `@aphrody/shenron-api` — 111 · 18 757 · 51. zod contract + `Bun.serve` router + OpenAPI 3.1 (`openapi/public.json`, title "Shenron API" v2.0.0, 50 paths); `better-auth` + `@better-auth/{cimd,mcp,oauth-provider,passkey}` — [packages/api/package.json](C:\src\apps\shenron\packages\api\package.json), [packages/api/openapi/public.json](C:\src\apps\shenron\packages\api\openapi\public.json).
  - `packages/db` `@aphrody/shenron-db` — 96 · 17 004 · 24. "PostgreSQL partagé Shenron : schéma Drizzle, pool postgres-js (Next) et driver Bun.SQL (scripts, API), indépendant du framework" — [packages/db/package.json](C:\src\apps\shenron\packages\db\package.json).
  - `packages/config` — 100 · 9 166 · 28 (git submodule `aphrody-labs/shenron-config`, `.gitmodules`). zod env, public URLs, wiki-launch gating, slugs, legacy routes.
  - `packages/auth` — 29 · 2 619 · 15. "Briques Better Auth partagées (site Next, bot Bun, API)".
  - `packages/activity` — 33 · 6 826 · 12. Pure rules/protocol of the Discord Activity (no network).
  - `packages/engine` `@aphrody/shenron-engine` — 23 · 6 093 · 4. "Unified full-stack Shenron game engine, GPU backend, WebGPU/WASM pipeline, vector canvas"; ships `src/wasm/shenron_engine_bg.wasm` — [packages/engine/src](C:\src\apps\shenron\packages\engine\src).
  - `packages/koharu` `@aphrody/shenron-koharu` — 12 · 3 267 · 4. Typed IPC protocol generated from `koharu-app` (Tauri Specta), JSON Lines transport, `src/wasm/koharu_canvas_bg.wasm`.
  - `packages/native` `@aphrody/shenron-native` — 16 · 3 094 · 4. `bun:ffi` binding of `crates/shenron-ffi` with worker pool.
  - `packages/media` — 16 · 2 535 · 7 (`mediabunny`, episode video delivery, remote OCR). `packages/images` — 11 · 963 · 3 (sharp hashing/variants). `packages/lexicon` — 8 · 1 845 · 1. `packages/dbxv2` — 25 · 3 667 · 7 (DBXV2 gateway client). `packages/crunchyroll` — 18 · 2 015 · 7 (headless CLI + MCP via `@modelcontextprotocol/sdk`).
- Runtime-class contract: every export declares `"shenron.runtime"` ∈ `pure | server | bun | json`, audited by `scripts/audit/check-workspace-packages.ts`; a `"use client"` module may not import `@aphrody/shenron-db/postgres-js`, `api/server` or anything of class `bun` — [AGENTS.md § Architecture](C:\src\apps\shenron\AGENTS.md).
- Dependency graph is acyclic: `config ← db/auth ← api`; `@aphrody/shenron-ui` depends only on `config`, `koharu`, `pipeline`; no package imports an app — [AGENTS.md](C:\src\apps\shenron\AGENTS.md).

### Inferences

- Framework-agnostic Bun code (keepable as services/workers): `apps/bot`, `apps/server` (minus the Next child-process relay), `apps/activity`, `packages/{api,auth,config,db,pipeline,media,images,lexicon,native,koharu,dbxv2,crunchyroll,activity,engine}`. Together ≈ 310 k TS lines.
- Inherently Next/React-bound (must be rewritten): `apps/site` (272 895 lines, 1 710 files) and the React component half of `packages/ui` (~47 k lines). `packages/api/src/next.ts`, `packages/auth/src/next.ts`, `packages/db/src/postgres-js.ts` are thin Next adapters.

### Gaps

- `git shortlog -sn` returned no output in this shell; author distribution not captured.
- Test counts are file counts, not test-case counts (`bun test` not executed, per the no-modification constraint).

---

## Q2. apps/site: Next.js version, route tree, i18n, rendering, SEO, data, auth, editors

### Takeaway

Next 16.5.0-canary.5 (vendored fork) App Router with Turbopack, no `[locale]` segment (cookie-based next-intl, fr/en/ja), 200 `page.tsx`, 159 `route.ts`, 222 files with `force-dynamic`, 73 ISR `revalidate` exports, 25 `generateStaticParams`, 364 `"use client"` files, 11 server-action files. OG images use `next/og` `ImageResponse` (Satori), not `@napi-rs/canvas`.

### Cited Findings

- Next config: `withBun` from `@aphrody/next-bun`; `serverExternalPackages`, `deploymentId: NEXT_DEPLOYMENT_ID` (skew protection for self-hosted `next start`), `assetPrefix = NEXT_PUBLIC_CDN_URL`, `output: "standalone"` only when `NEXT_OUTPUT=standalone`, `experimental.useTypeScriptCli`, `cpus: 1`, `staticGenerationMaxConcurrency: 2`; comments record cold build ≈ 8.1 GiB RSS and 10.5 GiB incremental → OOM on an 11 GiB VPS — [apps/site/next.config.ts](C:\src\apps\shenron\apps\site\next.config.ts).
- Middleware: `src/proxy.ts` (Next 16 rename of middleware): host canonicalisation to dragonballfr.com, `/admin` + `/workshop` staff gating via `better-auth/cookies` `getSessionCookie`, `x-admin-token`, `SHENRON_ADMIN_IPS`, beta gating of wiki categories read from DB (`WikiLaunch` singleton) — [apps/site/src/proxy.ts](C:\src\apps\shenron\apps\site\src\proxy.ts).
- i18n: `src/i18n/request.ts` (next-intl `getRequestConfig`, locale from `NEXT_LOCALE` cookie else `Accept-Language`, `timeZone Europe/Paris`, French fallback). Messages `messages/fr.json`, `en.json`, `ja.json` (3 469 lines each; 157 KB / 145 KB / 172 KB), `glossary.json` (4 835 lines) plus ~40 namespace sub-directories (`wiki-public/`, `manga-ui/`, `video-ui/`, `dbxv2/`, …) — [apps/site/messages](C:\src\apps\shenron\apps\site\messages), [apps/site/src/i18n/request.ts](C:\src\apps\shenron\apps\site\src\i18n\request.ts). 105 files import `next-intl`.
- Route tree (`find src/app -name page.tsx`, 200 pages), grouped:
  - Public: `/`, `/about`, `/credits`, `/license`, `/privacy`, `/site-map`, `/stats`, `/sources`, `/sources/dragon-ball/[sourceId]`, `/news`, `/news/[slug]`, `/news/page/[n]`, `/news/theme/[tag]`, `/news/feed/[[...path]]`, `/publications/[slug]`, `/catalog`, `/catalog/[category]`, `/catalog/[category]/[id]`, `/catalog/assets`, `/rankings`, `/leaderboard`, `/personas`, `/commands`, `/ask`, `/canvas`, `/coming-soon`, `/download`, `/donations`, `/shop`, `/vip`, `/tierlists`, `/tierlists/[slug]`, `/tierlists/mine`, `/tierlists/new`, `/preview/characters/[slug]`, `/review-techniques`.
  - Games: `/games`, `/games/{2048,bingo,budokai-tenkaichi-3,dragon-pixel,rock-paper-scissors,tic-tac-toe,xenoverse-2}`.
  - Wiki (`/wiki/**`, 60 pages): `/wiki`, `/wiki/[...slug]`, `arcs(/[slug])`, `canon`, `cards(/[slug])`, `characters(/[slug])`, `contribute`, `contributors(/[slug])`, `corrections`, `databooks(/[id])`, `dragons`, `episodes(/[id])`, `episodes/@modal/(.)[id]` (intercepting modal), `episodes/series/[series](/[number])`, `events`, `games(/[slug])`, `gifs`, `interviews`, `items(/[slug])`, `locations(/[slug])`, `manga`, `manga/[id]`, `manga/interviews`, `manga/review`, `manga/volume/[id]`, `movies(/[slug])` + `@modal`, `music`, `power-levels`, `races(/[slug])`, `sagas(/[slug])`, `search`, `staff`, `techniques(/[slug])`, `timeline`, `tools`, `toriyama`, `transformations(/[slug])`.
  - Manga/Studio/Workshop: `/studio`, `/studio/video`, `/workshop`, `/workshop/(staff)/databooks/[id]`, `/workshop/(staff)/transcription`, `/workshop/(staff)/translation`, `/desktop`, `/desktop/control`, `/desktop/download`.
  - User/Auth: `/signin`, `/forgot-password`, `/reset-password`, `/two-factor`, `/oauth/consent`, `/account/billing`, `/profile/[id]`, `/profile/me`, `/settings`, `/favorites`, `/watchlist`, `/dashboard`, `/admin-access`.
  - Admin (`/admin/**`, 81 pages): `a2a, account, activity, agents, ai, api-docs, audit, audit-internal, banners, bot(/[id]), bxc-campaigns, canon, canvas(/themes), cards, command-runner, commands, console, contests, cron, dashboard, database(/[table]), db-universe/{assets,databooks,episodes,games,movies,sagas,sources}, dbxv2(/immersion), design, discord, economy, evaluations, events, giveaways, hierarchy, home, launch, leaderboards, levels, live, logs, messages, moderation(/comments), monetization, posts(/[id],/new), profile, reports, send, services, settings, shop, stats, sync, taxes, tickets, tierlists(/[id],/new), timeline, triggers, visibility, webhooks, wiki, wiki/category/{[id],new}, wiki/characters, wiki/contributions, wiki/history, wiki/page/{[id],new}, wiki/studio/[table]/[id], wiki/todo`.
  - API `route.ts` (159): `/api/auth/[...all]` (better-auth), `/api/public/[...route]` (mounts `@aphrody/shenron-api` via `toNextRouteHandlers`), `/api/agent/v1/*` (articles, comments, feed, openapi.json, whoami, wiki/*), `/api/manga/*` (chapter pages, translation, coverage, search, volume), `/api/databooks/*` (anomalies, ocr-review, pages, texts, transcription, search), `/api/episodes/*` (download, timeline, video), `/api/movies/*`, `/api/gifs/*`, `/api/frames/search`, `/api/wiki/*` (contributions, contributors, events, media, timelines, variants), `/api/wiki-admin/[...path]`, `/api/canon*`, `/api/stripe/{donate,portal,subscribe,webhook}`, `/api/paypal/{donate,donate/capture,subscribe,subscription/cancel,webhook}`, `/api/ads/*`, `/api/a2a`, `/api/mcp/card`, `/mcp`, `/api/bot-admin/[...path]`, `/api/bot-user/[...path]`, `/api/crunchyroll/[...path]`, `/api/admin/video/crunchyroll/[...path]`, `/api/desktop/link(/verify)`, `/api/releases/*`, `/api/studio/*`, `/api/social/*`, `/api/tierlists/*`, `/api/health{,/live,/ready}`, `/api/telemetry`, `/api/analytics`, `/sw.js`, `/manifest.webmanifest`, `/llms.txt`, `/agy.md`, `/plugin*`, `/news/rss.xml`, `/sources/sitemap.xml`, `/sources/sitemaps/[page]`, `/wiki/random`, `/.well-known/[...path]`.
  - Special files: `src/app/sitemap.ts` (`revalidate = 86400`, derived from `WikiLaunch` access config), `robots.ts`, `opengraph-image.tsx` (root) and `tierlists/[slug]/opengraph-image.tsx`, `not-found.tsx`, `error.tsx`, `global-error.tsx`, 13 `loading.tsx`, 12 `error.tsx` segments, `@modal/default.tsx` parallel routes — listed by `find src/app`.
- Rendering modes (grep counts over `src/`): `"use client"` 364 files; `"use server"` 11; `generateStaticParams` 25; `export const revalidate` 73; `force-dynamic` 222; `force-static` 0; `revalidateTag/Path` 26; `unstable_cache`/`"use cache"` 4; `generateMetadata` 40; `next/image` 51; `server-only` 135.
- SEO/OG: `src/app/opengraph-image.tsx` uses `ImageResponse` from `next/og` with the Kinto-Un SVG from `@aphrody/shenron-ui/toriyama-svg/kinto-un` and `DRAGONBALLFR_LOGO_SVG`; `@napi-rs/canvas` is used in 0 site files (28 in the bot). Root `layout.tsx` sets `metadataBase`, title template `%s — DBFR`, GTM/GA via `@next/third-parties/google`, JSON-LD (`SiteJsonLd`, `schema-dts`), PWA (`PwaProvider`, `manifest.webmanifest`, `sw.js`), View Transitions (`ViewTransition.tsx`) — [apps/site/src/app/layout.tsx](C:\src\apps\shenron\apps\site\src\app\layout.tsx).
- Fonts are self-hosted from `public/fonts` via generated `src/app/fonts.css` (1 356 lines) and `scripts/fonts.ts`, not `next/font`: `google-sans`, `google-sans-flex/`, `jetbrains-mono/`, `newsreader/`, `noto-sans-jp/`, `shenron-lettering/`, `shenron-text/`, plus legacy `Inter-*.ttf`, `SaiyanSans.ttf`, `DBSScouter.ttf` (the latter two are no longer loaded per layout.tsx comments) — [apps/site/public/fonts](C:\src\apps\shenron\apps\site\public\fonts).
- Data layer: Drizzle over `postgres` (`@/lib/db`, `@/db/schema`, `@/db/bot-schema`), 325 top-level modules in `src/lib/`, React Query in 65 files, legacy French routes → 308 in `src/lib/legacy-routes.ts`; `tests/english-routes.test.ts` refuses new French segments — [AGENTS.md](C:\src\apps\shenron\AGENTS.md).
- Auth: better-auth 1.7.14 server in `packages/api/src/host/auth.ts` with plugins `bearer()`, `twoFactor()`, `passkey({rpName:"Dragon Ball France"})`, `magicLink()`, `jwt()`, `mcp()`, `socialProviders` Discord + Google (lines 162-269); site uses `src/lib/auth.ts`, `auth-client.ts`, `session.ts`, `host-auth.ts`; env `DISCORD_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `BETTER_AUTH_SECRET/URL`, `OWNER_ID`, `OAUTH_ALLOWED_USERS`, `SHENRON_ADMIN_TOKEN`, `SHENRON_ADMIN_IPS` — [packages/api/src/host/auth.ts](C:\src\apps\shenron\packages\api\src\host\auth.ts), [apps/site/src/lib/env.ts](C:\src\apps\shenron\apps\site\src\lib\env.ts).
- Editors: Tiptap in 13 site files (`src/components/editor/{Editor,toolbar,slash,dialogs,primitives,source,status}.tsx`, admin posts), CodeMirror markdown in 1 file; `@tanstack/react-virtual` imported in 0 site files (declared in `packages/ui`).
- Client-side rendering tech: `pixi.js` in `src/lib/capacites-client.ts`; WebGPU in `src/components/wiki/scene/{scene-renderer.ts,WikiSceneDepth.tsx,WikiScenePortal.tsx}`; WASM consumers `src/app/games/dragon-pixel/CpkScene.tsx`, `src/components/games/{Dbxv2CpkExplorer,Xenoverse2Runtime}.tsx`, `src/components/manga/MangaChapter3D.tsx`, `src/app/games/budokai-tenkaichi-3/Bt3Player.tsx`.
- Monetisation: Stripe (24 files; `STRIPE_SECRET_KEY`, `STRIPE_PRICE_VIP_{MONTHLY,ANNUAL}`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`), PayPal (24 files; `PAYPAL_*`, VIP plans), AdSense (`NEXT_PUBLIC_ADSENSE_*`), billing outbox cron `/api/cron/billing-outbox` — [apps/site/src/lib/env.ts](C:\src\apps\shenron\apps\site\src\lib\env.ts).
- Site CSS: `src/app/globals.css` (14 lines, imports), `dragon-ball-design.css` (149), `neutral-theme.css` (82), `frame-theme.css` (79), `official-beerus.css` (38), `fonts.css` (1 356).

### Inferences

- With 222 `force-dynamic` files vs 25 `generateStaticParams`, the site is predominantly SSR with ISR on list pages; a Rust SSG/SSR replacement must support per-request auth gating (proxy.ts) and DB-driven section visibility (`WikiLaunch`), not pure SSG.
- Satori-based OG generation can be replaced by a Rust renderer (vello/resvg) since inputs are already SVG strings.

### Gaps

- Exact per-route rendering mode matrix not computed (would require parsing 200 pages); numbers above are file-level greps.
- Service-worker (`sw.js` route) behaviour not read.

---

## Q3. packages/ui design system (layers, Tailwind/Base UI, components, tokens, CSS, SVG, fonts)

### Takeaway

`@aphrody/shenron-ui` is a Tailwind v4 CSS-first design system with a documented three-layer architecture (primitive `--dbz-*`/`--toriyama-*` → semantic `@theme inline` aliases → components), 26 files using `@base-ui/react` (25 distinct Base UI modules), 113 package exports, ~8.5 k lines of CSS, 55 SVG assets, and one bundled font (`NotoSansCJK-VF.otf` for the Koharu editor).

### Cited Findings

- Three layers table: Primitive = raw value overridable at runtime by `/admin/design` (`--dbz-*`, `--toriyama-*`); Semantic = alias with fallback in `@theme inline` of `src/styles.css` (e.g. `--color-dbz-orange: var(--dbz-orange, #e78220)`); Component = class/component reading only semantic tokens (`toriyama.css`, `src/components/`, `.toriyama-panel`, `<Button variant="dragonball">`). "Primitives accessibles : `@base-ui/react` + `class-variance-authority` + `cn`" — [docs/products/design-system.md lines 84-124](C:\src\apps\shenron\docs\products\design-system.md).
- `src/styles.css` header: "shared design-token layer (Tailwind v4, CSS-first)… `@import "tailwindcss"; @import "@aphrody/shenron-ui/styles.css"`… Every palette value stays `var(--dbz-*, <default>)`: /admin/design overrides `--dbz-*` at runtime. `src/tokens.ts` is generated from this file (`bun packages/ui/scripts/generate-tokens.ts`)". Accent is Goku's gi orange `#e78220` (contrast 7.18:1 on black); fonts `--font-display`, `--font-serif`, `--font-mono`, `--font-jp`, `--font-saiyan`, `--font-scouter` — [packages/ui/src/styles.css](C:\src\apps\shenron\packages\ui\src\styles.css).
- `src/tokens.ts` (generated) exports `colorVars` = `--dbz-{bg,card,border,orange,orangeDark,blue,blueLight,yellow,red,green,purple,gold,cyan,pink,…}` — [packages/ui/src/tokens.ts](C:\src\apps\shenron\packages\ui\src\tokens.ts).
- CSS files (lines): `site.css` 5 036 (layers `@layer base/components/utilities`, imports `episode-themes.css`, `video-player.css`, `shell-controls.css`; `@custom-variant dark`), `toriyama.css` 604, `editorial.css` 531, `styles.css` 509, `video-player.css` 320, `koharu/styles.css` 252, `episode-themes.css` 185, `shell-controls.css` 165, `barre-nav.css` 151, `editor.css` 144, `vie.css` 135, `reader-dragon-ball.css` 107, `dbxv2/dbxv2.css` 100, `chat/chat.css` 80, `koharu/internal/styles/globals.css` 75, `home-theme.generated.css` 73, `reader-styles.css` 31, `koharu/editor.css` 9 — total 8 507.
- `@aphrody/m3-*` usage counts in `src/`: `m3-primitives` 14, `m3-reader` 10, `m3-ai` 4, `m3-theme` 3, `m3-tokens` 2.
- Base UI modules imported: dialog (3), menu (2), alert-dialog (2), tooltip, toggle-group, toggle, toast, tabs, switch, slider, separator, select, scroll-area, radio-group, radio, progress, popover, number-field, menubar, drawer, collapsible, checkbox, button, avatar, accordion — grep `from "@base-ui/react/…"`.
- Component inventory (`.tsx`, non-test), by directory:
  - `components/` (31, shadcn-style wrappers): accordion, alert-dialog, avatar, badge, button, card, checkbox, collapsible, dialog, dropdown-menu, input, label, pagination, popover, progress, radio-group, select, separator, slider, surface, switch, tabs, textarea, toast, toggle, tooltip, toriyama-badge, toriyama-panel, toriyama-progress, toriyama-slider, toriyama-speech-bubble.
  - `navigation/` (14): AppShell, DomainBarView, FooterFabGuard, FooterFrame, LinkPager, MobileNavFrame, ShellBoot, ShellSidebar, ShellTabBar, ShellTopBar, TabNav, WindowControls.
  - `layout/` (7): AdminFrame, HeroTitles, PageHeader, PageHero, PageShell, SectionHeading, ViewTransition.
  - `public/` (22): BroadcastSchedule, Carousel, CharacterCard, Chip, CommandPalette, DragonRadarSearch, EmptyState, FilterDropdown, MangaCard, SceneBackdrop, SectionNavigation, Stars, StatTiles, StreamSkeleton, WikiSkeleton (+ message/http helpers).
  - `admin/` (12): AdminPageHeader, AdminSidebarView, ConfirmDialog, DataTable, FormGrid, Metrics, NativePipelinePanel, QueryProvider, RythmeSparkline, StatusBadge.
  - `reader/` (9): DatabookReader, MangaPage3D, MangaReader. `studio/` (9): AdminStudio, DatabooksStudio, ShenronStudio, StudioHeader, StudioKit, TrainingStudio.
  - `toriyama/` (16): DragonBall, DragonBallSphere, DragonBallWordmark, DragonRadarDisplay, KiAura, KintoUn, KintoUnCloud, MotManga, MotifsCouverture, PotaraEarrings, ScouterHudOverlay, SenzuBean, ShenronSilhouette, Toriyama3D, ToriyamaEmblem. `toriyama-svg/` (12 TS geometry modules): couverture, emblems, geometry, gohan-ultime, kinto-un, model3d, palette, potara, senzu, sphere, wordmark.
  - `cinematic/` (7): AnimeMomentCard, AuraContainer, KenBurns, KiAuraContainer, KiExplosionEffect, OfficialMediaCard. `vie/` (4): Reveal, SectionDivider, VieArt, VieStage. `chat/` (5): ChatPanel, MemoryPanel, ModelsPanel. `dbxv2/` (7): Dbxv2Image, Dbxv2Media, Dbxv2ModelViewer. `scene3d/` (5): glb.ts, portal-diorama.ts, strict-webgpu.ts (three.js + WebGPU). `icones/` (4): MaterialSymbol, glyphe. `video/`: ShenronComposition. `external/`: ExternalLink. Root: markdown.tsx, json-ld.tsx, material-symbols.tsx, api-access.tsx, video-source-summary.tsx.
  - `koharu/` (60 files, 46 tsx — the Shenron Studio manga editor UI): `components/app/{AboutDialog,KoharuApp,StartupView,TitleBar,WindowChrome}`, `components/controls/{ColorSampling,ColorWell,CommitTextarea,FontPicker,ModelPicker,OutputPicker}`, `components/editor/{ActivityCenter,AgentPanel,CanvasCommandBar,CanvasOverlay,CanvasWorkspace,Editor,InferenceControl,Inspector,PageRail,PipelinePanel,ResourceMonitor,RightSidebar,SelectionControls,StatusBar,ToolBar}`, `components/preferences/{Generation,Pipeline,Provider,Translation,Typesetting}Preferences, PreferenceFields, SettingsPage`, `components/start/StartView`, `ShenronAtlasPanel`, `ShenronExportPanel`, `internal/components/{empty,input-group,menubar,number-field,resizable,scroll-area}`, locales `en-US/ fr-FR/ ja-JP/` (i18next), font `assets/NotoSansCJK-VF.otf`.
- Assets: `packages/ui/assets/` holds 125 files incl. 55 SVG (`badges/`, `brand/`, `dbz/`, favicons, apple-touch-icon); `predev` copies them into `apps/site/public/` — [AGENTS.md § Commandes](C:\src\apps\shenron\AGENTS.md).
- Art direction rules (owner, 2026-11-03/04): immersive illustrated wiki with Goku, Kid Buu, Shenron; "Les nouvelles scènes utilisent WebGPU explicitement, jamais WebGL ni un repli automatique WebGL"; content must remain reachable in HTML/SVG without GPU; "Les interfaces Rust et desktop partagent ces contrats visuels… ne pas créer de palette parallèle" — [AGENTS.md § Direction artistique](C:\src\apps\shenron\AGENTS.md), [docs/products/wiki-art-direction.md](C:\src\apps\shenron\docs\products\wiki-art-direction.md).

### Inferences

- The token model (primitive → semantic → component, runtime-overridable via `/admin/design`, persisted in `SiteTheme` table) maps cleanly to a Rust theme struct; the `--dbz-*` names are the stable contract to preserve.
- Toriyama vector assets are already pure TS geometry (`toriyama-svg/*.ts`), portable to Rust path builders (vello/kurbo) without redrawing.

### Gaps

- `docs/design/` does not exist (`ls docs/design` → "No such file"); design docs live in `docs/products/{design-system,wiki-art-direction,spec-ui-dragon-ball-cinematic,toriyama-catalogue,episode-design,shell-navigation,accueil-et-shell}.md`.
- `@aphrody/m3-tokens` / `m3-theme` are external published packages (not in repo); their internals were not inspected.

---

## Q4. Rust side: workspace, crates, GPU/UI stack

### Takeaway

Root `Cargo.toml` (resolver 3, edition 2024, rust-version 1.97, toolchain 1.99.1) has `members = ["crates/*"]` with `crates/shenron-video` and `crates/filmcraft` excluded. 30 crates in-workspace (koharu-* 13, shenron-* 15, dragon-pixel) plus the FilmCraft submodule (≈ 50 crates, 400 k lines) — a complete clean-room media stack with an **egui/eframe** frontend (`filmcraft-ui-egui`, 73 669 lines) and a **wgpu** compositor. wgpu 30.0.1 + vello 0.11 already own rendering in `shenron-gpu`, `koharu-rasterizer`, `koharu-renderer`, `shenron-engine`.

### Cited Findings

- Workspace header: "the shenron CLI, MCP server, C ABI, studio commands, desktop app and the Koharu manga translation engine… Aphrody capabilities (ML runtime, RAG, OCR, models, Tauri 3 fork) come from aphrody-labs/aphrody pinned by revision"; `exclude = ["crates/shenron-video", "crates/filmcraft"]` — [Cargo.toml](C:\src\apps\shenron\Cargo.toml).
- Pinned graphics/ML deps: `wgpu = "30.0.1"` ("The one wgpu of the workspace (crates/shenron-gpu owns it)"), `vello = "0.11.0"`, `bevy = 0.19.1` (features `3d, web, webgpu`, for dragon-pixel wasm32), `image 0.25.10`, `imageproc 0.27`, `fast_image_resize 6.1`, `webp 0.3.1`, `fontique 0.11.1`, `harfrust 0.13.3`, `skrifa`, `icu_*`, `tokenizers 0.23.2`, `hf-hub` (git), `rmcp =3.5.0`, `axum 0.8`, `rusqlite 0.40 bundled`, `tokio 1.53`, `reqwest 0.13.5`, Tauri 3 alpha fork (`aphrody-tauri =3.0.0-alpha.4`, `tauri-runtime-cef`), ML via `aphrody-{llama,diffusion,torch,ml-runtime,ocr,rag}` git deps — [Cargo.toml lines 24-180](C:\src\apps\shenron\Cargo.toml).
- Toolchain: `channel = "1.99.1"`, targets `x86_64-unknown-linux-gnu`, `x86_64-pc-windows-msvc`, `wasm32-unknown-unknown` — [rust-toolchain.toml](C:\src\apps\shenron\rust-toolchain.toml).
- Crates (name · .rs files · lines · description · key deps), from each `Cargo.toml`:
  - `shenron-gpu` · 11 · 2 098 · "The one wgpu backend of Shenron: adapter and device selection, limits, device loss, render targets, readback, presentation and Vello glue, native and browser" · wgpu, vello.
  - `shenron-engine` · 45 · 15 388 · "Unified production-grade full-Rust game engine, GPU backend, 2D/3D renderer, vector canvas, and WASM bindings" · glam, wgpu, vello, image, wasm-bindgen, web-sys, shenron-panels, shenron-re, dragon-pixel.
  - `dragon-pixel` · 15 · 4 231 · deterministic combat engine, WebGPU render packets, multiplayer room service, Bevy WebGPU view · bevy, axum, tokio.
  - `shenron-re` · 39 · 10 541 · DBXV2 binary parsers, CRIWARE CPK, live memory inspection · wasm-bindgen.
  - `shenron-panels` · 5 · 1 509 · manga panel (koma) detection → PNG/SVG/GIF, native + wasm32 · image.
  - `shenron-ffi` · 9 · 3 065 · C ABI `shenron_*` for `bun:ffi` (command, RAG chunk/search, persona, corpus, cancellable jobs) · axum, aphrody-rag-core, aphrody-llama-server, specta.
  - `shenron-cli` · 14 · 4 540 · `shenron` command (health, RAG, training, databooks OCR bridge, databooks API, manga, config) · clap, aphrody-ocr, aphrody-rag, miette.
  - `shenron-mcp` · 11 · 6 760 · MCP server (stdio/HTTP) exposing `dragonball.*` and `dbfr_*` tools · rmcp, axum, tower-http.
  - `shenron-rag` · 4 · 1 995 · offline corpus, local index, persona, ingestion into Aphrody RAG storage · rusqlite, aphrody-rag.
  - `shenron-lexicon` · 6 · 1 538 · the ja/fr/en lexicon (embedded data, lookup, term protection).
  - `shenron-manga` · 5 · 1 420 · adapter over Koharu library: CDN catalog, OCR projection · aphrody-ocr-core.
  - `shenron-studio` · 3 · 339 · Tauri commands `studio_*`, `shenron_chat`. `shenron-desktop` · 3 · 630 · "Shenron Studio (Tauri 3), the only Shenron desktop app" · tauri + plugins, tauri-runtime-cef.
  - `shenron-video` (excluded) · 2 · 564 · "pure Rust, no ffmpeg: MPEG-1/2 decode, H.264 encode, fragmented MP4 mux" · filmcraft-{mpeg2v,h264enc,isobmff,export}.
  - `koharu-library` · 21 · 7 442 · the Koharu engine: editor state, projects, processing, rendering, export, agent tools, `koharu-sdk` JSON Lines host · aphrody-{llama,diffusion,torch,ml-runtime}, hayro (PDF), rars, zip, webp.
  - `koharu-ml` · 124 · 30 254 · detection/OCR/inpainting/LLM glue · aphrody-ml-runtime, llguidance, tokenizers, minijinja, imageproc.
  - `koharu-renderer` · 16 · 10 472 · text layout + composition · vello, skrifa, harfrust, hypher, icu_segmenter, jieba-rs, unicode-bidi, fontique.
  - `koharu-rasterizer` · 7 · 3 105 · "Portable prepared frames and shared Vello/WGPU composition" · vello, fast_image_resize, blake3, postcard.
  - `koharu-pipeline` · 25 · 6 645 · in-process scene processing · sysinfo, arc-swap. `koharu-scene` · 24 · 6 477 · typed scene model · imbl, slotmap, revision. `koharu-storage` · 9 · 1 048 · snapshot/blob storage · memmap2, fs4. `koharu-translator` · 24 · 5 968 · local/hosted translation backends · shenron-lexicon. `koharu-psd` · 8 · 2 167 · PSD export. `koharu-canvas` · 4 · 2 086 · wasm canvas. `koharu-agent` · 11 · 1 391 · OAuth Codex agent orchestration. `koharu-app` · 9 · 795 · Tauri Specta command layer. `koharu-desktop` · 1 · 558. `koharu-secrets` · 2 · 408 · keyring.
  - FilmCraft (`crates/filmcraft`, git submodule `aphrody-labs/filmcraft`): `apps/filmcraft` (egui/eframe desktop, 4 312 lines; deps egui, eframe, rfd, cpal, arboard), `apps/filmcraft-web` (wasm32 eframe, WebGPU/WebGL2, OPFS, WebCodecs; 2 650), `apps/filmcraft-cli` (CLI + MCP; 1 891); `crates/ui-egui` = `filmcraft-ui-egui` 176 files · 73 669 lines "The FilmCraft egui frontend (swappable): panels, docking, timeline, monitors, control channel" (dep `craft-ui`); `crates/gpu` = `filmcraft-gpu` 4 585 "wgpu compositor: YUV/RGB layer sampling, linear-light premultiplied compositing in WGSL"; `crates/render` 23 132 (CPU reference compositor); `crates/engine` 56 041; `crates/text` 3 102 (skrifa/harfrust shaping, bidi, line-break); codecs: av1 (20 404), h264 (10 159), h264enc (8 114), hevc (8 630), vp9, vp8, prores, dnx, apv, mpeg2v, aac, opus, ac3, mpa, flac; containers isobmff, matroska, mxf, mpegts, ogg, avi, cfb; `platform` 16 469 (VideoToolbox/Media Foundation/VA-API/NVDEC HW decode); `speech` (Whisper on candle), `tts` (Kokoro on candle), `captions`, `interchange` (EDL/FCPXML/OTIO), `audio-dsp` 12 890, `scopes`, `golden`, `testkit`.

### Inferences

- Crates promotable into a new Rust UI stack: `shenron-gpu` (wgpu/vello surface), `koharu-rasterizer` + `koharu-renderer` (vector text/typesetting), `shenron-engine` (2D/3D + wasm), `filmcraft-ui-egui` + `filmcraft-gpu` (a working egui+wgpu application shell with docking/timeline), `filmcraft-text` (font DB + shaping), `shenron-panels`, `shenron-lexicon`, `shenron-mcp`, `shenron-rag`, `shenron-ffi`.
- Current desktop is Tauri 3 (CEF webview) wrapping the Next site; replacing it with egui/wgpu is consistent with the owner's "WebGPU explicit, never WebGL" rule and the FilmCraft precedent.
- No Dioxus, iced, GPUI, taffy or skia dependency exists in the workspace (none matched in `Cargo.toml` grep); taffy/Dioxus would be new additions.

### Gaps

- The `craft-ui` crate used by `filmcraft-ui-egui` was not located inside `crates/filmcraft/crates` (likely a path/git dep in the submodule's own `Cargo.toml`, not inspected).
- Rust test counts for the FilmCraft submodule were not computed.

---

## Q5. Backend: API, DB, auth, pipeline, media/images, MCP, Discord bot

### Takeaway

PostgreSQL (Drizzle, 62 `pgTable` in site schema + 84 `bot.table` in schema `bot`) is the editorial source of truth; the bot's SQLite `data/bot.db` (273 MB) is a replica; Redis holds rebuildable projections; an embedded SQLite VFS (`shenron-vfs.sqlite`, FTS5 + e5 vectors) ships inside binaries. API = zod contract + native `Bun.serve` router (`packages/api`), with a read-only GraphQL (`/graphql`, Pothos + graphql-yoga) in the bot only. MCP tools are served by the Rust `shenron-mcp` crate (not TS). Neon is retired.

### Cited Findings

- README: "PostgreSQL est la source éditoriale ; SQLite est le réplica du bot… Redis contient des projections reconstructibles, dont les articles publics dans la base logique 4" — [README.md](C:\src\apps\shenron\README.md).
- `packages/db/src/bot-schema.ts` line 7: "L'ancien miroir Neon (timer `shenron-neon-sync`) est retiré"; `config.ts` requires `DATABASE_URL` as `postgres://` — [packages/db/src/bot-schema.ts](C:\src\apps\shenron\packages\db\src\bot-schema.ts), [packages/db/src/config.ts](C:\src\apps\shenron\packages\db\src\config.ts).
- Site schema tables (`pgTable`): `User, Tierlist, Comment, WikiCategory, WikiPage, ba_user, ba_session, ba_account, ba_verification, two_factor, jwks, oauth_resource, oauth_client_assertion, site_ad_slots, HomeConfig, ContributionRights, SiteTheme, ChronologyConfig, CanonConfig, WikiLaunch, PageBanners, url_redirects, canon_references, canon_verdicts, canon_ingest_runs` … (62 total) — [packages/db/src/schema.ts](C:\src\apps\shenron\packages\db\src\schema.ts).
- Bot schema (`pgSchema("bot")`, 84 tables): `db_characters, db_planets, db_transformations, db_races, db_techniques, db_character_techniques, db_sagas, db_arcs, db_character_arcs, db_character_variants, db_episodes, db_movies, db_games, db_game_characters, db_manga_volumes, db_databooks, db_media_publications, media_works, media_editions, media_edition_aliases, media_volumes, media_chapters, media_page_assets, media_page_refs, narrative_timelines, narrative_events, narrative_event_aliases, narrative_event_participants, narrative_event_relations, contributors, contributor_credits, db_manga_chapters, db_manga_pages, db_news, db_tools, db_sources, db_licenses, db_assets, db_wiki_sections, dragonballcn_volumes, db_battles, db_timeline_events, db_power_levels, db_items, db_dragons, db_wishes, db_locations, db_tournaments, db_voice_actors, db_soundtracks, users, inventory, shop_items, achievements, achievement_triggers, fusions, warns, bans, tickets, vocal_tempo, vocal_tempo_bans, giveaways, giveaway_entries, level_rewards, guild_settings, message_templates, command_permissions, card_themes, economy_flags, economy_index, ursaf_notices, discord_members, discord_roles, discord_channels, action_logs, rag_eval_history` — [packages/db/src/bot-schema.ts](C:\src\apps\shenron\packages\db\src\bot-schema.ts).
- `packages/db/src/` also holds `vfs/` (embedded SQLite VFS, FTS5 BM25 + e5 cosine RRF, built by `scripts/data/build-vfs.ts`), `conversations/` (chat store, SQLite or PG schema `chat`), `redis.ts`, `replica/`, `repos/`, `bun-sql.ts`, `postgres-js.ts` — [AGENTS.md § Architecture](C:\src\apps\shenron\AGENTS.md).
- API: "`@aphrody/shenron-api/contract` est le catalogue zod v4 des endpoints (auth, cache, SSE, WebSocket) ; `server/` est un routeur `Bun.serve` natif (pas Hono), `createShenronApi(ports)`… Le site le monte par `app/api/public/[...route]` (`toNextRouteHandlers`), le bot en repli après ses routes historiques (plus `/graphql` en lecture seule). L'OpenAPI 3.1 est dérivée du contrat" — [AGENTS.md](C:\src\apps\shenron\AGENTS.md). Contract modules: `account, activity, chat, chronology, endpoints, favorites, home, lexicon, local, memory, page-banners, playback-capabilities, plugin, site-theme, sync, video, watch, web, wiki-launch`; host handlers: `account-deletion, account-profile, auth-rate-limit, auth, chronology, desktop-link, favorites, home, page-banners, rag, reports, site-theme, smtp-email, watch, wiki-launch` — [packages/api/src](C:\src\apps\shenron\packages\api\src). Only 1 file each references `@pothos` and `graphql-yoga` (bot: `apps/bot/src/api/graphql.ts`).
- Bot: "discordx + tsyringe ; `entry-standalone.ts` (`--smoke`, `--dry-run`) puis `index.ts` (migrations, base, `ApiServer`, Discord). Le socle Discord vient d'Aphrody : `@aphrody/discord-kit`… et `@aphrody/messaging`" — [AGENTS.md](C:\src\apps\shenron\AGENTS.md). Source dirs: `api` 30, `commands` 33 (groups `admin, economy, fun, games, giveaway, level, moderation, race, ticket, utility, vocal, wiki`; 115 `@Slash(` decorators), `db` 29, `events` 24, `frames` 6, `guards` 6, `lib` 65, `render` 29 (card renderer on `@napi-rs/canvas`: `cards/, draw.ts, surface.ts, text.ts, theme.ts, tokens.generated.ts, icons.generated.ts, pool.ts`), `services` 43, `ui` 16, `workers` 3; 28 files import `@napi-rs/canvas` — [apps/bot/src](C:\src\apps\shenron\apps\bot\src). Bot `api/` includes `graphql.ts, openapi.ts, hls-security.ts, wiki-replica.ts, wiki-image-storage.ts, public-rag.ts, a2a-proxy.ts, oauth.ts, cron-registry.ts, service-registry.ts`.
- Pipeline (`packages/pipeline/src`): `ai/`, `aphrody/`, `auto/`, `bridge/`, `bxc/`, `dragon-ball/`, `runtime/`, `wasm/` (`shenron_re_bg.wasm`), `manga-ocr.ts`, `koharu-sdk-client.ts`, `orchestrator*.ts`, `workflows.ts`, `cli.ts` — "`pipeline <ocr|rag|ia|translation|crawl|unify>` délègue le calcul à Aphrody" — [AGENTS.md](C:\src\apps\shenron\AGENTS.md).
- Media/images: `packages/media/src/{crunchyroll-mapping, episode-playback, episode-video-delivery, manga, mediabunny-pipeline, ocr, remote-ocr, video-plan}.ts`; `packages/images/src/{hash, ink-stroke, pixels, resolve, select, variants, webp}.ts` (sharp). HLS owner is `@aphrody/bun-video/hls` — [AGENTS.md § Outils](C:\src\apps\shenron\AGENTS.md).
- MCP: `crates/shenron-mcp` (Rust, rmcp) serves `dragonball.*`/`dbfr_*`; site `/mcp` relays to `shenron-mcp --http --public`; plugin manifests in `plugin/` (`plugin.json`, `mcp_config.json`, `skills/`, `agents/`, `openai/`, `GEMINI.md`); TS MCP only in `packages/crunchyroll/src/mcp.ts` — [README.md § MCP](C:\src\apps\shenron\README.md), [plugin/](C:\src\apps\shenron\plugin).
- Standalone server: "un `Bun.serve` frontal sert, dans cet ordre, `/api/local/*` (`bun:ffi` vers `libshenron_ffi`…), l'hôte `@aphrody/shenron-api/host` (`/api/v1/*`…, `/mcp`, WebSocket du chat), les assets statiques puis `/assets/*` du VFS, et relaie le reste vers le `server.js` standalone de Next lancé en processus enfant… emballe un payload zstd… dans `bun build --compile`" — [AGENTS.md](C:\src\apps\shenron\AGENTS.md).
- Activity: `apps/activity/src/{server.ts, ws/hub.ts, ws/hello.ts, auth/discord.ts, settle/settler.ts, http/{assets,limiter,security}.ts}`; rules in `packages/activity` ("Quiz Budokai rules, bounded zeni rewards and signed settlement receipts").
- External services (env keys in `apps/site/src/lib/env.ts` and `packages/config/src/public-urls.ts`): Discord OAuth (`DISCORD_CLIENT_ID/SECRET`, `NEXT_PUBLIC_DISCORD_INVITE_URL`, `bot.dragonballfr.com`), Google OAuth, Stripe, PayPal, Resend (`RESEND_API_KEY`) + SMTP (`SMTP_USER/PASSWORD`, `AUTH_EMAIL_FROM`), Crunchyroll (`CRUNCHYROLL_EMAIL/PASSWORD`, `BUN_VIDEO_CRUNCHYROLL_*`), Steam link (`/api/account/steam/*`), Google AdSense/GA/GTM, Typesafe (`TYPESAFE_API_KEY`), Aphrody A2A (`APHRODY_A2A_COORD_API`), CDN hosts `cdn.dragonballfr.com`, `shenron-cdn.aphrody-labs.workers.dev`, `play.aphrody.app`, `cdn.discordapp.com`, `www.carddass.com`; canon YOLO model gates `SHENRON_CANON_YOLO_*`. `Bun.s3`/S3 usage in `packages/media/src/episode-video-delivery.ts`, `scripts/ops/web-engine-cdn.ts`, `scripts/ops/bun-source-pipeline.ts`, `apps/site/src/lib/catalog-editorial-contracts.ts`.

### Inferences

- The whole backend (API contract, DB, auth, pipeline, bot, activity) is already Next-independent Bun code; only `packages/api/src/next.ts`, `packages/auth/src/next.ts` and the site's 159 `route.ts` handlers wrap it. A Rust/Bun refactor can keep these as-is and re-expose the route handlers from `Bun.serve`.
- better-auth is JS-only; retaining a Bun auth service (or replacing with a Rust OIDC/passkey stack) is a decision point — sessions, passkeys, 2FA, magic links, OAuth-provider and MCP auth are all active.

### Gaps

- Redis key layout and the `chat` PG schema not inspected.
- `scripts/` (313 files: audit, build, data, deploy, editorial, i18n, media, ops, plugin, release, testing, video) not inventoried individually.

---

## Q6. Build and deploy: justfile, bunfig, Docker, bake, deploy/, Cloudflare, CI, hosting

### Takeaway

One sealed Docker image (`localhost/shenron:<sha>`) contains the Next standalone server, the Bun bot binary, the `shenron-mcp` sidecar and `libshenron_ffi.so`; it is built by `scripts/deploy/release.sh` (Dockerfile.build + docker-bake.hcl) and activated on a single self-managed host "Prod" via SSH (nginx, PostgreSQL, Redis, systemd). Cloudflare is used for a private R2 bucket `shenron-cdn` behind a Worker (qualification stage, no production DNS route) and `cloudflared`; there is no Pages/Workers hosting of the site.

### Cited Findings

- `justfile` targets: `check, lint, test, format-check, ci, install, typecheck, bun-lint, bun-test, test-scripts, test-live, dev-site, dev-bot, build-server, build-bot, entries, protocol, rust-check, rust-lint, rust-test, rust-fmt(-check), rust-deny, koharu, wasm, wasm-build, rust-doc, mcp, cli, desktop, deps, deps-check, align-check, container-{env,build,up,down,status,db-init,ovh,backup}, setup-connectors, connectors-status, build-local{,-cli,-desktop,-guard,-windows}`; shell is `bun exec` — [justfile](C:\src\apps\shenron\justfile).
- `docker-bake.hcl` targets: `rust-linux-x64, rust-windows-x64, wasm, bot-linux-x64, bot-windows-x64, server-linux-x64, server-windows-x64, desktop-windows-x64, release-linux` (sealed runtime image, `FLAVOR=production`, needs public VFS), `BASE_IMAGE ubuntu:26.10` — [docker-bake.hcl](C:\src\apps\shenron\docker-bake.hcl). Dockerfiles: `Dockerfile.build` (16 KB multi-stage), `deploy/docker/Dockerfile`.
- `deploy/docker/README.md`: "One immutable image contains the Next.js 16 standalone server, Discord bot, MCP sidecar, native FFI and bot migrations… `build-image.sh` fetches the public VFS, builds the site, the bot and the native components… `ship-image.sh` streams the image to the target and runs `~/deploy-shenron-image.sh <sha> <tar>`… Infra mounts `/srv/shenron/shared/server` at `/var/lib/shenron`; the public snapshot is `/var/lib/shenron/data/shenron-vfs.sqlite`… Both apps listen on host loopback." Compose services: `site`, `bot` (same image) — [deploy/docker/README.md](C:\src\apps\shenron\deploy\docker\README.md), [deploy/docker/compose.yaml](C:\src\apps\shenron\deploy\docker\compose.yaml).
- Hosting (2026-11-02): "Prod — Shenron actif: Site · API · Bot · PostgreSQL · Redis · chat temps réel · origine CDN"; DBFR host is now a daily rsync backup; the VPS was purged; operated over SSH + tmux "sans Aphrody Infra"; runtime `/usr/local/bin/bun` canary `1.4.4-canary.1`; active image `aac017cec…` — [docs/operations/PROD-HOSTING.md](C:\src\apps\shenron\docs\operations\PROD-HOSTING.md), [docs/reference/root/REPRISE.md § 2026-11-02](C:\src\apps\shenron\docs\reference\root\REPRISE.md).
- `deploy/README.md`: systemd units, nginx vhosts, releases, backups are owned by the sibling repo `aphrody-infra` (`service-catalog.json`, `systemd/shenron-*.{service,timer}`); only `deploy/privoxy/` remains here — [deploy/README.md](C:\src\apps\shenron\deploy\README.md).
- Cloudflare: `deploy/cloudflare/wrangler.jsonc` → Worker `shenron-cdn`, `main: cdn-worker.ts`, `r2_buckets: [{binding CDN, bucket_name shenron-cdn}]`, `workers_dev: false`, vars `IMPORT_ENABLED=false`, `VERIFY_UPLOADS=false`, `MANIFEST_PREFIX=_migration/manifests/`; README: "Worker déployé en qualification sur `shenron-cdn.aphrody-labs.workers.dev`, sans route DNS de production. Le bucket `shenron-cdn` est privé ; seuls les chemins présents dans les manifests sont servis… objets adressés par SHA-256 (`_objects/<sha256>`)"; origin remains `https://cdn.dragonballfr.com` / `origin-cdn.dragonballfr.com`; systemd units `shenron-cloudflared.service`, `shenron-cloudflare-audit.service`, `shenron-cloudflare-s3-renew.service`, `shenron-cdn-origin.service`; CLI tools `deploy/cloudflare/cli/{cloudflare-ops,publish-catalog,native-s3-signer,transfer,stage-file,s3-profile}.ts` — [deploy/cloudflare/README.md](C:\src\apps\shenron\deploy\cloudflare\README.md), [deploy/cloudflare/wrangler.jsonc](C:\src\apps\shenron\deploy\cloudflare\wrangler.jsonc).
- CI (`.github/workflows`): `ci.yml` (Bun, ubuntu-24.04), `rust.yml` (self-hosted `shenron-factory`), `server-artifact.yml` "Production image build and auto-deploy" (self-hosted, `SHENRON_DEPLOY_TARGET` default `ssh:prod`), `release.yml`, `desktop.yml` (matrix OS, Tauri), `codeql.yml`, `update-deps.yml` — [.github/workflows](C:\src\apps\shenron.github\workflows).
- Build memory constraints documented in `next.config.ts`: cold Next build ≈ 8.1 GiB RSS, 10.4 GiB with standalone file tracing; `cpus: 1`, `staticGenerationMaxConcurrency: 2` — [apps/site/next.config.ts](C:\src\apps\shenron\apps\site\next.config.ts).
- Owner-imposed tooling: "`bun check`, `bun lint`, `bun fmt`, `bun n2b` selon le besoin ; `tsc` et `oxlint` bannis, y compris par invocation indirecte"; "Pas de node/npm/npx/bunx" — [GOAL.md § Portes](C:\src\apps\shenron\GOAL.md), [AGENTS.md § Outils](C:\src\apps\shenron\AGENTS.md).

### Inferences

- Removing Next eliminates the single largest build-memory cost (8–10 GiB) and the vendored Next fork maintenance; the rest of the image pipeline (bake targets for Rust/bot/wasm) is already framework-agnostic.
- Cloudflare dependency is limited to R2 object storage + a CDN Worker + tunnel; no Pages/Workers app hosting to migrate.

### Gaps

- `aphrody-infra` (nginx routes, systemd units, service catalog) is a separate repo not present locally; exact public route map and ports were not readable.
- `Dockerfile.build` stages were not read line-by-line.

---

## Q7. Architecture-decision docs (README, AGENTS, GOAL, TODO, REPRISE, design)

### Takeaway

AGENTS.md (symlinked as CLAUDE.md) is the binding rule set: NHIL autonomous execution, English identifiers/routes/APIs with French docs, zero hard-coded UI strings (fr reference, en/ja complete), one shared lexicon, Koharu never visible (product = "Shenron Studio"), WebGPU-only for new scenes, runtime-class audited package graph, Bun-only tooling. GOAL/TODO focus on manga completeness (SOSH 18 volumes, 110 missing volumes), Studio hosting, video via Bun Video/FilmCraft, and the Nov-2026 immersive wiki direction.

### Cited Findings

- Languages/names: "Code…, slugs, segments de routes, chemins et champs d'API, schémas, clés de configuration, noms d'outils MCP, bot et backend : en anglais. Un ancien segment français reste servi par un 308"; "Aucun texte visible codé en dur… toute chaîne d'interface passe par les dictionnaires (`apps/site/messages/{fr,en,ja}.json`, locales des paquets). Le français est la langue de référence ; l'anglais et le japonais sont complets. Les API acceptent la langue (`lang` ou `Accept-Language`, `fr | en | ja`)"; "Un seul lexique de traduction… sert le site, l'API, le bot, le plugin, le pipeline et le traducteur"; "Koharu est un nom de code interne… aucun texte visible ne dit « Koharu »"; "La documentation (`docs/`) reste en français" — [AGENTS.md § Langues et noms](C:\src\apps\shenron\AGENTS.md).
- NHIL: "L'utilisateur a autorisé l'exécution autonome de bout en bout… poursuivre jusqu'aux portes requises et à la livraison sans demander de confirmation intermédiaire. Trancher les choix réversibles… déléguer par défaut… revendiquer des chemins disjoints"; permanent owner agreement dated 2026-10-25 — [AGENTS.md § Exécution autonome NHIL](C:\src\apps\shenron\AGENTS.md).
- Tools: "Bun (`bun`, `bun -e`, Bun Shell, `bun test`, `bun build --compile`) et Rust (`cargo`). Recherche : `rg`, `fd`. Pas de node/npm/npx/bunx… `bun check`, `bun lint`, `bun fmt` natifs (ni tsc, tsgo, oxlint, oxfmt, eslint). Rust : `just`…, cargo-nextest, cargo-deny" — [AGENTS.md § Outils](C:\src\apps\shenron\AGENTS.md).
- Sources of truth: PostgreSQL editorial; logical deletes only (`visible = false`) revised in `wiki_revisions`; `db:push` forbidden; migrations in `apps/site/src/db/migrations`; reports go to `var/reports/` never `docs/` — [AGENTS.md § Architecture](C:\src\apps\shenron\AGENTS.md).
- Editorial gate: "Manga, scans et déclarations d'Akira Toriyama priment ; Fandom est interdit comme source" — [AGENTS.md § Portes](C:\src\apps\shenron\AGENTS.md), [GOAL.md](C:\src\apps\shenron\GOAL.md).
- README architecture table (apps/site "Application Next 16 : site public, administration, `/studio`, lecteurs et passerelle `/mcp`"; `crates/koharu-*` "Moteur de traduction manga ; Koharu reste un nom de code interne") and "Les capacités ML, OCR, traduction et navigateur proviennent d'Aphrody" — [README.md](C:\src\apps\shenron\README.md).
- GOAL.md priorities: owner request 2026-10-20 (video via Bun Video, FilmCraft, Shenron Video; replace direct FFmpeg), 2026-10-18 (unify manga journey + Shenron Studio; "Conserver `koharu-library` comme propriétaire de l'état éditorial"; admin shares a modern Studio workshop), 2026-10-15 (neutral theme, home without videos, full theme customisation dashboard with persistence), SOSH 18 volumes + 110 missing volumes with permanent 24/7 workers; gates: primary sources, secrets protected, "un HTTP 200 ne prouve pas un rendu" — [GOAL.md](C:\src\apps\shenron\GOAL.md).
- TODO.md open items: hosted Studio engine (`koharu-sdk` in image), admin Studio frame `aafa7c8b`, SOSH delivery, 110 volumes, canon lot, wiki fill queue "37 tables, 10 754 lignes visibles auditées, 108 contenus vides", audit of 69 072 catalogue images, RAG Recall@5 78.49 % below 80 % gate — [TODO.md](C:\src\apps\shenron\TODO.md).
- STACK.md (2026-09-24/28): unification plan into six `@aphrody/shenron-*` packages replacing "≈ 115 résolveurs de `DATABASE_URL`…"; `@aphrody/shenron-ui` = "Base UI 1.8 + Tailwind v4"; Shenron packages are upstream of Aphrody clients — [docs/architecture/STACK.md](C:\src\apps\shenron\docs\architecture\STACK.md). Companion docs: `APHRODY-ECOSYSTEM.md`, `RUNTIME.md`, `i18n.md`, `lexicon.md`, `architecture-refonte-wiki-dragon-ball.md`, `pipeline-svg.md` in `docs/architecture/`.
- Design/product docs (in `docs/products/`, not `docs/design/`): `design-system.md`, `wiki-art-direction.md`, `spec-ui-dragon-ball-cinematic.md`, `shell-navigation.md`, `accueil-et-shell.md`, `episode-design.md`, `reader-fullscreen.md`, `reader-gestures.md`, `toriyama-catalogue.md`, `vie-illustrations.md`, `dragon-pixel-world.md`, `dragon-pixel-effets-bevy.md`, `dbxv2-rendu-pixel-perfect.md`, `koharu/README.md`, `koharu/web-studio.md`, `shenron-video.md`, `pwa.md`, `authentication.md` — [docs/products](C:\src\apps\shenron\docs\products).
- Koharu product doc: "Shenron Studio (`crates/shenron-desktop`, Tauri 3, identifiant `com.dragonballfr.shenron`) est la seule application de bureau… `koharu-library` est l'unique propriétaire du moteur" — [docs/products/koharu/README.md](C:\src\apps\shenron\docs\products\koharu\README.md).
- REPRISE.md is 1 179 lines of dated evidence (latest 2026-11-02 hosting migration; 2026-10-30 UI duplicate removal and release-script consolidation; 2026-10-20 VFS behind nginx) — [docs/reference/root/REPRISE.md](C:\src\apps\shenron\docs\reference\root\REPRISE.md).

### Inferences

- A refactor plan must keep: English route/API/identifier naming with 308s from old French paths, the three message dictionaries as the only UI-string source, the shared lexicon, `koharu-library` as engine owner, Bun-only tooling (`bun check/lint/fmt`), and the Rust/desktop "same tokens, no parallel palette" rule.

### Gaps

- `docs/reference/root/PLAN.md` (invariants register) and `START-HERE.md` were not read in full.

---

## Q8. Data volume (wiki entities, manga, databooks) to size SSG

### Takeaway

From the bot SQLite replica `data/bot.db` (273 MB) and the 2026-10 live audit: ≈ 1 312 characters, 826 techniques, 826 episodes, 254–329 manga volumes, 922–939 chapters, 12 593 manga pages indexed (53 304 pages cited in docs), 427 databooks, 28 movies, 58 games, 33 sagas, 65 arcs, 2 064 news items, 68 979–69 072 catalogue images; the RAG index holds 59 995 chunks. Order of magnitude for SSG: ~5–6 k entity pages + ~13–53 k manga page routes + ~2.6 k media pages.

### Cited Findings

- `data/bot.db` row counts (via `bun:sqlite`, read-only): `db_characters 1312, db_techniques 826, db_character_techniques 1335, db_episodes 826, db_movies 28, db_games 58, db_game_characters 144, db_sagas 33, db_arcs 65, db_races 18, db_transformations 33, db_planets 62, db_locations 35, db_items 27, db_dragons 5, db_wishes 20, db_battles 49, db_timeline_events 32, db_power_levels 50, db_tournaments 11, db_voice_actors 14, db_soundtracks 24, db_manga_volumes 254, db_manga_chapters 939, db_manga_pages 12593 (FTS `manga_pages_fts_content 12577`), dragonballcn_volumes 364, db_news 2064, db_assets 1018, db_sources 17, db_tools 43, users 8037, achievements 3187, action_logs 225752, rag_chunks_content 59995, vec_chunks_rowids 59995` — [data/bot.db](C:\src\apps\shenron\data\bot.db) (file dated 2026-10-08; `data/` totals 45 GB incl. `DB Xenoverse 2/`, `episode/`, `rag/`, `source-acquisition/`).
- Live audit (REPRISE line 643): "Audit live des catalogues : 329 tomes, 922 chapitres, 427 databooks, 874 épisodes, 28 films ; 2 580 pages répondent 200, mais seules 320/68 979 images ont été contrôlées" — [docs/reference/root/REPRISE.md](C:\src\apps\shenron\docs\reference\root\REPRISE.md).
- Other figures quoted in GOAL/TODO/REPRISE/PLAN (grep): "53 304 pages", "876 épisodes", "69 072 images", "110 tomes manquants", "18 tomes SOSH", "672 personnages", "481 databooks", "84 volumes", "222 volumes" — [GOAL.md](C:\src\apps\shenron\GOAL.md), [TODO.md](C:\src\apps\shenron\TODO.md), [docs/reference/root/REPRISE.md](C:\src\apps\shenron\docs\reference\root\REPRISE.md).
- Wiki fill queue: "37 tables, 10 754 lignes visibles auditées, 108 contenus vides/provisoires" — [TODO.md](C:\src\apps\shenron\TODO.md).
- Site-side JSON data: `apps/site/data/extracted-wiki-assets.json`, `illustrations-lieux-objets.json`; `data/streams.json` (763 KB), `data/lexique-db-canonique.json`, `data/ja-identities-2026-09-23.json`, `data/fr-episode-titles.json`, `data/databooks-ocr/lots/` — [data/](C:\src\apps\shenron\data).

### Inferences

- Full SSG of entity pages (characters, techniques, episodes, movies, games, sagas, arcs, races, transformations, locations, items, databooks ≈ 4 000–4 500 routes × 3 locales) is feasible; manga page-level routes (12.6 k indexed, 53 k target) and databook pages should stay on-demand/ISR-like or be served from the VFS/CDN rather than prerendered.
- The 427 vs 481 databooks and 254 vs 329 volumes discrepancies reflect the SQLite replica (2026-10-08) lagging PostgreSQL; PostgreSQL is authoritative.

### Gaps

- No PostgreSQL access from this survey; counts for `WikiPage`, `db_databooks` pages, `media_*` tables, `narrative_events` and `contributors` were not obtainable locally (bot.db lacks `db_databooks`/`media_*` rows).

---

## Key question A. TypeScript inherently tied to Next/React vs framework-agnostic Bun

### Takeaway

≈ 320 k of ≈ 580 k TS lines are Next/React-bound (`apps/site` 272 895 + `packages/ui` 47 532); ≈ 260 k lines are Bun services (bot 110 722, pipeline 48 180, api 18 757, db 17 004, config 9 166, activity app+pkg 14 257, server 6 889, engine 6 093, dbxv2 3 667, koharu 3 267, native 3 094, auth 2 619, media 2 535, crunchyroll 2 015, lexicon 1 845, images 963).

### Cited Findings

- Next-specific surfaces: 200 `page.tsx`, 159 `route.ts`, 10 `layout.tsx`, `src/proxy.ts`, `next.config.ts`, `src/i18n/request.ts` (next-intl server), 51 `next/image` files, 364 `"use client"` files, 11 `"use server"` files, `opengraph-image.tsx` (`next/og`), `sitemap.ts`/`robots.ts` (`MetadataRoute`) — `find`/`grep` over [apps/site/src](C:\src\apps\shenron\apps\site\src).
- Framework-agnostic by contract: `packages/db` "indépendant du framework" (package description); `packages/api/server` is a native `Bun.serve` router; the bot is a `bun build --compile` binary; `apps/server` is `Bun.serve` + `bun:ffi` — [packages/db/package.json](C:\src\apps\shenron\packages\db\package.json), [AGENTS.md § Architecture](C:\src\apps\shenron\AGENTS.md).
- Thin Next adapters to delete: `packages/api/src/next.ts`, `packages/auth/src/next.ts`, `packages/db/src/postgres-js.ts` ("pool postgres-js (Next)") — [packages/api/src](C:\src\apps\shenron\packages\api\src), [packages/auth/src](C:\src\apps\shenron\packages\auth\src).
- React-but-not-Next: `packages/ui` components use i18next/react-i18next (not next-intl) and `zustand`; `apps/activity/client` (7 tsx) is a plain React client on `Bun.serve` — [packages/ui/package.json](C:\src\apps\shenron\packages\ui\package.json), [apps/activity](C:\src\apps\shenron\apps\activity).

### Inferences

- Keepable as Bun workers/services with no change: bot, pipeline, api/db/auth/config, activity, media/images/lexicon/native/koharu/dbxv2/crunchyroll, `scripts/` (313 files).
- Rewrite set: all `apps/site/src/{app,components}` (496 + 332 files), ~70 % of `apps/site/src/lib` (325 modules, many Next-coupled via `next/headers`, `next/cache`, `server-only`), and `packages/ui` React components (≈ 240 tsx). CSS token layers (`styles.css`, `site.css`, `toriyama.css`) and `toriyama-svg/*.ts` geometry are portable.

### Gaps

- Exact share of `src/lib` modules importing `next/*` was not measured.

---

## Key question B. Rust crates that can be promoted into the new UI stack

### Takeaway

Already wgpu/vello-based: `shenron-gpu`, `shenron-engine`, `koharu-rasterizer`, `koharu-renderer`, `filmcraft-gpu`; already egui: `filmcraft-ui-egui` (73 k lines) and `apps/filmcraft{,-web}`. Bevy (WebGPU) in `dragon-pixel`. Text shaping stack (skrifa/harfrust/fontique/icu) exists in `koharu-renderer` and `filmcraft-text`.

### Cited Findings

- See Q4 crate list; `shenron-gpu` description "native and browser"; `koharu-rasterizer` "shared Vello/WGPU composition"; `filmcraft-ui-egui` "swappable… panels, docking, timeline, monitors, control channel"; `filmcraft-web` "eframe web runner, WebGPU/WebGL2, OPFS, WebAudio, WebCodecs" — respective `Cargo.toml` files under [crates/](C:\src\apps\shenron\crates).
- WASM artifacts already consumed by the site: `packages/engine/src/wasm/shenron_engine_bg.wasm`, `packages/koharu/src/wasm/koharu_canvas_bg.wasm`, `packages/pipeline/src/wasm/shenron_re_bg.wasm` — [packages/*/src/wasm](C:\src\apps\shenron\packages).
- Owner rule: "Les interfaces Rust et desktop partagent ces contrats visuels et préférences" — [AGENTS.md](C:\src\apps\shenron\AGENTS.md).

### Inferences

- A Rust UI (egui or Dioxus/RSX per the YOLO protocol) can reuse `shenron-gpu` for device/surface, vello for vector/Toriyama assets, `koharu-renderer`/`filmcraft-text` for CJK-capable text, `filmcraft-ui-egui` patterns for docking/timeline (Studio/video), and `shenron-lexicon` + `shenron-mcp` + `shenron-rag` for data/AI.
- `shenron-desktop` (Tauri 3 CEF shell around the Next site) becomes obsolete if the UI is native Rust.

### Gaps

- Dioxus 0.8 / taffy are not in the workspace; feasibility of mixing them with existing egui code was not assessed.

---

## Key question C. External services/APIs to preserve

### Takeaway

Discord (OAuth, bot gateway, Activity SDK, CDN), PostgreSQL + Redis (self-hosted on Prod), Cloudflare R2 + Worker CDN + cloudflared, Stripe and PayPal (VIP subscriptions + donations), Google OAuth/AdSense/GA/GTM, Resend + SMTP email, Crunchyroll (via `@aphrody/bun-video`), Steam account linking, Aphrody services (ML/OCR/RAG/A2A), MCP public endpoint `/mcp`, OpenAPI `/api/agent/v1/openapi.json`.

### Cited Findings

- Env keys list in [apps/site/src/lib/env.ts](C:\src\apps\shenron\apps\site\src\lib\env.ts) (quoted in Q5); public hosts in [packages/config/src/public-urls.ts](C:\src\apps\shenron\packages\config\src\public-urls.ts); auth plugins/providers in [packages/api/src/host/auth.ts](C:\src\apps\shenron\packages\api\src\host\auth.ts); Stripe/PayPal routes under `apps/site/src/app/api/{stripe,paypal}`; webhooks `/api/stripe/webhook`, `/api/paypal/webhook`; R2 Worker [deploy/cloudflare/wrangler.jsonc](C:\src\apps\shenron\deploy\cloudflare\wrangler.jsonc); Neon retired ([packages/db/src/bot-schema.ts](C:\src\apps\shenron\packages\db\src\bot-schema.ts) line 7); A2A "`APHRODY_A2A_COORD_API`… Une configuration absente est une erreur en production" — [README.md](C:\src\apps\shenron\README.md).

### Inferences

- Stripe/PayPal/better-auth are JS SDK-heavy; keeping them in a Bun service is the lowest-risk path while the UI moves to Rust.

### Gaps

- No Supabase, Vercel, Neon or Firebase usage found in the repo; `.env` (197 bytes) not read.

---

## Key question D. Full list of UI components/screens to re-implement

### Takeaway

Screens: 200 page routes (119 public/user + 81 admin) across 3 locales. Components: 332 site `.tsx` (wiki 76, admin 42, home 19, episodes 15, manga 12, kit 9, editor 8, stream 8, media 7, games 6, catalog 5, databooks 5, streaming 5, ratings 4, tierlist 4, site 4, contest 3, social 3, stripe 3, studio 3, ads 2, dragon-world 2, history 2, library 2, profile 2, + 34 root) and ≈ 240 `packages/ui` `.tsx` (31 primitives, 14 navigation, 7 layout, 22 public, 12 admin, 9 reader, 9 studio, 16 toriyama, 7 cinematic, 46 Koharu editor, 5 chat, 7 dbxv2, 4 vie, misc).

### Cited Findings

- Site root components: Avatar, Breadcrumbs, ChunkReloadGuard, CommandMenu, CommandPalette, ConsentGate, DiscordInviteFAB, FavoriteButton, GameSurfaceLayout, GatedLink, JsonLd, LanguageSwitcher, NavAuth, NavigationProgress, PageHero, PageTransition, PageViewTracker, PwaProvider, ReportButton, ShareButton, SiteFooter, SiteShell(Client), T, WikiPageActions, SignInDiscord, SignOut — [apps/site/src/components](C:\src\apps\shenron\apps\site\src\components).
- Wiki components (76): AgeTimeline, CanonExplorer, CharacterGrid, CharacterPowerScaling, CharacterSagaVariants(Tabs), ChronologyAtlas, ChronologyTimeline, GamesExplorer, InterviewsExplorer, ItemsGrid, LocationsGrid, NarrativeEventsExplorer, PowerLevelsTable, SagaCatalogue, scene/{WikiEditorialPortal,WikiSceneDepth,WikiScenePortal,WikiWorldFallback}, SoundtracksGrid, TechniqueArtworkPanel, TechniqueFamiliesView, TechniqueGrid, TransformationsCatalogue, TransformationTreesView, UnifiedStaffExplorer, WikiAdminBar, WikiArticle, WikiCatalogueToolbar, WikiCategoryNav, WikiContribute, WikiContributionJourney, WikiDetailPage, WikiEditBar, WikiEditor, WikiEditorialHero, WikiEntitySections, WikiIndexPage, WikiListLayout, WikiMarkdown, WikiMediaCatalogue, WikiPageShell, WikiPortalIdentity, WikiRagArchives, WikiRelatedCharacters, WikiSectionsReader, WikiVisualFrame, WishesLedger, ZoomableImage, … — [apps/site/src/components/wiki](C:\src\apps\shenron\apps\site\src\components\wiki).
- Admin components (42): AdminSidebar, AdminWorkspace, AdminMediaPicker, bot/{BotUi,CommandsPanel,GuildMirrorPanel}, CharacterPageEditor, CharacterStatsPanel, ContributionRightsPanel, DatabookAdminList, DatabookPagesPanel, DatabooksCatalogManager, DbCrud, GalerieMedias, GameMediaPanel, ImageCropDialog, ImageField, JsonEditor, MarkdownField, NativeAiPanel, NativePipelinePanel, RelationsPanel, RolePicker, SmartField, TranscriptionRelecteur, TranscriptionsDashboard, TransformationsPanel, UnifiedIaCockpit, UserSelect, WikiAiAssistant, WikiEditorialWorkflow, WikiEntityPreview, WikiHistory, WikiSectionsPanel, WikiStudio — [apps/site/src/components/admin](C:\src\apps\shenron\apps\site\src\components\admin).
- Home (19): DbsBeerusSpotlight, HomeBeerusCarousel/Feature/Logo, HomeCanonArbitre, HomeGames, HomeHero, HomeHeroFrames, HomeLive, HomeMenuJourney, HomeMotion, HomeScreenDeck, HomeSection, HomeSoundCue, HomeView, KintoUnVolant, SagaBestOf, SceneBackdrop, SectionScene. Episodes (15): EpisodesCatalogue, EpisodeTimeline, EpisodeThemeSwitcher, VideoPlayer, VideoLecteurs, VideoSelect, VideoTrackControls, WatchLayout, OffreLegale, … Manga (12): MangaReader, UnifiedVolumeReader, MangaChapter3D, MangaDialogueSearch, MangaVolumeGrid, VolumeChaptersList, VignetteTome, … Editor (8, Tiptap). Stream (8): Billboard, EpisodeCard, MediaCatalogRails, Modal, PosterCard, QuickLook, StreamRail, StreamRow — [apps/site/src/components](C:\src\apps\shenron\apps\site\src\components).
- `packages/ui` full list in Q3; Koharu editor (46 tsx) in Q3.
- Games requiring runtimes: 2048, bingo, rock-paper-scissors, tic-tac-toe (DOM games), budokai-tenkaichi-3 (`Bt3Player.tsx`, WASM), dragon-pixel (`CpkScene.tsx`, Bevy/WebGPU wasm), xenoverse-2 (`Xenoverse2Explorer.tsx`, `Dbxv2CpkExplorer.tsx`, shenron-re wasm) — [apps/site/src/app/games](C:\src\apps\shenron\apps\site\src\app\games).

### Inferences

- Screen families for the migration map: (1) Shell/navigation/footer/command palette/language/consent/PWA; (2) Home cinematic; (3) Wiki index+detail per 14 entity types + canon/timeline/search/contribute; (4) News/publications/RSS; (5) Manga library + reader (2D/3D) + databook reader + workshop staff tools; (6) Episodes/movies catalogue + video player + GIF/frames; (7) Catalog/sources/archives; (8) Games hub + 7 games; (9) User: signin/2FA/passkey/profile/settings/favorites/watchlist/dashboard/billing/VIP/donations/shop; (10) Tierlists; (11) Admin workspace (81 pages) incl. design editor, DB CRUD, wiki studio, bot console, IA cockpit, transcriptions; (12) Shenron Studio (Koharu editor, 46 components) + `/desktop` control; (13) Chat/ask (RAG).

### Gaps

- Screens rendered by the bot (Discord embeds, `@napi-rs/canvas` cards in `apps/bot/src/render`) are listed by module, not by card type.
