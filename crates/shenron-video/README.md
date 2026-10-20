# Shenron Video natif

Cet outil facultatif réutilise FilmCraft : décodage MPEG-1/2, conversion couleur,
encodeur H.264 et muxeur MP4. Il ne lance aucun exécutable FFmpeg. Le manifeste
épingle les quatre dépendances au même commit de
`aphrody-labs/bun-distribution` ; le workspace racine ne les résout pas.

`encode-rgba --width W --height H --fps-num N --fps-den D --frames C` reçoit
des pixels RGBA8 opaques sur stdin et écrit un MP4 fragmenté H.264 sur stdout.
Le budget est de 1 800 images, 60 images/seconde et 2 073 600 pixels, avec des
dimensions paires comprises entre 16 et 1 920. Alpha, troncature et données
excédentaires sont refusés. L'encodage Web est une conversion avec pertes vers
YUV420 BT.709 limité, avec transfert sRGB ; les PNG originaux restent l'archive
exacte. Le reçu du rendu distingue ces deux formats.

## Construire sur la fabrique

Le script `scripts/ops/build-shenron-video.sh` exige l'environnement qualifié
d'Infra : `APHRODY_CARGO_SERIAL` doit désigner son wrapper exécutable et
`CARGO_TARGET_DIR` son cache absolu. Il ne lance aucun build lourd sur le PC.

```sh
bash scripts/ops/build-shenron-video.sh --out /chemin/absolu/artefact-neuf
```

Par défaut, Cargo résout les dépendances Git épinglées. Le script copie les
sources dans un répertoire temporaire unique, exécute tests, Clippy sans
avertissement puis build via le wrapper pour chaque phase. Les phases suivant
la résolution initiale utilisent `--locked`. Le dossier de sortie conserve le
binaire, le manifeste, le lockfile, les journaux et `receipt.json`, avec les
empreintes des sources et du binaire. Un dossier existant est refusé. Aucun
binaire n'est installé ni activé globalement : la livraison relève d'Infra.

Pour qualifier explicitement un checkout du propriétaire :

```sh
bash scripts/ops/build-shenron-video.sh --local-owner /checkout/bun-os --out /artefact/local-neuf
```

Ses chemins de crates remplacent alors les dépendances Git uniquement dans la
copie temporaire. Le checkout doit être propre dans `crates/`. Le reçu porte
`dependencyMode: explicit-local-owner` et son commit exact. Cette preuve est
distincte d'un build des dépendances Git épinglées ; son lockfile ne remplace
pas le lockfile de livraison Git.

`scripts/video/render.ts` reçoit le binaire qualifié par
`SHENRON_VIDEO_ENCODER`, conserve chaque PNG capturé avec son empreinte et borne
l'archive à 2 Gio. Il impose `RAYON_NUM_THREADS=1` au processus d'encodage et
contrôle codec, dimensions, cadence, durée et nombre d'images avec Bun Video.
Les autres chemins propriétaires restent `SHENRON_VIDEO_OUTPUT_HOME`,
`SHENRON_VIDEO_RENDERER_HOME` et `SHENRON_VIDEO_CHROME`.

La compilation ne suffit pas à qualifier les codecs : contrôler aussi une
entrée réelle autorisée, les métadonnées, les images décodées et la lecture du
résultat. Le rendu ne revendique aucune égalité entre H.264 et les PNG sources.

## Qualification du 20 octobre 2026

Sur la fabrique Linux x86_64 avec Rust 1.98.1, les cinq tests, Clippy avec
`-D warnings` et le build release passent. Le checkout propriétaire utilisé
par l'override local est exactement
`f067d7f77e4b5a95412bc35e8bcee5f809670ecc`, identique au pin Git du manifeste ;
le reçu et son lockfile décrivent explicitement cette résolution locale.

Trois images réelles autorisées de l'épisode Beerus, aux temps 30, 31 et
32 secondes, ont été encodées en H.264 High à 320 × 180 et une image/seconde.
Bun Video relit trois images et une durée de trois secondes ; chaque image a
été redécodée en PNG puis inspectée visuellement. L'erreur RGB absolue moyenne
mesurée par image est de 2,03, 3,01 et 3,33 sur 255, sans prétention d'égalité
avec les pixels sources. Cette qualification couvre l'encodeur Linux et ne
constitue pas un test complet du navigateur de composition ni des autres
plateformes.
