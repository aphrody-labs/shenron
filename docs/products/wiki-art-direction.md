<!-- SPDX-License-Identifier: Apache-2.0 -->

# Portail wiki : continuité avec l’accueil DBFR

## Correction propriétaire du 4 novembre 2026

Le portail doit prolonger l’accueil de [dragonballfr.com](https://dragonballfr.com/).
Le propriétaire a rejeté l’atlas : une carte schématique accompagnée de fenêtres et
de personnages disparates ne répond pas à son attente d’un site immersif contemporain.
Les sources expérimentales restent conservées ; elles ne constituent pas une direction
validée et ne doivent pas être publiées par inertie.

## Ce que montre l’accueil réel

Inspection dans Chrome le 4 novembre, viewport 1616 × 853 : barre sombre d’environ
65 px, navigation en capitales espacées, fine séparation jaune, images d’anime de
grande taille, texte à gauche et image ouverte à droite. Les fondus latéraux et
inférieurs relient l’image aux surfaces du site. Les actions sont lisibles, les
contrôles de mouvement discrets. Le contenu communautaire suit la scène.
La police calculée est Google Sans Flex, Noto Sans JP, system-ui, sans-serif.

Sources existantes : `HomeHero.tsx`, `HomeHeroFrames.tsx`, `HomeHero.module.css`,
`HomeBeerusCarousel.tsx` dans `apps/site/src/components/home/`, et
`apps/site/src/lib/home-hero-frames.ts`. Les frames qualifiées ont des dimensions,
une provenance et un cadrage : les réutiliser avant de fabriquer un nouveau décor.
Reprendre ce langage ne signifie pas dupliquer le logo, les commandes du shell ou
le catalogue de l’accueil.

## Composition du portail

- Une ouverture éditoriale intégrée au fond, avec un vrai visuel lisible et un titre
  court. Le premier écran doit déjà permettre de choisir une rubrique. L’image et
  l’accès au contenu partagent l’espace ; un écran d’introduction à franchir est exclu.
- Toutes les rubriques ont un accès direct dans un répertoire compact organisé par
  usages. Personnages n’accapare ni la surface ni la priorité. Aucun lien essentiel
  n’est caché derrière une carte, une animation ou un survol obligatoire.
- Les découvertes utilisent de vrais contenus publiés, leurs images pertinentes et
  leurs titres. Une nouvelle publication modifie la sélection ; un compteur seul
  ne rend pas une page vivante. Aucun titre, compte, statut « direct » ou média n’est inventé.
- Goku, Kid Buu et Shenron signent l’univers avec des images fidèles et correctement
  détourées. Ils ne remplacent pas l’iconographie d’une rubrique sans rapport.
  Les SVG expérimentaux n’ont pas acquis la fidélité nécessaire par leur seul tracé.
- Défilement natif, sans écran bloquant, panneau imbriqué obligatoire ni section
  artificiellement haute. À 390 px, le texte et les liens passent avant le décor.

## Mouvement, matière et cohérence

Hériter de la police, du shell et des rôles de couleur existants. Les grandes images
portent la couleur ; le texte garde une surface lisible. Les accents jaunes servent
la marque et les actions, sans cerner chaque bloc d’un cadre identique.
Les fondus et les mouvements lents relient les états sans déplacer les cibles de
navigation. Pause explicite, arrêt hors écran et onglet masqué, mouvement réduit.
Un changement de sélection reste utilisable sans transition.

Pixi, Three et wgpu sont des moyens disponibles. Leur présence n’est pas un critère
artistique. Tout rendu GPU utilise WebGPU exclusivement ; le portail reste complet
sans GPU. Ne pas introduire un second moteur pour habiller une faiblesse de composition.
Les recommandations automatiques de UI/UX Pro Max sur les FAQ, palettes documentaires
ou scènes spatiales ne correspondent pas à ce brief ; elles ne sont pas retenues.

## Preuves avant livraison

Comparer accueil et portail dans le même navigateur, aux largeurs 1440 et 390 px,
avec le vrai shell, les vraies polices et les vrais médias. Examiner le cadrage,
la continuité, les contrastes, les chemins vers chaque rubrique et le premier écran.
Puis vérifier clavier, focus, zoom, pause, mouvement réduit, ressources et absence
de défilement horizontal. Un rendu HTML isolé reste une étude, pas une validation
du produit. Les tests et les hashes prouvent leurs contrats, pas la qualité artistique.

Les builds, serveurs de compilation et déploiements restent arrêtés sur instruction
du propriétaire. Aucune modification source ne doit être présentée comme visible en
production ou qualifiée dans l’application tant que ces portes ne sont pas exécutées.
