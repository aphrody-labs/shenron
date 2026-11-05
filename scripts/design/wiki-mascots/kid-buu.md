# Kid Buu entier : construction vectorielle originale

Référence inspectée : illustration complète de Dragon Ball FighterZ, Bandai Namco,
`apps/site/public/wiki-scene/kid-buu-fighterz.png`, 512 × 939 pixels.
Source : https://dba.bn-ent.net/character/images/majinBoo/portrait.png ; SHA-256
`72b26a82de0500ab0a08288e9f576781c4e5c140fac6feb66f72480bf902a3f0`.

Le SVG est une **interprétation originale stylisée**, dessinée par parties anatomiques
avec des courbes saisies manuellement. Aucun contour de raster n'est automatiquement
extrait ; aucune image, police ou ressource externe n'est incorporée. Il ne s'agit
ni d'une illustration officielle, ni d'une reproduction pixel pour pixel.

## Mesures et décisions

Le repère reste celui de la référence, 512 × 939. Les points suivants sont des
estimations visuelles, arrondies, pas des résultats de segmentation anatomique :

| Point | X | Y |
| --- | ---: | ---: |
| Centre du visage | 277 | 211 |
| Poing levé | 373 | 207 |
| Poing bas | 62 | 524 |
| Ceinture | 265 | 473 |
| Entrejambe | 267 | 658 |
| Pied gauche | 57 | 882 |
| Pied droit | 464 | 899 |

Les yeux, les deux bras/poings, les deux jambes/bottes, le pantalon ample,
la ceinture à emblème géométrique et l'appendice crânien recourbé sont construits
séparément. Les primitives `arcs` et `inkStroke` viennent du propriétaire
`packages/ui/src/toriyama-svg/geometry.ts`. Le trait extérieur vaut 2,31 unités,
choix interprété après inspection de la référence, sans prétendre mesurer le G-pen
d'une planche manga. Les ombres du tronc et du pantalon sont découpées par leurs
silhouettes. Les courbes de bouche et les doigts ne dépendent d'aucun caractère texte.

Le générateur relève directement neuf sondes RGBA dans la source. La palette SVG
est ensuite une simplification en aplats : peau `#e793ae`, lumière `#ffd3de`, ombre
`#bf5c88`, tissu `#f5f4e8`, ombre de tissu `#b2c5bc`, bracelets `#313b3e` et dorures
`#c9a454`. Ces couleurs sont des choix de dessin, pas une équivalence colorimétrique.

## Reproduction et contrôle

```sh
bun scripts/design/wiki-mascots/kid-buu.ts
bun scripts/design/wiki-mascots/kid-buu.ts --check
bun plugin/skills/toriyama-svg/scripts/rendu.ts packages/ui/assets/wiki-mascots/kid-buu-full.svg --tailles 512 256 160 85 32 16 --compare apps/site/public/wiki-scene/kid-buu-fighterz.png --sortie var/reports/wiki-scene-20261103/kid-buu-svg/final
```

Les masques, sondes et planches de comparaison restent dans `var/reports/`.
Les premiers rendus ont révélé un appendice trop droit, une ceinture trop haute
et un pantalon trop étroit : la révision suivante a corrigé ces proportions.
Le visage et l'anatomie restent plus simples et plus anguleux que la référence.
À 85 pixels de largeur, la silhouette et l'emblème restent reconnaissables ;
aucune lisibilité du visage à 16 pixels n'est revendiquée.

Le **PNG fidèle reste utilisé par le portail**. Le SVG entier ne se substitue pas
automatiquement à cette mascotte. Le contrôle de cet actif ne qualifie ni animation
de personnage, ni rendu WebGPU, ni production complète du site.
