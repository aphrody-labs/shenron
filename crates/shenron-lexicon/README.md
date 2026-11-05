# shenron-lexicon

Lexique de traduction Dragon Ball (ja/fr/en): données embarquées, recherche, protection des termes autour d'une traduction.

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check -p shenron-lexicon
cargo nextest run -p shenron-lexicon
```

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.
