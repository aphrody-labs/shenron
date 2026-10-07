# Archive : Ancien Prototype Canvas 2D (Déprécié)

Ce dossier conserve l'ancien prototype procédural `Canvas2D` (`DragonPixelGame.deprecated-canvas2d.tsx`).

### Raison de l'archivage & Interdiction stricte
- **Interdiction** : Le rendu procédural à base de rectangles `ctx.fillRect` et d'arcs mathématiques est formellement interdit pour Dragon Pixel.
- **Remplacement** : Remplacé par le véritable moteur Dragon Pixel authentique :
  1. Assets et sprites rétro authentiques extraits par rétro-ingénierie (RE) des conteneurs du monorepo et du VPS.
  2. Moteur Rust compilé en WebAssembly (`wasm32-unknown-unknown`) avec rendu WebGPU (shaders WGSL, nearest-neighbor mixel-perfect point sampling).
  3. Support complet clavier et manette physique (Gamepad API standard avec deadzones analogiques et vibrations haptiques).
  4. Streaming direct des textures et SFX depuis le CDN Nginx (`https://cdn.dragonballfr.com/assets/dragon-pixel/`).
