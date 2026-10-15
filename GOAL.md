<!-- SPDX-License-Identifier: Apache-2.0 -->

# Objectif courant Shenron

Ce document contient uniquement les objectifs encore pertinents. Les preuves datées et
l’historique sont dans [REPRISE.md](docs/reference/root/REPRISE.md) ; les invariants dans
[PLAN.md](docs/reference/root/PLAN.md). Une ancienne note n’est pas une nouvelle demande.

## Priorités

Demande active du 15 octobre : corriger les bugs et trous de données des pages manga,
databooks et wiki, synchroniser l’IA et l’interface avec PostgreSQL, évaluer le RAG,
et qualifier le crawl/rendu avec Bun WebView sur la fabrique. Le propriétaire ajoute :
thème neutre, retrait des vidéos d’accueil, défilement stable et dashboard permettant
la personnalisation complète du thème, avec persistance et relecture réelles.
« star » reste à préciser ; aucun correctif arbitraire n’est déduit de ce mot.

0. Demande propriétaire du 13 octobre livrée (contrôle du 15 octobre dans REPRISE) :
   accueil, catalogue épisodes/sagas, cinq GIF, aperçus et téléchargements servis par
   la release `88ac0d23`. La prochaine image commune reste coordonnée avec le dashboard.

1. Maintenir la collecte privée des sources officielles avec provenance, robots, sitemaps,
   budgets et couverture explicitement qualifiés.
2. Livrer les lecteurs manga, databooks et vidéo avec tests navigateur réels ; distinguer
   chargement, disponibilité et lecture effective.
3. Consommer HLS depuis `@aphrody/bun-video`, sans vendoring local ; respecter les licences,
   DRM et droits des fournisseurs.
4. Maintenir les catalogues par writers transactionnels, snapshots JSON validés, sauvegarde,
   relecture et réplica ; aucune écriture implicite dans RAG, Redis ou PostgreSQL.
5. Garder le monorepo modulaire : paquets `@aphrody/shenron-*`, apps privées, crates Rust
   avec leurs noms publics et notices.
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
