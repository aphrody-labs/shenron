# koharu-app

Espace de travail GPUI Kit du moteur d'édition Koharu (`KoharuWorkspace`), sans couche IPC Tauri.

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check -p koharu-app
cargo nextest run -p koharu-app
```

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.
