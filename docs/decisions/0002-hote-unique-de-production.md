# ADR 0002 : Un seul hôte de production

- **Statut** : Accepté
- **Date** : 2026-11-02
- **Décideurs** : aphrody-dev
- **Pilier(s) concerné(s)** : deploy, scripts/deploy

## Contexte

Shenron tournait sur DBFR, puis sur Prod pendant la migration de novembre 2026. DBFR garde `auto-minio` et `auto-extraction-ia`, qui n'ont rien à voir avec Shenron. Le VPS héberge Bun OS et d'autres projets. Les dépôts, caches, données et unités Shenron du VPS ont été supprimés le 2026-11-02.

## Décision

Nous retenons Prod comme seul hôte qui sert Shenron: site, API, bot, PostgreSQL, Redis, chat, embeddings, compute, origine CDN et tunnel. DBFR reçoit une copie de secours quotidienne. vps et bunos servent aux builds et aux calculs, pas au trafic.

## Options considérées

| Option                                   | Avantages                 | Inconvénients                                   |
| ---------------------------------------- | ------------------------- | ----------------------------------------------- |
| Prod seul                                | Une topologie, un compose | Un seul point de panne, d'où la copie vers DBFR |
| Répartir site et bot sur plusieurs hôtes | Isolation                 | WireGuard et activation à maintenir entre hôtes |

## Conséquences

- Positives : une topologie lisible (`docs/operations/production.md`).
- Négatives : une panne de Prod coupe tout. Le 2026-11-04 une purge a coupé le site pendant environ six heures.
- Travaux induits : le propriétaire n'a pas décidé si les applications restent sur Prod après l'instruction « réduire prod à nginx, docker, base et CDN ». Ne pas répéter la purge ni déplacer les apps sans cette décision.

## Vérification

Sur Prod: `docker compose -f /srv/shenron/compose.yaml ps` liste les services de `docs/operations/production.md`.

## Références

- `docs/operations/backup-recovery.md`
