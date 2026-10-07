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
| `extract` | Partiel : `shenron-re cpk <file.cpk> --output-dir <new-dir>` extrait l'arborescence validée avec manifeste vers une destination neuve; pas de reprise, de scan d'installation ni de traitement batch de plusieurs archives. |
| `tex` | Partiel : `shenron-re emb <file.emb> --output-dir <new-dir>` valide et extrait les entrées EMB nommées en DDS dans un nouveau répertoire; pas de conversion DDS→PNG, de traitement récursif, ni d'analyse d'installation réelle. |
| `audio` | Absent : pas de conversion CRI vers WAV. |
| `text` | Partiel : `shenron-re text <file.msg>` extrait les runs UTF-16LE; `shenron-re text <input-dir> --output-dir <new-dir>` traite récursivement les `.msg` vers un arbre de sortie distinct, avec manifeste, ordre déterministe, liens symboliques ignorés et refus d'une destination existante. Ce mode protège les entrées et ne remplace pas le comportement risqué d'écrasement source du script Python. Le binding WASM `extractMsgText` extrait ces runs depuis un buffer. |
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
le contrat FFI standard. `shenron-re text <file.msg>` porte l'extraction d'un fichier sans
écraser un JSON existant; le mode dossier porte la conversion récursive dans une destination
neuve, sans modifier l'arbre d'entrée. `shenron-re cpk` extrait l'arborescence de l'archive
dans une destination neuve, refuse les chemins traversants/collisions, décompresse CRILAYLA
et écrit un manifeste; une archive complète est lue en mémoire par invocation. `shenron-re emb`
valide offsets, tailles et noms avant d'écrire les DDS dans une nouvelle destination; l'archive
complète est lue en mémoire et aucun convertisseur externe n'est invoqué. `parseEmb` via WASM/Bun
renvoie les noms et plages validés, sans copier les payloads. La matrice ne constitue pas
une parité avec le CLI dbxv2.

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
et son JSON observé. Après ajout de l'extraction CPK et du parseur EMB, de leur commande et du
binding WASM/Bun, les 39 tests du crate (34 unitaires avec feature WASM, 5 CLI) et Clippy strict passent; les fixtures sont
synthétiques et aucun asset du jeu n'a été copié ou extrait. Le build WASM/bindgen et les 12 tests
`@shenron/pipeline` passent aussi. Le lint ciblé passe; le typecheck complet échoue sur des
dépendances absentes du workspace (`zod`, `@aphrody/api/core`) et d'autres erreurs induites par
ces modules manquants. L'alias VPS SSH configuré ne résolvait pas pendant ce lot; aucun hôte ni
service de production n'a été modifié.
