# packages/native

Binding Bun FFI de la bibliothèque native `shenron-ffi`: commandes shenron, RAG et persona, pool de workers pour les appels longs.

Commands:

```sh
bun run --filter @aphrody/shenron-native test
bun run --filter @aphrody/shenron-native lint
bun run --filter @aphrody/shenron-native typecheck
```

Rules:

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- `src/generated/` se régénère avec `bun run --filter @aphrody/shenron-native generate`; `generate:check` détecte l'écart.
- Repo-wide rules: `AGENTS.md` at the root.
