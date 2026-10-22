# Son Gohan, forme ultime (アルティメット悟飯) — analyse visuelle des sources et dessin du SVG

<!-- Généré par scripts/plugin/build-references.ts — ne pas éditer. Sources : docs/reference/gohan-ultime-analyse-visuelle.md. -->

> **Instantané hors ligne** — sources du dépôt Shenron (`docs/reference/gohan-ultime-analyse-visuelle.md`),
> révision `non commitée` du inconnue. Citer cette révision et cette date avec toute
> réponse tirée d'ici ; une source vivante plus récente peut avoir changé.

Les outils cités ici (`sharp`, Pillow, `mesurer.py`) sont ceux de la mesure d'origine ; la skill
les remplace par `scripts/mesurer.ts`, `rendu.ts` et `icones.ts` (Bun seul, même algorithme).
Les chemins `apps/`, `packages/` et `docs/` désignent le dépôt Shenron, absent d'une
installation du plugin seul.

Relevé de la chevelure, de l'aura et de la palette de Gohan après le réveil de son
potentiel par le Vieux Kaioshin, puis dessin original à partir de ces seules mesures.
Mesures faites le 2026-10-23 avec `plugin/skills/toriyama-svg/scripts/mesurer.ts`,
`inspecter-manga-anime.ts` (Bun.Image) et des relevés d'ancrages sur grille de 10 px
(recadrages agrandis), écrits dans un dossier de travail temporaire, hors dépôt.

- Générateur : `packages/ui/src/toriyama-svg/gohan-ultime.ts` (`arcs`, `radialSpeedlines`, `roundTo` : `geometry.ts`)
- Sorties : `svgChevelure()` (aplat d'encre), `svgEmbleme()` (512 × 512), `svgCalqueBanniere()` (aura et traits de concentration, sans fond)
- Reproduire : `gohanUltime.*` via `toriyama.js` ; `GOHAN_ULTIME_COULEURS_BRUTES` pour un rendu hors CSS
- Tests : `packages/ui/test/gohan-ultime.test.ts`

## Sources

| #   | Source                                                                                        | Dimensions              | Ce qu'elle vaut                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `https://dragonballfr.com/assets/manga/DB/regular/vol41/142.webp`, grande case                | 1280 × 1972             | **Retenue, référence de forme.** Ch. 496, Gohan en pied après l'entraînement (« Merci beaucoup !! »). Tête de trois quarts, chevelure entière dans la case. Boîte de la masse noire x 787–980, y 184–345 |
| B   | même planche, case du milieu à gauche (« Au revoir ! »)                                       | idem                    | Contrôle de face : mèche frontale unique et pattes. Sommet coupé par le cadre de la case, donc pas de mesure des pointes                                                                                 |
| C   | `…/DB/regular/vol41/031.webp`, case du haut                                                   | 1280 × 1972             | **Retenue pour l'aura.** Ch. 488, réveil par le Vieux Kaioshin (« WOSHHH ») : aura blanche en dents de scie et traits de concentration tracés à la règle                                                 |
| D   | `…/DB/regular/vol41/031.webp`, gros plan bas gauche                                           | idem                    | Écartée pour la mesure : tête inclinée, sommet de la chevelure hors case                                                                                                                                 |
| E   | `https://cdn.dragonballfr.com/assets/manga/DBFC/ch496/010.jpg`                                | 1662 × 2560             | **Retenue, référence de couleur.** Même planche que A dans l'édition couleur (colorisation de l'édition, pas de Toriyama)                                                                                |
| F   | `https://dragonballfr.com/assets/ext/db_episodes_frames/DBZ_KAI_FINAL/ep052/frame-00001.webp` | 1600 × 900              | Contrôle anime (Kai Final ép. 52, « Les pouvoirs infinis de Gohan ») : gros plan de face. Mèche frontale et pattes concordent avec B. Couleur écartée (voir plus bas)                                    |
| G   | `…/ep051/frame-00007.webp`, `…/ep052/frame-00003.webp`                                        | 1920 × 1080, 1600 × 900 | Contrôle anime de la silhouette en pied et de la montée de puissance (rochers en lévitation, sans aura dessinée) ; rien n'en est mesuré                                                                  |
| H   | `apps/site/public/dbz/transformations/gohan-ultimate.webp`                                    | 2500 × 4500             | Écartée comme source : illustration de jeu détourée, hors manga ; sert seulement d'image de bannière, pas de référence                                                                                   |

Aucune édition couleur de Toriyama n'existe pour cette planche ; la couleur E est celle
de l'édition Full Color et se dit comme telle.

## Forme : la chevelure

