# Architecture de Shenron

## 1. Vue d'ensemble

Shenron sert **dragonballfr.com** (`$WORKSPACE_ROOT/shenron`) sur trois hotes relies par WireGuard (`10.200.77.0/24`, definis dans `deploy/environment.json`, cle `triad`) :

- **`ssh vps` (`10.200.77.1` / `51.77.147.152`)** : Hub de maillage WireGuard et usine de compilation (12 coeurs, sccache, builds Rust/Bun, pipelines OCR et indexation RAG).
- **`ssh cdn` (`10.200.77.3` / `51.255.162.6`, alias `bunos`)** : Simulateur Cloudflare Edge de bout en bout executant :
  - **Pingora Gateway** (`yolo-cf-gateway.service`) : routage L4/L7, TLS et cache HTTP.
  - **Garage S3** (`yolo-cf-garage.service`) : stockage objet distribue compatible S3 / Cloudflare R2.
  - **RQLite** (`yolo-cf-rqlite.service`) : SQLite replique par consensus Raft (role Cloudflare D1).
  - **Workerd** (`yolo-cf-workerd.service`) : runtime natif Cloudflare Workers executant `deploy/cloudflare`.
- **`ssh prod` (`10.200.77.5` / `72.60.186.43`)** : Serveur de production bare-metal sous Arch Linux 7.2.11 (Btrfs, 203 Go libres) hebergeant les conteneurs actifs de `dragonballfr.com`.

---

## 2. Etat de Production et Pile Cible

### En production aujourd'hui (`ssh prod`)

- **`apps/site`** (Next.js 16.5+ standalone sous Bun) et **`apps/bot`** (`discordx`) tournent dans des conteneurs legers issus de l'image unifiee `localhost/shenron:<sha>`.
- **`apps/server`** assemble le site, l'API Shenron et les routes internes en un binaire Bun (`scripts/build/server.ts`).
- **Base de donnees et Cache** : PostgreSQL 18 avec `pgvector` (`shenron-postgres`, schemas `public` et `bot`) et Redis (`shenron-redis`).
- **IA Locale & MCP** :
  - `shenron-chat` : serveur d'inference LLaMA (`llama-server` sur `127.0.0.1:8799`).
  - `shenron-embed` : serveur d'embeddings vectoriels `e5-small`.
  - `shenron-compute` : serveur MCP HTTP (`shenron-mcp`).
- **Bibliotheque Native** : `shenron-ffi` appelee en zero-copy depuis Bun via `packages/native`.
- **CDN Media** : Worker Cloudflare (`deploy/cloudflare`) adosse au bucket R2 `shenron-cdn` et replique sur Garage S3 (`ssh cdn`).

### Cible

- Auto-hebergement Rust sans PaaS : `docs/decisions/0009-auto-hebergement-rust-integral.md`.
- Surfaces applicatives (admin, Studio, desktop, web) : GPUI (`gpui-kit`), ADR 0008, qui remplace Dioxus et Leptos.
- Site public : l'ADR 0009 prevoit encore Leptos (ADR 0001, remplace par l'ADR 0008). Conflit ouvert, voir `docs/plans/base-ui-vers-gpui.md`.
- `packages/bun-blender`, `packages/bun-video-project`, `packages/bun-gamestream` et `crates/bun-engine-core` ont ete supprimes le 2026-11-11 (commit `46f1f542`).

---

## 3. Couches du Monorepo

- **Donnees (`packages/db`)** : Schemas Drizzle ORM pour PostgreSQL (`public` et `bot`), migrations SQL versionnees dans `apps/site/src/db/migrations` et `apps/bot/src/db/migrations`.
- **Contrats (`packages/api`, `packages/native`)** : Specification OpenAPI publique generee et bindings FFI C-ABI.
- **Calcul & Editorial (`packages/pipeline`, `shenron-rag` et `shenron-lexicon` dans `../wiki/crates`)** : OCR de databooks, crawling, RAG hybride et lexique trilingue unifie (FR/EN/JA).
- **Studio Manga (`koharu-*` dans `../wiki/crates`, `packages/koharu`)** : Detection de bulles, OCR manga, inpainting et typographie assistee.
- **Jeu & Moteur (`dragon-pixel` et `shenron-engine` dans `../wiki/crates`, `packages/engine`)** : Moteur 2D/3D et streaming d'assets.

---

## 4. Invariants et Regles de Coherence

1. **Lexique Unique** : `shenron-lexicon` (`../wiki/crates`) et `packages/lexicon` constituent la seule source de verite terminologique pour le site, le bot, l'API et le pipeline.
2. **Derive zero (`just drift`)** : la CI verifie `packages/api/openapi/public.json`, les cas de `data/api/fixtures`, `packages/ui/src/tokens.ts` et les contrats IA de `packages/pipeline`. `packages/native/src/generated/` se verifie par `just native-generate --check`.
3. **Isolation des Lanes de Deploiement** : `scripts/deploy/lanes.ts` calcule les lanes (`site`, `bot`, `server`, `image`) et les services (`site`, `bot`) qu'un commit atteint, pour ne reconstruire et ne redemarrer que ceux-la.
