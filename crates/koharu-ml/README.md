# koharu-ml

Modèles et inférence de Koharu: détection de texte et de bulles, OCR, inpainting, disposition de page, avec benchmarks.

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check -p koharu-ml
cargo nextest run -p koharu-ml
```

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.
