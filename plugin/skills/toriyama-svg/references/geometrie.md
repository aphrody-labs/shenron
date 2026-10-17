# Mesures, géométrie et exports

## Mesurer et comparer

Depuis la skill (Bun seul) :

```bash
bun scripts/mesurer.ts /tmp/sujet/planche.png --teinte 20 45 --sat 0.3 --k 5
bun scripts/mesurer.ts /tmp/sujet/planche.png --sombre          # trait d'encre
bun scripts/mesurer.ts /tmp/sujet/planche.png --boite 405 638 1229 1079
bun scripts/rendu.ts dessin.svg --tailles 512 128 64 32 16 --compare /tmp/sujet/planche.png
bun scripts/icones.ts icone.svg --sortie /chemin/public
```

`mesurer.ts` isole la plus grande composante, rebouche les trous et produit boîte,
ratio, remplissage, palette k-means HEX/RGB/HSL/OKLCH, déciles de luminance, rythme
des creux du bord inférieur et, avec `--sombre`, l'épaisseur médiane du trait
(mesurée sur l'encre elle-même). Regarder masque et découpe avant d'accepter les
mesures : un décor, une scène nocturne ou un scan jauni peuvent les fausser. Une
source en désaccord avec une autre reste documentée, pas tranchée en silence.

Mesurer le ratio sur l'encre après rognage, pas sur le viewBox. Pour un personnage :
taille en têtes, épaules, position des yeux, mèches, bouche ; utiliser `--boite` sur
les zones. Les valeurs de trait 0,7–0,9 % du sujet (manga, Kinto-Un) et 0,61 %
(couverture) sont des mesures citées dans [les analyses](mesures/kinto-un-analyse-visuelle.md),
pas des constantes universelles.

## Géométrie embarquée : `scripts/toriyama.js`

Généré depuis `packages/ui/src/toriyama-svg/` du dépôt Shenron (révision et date dans
l'en-tête du fichier). Bibliothèque ESM :

```ts
import {
  arcs,
  volute,
  meche,
  planDombre,
  inkStroke,
  mirrorX,
  svgSphere,
  kintoUn,
  couverture,
} from "./toriyama.js";
```

| Export                                                                      | Usage                                                                                                    |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `arcs(points, fleches, ferme?)`                                             | chaîne d'arcs de cercle entre creux ; flèche > demi-corde = lobe pincé                                   |
| `volute(depart, vers, r, tours?, sens?)`                                    | spirale rentrante des lobes (Kinto-Un, nuages)                                                           |
| `meche(base, pointe, largeur, courbure?)`                                   | mèche pleine effilée, jamais un trait constant                                                           |
| `planDombre(contour, decalage, largeur, attenuation?)`                      | ombre = contour décalé, découpé par la silhouette                                                        |
| `inkStroke(largeurSujet, pct?)`                                             | trait en % de la largeur du sujet (0,8 % par défaut)                                                     |
| `mirrorX(points, axe)`, `starPoints`, `scouterBrackets`, `radialSpeedlines` | symétrie et motifs                                                                                       |
| `svgSphere(n)`, `SPHERE_*`, `etoilesSphere`                                 | Dragon Ball mesurée (étoile unique mesurée ; disposition 2 à 7 non sourcée)                              |
| `kintoUn.*`                                                                 | `svgIllustration`, `svgIcone({volutes, echelle, coins, pastille})`, `svgMonochrome`, `KINTO_UN_COULEURS` |
| `couverture.*`                                                              | cadre de case, banc de nuages, pastille de tome, étoile r/R = 0,45                                       |
| `TORIYAMA_PALETTE`, `EMBLEMS`                                               | palette et emblèmes du site : vérifier leur mesure pour le sujet avant usage                             |

Ligne de commande :

```bash
bun scripts/toriyama.js sphere 4 --sortie sphere-4.svg
bun scripts/toriyama.js kinto-un icone-petite          # sans volutes, pour < 64 px
bun scripts/toriyama.js banc-nuage
bun scripts/toriyama.js etoile 50
bun scripts/toriyama.js mesures                         # constantes mesurées (JSON)
```

Le générateur, le composant et l'icône d'un sujet doivent partager la même
géométrie : étendre `toriyama.js` par composition, ne pas recopier un moteur.

## Contrôles de rendu

Le rendu à chaque taille doit être natif, agrandi au plus proche voisin pour voir les
pixels réels. Ouvrir la planche avec la référence à hauteur égale : une tête trop
longue ou une dérive de palette reste invisible au code seul. Sous 64 px, supprimer
les détails devenus bruit ; une illustration large ne remplace pas une icône carrée.
Un jaune sur blanc peut nécessiter une pastille sombre ; vérifier le contraste
effectivement mesuré.

`icones.ts` produit un conteneur ICO multi-tailles réel (16, 32, 48), PNG 16/32/48/96,
Apple 180 opaque, 192/512 `any`, 512 `maskable` séparée (dessin à 80 %) et tuile
Windows 150. Vérifier les balises et le recadrage effectif ; un PNG renommé `.ico`
ou une image unique `any maskable` ne qualifie pas ce jeu. Sans rastériseur, seules
les variantes SVG sont écrites : le dire.
