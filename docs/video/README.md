<!-- SPDX-License-Identifier: Apache-2.0 -->

# Vidéo Shenron

Le lecteur public consomme `@aphrody/bun-video/playback` pour le cycle de vie,
les pistes, le changement de source et la récupération réseau. Les contrôles,
les traductions et la reprise restent dans Shenron. L'adaptateur navigateur utilise
`@aphrody/bun-runtime-sdk/video/hls` ; `Bun.Video` est une capacité native du serveur
et ne devient pas une API globale dans le navigateur.
La reprise vit dans `VideoPlayer.tsx` : la position est mémorisée dans `localStorage`
(clé `shenron:video-position:` + origine et chemin de la source, sans jeton de requête), toutes
les 5 secondes et à la fermeture de la page. Elle est restaurée au chargement des métadonnées si elle
dépasse 15 s et reste à plus de 30 s de la fin, puis effacée à la fin de la lecture. Le stockage
bloqué est toléré. Les flèches haut/bas règlent le volume, le retour du son à volume 0 repasse à 50 %,
le plein écran iOS passe par `webkitEnterFullscreen`, et `crossOrigin` n'est posé que si des
sous-titres sont chargés (sinon un MP4 cross-origin sans CORS ne démarre pas). Les tests purs sont dans
`apps/site/tests/video-controls.test.ts` ; les tests DOM du lecteur exigent un `document` et sont ignorés
sans lui. Aucune lecture réelle n'est qualifiée par ce lot.

Le worker est servi sur la même origine avec sa licence Apache-2.0. Qualité, audio et
sous-titres sont proposés selon les pistes réellement présentes. Les fournisseurs protégés
conservent leur lecteur et leurs conditions ; HTTP200 et iframe.onload ne prouvent pas une lecture.

## Paquet npm livré par archive immuable

Le nom npm `@aphrody/bun-video` et sa version `1.4.4-video.1` sont conservés.
La source relue est `8ae3009ee97d6768d58b0ff09e840ff68fb2e24c` dans le dépôt Bun.
Cette livraison utilise une archive npm publique sur le CDN Infra, distincte
du registry npm où cette version reste en staging. Elle ne prouve aucune publication registry.
Le [gestionnaire de paquets Bun accepte les archives HTTPS](https://bun.com/docs/pm/cli/add#tarball-dependencies).

Le catalogue racine porte l'URL complète avec SHA-256 dans son chemin ;
`shenron.packageArchives` conserve identité, source, version et empreintes relues.
`bun.lock` fixe cette même URL et son intégrité SHA-512. L'audit du workspace
refuse un désaccord entre catalogue, provenance et verrou ; une URL mutable,
un hôte étranger ou des identifiants dans l'URL sont refusés. Un install figé
et une empreinte volontairement incorrecte ont été testés : le premier réussit,
la seconde est rejetée avec `IntegrityCheckFailed`.

L'archive contient uniquement les sources, types, outils et notices autorisés.
Sessions, cookies, captures privées, bases et corpus en sont exclus. Le build
prélève seulement `hls.worker.js` et la licence Apache-2.0 avec sa notice Dailymotion
depuis le paquet installé. Il sert ces deux fichiers sous `/assets/bun-video/`.
Une installation, un worker actif et une vraie lecture sont des qualifications séparées.

## Génération en qualification

Trois compositions originales sont prévues : chronologie éditoriale, synthèses Beerus et
scène géométrique Kinto’un. Le plan conserve les URLs, empreintes et dates de collecte.
Les illustrations réutilisent la géométrie propriétaire Toriyama SVG ; aucun épisode ou
article intégral n’est recopié. Le nom `toei-animation` est un outil Shenron indépendant.

Le transport MCP complet expose `dragonball.toei_animation` pour le plan et
`dragonball.toei_animation_render` pour le rendu. Les deux sont exclus du serveur public.
Le backend doit être installé par le propriétaire : chemins fixes, requête JSON bornée,
capture locale isolée et nettoyage des processus du job. Une capacité absente échoue explicitement.
Les scripts vivent dans `scripts/video/` ; ils restent en qualification tant que les reçus
de capture, encodage, publication et backend ne sont pas tous établis.

L’archive FFV1 doit être comparée aux images PNG capturées ; le MP4 H.264 est une sortie
avec perte destinée au Web. Une égalité RGBA sur les images représentatives vérifie
l’archive de la composition ; elle ne prouve aucune correspondance avec l’anime.
Les APIs Bun vidéo disponibles et leurs gaps natifs sont consignés dans les reçus privés.

## Livraison et entraînement

Les builds lourds tournent sur un hôte de build Linux x64 (`scripts/deploy/release.sh`) ; DBFR
reçoit l'image et l'active via son entrée Infra. Les médias publics passent par un intake propriétaire avec empreinte,
provenance et droits relus ; PostgreSQL utilise les writers éditoriaux et Redis une invalidation ciblée.
Conserver les anciennes URLs, chunks et rollback à chaque delta R2.

Omar fournit un GPU réel, mais cela ne qualifie pas l’entraînement. Installer la capacité
propriétaire, vérifier les licences du corpus et les jeux d’évaluation, puis obtenir une lease
GPU commune avec l’inférence existante avant tout job. Modèles, conversations, cookies et
données brutes restent dans leurs stores protégés. Voir [GOAL](../../GOAL.md) et
[REPRISE](../reference/root/REPRISE.md) pour l’état daté et les lacunes conservées.