Mesure sur la silhouette d'encre remplie de A (`mesurer.ts --sombre --boite 780 180 985 345`,
masque regardé : masse unique, rognée à la ligne des sourcils, sans fond parasite).

| Grandeur                      | Mesure                                                                                                                                                   | Retenu                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Boîte de l'encre              | 193 × 161 px                                                                                                                                             | ratio 1,199                              |
| Remplissage de la boîte       | 71,7 %                                                                                                                                                   | contrôle du contour                      |
| Creux du bord inférieur (% L) | 0,5 · 13,5 · 26,6 · 36,7 · 46,4 · 50,8 · 57,7                                                                                                            | consignés (ligne frontale et mèche)      |
| Trait de contour              | 2 px pour 193 px (`inspecter-manga-anime.ts`)                                                                                                            | 0,9 % de la largeur                      |
| Part d'encre pleine (beta)    | 59,9 % de la boîte tête (`--mode manga`)                                                                                                                 | chevelure en aplat, sans trait intérieur |
| Pointes                       | six : deux à gauche (latérale, puis pointe 1), quatre au sommet, la quatrième la plus haute avec le flanc droit le plus long, la cinquième au bord droit | 22 ancrages (u, v) dans la boîte         |
| Mèche frontale                | une seule, creusée, qui retombe vers l'œil gauche du lecteur                                                                                             | flèches négatives sur la ligne frontale  |
| Longue mèche droite           | descend sous la ligne des sourcils jusqu'à v = 1,211                                                                                                     | seul ancrage hors de la boîte            |

Contrôle : le contour généré, superposé à A à l'échelle 1 (recadrage x 760–1020,
y 165–425, agrandi trois fois), suit les pointes et les creux à ±2 px ; la première
passe faisait bomber les flancs (flèches 0,012–0,025 L) et remontait la patte gauche,
corrigés (flancs ≤ 0,004 L, patte au ras de l'oreille).

## Forme : l'aura et les traits de concentration

Planche C : l'aura est le blanc du papier, cerné d'encre, en dents de scie dont les
pointes s'allongent vers le haut ; les traits de concentration sont des triangles
effilés vers le centre, qui laissent un cœur libre autour du personnage.

| Grandeur                | Retenu                                                      |
| ----------------------- | ----------------------------------------------------------- |
| Pointes d'aura          | 23, amplitude 0,18 du rayon, ×2,6 vers le haut              |
| Traits de concentration | 96, cœur libre à 0,22 du rayon                              |
| Aplats                  | papier `--color-os`, encre `--color-encre` (jetons du site) |

Ces nombres sont des relevés à l'œil sur la case, non des comptages automatiques :
la trame et les débris de C empêchent une segmentation fiable.

## Palette

Médianes de zones et k-means (k = 3) sur E :

| Zone                             | Mesure                                         | Retenu          |
| -------------------------------- | ---------------------------------------------- | --------------- |
| Gi, aplat (torse, pantalon)      | #FC9D18 (68 %), #FC9D16 (68 %)                 | `#fc9d18`       |
| Gi, ombre                        | #BA5F1E (26 %), #B45C20 (22 %)                 | `#ba5f1e`       |
| Sous-vêtement, ceinture, poignet | #204FAF (92 %), #2150AC (73 %), #204FAF (79 %) | `#2150ac`       |
| Peau (joue, front)               | #FED7B4, #F6D4B0 (médianes)                    | `#fed7b4`       |
| Chevelure                        | encre                                          | `--color-encre` |

Écart avec l'anime (F, capture compressée, niveau 5) : peau #ECDFE8 (dérive vers le rose),
gi #B03516 (décalé vers le rouge), sous-vêtement #584278. Conforme à la mise en garde des
sources sur les captures d'épisode : la palette reste celle de E.

## Rendu

`bun plugin/skills/toriyama-svg/scripts/rendu.ts gohan-ultime-embleme.svg --compare <recadrage de A>`
(rastériseur `Bun.WebView`), planches regardées à 512, 128, 64, 32 et 16 px, fonds clair et sombre :

- première version rejetée : aura débordant du disque, chevelure confondue avec le cerne
  de l'aura, copie de la chevelure à 35 % d'opacité (contraire à l'ombre portée dure) ;
- version retenue : disque bleu, aura découpée par le disque, médaillon peau cerclé de
  l'orange du gi, chevelure posée dessus avec une ombre portée dure dans l'ombre du gi
  (décalage 3 % du côté, sans flou ni transparence). Lisible jusqu'à 32 px ; à 16 px il ne
  reste qu'une masse sombre sur un rond clair, à ne pas utiliser comme favicon.
