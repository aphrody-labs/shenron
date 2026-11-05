# deploy

- `docker/`: image de production (`Dockerfile`), fichiers compose, configuration nginx de la gateway.
- `cloudflare/`: Worker CDN sur le bucket R2 `shenron-cdn` et outils d'inventaire.
- `sql/`: migrations SQL ponctuelles avec leur retour arrière.
- `prod/apply-migrations.py`: applique les migrations du site, une transaction chacune.
- `privoxy/`: configuration du proxy média.

Procédure de déploiement: `docs/operations/deploy.md`.
