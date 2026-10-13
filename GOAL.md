<!-- SPDX-License-Identifier: Apache-2.0 -->

# Objectif courant Shenron

Ce document contient uniquement les objectifs encore pertinents. Les preuves datées et
l’historique sont dans [REPRISE.md](docs/reference/root/REPRISE.md) ; les invariants dans
[PLAN.md](docs/reference/root/PLAN.md). Une ancienne note n’est pas une nouvelle demande.

## Priorités

0. Terminer la demande propriétaire du 13 octobre : accueil sans menu d'ancrage,
   bloc univers/compteurs, reprise ni promotion Beerus ; catalogue épisodes/sagas
   immédiatement accessible, héros compacts et frames HD qualifiées. Livrer les cinq
   GIF et leurs aperçus via le catalogue public, puis vérifier page/API/téléchargements.
   Les sources `7bd95e65` attendent la prochaine image commune avec les correctifs
   dashboard/Canvas ; ne pas activer une ancienne image intermédiaire.

1. Maintenir la collecte privée des sources officielles avec provenance, robots, sitemaps,
   budgets et couverture explicitement qualifiés.
2. Livrer les lecteurs manga, databooks et vidéo avec tests navigateur réels ; distinguer
   chargement, disponibilité et lecture effective.
3. Conserver le pipeline HLS dans `vendor/hls.js` et les capacités réutilisables dans Bun ;
   respecter les licences, DRM et droits des fournisseurs.
4. Maintenir les catalogues par writers transactionnels, snapshots JSON validés, sauvegarde,
   relecture et réplica ; aucune écriture implicite dans RAG, Redis ou PostgreSQL.
5. Garder le monorepo modulaire : paquets `@aphrody/shenron-*`, apps privées, crates Rust
   avec leurs noms publics, sous-modules et notices.
6. Construire sur VPS, sceller l’artefact, activer via Aphrody Infra sur DBFR, puis vérifier
   les sondes publiques, CDN, MCP et lecteurs réellement servis.

## Portes

- Sources primaires et droits vérifiés ; Fandom interdit comme source éditoriale.
- Secrets, bases, corpus, modèles, captures complètes et cookies restent protégés.
- Une annonce ne prouve pas une lecture ; un HTTP 200 ne prouve pas un rendu ou une lecture.
- DNSSEC, délégation, TLS, cache et rollback sont des contrôles séparés.
- Les gates du dépôt restent celles de [AGENTS.md](AGENTS.md).

## Prochain travail

Choisir le premier lot explicitement non livré dans `REPRISE.md`, revendiquer ses chemins,
reproduire le défaut, qualifier le propriétaire, commiter le lot vert et pousser sans réécrire
les migrations ni les historiques.
