# deploy

- `docker/`: image de production (`Dockerfile`), fichiers compose, configuration nginx de la gateway.
- `prod/`: pile de production sans secret (`compose.yaml`), unité systemd `shenron-stack.service`, migrations (`apply-migrations.py`).
- `activation/activate.sh`: bascule d'une image service par service, sans coupure.
- `cloudflare/`: Worker CDN sur le bucket R2 `shenron-cdn`, origine locale et outils d'inventaire.
- `sql/`: migrations SQL ponctuelles avec leur retour arrière.
- `privoxy/`: configuration du proxy média.
- `environment.json`: environnement unique de build, livraison et production (vérifié par `bun scripts/deploy/environment.ts --check`).

## Variables d'hôte

Aucun chemin d'hôte n'est écrit en dur: chaque fichier compose, unité systemd et script lit une variable.

| Variable | Rôle |
| --- | --- |
| `SHENRON_ROOT` | racine hôte de la disposition de production (`config/`, `data/`, `models/`, `releases/`, `current`, `shared/`, `compose.yaml`, `.env`). Requise par les fichiers compose de `prod/`, `docker/` et `triad/`. `activation/activate.sh` la déduit de son propre emplacement (`$SHENRON_ROOT/bin/`) et l'exporte; `shenron-stack.service` la lit dans `/etc/shenron/stack.env` |
| `SHENRON_SHARED_ROOT` | données partagées de `docker/compose.yaml`; défaut `$SHENRON_ROOT/shared` |
| `KOHARU_ROOT` | dossier de `prod/koharu.compose.yaml`; `koharu-stack.service` la lit dans `/etc/shenron/koharu.env` |
| `SHENRON_BACKUP_DIR` | sauvegardes de `prod/apply-migrations.py`; défaut `~/backups-auth` |
| `SHENRON_DEPLOY_COMMAND` | commande d'activation distante de `scripts/deploy/ship-image.sh`; défaut `bash ~/deploy-shenron-image.sh` (le `~` est résolu par l'hôte distant) |
| `SHENRON_WINDOWS_BUN_EXE` | `bun.exe` de la tâche planifiée Windows enregistrée par `cloudflare/cli/register-infra.ts`; défaut `bun.exe` (dans le `PATH`) |

Les unités `cloudflare/cli/*.service` utilisent `%h` (dossier personnel de `User=`); `install-cli.sh --install-owner-s3`
écrit `/etc/shenron/cloudflare/s3-renew.env` (`CLOUDFLARE_MANIFEST`) pour l'unité de renouvellement qui tourne en root.
Les chemins internes aux images (racines nginx, volumes du moteur de jeux, home du builder) font partie de la disposition de l'image.

## Rôles

| Hôte  | Rôle                                                              |
| ----- | ----------------------------------------------------------------- |
| `fr1` | build : images (`Dockerfile.build`, BuildKit), CI, travaux lourds |
| `fr2` | previews et edge (équivalents auto-hébergés de Vercel/Cloudflare) |
| `prd` | production, partagée avec rosegriffon uniquement                  |

Production, tout en images upstream hors le site et le bot : `pgvector/pgvector:pg18`, `redis:8-alpine`,
`ghcr.io/huggingface/text-embeddings-inference` (embeddings e5), `ghcr.io/ggml-org/llama.cpp:server` (chat),
`cloudflare/cloudflared`. Le site, le bot et la gateway sont construits depuis ce dépôt.

Procédure et coordination avec rosegriffon (verrou de déploiement partagé): [`docs/operations/deploy.md`](../docs/operations/deploy.md).
