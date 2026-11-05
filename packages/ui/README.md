# @aphrody/shenron-ui

Couche UI actuelle: système de design Dragon Ball, composants du site, lecteurs, primitives d'admin, éditeur Koharu. Les crates Rust de `docs/decisions/0001-pile-du-site.md` la remplacent.

## Commandes

```sh
bun run --filter @aphrody/shenron-ui test
bun run --filter @aphrody/shenron-ui lint
bun run --filter @aphrody/shenron-ui typecheck
```

Les tests utilisent `bun test`. Lancer `test` avant tout commit qui touche ce dossier.

## Règles du dossier

- `src/tokens.ts` se régénère avec `bun run --filter @aphrody/shenron-ui tokens`; `tokens:check` détecte l'écart.

Règles générales: `AGENTS.md` à la racine.
