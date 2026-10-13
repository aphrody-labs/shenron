<!-- SPDX-License-Identifier: Apache-2.0 -->
# Réparer les compteurs de pages existantes

`repair-media-page-counts.ts` remplit uniquement `media_volumes.page_count`
quand ce champ estNULL et que les chapitres associés possèdent des références
de pages uniques déjà présentes dans l'inventaire R2 qualifié. Il ne crée ni
scan, ni chapitre, ni traduction, ni édition et ne change aucun autre champ.

Chaque référence doit désigner une image du catalogue, avec taille positive
et SHA256 valide. Un doublon à l'intérieur d'un volume, une traversée de
chemin, un asset absent ou une précondition modifiée arrêtent le traitement.
La somme décrit les pages réellement référencées par les chapitres, pas la
pagination bibliographique d'un livre imprimé ni une preuve de couverture
de tous ses suppléments.

Le job privé contient `counter-plan.json`, `r2-inventory.json` et un
`backup-receipt.json` attestant la sauvegarde PostgreSQL hors hôte des tables
volumes/chapitres. L'environnement DB existant reste injecté en mémoire.
Exécuter avec Bun et la configuration du site :

```text
bun --conditions react-server --tsconfig-override apps/site/tsconfig.json scripts/ops/repair-media-page-counts.ts <job-private-absolute-path>
bun --conditions react-server --tsconfig-override apps/site/tsconfig.json scripts/ops/repair-media-page-counts.ts <job-private-absolute-path> --apply
```

Le writer canonique `updateWiki` conserve son verrou transactionnel médias
et vérifie `expected: {pageCount: null}` sous ce verrou. Une modification
concurrente du compteur n'est jamais écrasée. Les révisions CMS, une relecture
indépendante de chaque volume et les reçus de progression qualifient l'application.
Une interruption peut laisser un lot partiellement appliqué : relire le reçu
et préparer un nouveau plan frais, sans restaurer aveuglément l'ancienne table.
