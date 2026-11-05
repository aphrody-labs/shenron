# Goku en pied — illustration vectorielle originale mesurée

Le SVG `packages/ui/assets/wiki-mascots/goku-full.svg` est une **création vectorielle
stylisée**, dessinée par parties anatomiques depuis une référence inspectée. Il
n’est ni l’illustration officielle de Toei, ni un fichier obtenu par vectorisation
automatique, ni une image raster incorporée dans un SVG. Le PNG du portail reste
inchangé jusqu’à revue visuelle et décision d’intégration.

## Référence retenue

- Image : `apps/site/public/wiki-scene/goku-kai.png`, 326 × 590 px.
- Origine : [Toei Animation, personnages Dragon Ball Kai](https://www.toei-anim.co.jp/tv/dragon_kai/character/),
  [illustration Goku](https://www.toei-anim.co.jp/tv/dragon_kai/character/img/1/imgChara.png).
- SHA-256 : `addd845e503d035ae52288a5fab68a4a481840a01c92b6cf868f36a0a28f53c0`.
- Source de forme et de couleur de ce lot : cette illustration d’animation précise,
  demandée par le propriétaire. Aucune attribution au dessin du manga original
  n’est revendiquée ; aucune source Fandom n’est utilisée.
- Cette provenance ne constitue pas une nouvelle déclaration de licence sur
  l’illustration de référence. La publication du catalogue reste celle autorisée
  dans le dépôt ; le présent dessin dérivé garde son identité distincte.

Le protocole canonique `plugin/skills/toriyama-svg/SKILL.md` et ses références de
mesure, de géométrie et d’inspection manga/animation ont été lus. La comparaison
porte sur une pose Kai précise ; la forme n’est pas reconstruite de mémoire à
partir d’un autre personnage ou d’un autre costume.

## Mesures et décisions

Toutes les positions suivantes sont des **ancrages visuels manuels approximatifs**
dans les coordonnées du PNG, avec une incertitude de l’ordre de 1 à 3 px. Les
valeurs alpha et les fréquences de couleurs sont, elles, calculées sur les pixels
opaques (`alpha >= 128`) décodés par `Bun.Image`.

| Élément             | Mesure retenue                                                     | Traduction dans la géométrie                                                         |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Silhouette opaque   | x 36–211, y 4–585 ; 176 × 582 px, 63 435 pixels opaques            | Corps entier, cheveux et pointes des deux bottes conservés                           |
| Cadrage du livrable | viewBox x 28, y 0, 192 × 592                                       | Suppression du vide latéral du PNG ; 2 px de marge basse supplémentaires             |
| Sommet des cheveux  | pointe x 99, y 6 ; largeur approximative x 43–199                  | Masse noire asymétrique et pointes latérales orientées ; mèches fermées              |
| Visage              | front vers y 75 ; yeux vers y 96 ; menton vers y 129               | Regard oblique, deux yeux blancs étroits, oreille droite et mâchoire individualisées |
| Épaules             | gauche vers x 53, y 152 ; droite vers x 209, y 160                 | Torse tourné, manches et bras de largeurs distinctes                                 |
| Ceinture            | x 73–148 ; y 227–251                                               | Bord irrégulier, plis bleus superposés et sillons diagonaux                          |
| Mains               | gauche vers x 46–65, y 290–322 ; droite vers x 157–188, y 298–327  | Deux mains fermées distinctes, doigts et pouces séparés par traits courts            |
| Pantalon            | bassin vers y 251 ; entrejambe vers y 323 ; ourlets vers y 480–493 | Plis longitudinaux asymétriques, replis angulaires et deux jambes distinctes         |
| Bottes              | gauche x 38–110, y 478–559 ; droite x 141–192, y 477–586           | Chaussure gauche oblique, pied droit presque frontal, bandes rouges et lacets dorés  |
| Trait               | contour environ 1 px à l’échelle source ; détails 0,5–0,9 px       | `inkStroke(176, 0.6)` pour le contour, traits internes allégés                       |

Le visage, les doigts, les mèches et les plis sont des courbes et surfaces
originales. Le dessin simplifie les micro-plis et l’anti-crénelage du PNG ; il ne
prétend pas reproduire ses pixels ni chaque trait d’un original officiel.

## Couleurs relevées

| Rôle                       | HEX       | Pixels exactement de cette couleur dans la référence opaque |
| -------------------------- | --------- | ----------------------------------------------------------: |
| Gi orange                  | `#ff6708` |                                                      11 510 |
| Ombre du gi                | `#aa4d06` |                                                      10 886 |
| Cheveux noirs              | `#000000` |                                                       5 686 |
| Bleu                       | `#18376a` |                                                       3 109 |
| Peau                       | `#ffdece` |                                                       2 709 |
| Bleu profond               | `#071b38` |                                                       2 650 |
| Ombre de peau              | `#e9a590` |                                                       1 926 |
| Ombre profonde du gi       | `#643404` |                                                       1 274 |
| Ceinture                   | `#212e6b` |                                                         812 |
| Rehaut orange              | `#ffac76` |                                                         556 |
| Bord rouge-brun des bottes | `#9a331b` |                                                         377 |
| Rehaut bleu                | `#3e54b6` |                                                         313 |

Les lacets dorés (`#efbc35`, rehaut `#ffe276`) sont une approximation visuelle
localisée : ils ne figurent pas parmi les couleurs dominantes et ne sont pas
présentés comme une mesure exacte. Le contour sombre (`#101112`) et l’arête des
cheveux (`#292b2c`) sont des choix de lisibilité du dessin original.

Le rapport automatique `inspecter-manga-anime` a été exécuté mais ses proportions
d’encre/couleur n’ont pas été retenues : sa boucle ne filtre pas l’alpha et compte
les zones transparentes noires. Le relevé utilisé filtre explicitement l’alpha.
L’outil partagé n’a pas été modifié dans ce lot.

## Génération et qualification

```powershell
bun scripts/design/wiki-mascots/goku.ts
```

Le générateur importe les primitives maintenues `arcs`, `meche` et `inkStroke` de
`packages/ui/src/toriyama-svg/geometry.ts`. Il n’embarque aucun second moteur ni
dépendance graphique. Les ombres sont des aplats fermés, sans flou ni filtre.

Les captures de référence, mesures RGBA, planches et reçus restent dans
`var/reports/wiki-scene-20261103/goku-svg/`, hors Git. Le script privé `qualify.ts`
compare le SVG généré, vérifie l’absence de bitmap/script/référence externe et
rend aux **hauteurs natives 512, 256, 160 et 85 px**, sur fond clair et sombre,
avec ImageMagick via le rastériseur canonique. Les petites tailles sont aussi
agrandies au plus proche voisin pour observer leurs pixels réels.

La CLI canonique `rendu.ts --tailles 512 256 160 85` produit également les planches
aux mêmes **largeurs** ; les deux séries sont distinguées dans les reçus. Aucun
build d’application, serveur ou déploiement n’est impliqué.

La lisibilité d’un visage complet à 85 px de hauteur reste limitée par le nombre
de pixels. Cette taille permet de contrôler la silhouette, les aplats et les
bottes ; elle ne qualifie pas une icône de visage ou une reproduction détaillée.
La revue visuelle ne vaut pas remplacement automatique du PNG officiel du portail.
