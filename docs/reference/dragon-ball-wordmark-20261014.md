# Marque vectorielle Dragon Ball France — référence HD, 14 octobre 2026

Source visuelle inspectée : [logo officiel Dragon Ball Super](https://dragonball-super.com/img/logo_en.webp), **1233 × 563 pixels**, SHA-256 `395c6052200aff36709084dcdb72e31e6ace6a5d7a16a6174d5c268c56dd3140`. La référence privée de travail est `var/reports/beerus-official-assets-20261013/assets/logo_en.webp`. Elle remplace le précédent relevé Netflix de 273 × 126 pixels ; aucun raster n'est incorporé au livrable.

Le propriétaire demande une adaptation publique **Dragon Ball France** : FRANCE remplace SUPER, le Kinto-Un remplace le cristal, le sous-titre promotionnel Beerus et les glyphes japonais de cette promotion sont exclus. L'éclair latéral est un dessin original. Ces adaptations ne sont pas présentées comme le logo officiel inchangé.

## Contours mesurés

Bun.Image décode les pixels RGBA à leur résolution native. `scripts/design/trace-dragon-wordmark.ts` segmente les couleurs dans x=35…919, y=100…381 : jaune avec R>130, G>110, B<90 ; rouge avec R>80, G<70, B<90 et R>2G. Le cristal est exclu par une ellipse centrée sur (479,289), rayon 70 avec garde. Les contours de moins de 30 segments sont écartés. La frontière de cellules produit 15 contours, dont les contrepoinçons ; les contours d'une même couleur sont assemblés en chemin composé avec règle pair-impair.

Simplification Douglas–Peucker : seuil 0,65 pixel ; maximum mesuré point→segment **0,6413 pixel**, 1947 sommets. Les raccords quadratiques enlèvent les petites marches du masque binaire. Les angles dont le déplacement du contrôle dépasse 0,85 pixel restent angulaires ; le déplacement propre au raccord est borné à 0,425 pixel. Cette borne de construction ne qualifie pas l'écart aux traits d'origine sous l'anticrénelage WebP. Les contours noirs sont reconstruits par cerne de 24 unités avec `paint-order="stroke fill"`, avec filet blanc extérieur de 6 unités pour les fonds sombres.

Le viewBox public est **20 90 1100 375**, ratio 2,9333. DRAGON et BALL gardent les coordonnées de la référence HD ; FRANCE est tracé en six glyphes originaux fermés dans un cartouche. Le corps de texte et les polices françaises, anglaises et japonaises du site restent sous leur propriétaire : aucune nouvelle fonte n'est publiée avec ce logo.

## Dégradés et couleurs

Les médianes des pixels retenus par ligne fondent les dégradés SVG, en coordonnées natives :

| Y   | Jaune DRAGON | Rouge BALL |
| --- | ------------ | ---------- |
| 125 | `#fef305`    | —          |
| 205 | `#fef100`    | `#e70113`  |
| 270 | `#fef100`    | `#e60113`  |
| 320 | `#ddb800`    | `#b40f17`  |
| 360 | `#bc8800`    | `#940d15`  |

Ces dégradés linéaires restituent la progression vers l'or et le rouge sombre ; ils ne reproduisent pas chaque pixel du WebP. Les tokens jaunes `#fef102` et rouges `#e50113` de la première extraction sont conservés. Le cartouche et l'éclair utilisent le jaune de marque ; le nuage conserve ses aplats manga canoniques.

## Nuage et sources uniques

Le nuage vient uniquement de `corpsNuage(KINTO_UN_ILLUSTRATION, prefix)` dans `toriyama-svg/kinto-un.ts`, sans géométrie copiée : translation (402,248), échelle uniforme 0,13. Son ratio, ses ombres et ses volutes restent canoniques. Le module `wordmark.ts` possède tous les contours, dégradés et compositions ; React et l'asset autonome appellent le même `renderWordmarkArtwork`. `useId` isole titres, gradients et clips de chaque instance React. L'asset standalone utilise des identifiants stables.

## Vérifications réelles

Chrome headless a rasterisé l'art à l'échelle native dans `native-compare.png`. Bun.Image a comparé les masques de remplissage aux mêmes zones du WebP, hors ellipse de rayon 82 autour du cristal remplacé :

| Zone         | Pixels référence | Pixels rendus | Intersection |          IoU |
| ------------ | ---------------: | ------------: | -----------: | -----------: |
| DRAGON jaune |            61336 |         61263 |        61259 | **99,868 %** |
| BALL rouge   |            34444 |         34502 |        34437 | **99,791 %** |

Ces nombres qualifient les masques colorés DRAGON/BALL, **pas** le cerne noir, le halo blanc, l'intégralité des couleurs ou les adaptations FRANCE/nuage/éclair. Aucun résultat ne prouve une égalité pixel à pixel du logo complet.

La planche Chrome `hd-size-qa.png` a été ouverte et inspectée aux largeurs **320 et 144 pixels**, sur fonds clair et sombre : lettres complètes, FRANCE lisible, nuage rendu, filet blanc sur sombre, aucune coupure du dessin. Six tests vérifient l'asset reproductible, les contours fermés, les gradients, la géométrie canonique du nuage, les identifiants uniques et les titres accessibles. Format et lint natifs sont contrôlés sur les chemins du lot.

Reproduction : `bun scripts/design/trace-dragon-wordmark.ts <reference.webp> --write`, puis `bun scripts/design/build-dragon-wordmark.ts`. La première commande exige la référence privée ; la seconde et son `--check` n'exigent ni réseau, ni bitmap, ni dépendance de police. Les masques, données de comparaison et captures restent dans `var/reports/dragon-ball-design-20261014/`.
