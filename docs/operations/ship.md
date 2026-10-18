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
SHENRON_HUMAN_REVIEW_RECEIPT=/chemin/protege/review.json
SHENRON_HUMAN_REVIEWER_EMAIL=yohanpierre15@gmail.com
```

Avec `SHENRON_AUTO_DEPLOY=false` ou absent, seul le crawl s'exécute. Avec `true`, un
administrateur doit fournir `SHENRON_HUMAN_REVIEW_RECEIPT`, un JSON externe contenant
`reviewedBy`, `reviewedAt`, `decision: "approved"` et `capture`. `reviewedBy` doit être
identique à `SHENRON_HUMAN_REVIEWER_EMAIL`. Le runner ne crée pas ce reçu et ne prend aucune
décision éditoriale ; il vérifie seulement sa structure et la correspondance d'identité. Les droits
doivent ensuite être `approved` et les images publiques autorisées ; le runner utilise ensuite les
variables `SHENRON_RELEASE_*`, `SHENRON_SITE_URL`, `SHENRON_CDN_URL` et `SHENRON_BOT_URL`.
Les credentials Cloudflare/R2 restent dans les stores Infra. `robots.txt` n'est jamais lu comme restriction (décision du propriétaire, 2026-10-18).
