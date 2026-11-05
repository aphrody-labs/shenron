# deploy

- `docker/`: image de production (`Dockerfile`), fichiers compose, configuration nginx de la gateway.
- `cloudflare/`: Worker CDN sur le bucket R2 `shenron-cdn` et outils d'inventaire.
- `sql/`: migrations SQL ponctuelles avec leur retour arrière.
- `prod/apply-migrations.py`: applique les migrations du site, une transaction chacune.
- `privoxy/`: configuration du proxy média.

Procédure de déploiement: `docs/operations/deploy.md`.

- catalogue des services et unités : `aphrody-infra/config/service-catalog.json`,
  `aphrody-infra/systemd/shenron-*.{service,timer}` ;
- routes publiques : `yolo/config/host/nginx/routes.json`,
  gabarits `aphrody-infra/nginx/*dragonballfr.com.conf.example` ;
- backups : `aphrody-infra/scripts/ops/backup-shenron-{pg,sqlite}.sh` ;
- topologie et hôtes : `aphrody-infra/docs/SHENRON-MIGRATION.md`,
  `aphrody-infra/docs/PRODUCTION-ALLOCATION.md`.

Ce dépôt construit et livre l'image : `scripts/deploy/release.sh` (voir
[`../docs/operations/AUTO-DEPLOY.md`](../docs/operations/AUTO-DEPLOY.md)) ;
l'activation sur l'hôte reste celle d'`aphrody-infra`, qui installe les gabarits d'ici :
`environment.json` (environnement unique de build, livraison et prod), `prod/compose.yaml`
(pile de Prod sans secret), `activation/activate.sh` (bascule par service). Les chemins
`aphrody-infra` ci-dessus étaient absents du checkout relu le 2026-11-05 (audit E1).

Aucune adresse, aucun hôte ni port de production n'est décrit ici : les lire
dans le catalogue `aphrody-infra`.

## Contenu restant

| Chemin                                   | Rôle                                                                            | Statut |
| ---------------------------------------- | ------------------------------------------------------------------------------- | ------ |
| `deploy/privoxy/shenron-media.conf`      | Configuration Privoxy installée en `/etc/privoxy/config`.                       | Idem.  |
| `deploy/privoxy/shenron-media-proxy.env` | URL locale du pont média lue par le bot (`SHENRON_MEDIA_PROXIES`), sans secret. | Idem.  |
