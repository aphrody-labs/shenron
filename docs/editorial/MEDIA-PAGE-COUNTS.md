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
cd apps/site
bun --conditions react-server scripts/repair-media-page-counts.ts <job-private-absolute-path>
bun --conditions react-server scripts/repair-media-page-counts.ts <job-private-absolute-path> --apply
```

Le writer canonique `updateWiki` conserve son verrou transactionnel médias
et vérifie `expected: {pageCount: null}` sous ce verrou. Une modification
concurrente du compteur n'est jamais écrasée. Les révisions CMS, une relecture
indépendante de chaque volume et les reçus de progression qualifient l'application.
Une interruption peut laisser un lot partiellement appliqué : relire le reçu
et préparer un nouveau plan frais, sans restaurer aveuglément l'ancienne table.

L'entrypoint typé `apps/site/scripts/repair-media-page-counts.ts` se lance depuis
`apps/site`, avec le tsconfig du site ; les aliases du site ne traversent pas le
projet TypeScript des scripts opérationnels.

## Qualification du13octobre2026

84compteursNULL ont été remplis depuis15900références uniques de chemins de
pages, toutes présentes dans l'inventaireR2 contrôlé. La relecture indépendante
confirme les84valeurs demandées et84révisionsCMS distinctes. Les autres champs
des volumes restent inchangés par cette réparation. Trois sondes d'images
existantes ont renvoyé200 avec leurs types et tailles attendus.

La sauvegarde PostgreSQL hors hôte des tablesvolumes/chapitres fait75627octets,
SHA256 `128ccf68f19d9989436c23ba261ccafd9f549d17e9bcc268b2b85840053e8a58`.
Le reçu et ses84révisions restent protégés dans le job de réparation.

L'attribution des éditions est une vérification séparée : une relecture plus
récente classe les42noticesFullColor de DragonBall en français, avec7935pages
déclarées pour cette édition. Le catalogue japonaisFullColor demandé n'est donc
pas qualifié par ces pages françaises. La différence avec le total15900, portant
sur84identités de volumes, ne justifie pas de réécrire les données concurrentes.
