# packages/koharu

Client du moteur de traduction manga Koharu: protocole IPC typé généré depuis `koharu-app`, transport JSON Lines `koharu-sdk`, canvas wasm.

Commands:

```sh
bun run --filter @aphrody/shenron-koharu test
bun run --filter @aphrody/shenron-koharu lint
bun run --filter @aphrody/shenron-koharu typecheck
```

Rules:

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- `src/protocol.ts` se régénère avec `bun run --filter @aphrody/shenron-koharu protocol`.
- Repo-wide rules: `AGENTS.md` at the root.
