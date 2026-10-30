<!-- SPDX-License-Identifier: Apache-2.0 -->

# Livraison en une commande

`bun run ship [-- --build-only | --ship-only] [revision]` lance `scripts/deploy/release.sh` :
build et vérification de l'image d'une révision (défaut `origin/main`) sur un hôte Linux x64
doté de Git, Bun, Rust et docker ou podman, puis livraison à `SHENRON_DEPLOY_TARGET`
(défaut `ssh:dbfr`, où l'entrée d'activation Infra `~/deploy-shenron-image.sh` assemble,
scelle, vérifie et active la release). Procédure et variables :
[`CONTAINER-COMPLET.md`](CONTAINER-COMPLET.md) (§ Release) et [`ENV.md`](ENV.md) (§ Release).

Le crawl privé n'en fait plus partie : il se lance à part
(`scripts/data/sync-beerus-site.ts`, voir [`source-synchronization.md`](source-synchronization.md)),
et la publication de son résultat reste une décision éditoriale (droits `approved`, images
publiques autorisées, relecture humaine), que le script de release ne vérifie pas. Les credentials Cloudflare/R2 restent dans les
stores Infra. `robots.txt` n'est jamais lu comme restriction (décision du propriétaire,
2026-10-18).
