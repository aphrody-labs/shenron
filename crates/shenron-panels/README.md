<!-- SPDX-License-Identifier: Apache-2.0 -->

# Cases manga et assets 2D

`shenron-panels` possède la segmentation XY-cut des gouttières, les découpes PNG,
les exports SVG, les GIF de panoramique/zoom et les atlas 2D. Le moteur
`shenron-engine::render::manga_scene` réutilise ces rectangles pour sa parallaxe
de cases texturées sur WebGPU. Il ne reconstruit pas les personnages en volumes.

## Export reproductible

Depuis le workspace, avec une planche locale autorisée :

```sh
cargo run -p shenron-panels --example export-page -- page.jpg var/reports/panel-assets
```

L'exemple produit un atlas PNG, son `sheet.layout.json`, un GIF des tuiles, un plan
SVG vectoriel et un SVG par case. Les scans et les résultats de travail restent
dans les stores privés, hors Git. Le SVG par case contient le scan raster dans
un cadre vectoriel ; il ne vectorise pas le trait et ne constitue pas une icône
redessinée. Les icônes Toriyama mesurées appartiennent à
`packages/ui/src/toriyama-svg/`.

La CLI intégrée expose le même propriétaire :

```sh
shenron panels page.jpg --output var/reports/panel-assets --sheet --sheet-gif --tile 256x256 --fps 2 --only 4 --only 2 --json
```

`--only` conserve l'ordre demandé et refuse tout index absent. `--json` émet
également le manifeste pour un atlas. `--sheet-gif` encode les vraies tuiles dans
cet ordre, avec leur letterboxing, sans gouttière ni cellule inutilisée ; il ne
crée pas de poses intermédiaires. L'encodeur ne garde qu'une tuile à la fois.
Les délais GIF sont arrondis à la centiseconde la plus proche : 8 images/s donne
130 ms par image. Le manifeste d'atlas conserve la cadence demandée.

Les tuiles et images vides, les cadences non finies ou hors de 1 à 100 images/s
et les atlas dépassant 8192 pixels par côté sont refusés avant assemblage.

## Qualification séparée

```sh
cargo test -p shenron-panels
cargo clippy -p shenron-panels --all-targets -- -D warnings
cargo check -p shenron-panels --lib --target wasm32-unknown-unknown
```

Ces portes couvrent l'export CPU ; elles ne qualifient ni le renderer wgpu,
ni Canvas 2D dans un navigateur, ni Dragon Pixel, ni un modèle 3D ou des VFX.
La sortie de l'exemple doit être relue et son GIF décodé avant de déclarer une
conversion réelle réussie.
