# Architecture de Shenron

## 1. Vue d'ensemble et Triade Souveraine

Shenron propulse **dragonballfr.com** au sein du monorepo YOLO (`C:\src\products\shenron`) et s'appuie sur la triade d'infrastructure souveraine interconnectee via WireGuard (`10.200.77.0/24`) :

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

- **`apps/site`** (Next.js 16.5+ standalone sous Bun v1.4.4+) et **`apps/bot`** (`discordx`) tournent dans des conteneurs legers issus de l'image unifiee `localhost/shenron:<sha>`.
- **`apps/server`** assemble le site, l'API Shenron et les routes internes en un binaire Bun (`scripts/build/server.ts`).
- **Base de donnees et Cache** : PostgreSQL 18 avec `pgvector` (`shenron-postgres`, schemas `public` et `bot`) et Redis (`shenron-redis`).
- **IA Locale & MCP** :
  - `shenron-chat` : serveur d'inference LLaMA (`llama-server` sur `127.0.0.1:8799`).
  - `shenron-embed` : serveur d'embeddings vectoriels `e5-small`.
  - `shenron-compute` : serveur MCP HTTP (`aphrody-mcp`).
- **Bibliotheque Native** : `shenron-ffi` appelee en zero-copy depuis Bun via `packages/native`.
- **CDN Media** : Worker Cloudflare (`deploy/cloudflare`) adosse au bucket R2 `shenron-cdn` et replique sur Garage S3 (`ssh cdn`).

### Architecture Cible Full-Rust (`docs/decisions/0001-pile-du-site.md`)

- **Site Web** : Leptos 0.8 SSR avec ilots sur Axum.
- **Shenron Studio & Desktop** : GPUI / Dioxus 0.8, rendu WGPU 30, Vello, Parley, Taffy, AccessKit.
- **Moteur & Pipelines Creatifs** : `crates/bun-engine-core`, `packages/bun-blender` (Blender 5.2.3 LTS), `packages/bun-video-project`, `packages/bun-gamestream`.

---

## 3. Couches du Monorepo

- **Donnees (`packages/db`)** : Schemas Drizzle ORM pour PostgreSQL (`public` et `bot`), migrations SQL versionnees dans `apps/site/src/db/migrations` et `apps/bot/src/db/migrations`.
- **Contrats (`packages/api`, `packages/native`)** : Specification OpenAPI publique generee et bindings FFI C-ABI.
- **Calcul & Editorial (`packages/pipeline`, `crates/shenron-rag`, `crates/shenron-lexicon`)** : OCR de databooks, crawling, RAG hybride et lexique trilingue unifie (FR/EN/JA).
- **Studio Manga (`crates/koharu-*`, `packages/koharu`)** : Detection de bulles, OCR manga, inpainting et typographie assistee.
- **Jeu & Moteur (`crates/dragon-pixel`, `crates/shenron-engine`, `crates/bun-engine-core`, `packages/engine`)** : Moteur 2D/3D et streaming d'assets.

---

## 4. Invariants et Regles de Coherence

1. **Lexique Unique** : `crates/shenron-lexicon` et `packages/lexicon` constituent la seule source de verite terminologique pour le site, le bot, l'API et le pipeline.
2. **Derive Zero (`just drift`)** : Les fichiers generes (`packages/api/openapi/public.json`, `packages/ui/src/tokens.ts`, `packages/native/src/generated/`, `packages/koharu/src/protocol.ts`) sont verifies automatiquement en CI.
3. **Isolation des Lanes de Deploiement** : `scripts/deploy/lanes.ts` calcule exactement quels services (`site`, `bot`, `migrations`, `cdn`) sont impactes par un commit afin de minimiser le temps de build et d'eviter tout redemarrage inutile en production.
