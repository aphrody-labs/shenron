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
1. `postgres` : Service PostgreSQL 16/18 avec volume persistant `postgres_data` et sonde `pg_isready`.
2. `redis` : Service Redis avec volume persistant `redis_data` et sonde `redis-cli ping`.
3. `server` : Service Shenron Server (Site, Studio, Bureau, MCP, API) écoutant sur 5011 et 8790.
4. `bot` : Service Shenron Bot écoutant sur 5006 avec volume `bot_data` pour SQLite ; opt-in (`--profile discord`) pour ne pas doubler le bot de production.
5. `gateway` : Nginx (`compose-gateway.nginx.conf`) servant de reverse-proxy HTTP local (port 80) et CDN statique ; la surveillance OVH reste hors de la pile locale (`bun scripts/ops/ovh-shenron.ts --watch`).

---

## 2. Ports et Topologie Réseau

| Service | Port Interne | Port Hôte Exposé | Rôle |
|---|---|---|---|
| **Passerelle Nginx** | 80, 443 | `80`, `443` | Reverse-proxy public, terminaison TLS, HTTP/3 QUIC, CDN |
| **Shenron Server** | 5011 | `127.0.0.1:5011` | Site Next.js 16, Studio, Bureau, MCP, API Publique |
| **Studio Bridge** | 8790 | `127.0.0.1:8790` | Pont local de l'éditeur Koharu (`/api/local/koharu`) |
| **Shenron Bot API** | 5006 | `127.0.0.1:5006` | API interne et commandes REST du bot Discord |
| **PostgreSQL** | 5432 | `127.0.0.1:5432` | Base relationnelle `shenron_site` |
| **Redis** | 6379 | `127.0.0.1:6379` | Cache, sessions Better Auth, rate limiting |
| **Chat IA Sidecar** | 8799 | `127.0.0.1:8799` | Inférence CPU LLaMA / Gemma4 (optionnel) |

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

# 9. Gérer le tunnel natif (VPS/DBFR <-> Windows natif)
just tunnel-up                   # Démarrer le tunnel SSH multi-ports
just tunnel-status               # Vérifier les ports relayés
just tunnel-wg                   # Générer le fichier WireGuard client
just tunnel-down                 # Arrêter le tunnel

# 10. Pipeline d'automatisation continue
just auto-deploy                 # Vérifier et déployer dès push origin/main
just auto-crawl-rag              # Crawl Aphrody Web & reconstruction VFS
just auto-finetune               # Évaluation RAG & Fine-tuning LLM (CUDA/CPU)
just daemon                      # Lancer le master daemon autonome
```

---

## 7. Tunnel Natif Complet (VPS Build, DBFR Prod & Windows Natif)

Le gestionnaire `scripts/ops/native-tunnel.ts` relie de manière étanche le poste de travail Windows aux deux serveurs distants :
- **Hub VPS** (`10.200.77.1`, IP publique `51.77.147.152`)
- **DBFR Prod** (`10.200.77.3`, IP publique `51.255.162.6`)
- **Windows Natif** (`10.200.77.4`, boucle locale)

### Ports relayés en boucle locale
- `15433` -> `5432` : PostgreSQL distant (`shenron_site`)
- `16379` -> `6379` : Redis distant
- `8799` -> `8798` : Chat IA Gemma 4 distant
- `8793` -> `8793` : MCP HTTP distant
- `5011` -> `5011` : Serveur Shenron distant
- `5006` -> `5006` : Bot Discord distant

Configuration WireGuard générée sous `deploy/docker/wireguard-aphro-pc.conf.example`.

---

## 8. Automatisation Continue & Intelligence Artificielle

### Auto-Deploy dès push sur `origin/main`
Le script `scripts/ops/auto-deploy.ts` surveille le dépôt GitHub :
1. Détection de tout nouveau commit sur `origin/main`.
2. Fast-forward de la branche locale (`git pull --ff-only`).
3. Synchronisation automatique des secrets sans fuite (`container-secrets.ts`).
4. Application des nouvelles migrations de bases PostgreSQL et SQLite (`container-db-init.ts`).
5. Redémarrage ou reconstruction transparente des conteneurs (`container.ts up`).
6. Contrôle des sondes de santé post-déploiement.

### Auto-Crawl Web & Mise à jour du RAG
Le script `scripts/ops/auto-crawl-rag.ts` :
1. Crawle les nouvelles publications du site officiel Dragon Ball via l'API Aphrody Web.
2. Reconstruit la base de connaissances VFS publique (`shenron-vfs.sqlite`).
3. Met à jour les index vectoriels de recherche canonique.

### Auto-Évaluation & Fine-Tuning LLM (CUDA / CPU)
Le script `scripts/ops/auto-eval-finetune.ts` :
1. Détecte automatiquement l'accélération matérielle NVIDIA CUDA (ex: GeForce RTX 4070, 12 Go VRAM) avec repli propre sur CPU si aucun GPU n'est disponible.
2. Évalue la fidélité des citations et le Recall@5 sur le jeu de test gold.
3. Exécute les cycles de fine-tuning itératif LoRA / SFT (`train-shenron-chat-loop.ts`).

### Master Daemon Autonome
`scripts/ops/shenron-daemon.ts` (`just daemon`) orchestre l'ensemble de ces sous-systèmes en continu en tâche de fond.

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


