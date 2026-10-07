# Chronologie média et curation sur Bun

Le modèle, la résolution de la curation et les helpers de tri/export sont
partagés dans `@shenron/config/chronology`. L’ancien module du site les
réexporte ; l’ordre des ères, les notes, le masquage et les rangs sont conservés.

L’hôte Bun expose `GET /api/v1/site/chronology` pour la curation,
`POST` sur la même adresse pour l’enregistrement admin et
`GET /api/v1/wiki/timeline` pour les médias. Les réponses sont sans cache.
L’hôte ouvre et ferme son pool Bun.SQL. La curation réutilise le singleton
`default` de `ChronologyConfig`, avec un upsert JSONB atomique ; l’auteur
provient de l’identité authentifiée. Les corps dépassant 512 Kio sont refusés.

Le dépôt média lit les épisodes et films visibles, ainsi que les tomes visibles
`DB` et `DBS`, sans filtre sur leur titre : le tome 1 reste dans la frise.
Il ne publie que les indicateurs VF/VOSTFR, jamais les URL de lecteurs.
Un tableau de lecteurs contenant une entrée nulle ne fait pas tomber le dataset.

Next n’enregistre plus la curation et son ancien helper `dbUniverse.timeline`
délègue la lecture média à l’hôte. La route de configuration transmet les
credentials, conserve sa garde admin et la revalidation du site. Sans hôte,
la curation lue utilise les défauts ; les écritures et le dataset manquant
renvoient une erreur explicite. Les événements narratifs, distincts de ce
dataset média, restent à migrer, ainsi que les autres accès DB du site.

## Qualification

`bun scripts/testing/integration/postgres.ts` teste le stockage JSONB,
l’auteur, les filtres de visibilité et de séries, le tome 1 et les indicateurs
de langues sur des tables synthétiques dans un cluster isolé. Aucune base
produit n’est ouverte. Activation et OAuth réels restent à qualifier.
