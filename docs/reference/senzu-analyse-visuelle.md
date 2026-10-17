# Senzu (仙豆) — analyse visuelle des sources et dessin du SVG

Relevé de la forme et de la palette du haricot magique sur l'édition couleur
(`DBFC`, CDN du site), dessin original à partir de ces seules mesures.
Mesures faites le 2026-10-17 avec `plugin/skills/toriyama-svg/scripts/mesurer.ts`
(Bun.Image) et de petits relevés de profils (axes principaux, centroïdes de
trait) écrits dans un dossier de travail temporaire, hors dépôt.

- Générateur : `packages/ui/src/toriyama-svg/senzu.ts` (`ovale`, `arcs`, `roundTo` : `geometry.ts`)
- Sorties : `senzu.svg` (illustration 512 × 366), `senzu-icone.svg` (512 × 512)
- Reproduire : `svgIllustration()` et `svgIcone()` du module, via `toriyama.js`

## Sources

Localisation par `dragonball_manga_search_pages` (« senzu ») sur le trait
français (`DB/regular/volNN/PPP.webp`), puis conversion tome → chapitre par
`/api/manga/volume/<id>` : les pages d'un tome sont la concaténation exacte
de ses chapitres DBFC (tome 13 : 186 pages = ch. 147–158).

| #   | Source                                                                    | Dimensions  | Poids     | Ce qu'elle vaut                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------- | ----------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `https://cdn.dragonballfr.com/assets/manga/DBFC/ch88/012.jpg`, case 1     | 1662 × 2560 | 338 760 o | **Retenue.** Premier senzu (Karin, « Senzu : le haricot du sage »), dans la paume de Goku. Haricot de 29 × 26 px (boîte encre, page x 322–351, y 605–631). Sa base est touchée par un trait de doigt (rogné à y ≥ 15 du recadrage)              |
| B   | `…/DBFC/ch150/012.jpg`, rangée 3 case 3                                   | 1662 × 2560 | 395 287 o | **Retenue, référence principale.** Haricot dans la main de Goku, couché à l'horizontale (angle 0,2°), isolé sur la peau. 27 × 19 px (page x 1158–1185, y 1646–1665)                                                                             |
| C   | `…/DBFC/ch150/012.jpg`, rangée 4 case 2 (en vol au-dessus de la jarre)    | idem        | idem      | **Retenue.** Incliné de −53°, sur fond orange. 33,6 × 22,2 px sur ses axes                                                                                                                                                                      |
| D   | `…/DBFC/ch150/012.jpg`, rangée 4 case 2 (dans la jarre)                   | idem        | idem      | **Retenue.** Vertical (−89,6°), 22 × 32 px, hile en haut                                                                                                                                                                                        |
| T   | `https://cdn.dragonballfr.com/assets/manga/DB/regular/vol13/059.webp`     | 1280 × 1972 | 156 532 o | Contrôle de forme seulement : même planche que B en niveaux de gris (13 × 8 px environ). Ovale + un trait court près d'un bout, comme en couleur. Cette « regular » ressemble à une désaturation de la couleur, pas à un scan du trait original |
| —   | `…/DBFC/ch250/011.jpg`, `ch342/010.jpg`, `ch279/008.jpg`, `ch408/013.jpg` | 1662 × 2560 | 4 pages   | **Écartées** : senzu absent ou réduit à quelques pixels (dans la bouche, ch. 250) — trouvées par le texte, sans gros plan                                                                                                                       |

Aucun gros plan de senzu dans les pages consultées : les quatre haricots
mesurés font 22–34 px de long. Tous les nombres ci-dessous sont donc des
mesures à ±1 px sur des objets de cette taille (soit ±3–5 %).

## Forme

Mesure sur la silhouette d'encre remplie (`mesurer.ts --sombre --seuil-sombre 0.35`,
masques regardés : anneaux fermés, A contaminé en haut par un trait de doigt,
rogné), puis axes principaux (ACP du masque).

