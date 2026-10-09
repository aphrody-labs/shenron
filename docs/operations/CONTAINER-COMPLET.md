<!-- SPDX-License-Identifier: Apache-2.0 -->

# Conteneur Complet et Pile Docker Shenron (dragonballfr.com)

Ce document est la référence canonique pour le déploiement et l'exécution conteneurisée
complète de **Shenron** (dragonballfr.com). Il couvre la totalité des composants du produit :
le site Next.js 16, Shenron Studio (l'éditeur de traduction manga), l'accueil Bureau / Desktop,
le bot Discord, le serveur d'API et MCP (`shenron-server`), la base de données PostgreSQL,
le cache Redis, la passerelle Nginx / CDN, et l'intégration des secrets Aphrody et des opérations OVH.

---

## 1. Deux modes de conteneurisation

Selon les besoins d'exploitation ou de développement, deux modes sont fournis :

### Mode A : Conteneur Unique Tout-en-Un (`deploy/docker/all-in-one/`)

Un conteneur autonome hermétique qui fait tourner l'intégralité de la pile Shenron dans un seul conteneur Docker :

- **Superviseur interne** (`entrypoint.sh`) avec gestion propre des signaux `SIGTERM` / `SIGINT`.
- **PostgreSQL 16/18** avec extensions `uuid-ossp`, `pg_trgm`, `unaccent`.
- **Redis 7/8** pour le cache de sessions et le rate limiting.
- **Nginx** frontal assurant le routage des 4 domaines (`dragonballfr.com`, `bot.dragonballfr.com`, `cdn.dragonballfr.com`, `mcp.dragonballfr.com`) et le service des assets CDN.
- **Shenron Server** (`shenron-server serve all`) hébergeant le site Next.js 16, l'espace Studio, le bureau, l'hôte MCP et démarrant en processus enfant le **Shenron Bot**.

### Mode B : Pile Docker Compose Multi-Services (`deploy/docker/compose.complete.yaml`)

Une composition orchestrée séparant chaque responsabilité dans un conteneur dédié :

1. `postgres` : `pgvector/pgvector:pg18`, même version majeure que la production (PostgreSQL 18 avec `vector` pour le store RAG), `shm_size: 1g` pour l'index HNSW, volume `postgres_data` monté sur `/var/lib/postgresql` (disposition de l'image 18) et sonde `pg_isready`.
2. `redis` : Service Redis avec volume persistant `redis_data` et sonde `redis-cli ping`.
3. `server` : Service Shenron Server (Site, Studio, Bureau, MCP, API) écoutant sur 5011 et 8790.
4. `bot` : Service Shenron Bot écoutant sur 5006 avec volume `bot_data` pour SQLite ; opt-in (`--profile discord`) pour ne pas doubler le bot de production.
5. `gateway` : Nginx (`compose-gateway.nginx.conf`) servant de reverse-proxy HTTP local (port 80) et CDN statique ; la surveillance OVH reste hors de la pile locale (`bun scripts/ops/ovh-shenron.ts --watch`).

---

## 2. Ports et Topologie Réseau

| Service              | Port Interne | Port Hôte Exposé | Rôle                                                    |
| -------------------- | ------------ | ---------------- | ------------------------------------------------------- |
| **Passerelle Nginx** | 80, 443      | `80`, `443`      | Reverse-proxy public, terminaison TLS, HTTP/3 QUIC, CDN |
| **Shenron Server**   | 5011         | `127.0.0.1:5011` | Site Next.js 16, Studio, Bureau, MCP, API Publique      |
| **Studio Bridge**    | 8790         | `127.0.0.1:8790` | Pont local de l'éditeur Koharu (`/api/local/koharu`)    |
| **Shenron Bot API**  | 5006         | `127.0.0.1:5006` | API interne et commandes REST du bot Discord            |
| **PostgreSQL**       | 5432         | `127.0.0.1:5432` | Base relationnelle `shenron_site`                       |
| **Redis**            | 6379         | `127.0.0.1:6379` | Cache, sessions Better Auth, rate limiting              |
| **Chat IA Sidecar**  | 8799         | `127.0.0.1:8799` | Inférence CPU LLaMA / Gemma4 (optionnel)                |

---

## 3. Gestion des Secrets Aphrody & Sécurité

Conformément à la politique `zero-plaintext-secrets-in-git` :

- **Aucun secret n'est commité dans Git.**
- Les fichiers générés sous `deploy/docker/env/*.env` et `deploy/docker/tls/` sont ignorés par `.gitignore` et créés avec des permissions strictes `0600`.
- L'outil `scripts/ops/container-secrets.ts` découvre automatiquement les secrets dans :
  1. `~/.aphrody/private/shenron/hosts/{dbfr,vps}`
  2. `~/.aphrody/private/shenron/env/`
  3. `/etc/rose-griffon/`
  4. `/etc/aphrody/`
  5. Les certificats TLS de `~/.aphrody/private/shenron/hosts/dbfr/etc/aphrody/shenron-tls/`

