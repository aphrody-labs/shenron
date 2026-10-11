<!-- SPDX-License-Identifier: Apache-2.0 -->

# Vidéo Shenron

Le lecteur public utilise le fork [HLS Aphrody](https://github.com/aphrody-labs/hls.js),
le cycle de vie `@aphrody/bun-runtime-sdk/video/hls` et les contrôles React de Shenron.
Le worker est servi sur la même origine avec sa licence Apache-2.0. Qualité, audio et
sous-titres sont proposés selon les pistes réellement présentes. Les fournisseurs protégés
conservent leur lecteur et leurs conditions ; HTTP200 et iframe.onload ne prouvent pas une lecture.

## Génération en qualification

Trois compositions originales sont prévues : chronologie éditoriale, synthèses Beerus et
scène géométrique Kinto’un. Le plan conserve les URLs, empreintes et dates de collecte.
Les illustrations réutilisent la géométrie propriétaire Toriyama SVG ; aucun épisode ou
article intégral n’est recopié. Le nom `toei-animation` est un outil Shenron indépendant.

Le transport MCP complet expose `dragonball.toei_animation` pour le plan et
`dragonball.toei_animation_render` pour le rendu. Les deux sont exclus du serveur public.
Le backend est installé par le propriétaire : chemins fixes, requête JSON bornée,
capture locale isolée et nettoyage des processus du job. Une capacité absente échoue explicitement.
Les scripts vivent dans `scripts/video/` ; ils restent en qualification tant que les reçus
de capture, encodage, publication et backend ne sont pas tous établis.

L’archive FFV1 doit être comparée aux images PNG capturées ; le MP4 H.264 est une sortie
avec perte destinée au Web. Une égalité RGBA sur les images représentatives vérifie
l’archive de la composition ; elle ne prouve aucune correspondance avec l’anime.
Les APIs Bun vidéo disponibles et leurs gaps natifs sont consignés dans les reçus privés.

## Livraison et entraînement

Les builds lourds tournent sur la fabrique VPS ; DBFR reçoit des artefacts scellés via
Aphrody Infra. Les médias publics passent par un intake propriétaire avec empreinte,
provenance et droits relus ; PostgreSQL utilise les writers éditoriaux et Redis une invalidation ciblée.
Conserver les anciennes URLs, chunks et rollback à chaque delta R2.

Omar fournit un GPU réel, mais cela ne qualifie pas l’entraînement. Installer la capacité
propriétaire, vérifier les licences du corpus et les jeux d’évaluation, puis obtenir une lease
GPU commune avec l’inférence existante avant tout job. Modèles, conversations, cookies et
données brutes restent dans leurs stores protégés. Voir [GOAL](../../GOAL.md) et
[REPRISE](../reference/root/REPRISE.md) pour l’état daté et les lacunes conservées.
