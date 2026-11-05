# shenron-video

Bibliothèque vidéo Rust sans ffmpeg: décodage MPEG-1/2, encodage H.264, mux MP4 fragmenté, sondage, images fixes. Exclue du workspace Cargo (`exclude` dans `Cargo.toml`).

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check --manifest-path crates/shenron-video/Cargo.toml
cargo nextest run --manifest-path crates/shenron-video/Cargo.toml
```

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.
