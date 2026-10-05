---
name: toriyama-svg
description: "Crée des assets vectoriels Dragon Ball depuis des références mesurées et vérifie leurs rendus ; icônes et animations incluses."
---

# Vectoriel Toriyama mesuré

Appliquer le [contrat partagé](../../references/execution.md). Une référence
mesurable est nécessaire ; sans elle, signaler ce qui manque sans inventer
forme ou palette. Utiliser Python/Pillow/numpy et Bun/sharp déjà disponibles ;
sinon consigner les mesures manuelles et le contrôle non effectué.

1. Sourcer : [hiérarchie et corpus](references/sources.md). Le manga au trait
   fonde la forme, l'édition couleur la palette ; signaler toute contradiction.
2. Mesurer avec `scripts/mesurer.py` depuis cette skill ; regarder segmentation
   et découpe. Créer `mesures.json` avant de dessiner, recouper une couleur
   incohérente sur une seconde source.
3. Consigner sources, proportions, palette et décision → mesure dans
   `docs/reference/<sujet>-analyse-visuelle.md` depuis Aphrody.
4. Réutiliser la géométrie propriétaire ; une seule source génère illustration,
   composant et icônes. Construire les arcs entre creux et découper l'ombre par
   la silhouette, sans décalquer ni vectoriser automatiquement une planche.
5. Rendre avec `scripts/rendu.ts` à 512/128/64/32/16 px et `--compare`, puis
   ouvrir les images sur fonds clair/sombre. Comparer ratio d'encre, contraste,
   détails et ressemblance ; le code seul ne qualifie aucun rendu.
6. Dessiner une variante carrée pour l'icône ; contrôler ICO réel, Apple opaque
   et fichiers distincts `any`/`maskable` avec `scripts/icones.ts`.

[Mesures, primitives et exports locaux](references/geometrie.md) pour réaliser
l'asset ; [animation](references/animation.md) seulement pour du mouvement ;
[Blender](references/blender.md) seulement pour la 3D. Charger la référence
sélectionnée, pas toute la bibliothèque.

Livrer SVG, générateur reproductible et document de mesures ; références,
masques et rendus de travail restent temporaires. Exécuter les gates du package
propriétaire. Un déploiement n'est effectué que dans son périmètre autorisé,
puis contrôlé par lecture du fichier servi et de son type de contenu.
