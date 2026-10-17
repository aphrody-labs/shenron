---
name: toriyama-svg
description: "Crée des assets vectoriels Dragon Ball depuis des références mesurées et vérifie leurs rendus, avec la géométrie et les mesures embarquées (Bun seul, sans dépôt ni réseau) ; icônes et animations incluses."
---

# Vectoriel Toriyama mesuré

Appliquer le [contrat partagé](../../references/execution.md). Une référence
mesurable est nécessaire ; sans elle, signaler ce qui manque sans inventer forme
ni palette. Tout tient dans cette skill : Bun suffit, sans `sharp`, Python ni dépôt.

1. **Sourcer** : [hiérarchie des sources](references/sources.md). Le manga au trait
   fonde la forme, l'édition couleur la palette ; signaler toute contradiction.
   Mesures déjà faites (embarquées) : [Kinto-Un](references/mesures/kinto-un-analyse-visuelle.md),
   [couverture de tankōbon et Dragon Ball](references/mesures/couverture-analyse-visuelle.md).
2. **Inspecter & Mesurer** :
   - **Visuellement via l'outil image (`view_file`)** : inspecter directement les planches de tomes manga (`apps/bot/assets/manga/...` ou scans) et les photogrammes d'animé pour relever la composition, l'angle des cases (_koma_), le calibre de plume G (_G-pen_), les mèches et la décomposition multicouche de celluloïd ([protocole complet d'inspection](references/manga-anime-inspection.md)).
   - **Numériquement par script** : `bun scripts/inspecter-manga-anime.ts image.png --mode manga|anime` ou `bun scripts/mesurer.ts image.png --teinte 40 70 --sat 0.3` (ou `--sombre` pour l'encre). Les références PNG (même entrelacées), JPEG, WebP, GIF et BMP sont décodées par `Bun.Image`, sans ImageMagick ni ffmpeg. Regarder `masque.png` et `decoupe.png` avant d'accepter les nombres. Sans outil ni image exploitable, consigner les mesures faites à la main et le contrôle non effectué.
3. **Consigner** sources, proportions, palette et décision → mesure dans un document
   de mesures livré avec l'asset (modèle : les deux analyses ci-dessus).
4. **Dessiner** avec la géométrie unique embarquée, `scripts/toriyama.js` (arcs,
   volutes, mèches, plan d'ombre, sphère, Kinto-Un, motifs de couverture) :
   [mesures, primitives et exports](references/geometrie.md). Construire les arcs
   entre creux, découper l'ombre par la silhouette, ne rien décalquer ni vectoriser
   automatiquement.
5. **Rendre** avec `bun scripts/rendu.ts dessin.svg --compare reference.png` (512, 128,
   64, 32, 16 px, fonds clair et sombre), puis **ouvrir** les planches. Rastérisation
   par `resvg`, `rsvg-convert`, ImageMagick ou Inkscape s'il en existe un ; sinon
   `planche.svg` vectorielle seulement, et le contrôle des pixels est déclaré non
   effectué. Le code seul ne qualifie aucun rendu.
6. **Icônes** : variante carrée dédiée, puis `bun scripts/icones.ts icone.svg --sortie DIR`
   (ICO réel 16/32/48, Apple opaque, `any` et `maskable` séparés, tuile Windows).

[Animation](references/animation.md) seulement pour du mouvement ;
[Blender](references/blender.md) seulement pour la 3D. Charger la référence utile,
pas toute la bibliothèque.

Pour une composition vidéo originale sourcée, suivre la
[référence vidéo](references/video.md) et le workflow `toei-animation` ; un plan
ne qualifie ni rendu réel ni correspondance de pixels.

Livrer SVG, générateur reproductible et document de mesures ; références, masques et
rendus de travail restent dans un dossier temporaire. Dans le dépôt Shenron
(mainteneurs), la géométrie maintenue vit dans `packages/ui/src/toriyama-svg/` :
l'utiliser plutôt qu'en copier une autre, puis régénérer `toriyama.js` par
`bun scripts/plugin/build-references.ts`. Un déploiement n'est effectué que dans son
périmètre autorisé, puis contrôlé par lecture du fichier servi et de son type.
