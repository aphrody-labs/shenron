# packages/engine

Moteur de jeu: backend GPU, pipeline WebGPU/WASM, canvas vectoriel, noyau de combat déterministe.

Commands:

```sh
bun run --filter @aphrody/shenron-engine test
bun run --filter @aphrody/shenron-engine lint
bun run --filter @aphrody/shenron-engine typecheck
```

Rules:

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- Repo-wide rules: `AGENTS.md` at the root.
