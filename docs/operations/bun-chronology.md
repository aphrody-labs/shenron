# Chargement de la chronologie sur Bun

Le modèle, la résolution de la curation et les helpers de tri/export sont
partagés dans `@shenron/config/chronology`. L’ancien module du site les
réexporte ; l’ordre des ères, les notes, le masquage et les rangs sont conservés.

L’hôte Bun expose `GET /api/v1/site/chronology` pour la curation,
`POST` sur la même adresse pour l’enregistrement admin et
`GET /api/v1/wiki/timeline` pour les médias. Les réponses sont sans cache.
`GET /api/v1/wiki/timeline/events` fournit les événements des Âges, avec un
filtre `era` facultatif ; le tri conserve l'année puis le rang éditorial.
`GET /api/v1/wiki/timeline/atlas` fournit les sagas, arcs et références visibles.
Les arcs d'une saga masquée et les arcs sans saga sont exclus. Les références
conservent leur ordre de publication. L'atlas sélectionne uniquement les champs
affichés, sans charger les pages, transcriptions et articles des databooks.
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
renvoient une erreur explicite. La page `/wiki/timeline` charge médias,
curation, Âges et atlas directement depuis ces adaptateurs HTTP, sans importer
le module DB de Next. La bannière utilise déjà son adaptateur vers l'hôte Bun.
Le helper historique `dbUniverse.timelineEvents` délègue également à Bun.
La page conserve son état dégradé et son ISR de 300 secondes. Les autres accès
DB du site restent à migrer ; le rendu React/Next est conservé.

## Qualification

`bun scripts/testing/integration/postgres.ts` teste le stockage JSONB,
l’auteur, les filtres de visibilité et de séries, le tome 1, les indicateurs
de langues, le tri des Âges, les sources et le filtrage de l'atlas sur des
tables synthétiques dans un cluster isolé. Aucune base
produit n’est ouverte. Activation et OAuth réels restent à qualifier.

Lot du 2026-10-07 : 5 tests PostgreSQL et 57 assertions réussis dans le cluster
isolé ; 3 tests d'adaptateurs HTTP du site et 1 test de garde admin réussis.
TypeScript DB/API/site, oxlint, oxfmt et dérivation OpenAPI vérifiés sur ce lot.
Ces preuves portent sur le code local ; la version de production n'est pas
modifiée par cette migration.