### Mode Production vs Mode Développement

- **Mode Production (`--prod`)** : Extrait et vérifie les clés requises du contrat (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `DISCORD_TOKEN_SHENRON`, jetons Aphrody AI).
- **Mode Développement (`--dev`)** : En l'absence des secrets de production (sur poste local ou test CI), injecte automatiquement des replis sécurisés locaux (base de données locale, token de test, URLs `localhost`) pour permettre un test immédiat sans bloquer l'exécution.

---

## 4. Base de Données et Migrations

L'initialisation des bases est assurée par `scripts/ops/container-db-init.ts` :

1. **PostgreSQL** :
   - Création de la base `shenron_site`.
   - Création des extensions nécessaires : `uuid-ossp`, `pg_trgm`, `unaccent`.
   - Application séquentielle des 23 migrations Drizzle du site (`apps/site/src/db/migrations/0000_...sql` à `0022_...sql`).
   - Suivi dans la table d'audit `_container_migrations`.
2. **SQLite Bot** :
   - Initialisation de `bot.db` sous `/app/data/bot.db`.
   - Application séquentielle des 20 migrations du bot (`apps/bot/src/db/migrations/0000_...sql` à `0019_...sql`).
3. **VFS SQLite** :
   - Chargement du snapshot public `shenron-vfs.sqlite`.

### Base locale restaurée depuis la production

Sans données, les rubriques sous règle d'accès redirigent vers `/coming-soon` (la configuration de
lancement vit en base). Pour une pile locale fidèle, on restaure un dump de la production, pris en
lecture seule. Le fichier reste sous `var/tmp/` (ignoré) et ne quitte jamais le poste :

```sh
# sur dbfr, détaché (les flux SSH longs par WireGuard se coupent)
nohup sh -c 'sudo docker exec -u postgres shenron-postgres-1 pg_dump -Fc -Z6 -d shenron_site > /tmp/shenron_site.dump' &
# rapatriement en morceaux `dd` de 32 Mio, sha256 comparé des deux côtés, puis suppression sur dbfr
docker cp var/tmp/shenron_site.dump shenron-postgres:/tmp/s.dump
docker exec shenron-postgres pg_restore -U shenron -d shenron_site --no-owner --no-acl -j 4 /tmp/s.dump
```

`POSTGRES_PASSWORD` vient de `deploy/docker/env/deploy.env` (`docker compose --env-file env/deploy.env`).

---

## 5. Surveillance OVH et Infrastructure

Le module `scripts/ops/ovh-shenron.ts` effectue les contrôles de conformité opérateur :

- **Authentification OVHcloud** : Détection des identifiants OAuth2 service account (`OVH_CLIENT_ID`, `OVH_CLIENT_SECRET`) ou application keys.
- **Résolution DNS** : Vérification des enregistrements A/AAAA pour :
  - `dragonballfr.com` (apex)
  - `bot.dragonballfr.com`
  - `cdn.dragonballfr.com`
  - `mcp.dragonballfr.com`
- **Surveillance VPS** : Contrôle des politiques d'expiration (`renew.automatic=true`, `renew.deleteAtExpiration=false`) avec alerte anticipée à 14 jours.

---

## 6. Commandes Rapides (Justfile)

Toutes les opérations courantes sont disponibles via `just` :

```sh
# 1. Découvrir et préparer les secrets Aphrody
just container-env               # Mode dev local
just container-env --prod        # Mode production

# 2. Construire l'image Docker
just container-build --all-in-one   # Conteneur unique
just container-build               # Image standard

# 3. Lancer la pile
just container-up --all-in-one     # Démarrage conteneur complet
just container-up                  # Démarrage pile Compose

# 4. Vérifier l'état de santé de tous les services
just container-status

# 5. Appliquer ou vérifier les migrations de base de données
just container-db-init

# 6. Auditer la configuration OVH et DNS
just container-ovh

# 7. Sauvegarder les données
just container-backup

# 8. Arrêter la pile
just container-down

# 9. Relayer PostgreSQL (15433) et le chat IA (8799) de production en local
bun scripts/dev/env-pull.ts tunnel --host vps
```

---

### Build sur le VPS : image `aphrody-build`

Les étapes Rust, WASM, `bun install` et bot de la release (`scripts/ops/release-host.ts`) et du runner
self-hosted (`server-artifact.yml`) tournent dans l'image de build d'Aphrody (`aphrody-build:latest`), par
`scripts/build/container.ts` : toolchain épinglée (Rust de `rust-toolchain.toml`, Bun de `packageManager`,
`wasm-bindgen` de `Cargo.lock`), caches partagés en volumes (`aphrody-build-{cargo,sccache,bun,xwin,xdg}`),
6 CPU et 16 Gio sans swap au plus, verrou lourd de l'usine. `bun scripts/build/container.ts --check` compare
l'image au checkout. La release construit dans `~/shenron-release` (worktree détaché forcé sur `origin/main`),
jamais dans `~/shenron`. Contrat et mesures : `docs/operations/container/CONTAINER.md` et
`docs/operations/infra/SHENRON-DOCKER.md` d'Aphrody.

