# Production

Relevé du 2026-11-02 (SSH `prod`), complété par la reprise du 2026-11-05. Détail des décisions: `docs/decisions/0002-hote-unique-de-production.md`.

## Hôtes

- prod: hôte Hostinger. Il porte tout Shenron. Piloté par SSH `prod`, avec tmux pour les tâches longues.
- dbfr: reçoit la copie de secours. Il garde `auto-minio` et `auto-extraction-ia`, sans lien avec Shenron.
- vps: Bun OS et d'autres projets. Aucun service Shenron n'y tourne. Sert aux builds et aux calculs (OCR, crawls, RAG).
- bunos: hôte de build et de calcul avec peu de disque (11 Gio libres au 2026-11-05).

## Services sur prod (docker compose, `/srv/shenron`)

Conteneurs actifs au relevé: `shenron-site`, `shenron-bot`, `shenron-gateway` (nginx), `shenron-cloudflared`, `shenron-compute`, `shenron-embed`, `shenron-chat`, `shenron-postgres`, `shenron-redis`.

- Le site et le bot utilisent la même image `localhost/shenron:<sha>`.
- postgres: image `pgvector/pgvector:pg18`, base `shenron_site`, schémas `public` et `bot`.
- Chat local: llama-server sur `127.0.0.1:8799`. Embeddings locaux: e5-small dans `shenron-embed`. Modèles sous `/srv/shenron/models`.
- Origine CDN: `shenron-cdn-origin.service`, sur `127.0.0.1:9077`, répond `cdn ok`.
- `/api/health` répond 200. `/api/v1/chat/ws` est monté et protégé.
- `/srv/shenron/current` est un pointeur historique vers une release scellée. Le compose fournit l'image réellement active.
- Runtime global: `/usr/local/bin/bun` (Bun upstream canary 1.4.4).
- `shenron-autodeploy.timer` reste désactivé: il visait l'ancienne fabrique de build.

Fichiers compose du dépôt: `deploy/docker/compose.yaml` (site et bot seulement), `deploy/docker/compose.complete.yaml` (postgres, redis, server, bot, gateway). Le compose de prod complet est sur l'hôte.

## Variables d'environnement

Les noms, jamais les valeurs. Modèle pour le bot: `apps/bot/.env.example`. Variables lues par le déploiement: `SHENRON_IMAGE_TAG`, `SHENRON_REVISION`, `SHENRON_DEPLOY_TARGET`, `SHENRON_DEPLOY_COMMAND`, `SHENRON_COMPOSE_FILE`. Accès administrateur: `SHENRON_API_ADMIN_TOKEN`, `DBFR_TOKEN`. Gel des databooks: `DATABOOKS_FREEZE_FILE` (un fichier absent veut dire gelé).

## Réseau

Le pair WireGuard entre prod et vps utilise le port UDP 52244. Les adresses et endpoints se lisent sur les hôtes, pas ici.
