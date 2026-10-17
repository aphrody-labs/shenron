# Potara (ポタラ) — analyse visuelle, pendant seul

<!-- Généré par scripts/plugin/build-references.ts — ne pas éditer. Sources : docs/reference/potara-analyse-visuelle.md. -->

> **Instantané hors ligne** — sources du dépôt Shenron (`docs/reference/potara-analyse-visuelle.md`),
> révision `non commitée` du inconnue. Citer cette révision et cette date avec toute
> réponse tirée d'ici ; une source vivante plus récente peut avoir changé.

Les outils cités ici (`sharp`, Pillow, `mesurer.py`) sont ceux de la mesure d'origine ; la skill
les remplace par `scripts/mesurer.ts`, `rendu.ts` et `icones.ts` (Bun seul, même algorithme).
Les chemins `apps/`, `packages/` et `docs/` désignent le dépôt Shenron, absent d'une
installation du plugin seul.

Relevé partiel le 2026-10-17 sur l'édition couleur (DBFC). **La sphère est
mesurée ; le crochet d'oreille ne l'est pas** (caché par les doigts sur les
deux planches exploitables) et n'est pas dessiné.

- Générateur : `packages/ui/src/toriyama-svg/potara.ts` (`ovale`, `arcs`, `roundTo` : `geometry.ts`)
- Sorties : `potara.svg` (352 × 570), `potara-icone.svg` (512 × 512)
- Reproduire : `svgIllustration()` et `svgIcone()` du module, via `toriyama.js`

## Sources

Localisation : `dragonball_manga_search_pages` (« potara boucle oreille »)
→ tome 41 p. 211 et 219 = ch. 502 p. 1 et p. 9 (`/api/manga/volume/122`).

| #   | Source                                                                          | Dimensions  | Poids     | Ce qu'elle vaut                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------- | ----------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q   | `https://cdn.dragonballfr.com/assets/manga/DBFC/ch502/001.jpg`, rangée 1 case 2 | 1662 × 2560 | 497 275 o | **Retenue, seule mesure de forme.** Potara pendu à la main de Goku, sphère de 46 × 47 px (page x 1332–1378, y 1362–1409), ceinture et deux fentes visibles                                   |
| P   | `…/DBFC/ch502/009.jpg`, rangée 2 case droite                                    | 1662 × 2560 | 622 834 o | Contrôle : Potara levé par Gohan, sphère ≈ 30 px, doigts mêlés au contour (ajustement de cercle à 2,6 px de résidu : rejeté). Confirme sphère jaune, connecteur sombre, crochet doré partiel |
| —   | `…/DBFC/ch503/013.jpg`                                                          | 1662 × 2560 | 565 529 o | **Écartée** : Potara non visible (échange hors champ)                                                                                                                                        |

Budget de téléchargement atteint (12 pages au total avec le senzu) : aucune
case de Vegetto ou de Kaioshin en gros plan n'a pu être consultée.

## Forme (Q)

| Grandeur     | Mesure                                                                                     | Retenu                                                        |
| ------------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| sphère       | largeur 46 px (rangs 79–91), hauteur 47 (y 62 → 108) ; remplissage d'ellipse 0,98          | **cercle**, D = 46,5 px                                       |
| contour      | 3 px (balayages horizontaux, y 80 et 100) ; 4 px (médiane `mesurer.ts --sombre`)           | **3,5 / 46,5 = 7,5 % de D**                                   |
| ceinture     | trait à y 72–73 de x 32 à 56, pente nulle (flèche < 1 px), joint le contour des deux côtés | **corde droite à 0,22 D du sommet**, 2 px (≈ 0,57 du contour) |
| fente 1      | composante 113 px, centre (−0,40 R ; +0,01 R), boîte 13 × 13, axe −49°                     | ellipse 0,34 × 0,19 D, −49°                                   |
| fente 2      | composante 84 px, centre (−0,01 R ; +0,31 R), boîte 11 × 11, axe −41°                      | ellipse 0,29 × 0,17 D, −41°                                   |
| tige visible | bande sombre de 7–8 px (x 40–47), cœur plus clair par endroits, ≥ 28 px jusqu'aux doigts   | **0,16 D × 0,6 D**, à l'encre                                 |

Axes des fentes déduits de l'aire et de la boîte d'une ellipse à ~45°.

## Palette

| Rôle   | Mesure                                                                                             | Retenu                                                                                     |
| ------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| sphère | Q `#EBC442` 60,2 % (k = 4, `--teinte 40 62`) ; P `#EDCE38` 45,8 %                                  | **`#EBC442`**                                                                              |
| ombre  | Q bas-droite `#E4B13B` contre `#F0CA3D` en haut : écart faible, pas d'aplat distinct               | non dessinée                                                                               |
| fentes | cœur médian `#BEB7B3` (25 px, fente 1) ; fente 2 plus sombre `#89806D` (12 px, mangée par l'encre) | **`#BEB7B3`**                                                                              |
| encre  | décile le plus sombre de l'anneau Q `#3E210A`                                                      | **`#180C00`** (encre du senzu, même édition ; un trait de 3–4 px est éclairci par le flou) |

Concordance des deux planches sur le jaune (H HSL 45–50°). Le composant
actuel (`PotaraEarrings.tsx`) pose une perle jaune `#fee440` ou verte, un
crochet argent `#e0e1dd`, une perle dorée et un reflet blanc : rien de cela
n'est sourcé par ces planches (pas de vert, pas de reflet ; crochet non vu).

## Contrôles de rendu

`rendu.ts potara.svg --compare <Q recadré>` et l'icône, `webview`, 512 → 16 px,
clair et sombre, planches ouvertes.

- Sphère, ceinture et paire de fentes en diagonale concordent avec Q.
- Écarts : contour du SVG plus gras que l'anneau de Q ; fentes un peu trop
  grandes et cernées trop épais ; la tige de Q montre un cœur clair et des
  maillons (alternance clair/sombre tous les ~9 px) que la tige pleine ne rend pas.
- 32 px : lisible (ceinture et fentes en taches) ; 16 px : boule jaune à tige.
  Fond sombre : la tige à l'encre disparaît (1,03:1), il reste une boule jaune
  (11,79:1) ; une variante pour fond sombre demanderait un cerne clair, non mesuré.

## Manques consignés (à combler avant intégration)

1. **Crochet d'oreille** : forme, longueur, couleur (le contrôle P suggère un
   doré olive, ≈ 0,7–0,9 D, mêlé aux doigts). Chercher une case de Kaioshin,
   du vieux Kaioshin ou de Vegetto où la boucle est portée à l'oreille en
   gros plan (tome 41 ch. 501–502, tome 42 ch. 504).
2. **Fentes** : une seule planche ; leur disposition peut être un effet de
   perspective (P n'en montre qu'une marque). Vérifier sur une seconde vue.
3. **Tige et maillons** : structure (tige pleine, chaîne, perle de liaison)
   non résolue à 7 px de large.
4. Couleur voulue par Toriyama non vérifiable (manga d'origine en N&B) ;
   seule la colorisation de l'édition est mesurée.

Le pendant livré est donc **un état intermédiaire**, utile pour comparer, pas
un remplaçant du composant tant que le crochet manque.
