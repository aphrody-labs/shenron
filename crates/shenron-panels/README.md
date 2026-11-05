# shenron-panels

Détection de cases de manga et extraction de chaque case en PNG, SVG et GIF animé; natif et wasm32.

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check -p shenron-panels
cargo nextest run -p shenron-panels
```

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.
