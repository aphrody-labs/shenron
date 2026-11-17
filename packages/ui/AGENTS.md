# packages/ui

Couche UI actuelle: système de design Dragon Ball, composants du site, lecteurs, primitives d'admin, éditeur Koharu. Les crates Rust de `docs/decisions/0001-pile-du-site.md` la remplacent.

Commands:

```sh
bun run --filter @aphrody/shenron-ui test
bun run --filter @aphrody/shenron-ui lint
bun run --filter @aphrody/shenron-ui typecheck
```

Rules:

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- `src/tokens.ts` se régénère avec `bun run --filter @aphrody/shenron-ui tokens`; `tokens:check` détecte l'écart.
- Repo-wide rules: `AGENTS.md` at the root.
