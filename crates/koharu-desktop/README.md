# koharu-desktop

Préparation native des pages, partagée entre la présentation navigateur et l'export.

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check -p koharu-desktop
cargo nextest run -p koharu-desktop
```

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.
