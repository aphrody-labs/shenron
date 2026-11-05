# shenron-manga

Adaptateur Shenron au-dessus de la bibliothèque Koharu: catalogue CDN, mapping des résultats de page, projection OCR.

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check -p shenron-manga
cargo nextest run -p shenron-manga
```

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.
