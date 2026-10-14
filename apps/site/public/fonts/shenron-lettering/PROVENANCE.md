# Shenron Lettering

Face de lettrage monochrome **partielle**, dérivée du propriétaire SVG de la
marque : `packages/ui/src/toriyama-svg/wordmark.ts`. Elle couvre exactement
les lettres majuscules **A B C D E F G L N R**, ainsi que l'espace U+0020.
La lettre O reste le nuage du SVG canonique ; aucun O, alphabet complet,
bas de casse ou accent n'est inventé. Les mots non couverts doivent garder
la police de texte ou le logo SVG.

Les contours principaux viennent des lettres HD mesurées ; F, C et E
viennent des glyphes FRANCE du même propriétaire. Chaque forme est
normalisée à une capitale de 800 unités dans un em de 1 000, avec un bord
gauche de 40 unités et un espacement droit d'environ 40 unités.
L'arrondi TrueType peut déplacer une extrémité d'une unité. Les trous de
D, R, A et B gardent une orientation opposée à leur contour externe.
Les courbes quadratiques et segments sont conservés, sans vectorisation
bitmap supplémentaire, interpolation variable ni faux kerning.

Génération : `bun scripts/design/build-shenron-lettering.ts`, avec Bun UV
et les dépendances isolées épinglées FontTools 4.60.1 et Brotli 1.1.0,
également utilisées par la recette du propriétaire M3 Fonts. Aucune
dépendance du monorepo ni source FontTools/M3 n'est copiée.
L'empreinte du module SVG, les métriques, contours, tailles et la plage
Unicode exacte sont dans `metadata.json`.

Fichiers : TTF complet de cette couverture et WOFF2 web. Famille
`Shenron Lettering`, poids 700. Le navigateur doit recevoir la plage
`U+0020,U+0041-0047,U+004C,U+004E,U+0052` pour conserver les replis.
Cette face sert uniquement du lettrage de marque, jamais les phrases,
contrôles ou paragraphes du site. Le SVG reste la référence du logo en
couleur avec contours, dégradés, nuage et composition.

Les droits de l'artwork restent distincts de la licence du code générateur ;
voir `NOTICE.txt`. La création d'un WOFF2 ne prouve pas à elle seule la
qualité pixel à pixel du rendu dans tous les navigateurs.