### Livraison Docker vers dbfr

Aucun build sur dbfr : il reçoit seulement l'image scellée. Sur le vps, les étapes longues tournent
dans tmux, sans flux SSH maintenu ouvert :

1. `tmux new -d -s shenron-build 'bash ~/shenron-docker-build.sh > ~/shenron-docker-build.log 2>&1'` :
   worktree détaché sur `origin/main`, cargo (verrou lourd), WASM, bot, serveur, image
   `localhost/shenron:<sha>`, puis `version` et `--smoke` du bot.
2. `~/ship-shenron.sh` (session `shenron-ship`, lancée après un build vert) : `docker save | zstd`,
   `scp` vers dbfr, puis `~/deploy-shenron-image.sh <sha> <tar>` sur dbfr. Ce script charge l'image,
   assemble la release (`~/assemble-shenron.py`, override `guild-admission`), la scelle
   (`~/seal-shenron-docker-release.py`, en reprenant les images passerelle, postgres, redis et chat
   de la release active), puis `aphrody-infra-deploy-shenron verify` et `activate` (sauvegarde de
   retour arrière dans `/srv/shenron/deploy-backups/`).
3. Sondes : pages, `/api/health`, `/api/public/rag/search`, `tools/list` anonyme de `/mcp`, `bot.` et `cdn.`.

## 7. Tunnel vers le vps et dbfr

Pas de gestionnaire de tunnel propre à ce dépôt : le réseau privé wg1 (10.200.77.0/24) appartient à
l'Infra d'Aphrody (`aphrody infra wg`, inventaire `tools/config/host/wireguard/aphrody-tunnel.json`,
voir `START-HERE.md` §5), et le relais SSH de développement (PostgreSQL 15433, chat IA 8799) est
`bun scripts/dev/env-pull.ts tunnel` (`docs/operations/DEV-LOCAL.md`).

## 8. Automatisation

Le déploiement, les migrations de production et la publication appartiennent à l'Infra d'Aphrody ;
ce dépôt ne déploie rien en continu. Le crawl du site officiel passe par
`scripts/ops/crawl-dragon-ball-official-aphrody.ts` (`--status | --dry-run | --apply`) ; ses
captures ne sont pas encore ingérées dans les tables éditoriales ni dans le VFS. La boucle
`scripts/ops/train-shenron-chat-loop.ts` génère des rollouts et les évalue sur le jeu gold : elle
ne lance aucun entraînement LoRA/SFT.

---

## 9. Connecteurs Agents (Codex, AGY, Claude Code & Omar)

Le script `scripts/ops/setup-agent-connectors.ts` (`just setup-connectors`) configure et teste les connecteurs d'agents pour l'ensemble des environnements :

### Surfaces d'exposition :

1. **Public Direct (Zero-Tunnel)** :
   - **Shenron MCP HTTP** : `https://dragonballfr.com/mcp` (Streamable HTTP, read-only, aucun secret requis).
   - **Shenron A2A Hub** : `https://dragonballfr.com/api/a2a` & `https://dragonballfr.com/.well-known/agent-card.json`.
2. **Tunnel Privé / VPN Mesh (Aphrody Core)** :
   - **Aphrody MCP HTTP** : `http://127.0.0.1:8793/mcp` (Streamable HTTP, authentifié via `Bearer <APHRODY_MCP_HTTP_TOKEN>`).
   - **Aphrody A2A Hub** : `http://127.0.0.1:8788` (Protocole A2A 1.0, endpoints `/ping`, `/msg`, `/jsonrpc`, `/events`).
   - **LLM Gemma4** : `http://127.0.0.1:8798/health`.
   - **LLM Qwen3 Shenron Chat** : `http://127.0.0.1:8799/health`.

### Configuration des outils :

- **Claude Code** : `.mcp.json` / `~/.claude.json` déclarant les serveurs `shenron-public` et `aphrody-tunnel`.
- **Antigravity / AGY** : `plugin/mcp_config.json` ou `~/.gemini/antigravity-cli/mcp_config.json`.
- **Codex** : `.codex/config.toml` avec bloc `[mcp_servers]`.
- **Poste d'Omar** : Pack clé en main dans `deploy/connectors/omar/` incluant scripts de tunnel (`connect-tunnel.ps1`, `connect-tunnel.sh`), configuration WireGuard (`wireguard-omar.conf.example`), modèles de configuration d'agents et `README.md` pas-à-pas.
