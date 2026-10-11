<!-- SPDX-License-Identifier: Apache-2.0 -->

# Navigation entre les sections de l’accueil

Le composant `HomeExperience` antérieur à `d27d7054` proposait un repère
« Sections de la page ». Le nouvel accueil avait conservé les rubriques, mais
perdu ce moyen de les rejoindre. Les invariants de l’accueil restent décrits
dans [accueil-et-shell.md](accueil-et-shell.md).

Le rail repose désormais sur `SectionNavigation`, dans `@aphrody/shenron-ui/public`.
Le site transmet ses rubriques visibles dans leur ordre de lecture, avec le
libellé de navigation configuré en priorité, puis le titre. Les libellés de
repli et le nom accessible viennent des dictionnaires existants. Les gardiens
absents du direct ne laissent pas de lien orphelin.

Chaque destination est un lien HTML vers l’identifiant de sa section : elle
existe avant l’hydratation. Le rail peut défiler horizontalement sur téléphone,
conserve des cibles de 44 pixels et un focus visible. Après hydratation,
`aria-current="location"` suit la position de lecture. Le défilement reste
celui du navigateur, sans interception de la molette ni contrôleur de panneaux.

Le logo, Kinto’un, les vidéos, les accès rapides et les blocs éditoriaux restent
en place. Les nouvelles puis les mini-jeux terminent toujours la page.

## Vérification

Les tests DOM couvrent les liens dans le HTML serveur, le suivi de la section
active et les changements d’ordre et de libellé. Le test
`scripts/testing/integration/test/section-navigation.live.test.ts` utilise le
composant réel, `Bun.serve`, `@aphrody/web-test` et le moteur Obscura, à 1440 et
390 pixels. Il vérifie le fragment encodé, le déplacement du viewport et la
position de la cible, avant hydratation. Le pipeline d’intégration le lance
avec ses autres étapes navigateur.

Ce test utilise des données et une géométrie synthétiques. Il ne qualifie ni
le rendu complet de l’accueil, ni la production, ni un appareil mobile physique.
La comparaison visuelle de l’accueil complet reste nécessaire pour l’objectif
global de restauration.

Le premier passage sur le binaire Obscura disponible le 7 octobre 2026 changeait
le fragment sans défiler. La correction appartient à Aphrody : l’activation
native des ancres doit rejoindre leur cible, pour le clic DOM comme pour le
clic CDP, tout en respectant l’annulation de l’événement. Un binaire comprenant
ce correctif est nécessaire pour cette étape du pipeline.

Le 7 octobre 2026, le binaire construit depuis le commit Aphrody `ce81d2829`
réussit ce test aux deux largeurs. Son SHA-256 est
`d996c62f9a9e52c5b3ce8cce516a6c96907c8834b9318c2059f0348383954d50`.
Le contrôle ELF ne trouve aucune importation glibc supérieure à 2.39. Les suites
CDP et JavaScript totalisent 966 tests réussis et quatre tests ignorés ; Clippy
strict passe sur les deux crates. Il s’agit d’un artefact explicite de
qualification, sans activation du binaire installé ni déploiement du site.
