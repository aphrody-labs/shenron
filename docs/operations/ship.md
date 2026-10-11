<!-- SPDX-License-Identifier: Apache-2.0 -->

# Livraison en une commande

`bun run ship` enchaîne le crawl privé puis, uniquement si l’administrateur l’active, le build,
la publication CDN et le déploiement Infra.

Variables protégées minimales :

```env
SHENRON_CRAWL_OUTPUT=/home/ubuntu/.aphrody/profiles/dbfr/corpus/beerus-sync
SHENRON_CRAWL_PUBLICATION_RIGHTS=approved
SHENRON_CRAWL_PUBLIC_IMAGES_PERMITTED=true
SHENRON_AUTO_DEPLOY=true
```

Avec `SHENRON_AUTO_DEPLOY=false` ou absent, seul le crawl s’exécute. Avec `true`, les droits
doivent être `approved` et les images publiques autorisées ; le runner utilise ensuite les
variables `SHENRON_RELEASE_*`, `SHENRON_SITE_URL`, `SHENRON_CDN_URL` et `SHENRON_BOT_URL`.
Les credentials Cloudflare/R2 restent dans les stores Infra. `robots.txt` reste obligatoire
et une origine refusée est bloquée en fail-closed.