| Grandeur                        | A           | B           | C           | D           | Retenu                                                                |
| ------------------------------- | ----------- | ----------- | ----------- | ----------- | --------------------------------------------------------------------- |
| longueur × largeur d'encre (px) | 31,5 × 24   | 27 × 19     | 33,6 × 22,2 | 32 × 22,1   | —                                                                     |
| **ratio L/W**                   | 1,314       | 1,419       | 1,513       | 1,451       | **1,435** (médiane)                                                   |
| remplissage / ellipse inscrite  | 0,956       | 1,027       | 0,944       | 1,012       | **ellipse** (écart ±3 % = pixel)                                      |
| largeur à 5 % des bouts (/W)    | 0,53 / 0,58 | 0,74 / 0,63 | 0,50 / 0,59 | 0,68 / 0,63 | symétrique : le bout « hile » est plus plein sur B, plus étroit sur D |
| trait d'encre (médiane)         | 3 px        | 3 px        | 3 px        | 3 px        | **3 / 31,75 = 9,4 % de L**                                            |

Le hile (trait court sombre près d'un bout), relevé par centroïde de la
noirceur ligne par ligne (B) et colonne par colonne (D) :

| Grandeur                     | B                       | D                      | Retenu                                    |
| ---------------------------- | ----------------------- | ---------------------- | ----------------------------------------- |
| position (du bout extérieur) | 7,3 / 27 = **0,27 L**   | 9,2 / 32 = **0,29 L**  | **0,28 L** (A, C ≈ 0,25 à l'œil)          |
| étendue                      | 11 / 19 = 0,58 W        | 9 / 22 = 0,41 W        | **0,50 W** (moyenne)                      |
| courbure                     | x 19,9 → 21,0 sur 11 px | y 19,4 → 20,8 sur 9 px | **droit** : pente ≤ 1 px, flèche < 0,5 px |
| orientation                  | ⟂ grand axe             | ⟂ grand axe            | ⟂ grand axe                               |
| épaisseur                    | 2 px                    | 2–3 px                 | **2/3 du contour**                        |

Sur A, le hile paraît presque vertical alors que le haricot est incliné de
−31,6° : non perpendiculaire. Contradiction non tranchée (un seul cas, 3 px de
large, base touchée par un doigt) ; B et D, mesurés, décident.

## Palette

k-means k = 4 sur les pixels verts (`--teinte 55 120 --sat 0.25 --val 0.3`).
Masques regardés : ils ne prennent que l'aplat clair (la calotte, peu saturée,
et l'encre en sont exclues) ; la palette de l'anneau d'encre vient du passage
`--sombre`.

| Rôle                                      | A                | B                | C                | D                | Retenu                                                |
| ----------------------------------------- | ---------------- | ---------------- | ---------------- | ---------------- | ----------------------------------------------------- |
| aplat clair                               | `#CEDD7D` 60,6 % | `#BED37E` 37,0 % | `#BED376` 57,4 % | `#BDCE82` 62,8 % | **`#BED37E`** (médiane RVB), OKLCH 0,83 / 0,11 / 120° |
| calotte (mi-ton)                          | `#ABB26B` 18,6 % | `#ADBC78` 20,8 % | `#A5B26D` 17,6 % | `#999E6C` 16,1 % | **`#A8B26C`** (médiane)                               |
| sombre (hile + bord)                      | `#5E602C` 9,3 %  | `#646943` 28,6 % | `#5B6432` 12,5 % | `#666C3E` 12,1 % | dessiné à l'encre                                     |
| encre (décile le plus sombre de l'anneau) | `#1A1400`        | `#150C00`        | `#220D00`        | `#140900`        | **`#180C00`** (médiane)                               |

**Contrôle de vraisemblance de la calotte.** Un hile à 0,28 L du bout découpe
une calotte d'ellipse de 23 % de l'aire ; la grappe mi-ton pèse 16–21 %
(le reste de la calotte est mangé par l'encre au bord). La grappe mi-ton est
donc bien la calotte, pas du lissage seul. Sur B, la calotte est plus sombre
(`#757858` en zone) ; sur D, à peine plus terne que l'aplat : l'écart de
valeur de la calotte varie d'une case à l'autre, sa présence non.

L'encre de cette colorisation est brun-noir chaud (H ≈ 30–40°), pas le
`#1A1A1A` neutre du Kinto-Un. Pas de reflet blanc : aucun des quatre haricots
n'en porte (le `#b5e48c` du composant actuel n'a pas de source). Le vert
mesuré est un vert-jaune pâle (H HSL 70–75°), loin du `#70e000` saturé de
`SenzuBean.tsx`. Colorisation de l'édition, pas de Toriyama : le manga
d'origine est en noir et blanc.

## Décisions forme → mesure

| Décision                                                                                                    | Mesure                              |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Ovale ellipse, L/W = 1,435 ; illustration couchée, 480 × 334,5 d'encre                                      | ratio médian, remplissage 0,94–1,03 |
| Silhouette = `arcs()` entre 12 points de l'ellipse (tous les 30°), flèche de chaque arc prise sur l'ellipse | aucun dessin à main levée           |
| Contour `#180C00`, 9,4 % de L (45 px sur 480)                                                               | 3 px pour L 31,75                   |
| Hile droit, ⟂ grand axe, centré à 0,28 L du bout, 0,50 W, 2/3 du contour, bouts ronds                       | B et D                              |
| Calotte `#A8B26C` = silhouette au-delà du hile ; aplat clair `#BED37E` sur le reste                         | grappe mi-ton 16–21 %, bord = hile  |
| Deux aplats + encre, aucun dégradé ni reflet                                                                | aucun reflet sur les 4 haricots     |
| Icône : même géométrie inclinée de −31,6°, encre à 88 % du carré, pas de pastille                           | angle de A ; contrastes ci-dessous  |

Le trait de 9,4 % est celui d'un haricot de 30 px sur la page (plume
constante à l'échelle de la page). Agrandi en illustration de 480 px, il reste
proportionnel, ce qui garde l'aspect de la case mais donne un contour très
gras : choix assumé pour un emblème vu en petit ; une illustration pleine page
demanderait une autre mesure (aucun gros plan disponible).

## Contrôles de rendu

`bun plugin/skills/toriyama-svg/scripts/rendu.ts senzu.svg --compare <B recadré>`
(et l'icône contre A), rastériseur `webview`, 512 → 16 px, fonds clair et
sombre, planches ouvertes.

- **Comparaison B** : proportions, position et orientation du hile, calotte
  plus terne à gauche concordent. Écarts : la référence est légèrement plus
  « pilule » (flancs haut/bas plus plats, remplissage 1,03) que l'ellipse ; son
  aplat clair s'éclaircit vers le centre (`#C6E17F` au 9ᵉ décile) là où le
  SVG reste en aplat ; son anneau, flou JPEG compris, paraît un peu moins gras
  que les 45 px du SVG.
- **Comparaison A** : silhouette et inclinaison justes ; le hile de A est
  vertical, celui du SVG perpendiculaire au grand axe (écart consigné plus haut).
- **Tailles** : lisible jusqu'à 32 px (hile et calotte visibles) ; à 16 px,
  ovale vert à bout gauche sombre, hile fondu dans la calotte — se lit encore
  comme un haricot, pas de variante simplifiée nécessaire.
- **Fond sombre** : l'encre `#180C00` disparaît sur `#0A0A0A` (1,03:1), la
  forme est portée par l'aplat (12,08:1). Fond clair : l'aplat seul tombe à
  1,64:1, c'est l'encre (19,24:1) qui porte la forme. Pas de pastille nécessaire.

## Manques consignés

- Aucun gros plan : forme et palette tirées d'objets de 22–34 px. Une case où
  le senzu dépasse ~100 px permettrait de vérifier la courbure fine du bout, la
  présence d'un second trait ou d'une texture.
- Pas de planche au trait original (N&B de Toriyama) exploitable dans ce
  relevé : la « regular » consultée semble désaturée depuis la couleur.
- Hile de A non perpendiculaire : non tranché.
- Variation de valeur de la calotte entre cases : retenue à la médiane.

## Intégration (non faite ici)

Brancher `SenzuBean.tsx` sur `corpsSenzu()` (ou déplacer `senzu.ts` dans
`packages/ui/src/toriyama-svg/`), ajouter l'entrée mesurée dans `palette.ts`,
régénérer `plugin/skills/toriyama-svg/scripts/toriyama.js` par
`bun scripts/plugin/build-references.ts`. `ovale()` est exporté par `senzu.ts`
et réutilisé par `potara.ts` : à déplacer dans `geometry.ts` lors de
l'intégration, plutôt que d'en garder deux copies.
