# deploy/docker

Une image `localhost/shenron:<sha>` contient le serveur, le bot et la bibliothèque native.

- `Dockerfile`: image de production, `SHENRON_REVISION` reçoit le commit.
- `compose.yaml`: services applicatifs `site` et `bot`. Tag via `SHENRON_IMAGE_TAG`.
- `compose.complete.yaml`: pile complète (postgres, redis, server, bot, gateway), pour un hôte neuf ou un essai.
- `compose-gateway.nginx.conf`: nginx de la gateway. Test: `bun test deploy/docker/compose-gateway.nginx.test.ts`.

Construire et livrer: `docs/operations/deploy.md`.
