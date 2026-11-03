# Exports visuels reproductibles du wiki

Ce CLI local transforme des **images sources existantes** en recadrages PNG et en atlas
JSON directement compatible avec `PIXI.Spritesheet`. Il ne publie rien dans le site,
ne lance ni build ni serveur et ne modifie jamais les sources.

```powershell
$sceneBun = 'C:/Users/aphro/.local/opt/bun-aphrody/bin/bun.exe'
& $sceneBun scripts/media/wiki-scene-assets/index.ts scripts/media/wiki-scene-assets/example.json var/experiments/wiki-scene/research/pipeline-example
& $sceneBun scripts/media/wiki-scene-assets/index.ts scripts/media/wiki-scene-assets/example.json var/experiments/wiki-scene/research/pipeline-example --check
```

Une deuxième exécution normale vérifie les sorties et renvoie `reused`, sans réencoder.
`--check` vérifie le manifeste, toutes les sources et toutes les sorties sans écrire.
Une sortie manquante ou altérée se régénère lors de l'exécution normale. Pour changer
la recette ou la version de Bun, choisir un nouveau dossier : une identité différente
refuse toute écriture dans le dossier existant.

## Contrat du manifeste

`example.json` est la recette réelle de référence. Les chemins des sources sont relatifs
au manifeste, ceux des sorties au dossier de destination. Les identifiants sont des
slugs anglais uniques ; les champs inconnus sont refusés.

- `sources` : chemin local, SHA-256 exact, dimensions avant transformation, provenance.
- `crops` : source, rectangle entier `left/top/width/height`, usages. Aucun redimensionnement,
  détourage, effacement de sous-titre ou création de contenu n'est implicite.
- `sheets` : ordre des recadrages, colonnes et marge transparente. Les cellules prennent
  la taille maximale des recadrages ; chaque frame conserve ses dimensions natives.
- `provenance.kind` distingue animation/édition officielle, `fan-colorization`, décor créé
  et origine de catalogue non qualifiée. Ce champ n'accorde aucune licence.
- Une frame d'épisode indique son identifiant et son temps demandé. `decoder-reported`
  exige aussi le temps réellement retourné par le décodeur ; `existing-extraction-label`
  décrit seulement le libellé d'une extraction existante et ne prouve pas son PTS.

L'exemple utilise deux PNG préexistants de l'épisode 876 (480×270, libellés 120 et 350 s)
et la page 12 du chapitre 150 de DBFC. **DBFC est une colorisation française de fans,
pas une édition couleur officielle.** Le petit senzu garde son fond de planche.
Les frames d'animation contiennent leurs sous-titres d'origine.

## Fichiers produits

Chaque recadrage donne `<id>.png`. Un usage `wallpaper` et `background` peut donc
référencer exactement le même PNG. Chaque atlas donne `<id>.png` et `<id>.json` :

```json
{
  "frames": {
    "beerus-detail": {
      "frame": { "x": 2, "y": 276, "w": 240, "h": 240 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 240, "h": 240 },
      "sourceSize": { "w": 240, "h": 240 }
    }
  },
  "meta": {
    "image": "scene-example.png",
    "format": "RGBA8888",
    "size": { "w": 968, "h": 548 },
    "scale": "1"
  }
}
```

`receipt.json` conserve le SHA du manifeste, Bun version/révision, les sources et leur
provenance, les rectangles, puis les SHA, octets et dimensions des sorties. Il n'intègre
aucune date variable. Les transformations utilisent `Bun.Image.extract().rgba()` ;
l'encodage PNG réutilise l'encodeur maintenu de `plugin/skills/toriyama-svg/scripts/png.ts`.
Il s'agit bien de rasters PNG, jamais de SVG contenant une image bitmap.

## Reprise, concurrence et limites

Un verrou exclusif `.export.lock` limite chaque dossier à un écrivain. Après un arrêt
brutal du processus, vérifier le PID contenu dans le verrou avant de retirer manuellement
**ce fichier uniquement**. Le CLI ne vole jamais un verrou supposé périmé.
Le marqueur atomique `.pending.json` identifie une génération interrompue avant le
receipt final. Seule une identité strictement identique peut reprendre ; tout fichier
étranger bloque l'export et reste intact. Le receipt final est écrit atomiquement après
toutes les sorties. Une vérification concurrente voit le verrou et refuse de conclure.

Budgets avant décodage : 16 M pixels par source/atlas, 32 M pixels cumulés par manifeste
pour les sources, 32 M pour les recadrages et 32 M pour l'ensemble des sorties préparées ;
64 Mo par fichier source et 128 Mo de sources encodées cumulées. Dimensions maximales
16 384 pixels par axe. Ces limites visent un export borné, pas un traitement de corpus.

La qualification fournie concerne le décodage/recadrage natif et le format d'atlas,
pas un rendu GPU Pixi. Aucun lecteur ni aucune séquence animée n'a été testé avec un
média artificiel. Les tests de coordonnées utilisent seulement quatre pixels de contrôle ;
la recette de démonstration a aussi été exécutée sur les médias réels ci-dessus.

## Amont vidéo et extensions futures

Le propriétaire existant de la génération temporelle est
`apps/site/src/lib/episode-video-generation.ts`, consommé par
`scripts/ops/episode-video-service.ts` : `Bun.Video.frame(time)` produit les images.
Le natif `Bun.Video.frames({start,end,step,maxFrames})` retourne les temps effectivement
décodés pour les futures recettes vidéo bornées. **Ce CLI n'extrait pas encore de vidéo** :
il accepte les PNG déjà produits. `packages/pipeline/src/aphrody/frames.ts` possède
l'indexation/recherche MPEG-7, et ne constitue pas un extracteur PNG.

Segmentation sémantique, alpha de personnage, GIF animé, glTF/GLB, animations, achat de
licence et publication sont hors de cette première tranche. Aucun de ces résultats
n'est simulé par un recadrage. La direction artistique et la sélection éditoriale des
rectangles restent une étape humaine ; le CLI automatise leur export vérifié.

```powershell
& $sceneBun test ./scripts/media/wiki-scene-assets/index.test.ts
& $sceneBun check -p scripts
& $sceneBun lint scripts/media/wiki-scene-assets
& $sceneBun fmt --check scripts/media/wiki-scene-assets
```
