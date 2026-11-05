# koharu-pipeline

Workflow de traitement de scène en processus pour Koharu.

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check -p koharu-pipeline
cargo nextest run -p koharu-pipeline
```

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.
