<!-- SPDX-License-Identifier: Apache-2.0 -->
# Audit de migration dbxv2 vers Rust et Bun — 2026-10-07

## Portée et entrées vérifiées

Audit local en lecture seule du dépôt `aphrody-code/dbxv2`, sous-module initialisé à
`fabc19c0021e3e992786dc2a093a749c8a1c26f0`, comparé au code versionné de `shenron-re`
et `@shenron/pipeline`. La licence du projet source est `Proprietary`. Son README
annonce 21 sous-commandes; son `pyproject.toml` déclare Python >=3.14. Le dépôt source
exclut explicitement `output/`, `.venv/`, `tools/` et les assets extraits de Git. Il
interdit de redistribuer les assets du jeu. Cet audit ne lit aucun fichier d'installation
Steam, aucune sauvegarde, aucun jeton/identifiant, aucun dump mémoire et aucun asset.

## État des commandes source

| Commande dbxv2 | État Shenron Rust/Bun constaté |
|---|---|
| `map` | Partiel : `shenron-re inventory <game-root>` porte l'inventaire de chemins/tailles et le SHA-256 des `.exe`/`.dll` de moins de 60 Mio; la carte prototype Xenoverse 3 est une autre commande. Aucun vrai jeu installé n'a été scanné. |
| `reverse` | Absent : pas d'analyse PE/DRM ni de CLI correspondant. |
| `extract` | Partiel : parsing CPK et extraction en mémoire existent; pas de commande d'extraction d'arbres, reprise ou manifest. |
| `tex` | Absent : pas de convertisseur EMB/DDS/PNG. |
| `audio` | Absent : pas de conversion CRI vers WAV. |
| `text` | Partiel : parseur MSG existe; pas de pipeline d'export localisé équivalente. |
| `models` | Absent : pas de métadonnées géométriques EMD/viewer. |
| `parse` | Partiel : BAC/BDM/CUS/CMS/MSG/PUP; BCM/BCS/BSA/EAN/EMM/ESK et équivalence pyxenoverse absents. |
| `tools` | Absent : aucun catalogue/cloneur équivalent dans ce crate. |
| `index` | Absent : pas d'index SQLite/FTS5 des assets DBXV2. |
| `classify` | Absent : pas de classification d'assets DBXV2. |
| `search` | Absent : pas de recherche sur cet index. |
| `stats` | Absent : pas de statistiques d'index DBXV2. |
| `serve` | Absent : pas de navigateur d'assets local. |
| `sav` | Absent et délibérément non exécuté; aucune lecture/édition de sauvegarde. |
| `rag` | Absent : pas de pipeline multimodale DBXV2. |
| `caption` | Absent : pas de génération/stockage de descriptions d'assets. |
| `llm` | Absent : pas d'export d'état DBXV2. |
| `report` | Absent : pas d'agrégateur de manifests DBXV2. |
| `setup` | Absent : aucune installation/téléchargement d'outil tiers déclenché. |
| `all` | Absent : aucune orchestration globale ou extraction déclenchée. |

`shenron-re` fournit aujourd'hui des décodeurs CPK/CRILAYLA et des parseurs de formats
Dimps listés plus haut, un scanner de manifests Steam explicitement fourni en entrée,
un catalogue et des bindings WASM. Le scan Steam ne lit que les manifests d'installation;
il ne produit aucun flux d'événements temps réel et n'accède pas aux identifiants Steam.
Le nouveau binaire `shenron-re map` sérialise la carte originale avec provenance;
`shenron-re catalog` sérialise le catalogue. `shenron-re inventory <game-root>` porte le
manifeste d'installation en lecture seule : chemins relatifs, extensions, tailles et SHA-256
uniquement pour les petits exécutables et DLL. Le binding natif `@shenron/native` expose aussi
la carte via le symbole ABI 5 `shenron_re_xenoverse3_map`, avec libération de la chaîne par
le contrat FFI standard. La matrice ne constitue pas une parité avec le CLI dbxv2.

## Assets, données et distribution

Le dépôt source ne contient pas les répertoires ignorés du PC/VPS mentionnés dans son
README; leur présence et leur taille courantes ne sont donc pas établies. L'inventaire Rust
ne copie aucun fichier. Le README source cite environ 35 GiB/130k fichiers historiques,
sans prouver leur présence actuelle ni autoriser leur redistribution. Aucun transfert DBFR,
flux Steam complet, copie CDN ou mise en production n'a été exécuté. La capacité de
crawl-index native est réservée à la recherche Web et ne transfère pas d'assets privés.

Avant toute exploitation d'assets du jeu, il faut inventorier les emplacements par les
propriétaires d'hôtes sans lire de secrets, vérifier sauvegarde/somme de contrôle et
rétention, puis qualifier explicitement une destination privée. Aucun contenu propriétaire
du jeu ne doit entrer dans Git, WASM téléchargeable ou CDN public. Les données de jeu ne
sont pas nécessaires à la carte prototype.

## État vérifié

La carte AGE 1000 est un graphe schématique original de six zones, huit points et sept
routes. Les emplacements annoncés citent les pages officielles Bandai Namco/Dragon Ball;
la géométrie et les liaisons prototype sont signalées comme telles. Elle n'est pas une
carte extraite/reconstituée du jeu, ni une production AAA. Les changements du site Dragon
Pixel ne consomment pas encore directement le graphe Rust/WASM.

Portes ciblées exécutées dans ce worktree : tests et Clippy de `shenron-re` et `shenron-ffi`,
compilation WASM, génération ABI vérifiée, typecheck/lint et 36 tests `@shenron/native` avec
la bibliothèque debug réellement chargée. La nouvelle commande CLI a également été exécutée
et son JSON observé. L'alias VPS SSH configuré ne résolvait pas pendant ce lot; aucun hôte
ni service de production n'a été modifié.
