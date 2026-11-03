# Objets du wiki — illustrations vectorielles mesurées

`dragon-ball-one-star.svg` et `senzu-icon.svg` sont des illustrations mesurées,
distinctes des images officielles. Le héros commun du wiki emploie ces petits
décors de 32 px selon son thème, avec `alt=""` et `aria-hidden="true"`. Les images
du catalogue restent présentes. Ce lot ne prétend pas que les nouveaux fichiers
sont déjà servis en production.
Les SVG ne contiennent que des primitives vectorielles, un dégradé et un découpage
vectoriel : aucun bitmap, décalquage automatique, filtre ou dépendance distante.

## Reproduction

Depuis la racine du dépôt, avec le runtime Aphrody :

```sh
bun packages/ui/assets/wiki-objects/generate.ts
bun packages/ui/assets/wiki-objects/generate.ts --check
```

Le générateur compose `svgSphere(1)` du point d’entrée mainteneur existant et
`svgIcone()` du senzu. Les deux lisent la géométrie unique de
`packages/ui/src/toriyama-svg/` ; aucune copie de tracés ou de moteur n’est ajoutée.
Cette géométrie n’a pas changé : le bundle du plugin n’a donc pas été régénéré.
Les paramètres, les empreintes des références et leurs limites sont livrés dans
[`measurements.json`](measurements.json).

Le composant importe les deux SVG par l’export déjà autorisé
`@aphrody/shenron-ui/assets/*`. Next émet leurs fichiers dans
`/_next/static/media/` ; la vérification du build réellement livré et des fichiers
servis reste requise après publication. Aucun nouveau registre, export de paquet
ou ajout à `uiAssetPaths` n’est nécessaire. Générateur, mesures et documentation
ne sont pas copiés dans les assets publics.

## Sources et choix

La couverture du tome 1 (`82.jpg`, 1000 × 1500) a été ouverte, puis la sphère du
titre comparée au rendu. Les proportions, le foyer lumineux et l’étoile unique
reprennent le relevé de `docs/reference/couverture-analyse-visuelle.md` (instantané
du skill `f4579c5`, 2026-10-05). Le cerne noir de 23 unités sur 512 est l’adaptation
maintenue depuis le logo DBS ; il est absent de cette couverture. Le SVG n’est donc
pas une reproduction exacte de la jaquette. Les dispositions à 2–7 étoiles restent
non mesurées et ne sont pas livrées. L’ancienne URL du bot a répondu 404 ; la même
référence a été récupérée sur le CDN propriétaire (200).

La planche DBFC chapitre 150 page 12 a été ouverte avec son contrôle « regular »
tome 13 page 59. Le senzu dans la paume de Goku est un petit ovale à bout terne et
hile court. Le masque et la découpe ont été ouverts avant d’accepter le nouveau
contrôle : boîte d’encre 27 × 19 px, ratio aligné 1,421, trait médian 3 px, ton sombre
`#150C00`. Ces valeurs concordent avec le relevé maintenu du 2026-10-17, dont le
générateur conserve la médiane inter-haricots 1,435, le hile à 0,28 L et les trois
aplats. Les sujets mesurés ne dépassent pas 34 px : précision d’environ ±3–5 %.

Le recadrage du chapitre 88 page 12 a également été ouvert pour l’inclinaison
de l’icône (−31,6°). Son hile paraît vertical, contrairement au hile perpendiculaire
des sources B/D ; cette contradiction existante reste explicite. La palette est
celle de la **colorisation française DBFC**, pas une attribution de couleurs
officielles à Toriyama. La version « regular » semble désaturée depuis la couleur :
elle ne remplace pas un gros plan du trait original en noir et blanc.

## Rendus effectivement contrôlés

Les rendus natifs 512, 128, 64, 32 et 16 px ont été calculés sur blanc et `#0A0A0A`
avec le script du skill, puis les quatre planches raster et les deux comparaisons
ont été ouvertes. Exemple non interactif sous PowerShell :

```powershell
$env:TORIYAMA_RASTER = 'magick'
bun plugin/skills/toriyama-svg/scripts/rendu.ts packages/ui/assets/wiki-objects/senzu-icon.svg --sortie var/reports/wiki-redesign-20261103/svg-objects/render-senzu
```

La sphère reste reconnaissable à toutes les tailles. Les pointes de l’étoile
fusionnent à 16 px : ne pas utiliser cette taille pour exprimer un nombre précis
d’étoiles. Le senzu conserve hile et calotte à 32 px ; à 16 px, le hile se fond dans
le bout sombre. Sur fond sombre, le contour du senzu s’efface et l’aplat vert porte
la silhouette. Le cerne de la sphère est plus épais que celui du scan, adaptation
assumée ; le senzu est plus régulier et plus plat que le petit objet JPEG.

Les scans, masques, découpes et PNG de contrôle restent des fichiers de travail
ignorés dans `var/reports/wiki-redesign-20261103/svg-objects/`. Aucun navigateur
n’a été repris après l’interruption de la QA live.
