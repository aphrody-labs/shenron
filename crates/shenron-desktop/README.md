# shenron-desktop

Shenron Studio (Tauri 3): le site, l'éditeur de traduction manga et les outils locaux dans une application bureau.

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check -p shenron-desktop
cargo nextest run -p shenron-desktop
```

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.
