<!-- SPDX-License-Identifier: Apache-2.0 -->

# Livraison en une commande

`bun run ship [-- --build-only | --ship-only] [revision]` lance `scripts/deploy/release.sh` :
build et vérification de l'image d'une révision (défaut `origin/main`) sur un hôte Linux x64
doté de Git, Bun, Rust et docker ou podman, puis livraison à `SHENRON_DEPLOY_TARGET`
(défaut `ssh:prod`, où l'entrée d'activation Infra `/root/deploy-shenron-image.sh` assemble,
scelle, vérifie et active la release). Procédure et variables :
[`CONTAINER-COMPLET.md`](CONTAINER-COMPLET.md) (§ Release) et [`ENV.md`](ENV.md) (§ Release).

Le crawl privé n'en fait plus partie : il se lance à part
(`scripts/data/sync-beerus-site.ts`, voir [`source-synchronization.md`](source-synchronization.md)),
et la publication de son résultat reste une décision éditoriale (droits `approved`, images
publiques autorisées, relecture humaine), que le script de release ne vérifie pas. Les credentials Cloudflare/R2 restent dans les
stores Infra. `robots.txt` n'est jamais lu comme restriction (décision du propriétaire,
2026-10-18).

## Fabrique `vps` : tenir le build en dessous de la mémoire

Mesuré le 2026-11-02 sur un build complet de `71f608f1` : 29 min, dont 27 min pour le site Next
(pic de 36 Go de mémoire résidente, temps système égal au temps utilisateur : le build
swappait). L'hôte (12 cœurs, 47 Go) partageait sa mémoire et ses cœurs avec un build Chromium
(conteneur `aphrody-helium-build`, jusqu'à 24 Go) et un émulateur Android. La livraison, elle,
prend 87 s (transfert zstd, `docker load`, activation).

- Avant de lancer un build du site, vérifier la charge (`uptime`, `free -g`) : sous 20 Go
  disponibles, `build-image.sh` attend déjà (`SHENRON_SITE_BUILD_MIN_GIB`) ; ne pas lancer de build
  concurrent.
- Réglages réversibles posés : `vm.swappiness = 30` (`/etc/sysctl.d/99-shenron-build.conf`,
  contre 100) et `docker update --cpu-shares 128` sur `aphrody-helium-build` (priorité réduite
  seulement en cas de contention, aucune limite dure).
- Les caches Docker (≈ 28 Go récupérables) et les images inutilisées se nettoient par
  l'Infra, jamais les volumes.
