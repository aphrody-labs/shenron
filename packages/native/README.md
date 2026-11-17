# @aphrody/shenron-native

Binding Bun FFI de la bibliothèque native `shenron-ffi`: commandes shenron, RAG et persona, pool de workers pour les appels longs.

## Commandes

```sh
bun run --filter @aphrody/shenron-native test
bun run --filter @aphrody/shenron-native lint
bun run --filter @aphrody/shenron-native typecheck
```

Les tests utilisent `bun test`. Lancer `test` avant tout commit qui touche ce dossier.

## Règles du dossier

- `src/generated/` se régénère avec `bun run --filter @aphrody/shenron-native generate`; `generate:check` détecte l'écart.

Règles générales: `AGENTS.md` à la racine.
