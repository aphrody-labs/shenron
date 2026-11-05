# shenron-gpu

Backend wgpu unique de Shenron: choix d'adaptateur et de device, limites, perte de device, cibles de rendu, lecture, présentation.

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check -p shenron-gpu
cargo nextest run -p shenron-gpu
```

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.
