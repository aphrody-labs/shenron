# deploy

- `docker/`: image de production (`Dockerfile`), fichiers compose, configuration nginx de la gateway.
- `prod/`: pile de production sans secret (`compose.yaml`), unité systemd `shenron-stack.service`, migrations (`apply-migrations.py`).
- `activation/activate.sh`: bascule d'une image service par service, sans coupure.
- `cloudflare/`: Worker CDN sur le bucket R2 `shenron-cdn`, origine locale et outils d'inventaire.
- `sql/`: migrations SQL ponctuelles avec leur retour arrière.
- `privoxy/`: configuration du proxy média.
- `environment.json`: environnement unique de build, livraison et production (vérifié par `bun scripts/deploy/environment.ts --check`).

## Rôles

| Hôte  | Rôle                                                              |
| ----- | ----------------------------------------------------------------- |
| `fr1` | build : images (`Dockerfile.build`, BuildKit), CI, travaux lourds |
| `fr2` | previews et edge (équivalents auto-hébergés de Vercel/Cloudflare) |
| `prd` | production, partagée avec rosegriffon uniquement                  |

Production, tout en images upstream hors le site et le bot : `pgvector/pgvector:pg18`, `redis:8-alpine`,
`ghcr.io/huggingface/text-embeddings-inference` (embeddings e5), `ghcr.io/ggml-org/llama.cpp:server` (chat),
`cloudflare/cloudflared`. Le site, le bot et la gateway sont construits depuis ce dépôt.

Procédure et coordination avec rosegriffon (verrou `/srv/deploy.lock`): [`docs/operations/deploy.md`](../docs/operations/deploy.md).
