# Shenron entier : illustration vectorielle originale mesurée

## Référence inspectée et statut

- Source locale : `apps/site/public/wiki-scene/shenron-dokkan.png`, 800 × 560, 114 180 octets.
- SHA-256 : `8af30dcc9884191b7ce51d28ca3cea9741f29472bfba50ed86ffe89dce56861b`.
- Page : https://www.xenofrance.fr/shenron ; crédit du fichier : XenoFrance / Maxiuchiha22 / Dokkan Battle.
- Source distante relevée dans le reçu propriétaire : `https://static.wixstatic.com/media/199f29_6c8f6e5d3d0f48819fe781d7b6975c08~mv2.png`.
- Le fichier est un rendu raster de jeu distribué par un site fan. Licence de redistribution non établie dans les preuves disponibles. Il n'est pas présenté comme un SVG officiel.

La référence a été ouverte entièrement : bois ramifiés, tête frontale à yeux rouges,
museau, bouche verticale, moustaches, ventre segmenté, écailles, crête dorsale,
quatre membres à griffes et extrémité de queue sont observables. La composition
entrelace des anneaux en vue quasi frontale. Ce n'est pas une référence au trait de
manga ; aucune fidélité au G-pen d'une planche précise n'est revendiquée.

Le nouvel actif est une **création vectorielle originale stylisée et dérivée**, pas
une conversion du rendu Dokkan, une restauration, une édition officielle ou une
reproduction pixel pour pixel. Aucun auto-trace, masque de segmentation ou contour
extrait du raster ne pilote la géométrie. Le script de mesure est séparé du dessin.

## Mesures numériques acceptées

Le seuil alpha ≥ 128 donne une boîte source `x=0..799, y=6..552`, soit **800 × 547**,
ratio **1,4625**, 213 213 pixels occupés. Calcul conservé dans
`reference-alpha-measurements.json`. La référence touche les bords latéraux.

Le premier passage du script maintenu `mesurer.ts --teinte 85 165 --sat 0.3`
a isolé seulement une composante de 753 × 312. Son masque a été ouvert et **rejeté
pour les proportions globales** : les occlusions séparent les anneaux. Son rapport
n'est pas une mesure du corps entier. Les valeurs de ce masque ne sont pas
silencieusement réutilisées comme boîte complète.

Histogramme sur les seuls pixels alpha > 240, couleurs quantifiées par pas de huit :
verts dominants proches de `#40b030`, `#48b030`, `#48b838` ; ventre `#ffe890`,
`#e0c060`, `#f0d888`. La palette vectorielle choisie est arrondie et simplifiée :

| Rôle            | Couleur SVG | Décision                                             |
| --------------- | ----------- | ---------------------------------------------------- |
| Corps           | `#4aaf38`   | Vert représentatif, sans répliquer la texture de jeu |
| Ombre           | `#267726`   | Aplat distinct, pas de flou                          |
| Crête           | `#09654c`   | Vert profond pour la silhouette                      |
| Ventre          | `#f4df8a`   | Jaune crème, contraste sur le vert                   |
| Ombre du ventre | `#d3af50`   | Aplat chaud                                          |
| Bois            | `#aa842e`   | Ocre représentatif                                   |
| Yeux            | `#ed3e3e`   | Rouge interprété depuis la référence                 |
| Contour         | `#173a28`   | Trait vectoriel de 3,572 unités, soit 0,47 % de 760  |

L'épaisseur est un choix graphique pour la lisibilité de la mascotte, **pas une
épaisseur de plume mesurée dans un manga**. Les annotations visuelles tête/yeux
sont approximatives ; aucune précision métrique de visage n'est inventée.

## Construction et différences assumées

Neuf courbes cubiques centrales saisies à la main définissent les anneaux et la
queue. Leur volume, les bandes du ventre et les aplats sont des surfaces fermées.
Des motifs d'écailles et de segments sont paramétriques. Les primitives maintenues
`meche`, `arcs`, `inkStroke` et `roundTo` proviennent directement de
`packages/ui/src/toriyama-svg/geometry.ts` ; aucun moteur n'est recopié.
Les quatre membres portent des groupes identifiés ; bois, museau, paupières,
mandibule, langue, dents et moustaches sont construits en formes vectorielles.

Après la première comparaison, les pieds arrière ont été rendus visibles, les
fermetures artificielles entre anneaux supprimées, le museau et les paupières
incurvés, la mandibule resserrée et les raccords des membres arrondis. La tête et
les mains restent plus simplifiées que le rendu source, avec une composition
d'anneaux différente. Ce constat interdit de revendiquer une équivalence Dokkan.

La boîte alpha rendue du SVG à 800 × 560 est `20..781, 13..555`, **762 × 543**,
ratio **1,4033** : environ 4 % plus compact que la référence. Le personnage entier
garde une marge, notamment les bois, les griffes et le bout de queue.

## Rendus contrôlés et décision de sélection

Le rastériseur natif ImageMagick 7 déjà installé a produit les tailles natives
512, 208, 128, 64, 32 et 16 px ; les petites sorties sont agrandies au plus proche
voisin par la skill, sans simuler de pixels supplémentaires. Les planches claires
et sombres sont ouvertes. Les tailles utiles **224, 160 et 85 px** sont aussi
comparées au PNG à largeur égale sur fond crème et bleu très sombre.

À 224/160, le dragon entier et ses signes distinctifs sont lisibles. À 85, la
silhouette générale reste reconnaissable, mais les doigts et le visage perdent
leurs détails. À 32/16, ce dessin complet ne constitue pas une icône qualifiée.
La référence raster conserve une anatomie et des textures plus fines. La validité
vectorielle et cette lisibilité ne prouvent pas une fidélité artistique égale.

**Le PNG du portail reste actif.** Ce lot livre une illustration originale complète
pour revue ; il ne remplace pas la mascotte fidèle et n'est pas publié automatiquement.
La qualification de rendu concerne l'actif, pas une page Pixi/WebGPU ni un build app.

## Reproduction sans build application

```powershell
$mascotBun = 'C:/Users/aphro/.local/opt/bun-aphrody/bin/bun.exe'
& $mascotBun scripts/design/wiki-mascots/shenron.ts
& $mascotBun scripts/design/wiki-mascots/shenron.ts --check
$env:TORIYAMA_RASTER = 'magick'
& $mascotBun plugin/skills/toriyama-svg/scripts/rendu.ts packages/ui/assets/wiki-mascots/shenron-full.svg --tailles 512 208 128 64 32 16 --compare apps/site/public/wiki-scene/shenron-dokkan.png --sortie var/reports/wiki-scene-20261103/mascot-svg/renders
& $mascotBun var/reports/wiki-scene-20261103/mascot-svg/qualify.ts
& $mascotBun test ./scripts/design/wiki-mascots/shenron.test.ts
```

`qualification.json` contient SHA, nombre de tracés, dimensions et bornes rendues.
Le CLI ne simule pas une inspection visuelle : celle-ci est documentée ici après
ouverture des PNG. Les sources, masques et planches de travail restent dans ce
répertoire de rapports ; seul le SVG est posé dans les actifs UI.

Le générateur canonique et ce document sont versionnés sous
`scripts/design/wiki-mascots/shenron.ts` et `shenron.md`. Le petit lanceur historique
du rapport importe le générateur canonique ; il n'en conserve aucune copie.
L'actif final contient 374 tracés, zéro image/script/lien actif, 202 087 octets
(60 134 octets gzip). SHA-256 :
`22a774e170ac92e56a6a6799882ed525f240c2aeeeaf2a179fade2eb2b994e67`.
