# dragon-pixel

Jeu de combat de Shenron: moteur de combat déterministe, simulation d'arcade, paquets de rendu WebGPU.

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check -p dragon-pixel
cargo nextest run -p dragon-pixel
```

## Jeu Bevy dans le navigateur

La feature `bevy` (wasm32 et WebGPU) compile `bevy_view.rs`: Bevy lit le clavier et les manettes, fait avancer `DragonPixelEngineCore` à 60 Hz fixes et dessine l'état en 3D. Le JavaScript ne fait que démarrer, mettre en pause et lire le HUD (`dragon_pixel_*`). Le même module expose `DragonPixelEngineWasm` et `map_standard_gamepad`, que le site utilise pour son repli canvas 2D sans WebGPU.

Build et mise en forme pour le site, sur fr1 ou en CI uniquement (`just dragon-pixel-wasm`): cargo (profil `production`, `opt-level = "s"`), `wasm-bindgen --target web`, `wasm-opt -Oz`, noms hachés, manifeste `apps/site/src/lib/dragon-pixel-wasm.generated.ts`. Garde: `just dragon-pixel-wasm-check`.

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.
