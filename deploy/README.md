# deploy

- `docker/`: image de production (`Dockerfile`), fichiers compose, configuration nginx de la gateway.
- `cloudflare/`: Worker CDN sur le bucket R2 / Garage S3 `shenron-cdn`, origine locale et outils d'inventaire.
- `sql/`: migrations SQL ponctuelles avec leur retour arrière.
- `prod/apply-migrations.py`: applique les migrations du site, une transaction chacune.
- `privoxy/`: configuration du proxy média.

Procédure de déploiement: `docs/operations/deploy.md`.

## Topologie Canonique de la Triade (`10.200.77.0/24`)

| Nœud       | Alias Hérité | IP Publique / Mesh WireGuard    | Système           | Rôle Canonique                                                                            |
| :--------- | :----------- | :------------------------------ | :---------------- | :---------------------------------------------------------------------------------------- |
| **`vps`**  | -            | `51.77.147.152` / `10.200.77.1` | Ubuntu 7.3.0      | Build Hub & Mesh Coordinator                                                              |
| **`cdn`**  | `bunos`      | `51.255.162.6` / `10.200.77.3`  | Ubuntu 7.3.0      | Simulateur Cloudflare Edge (Pingora Gateway, Garage S3 R2, RQLite D1, Workerd, Mail/Auth) |
| **`prod`** | `dbfr`       | `72.60.186.43` / `10.200.77.5`  | Arch Linux 7.2.11 | Production Origin (`dragonballfr.com`)                                                    |

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
`environment.json` (environnement unique de build, livraison et prod incluant la triade), `prod/compose.yaml`
(pile de Prod sans secret), `activation/activate.sh` (bascule par service). Les chemins
`aphrody-infra` ci-dessus étaient absents du checkout relu le 2026-11-05 (audit E1).

## Contenu restant

| Chemin                                   | Rôle                                                                            | Statut |
| ---------------------------------------- | ------------------------------------------------------------------------------- | ------ |
| `deploy/privoxy/shenron-media.conf`      | Configuration Privoxy installée en `/etc/privoxy/config`.                       | Idem.  |
| `deploy/privoxy/shenron-media-proxy.env` | URL locale du pont média lue par le bot (`SHENRON_MEDIA_PROXIES`), sans secret. | Idem.  |
