# Architecture

## Deux états

Production aujourd'hui:

- `apps/site` (Next.js 16) et `apps/bot` (discordx) tournent sous Bun.
- `apps/server` empaquette le site, l'API Shenron et les API locales en un binaire Bun (`scripts/build/server.ts`).
- Le bot a sa propre base (schéma `bot.*`) et son API montée dans `Bun.serve`.
- La bibliothèque native `shenron-ffi` est appelée depuis Bun par `packages/native`.
- Les médias sont servis par le CDN (`deploy/cloudflare`, Worker sur le bucket R2 `shenron-cdn`).

Cible, selon `docs/decisions/0001-pile-du-site.md`:

- Site: Leptos 0.8 SSR avec îlots sur Axum.
- Studio: Dioxus. Rendu: wgpu, vello, Parley, Taffy, AccessKit.
- Bot, scripts, tests: Bun.

## Couches

- Données: PostgreSQL (schémas `public` et `bot`, extension pgvector pour le RAG) et Redis. Schéma Drizzle dans `packages/db`.
- Contrats: `packages/api` (OpenAPI public généré), `packages/native` (binding FFI généré).
- Calcul: `packages/pipeline` (OCR, crawl, RAG, IA), `crates/shenron-rag`, `crates/shenron-lexicon`.
- Studio: `crates/koharu-*` (moteur d'édition manga), `crates/shenron-desktop` (Tauri 3), `packages/koharu` (client et protocole).
- Jeu: `crates/dragon-pixel`, `crates/shenron-engine`, `packages/engine`.

## Règles

- Un seul lexique de traduction (`crates/shenron-lexicon`, `packages/lexicon`) sert le site, l'API, le bot, le plugin et le pipeline.
- Les fichiers générés (`packages/api/openapi/public.json`, `packages/ui/src/tokens.ts`, `packages/native/src/generated/`, `packages/koharu/src/protocol.ts`) ne se modifient pas à la main; `just drift` détecte l'écart.
- Les migrations SQL du site sont dans `apps/site/src/db/migrations`; celles du bot dans `apps/bot/src/db/migrations`.
- Koharu est un nom de code interne (crates `koharu-*`, paquet `@aphrody/shenron-koharu`).
