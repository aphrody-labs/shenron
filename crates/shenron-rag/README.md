# shenron-rag

Connaissance Dragon Ball hors ligne: corpus, index local, persona, ingestion du corpus.

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check -p shenron-rag
cargo nextest run -p shenron-rag
```

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.
