# packages/koharu

Client du moteur de traduction manga Koharu: protocole IPC typé, transport JSON Lines `koharu-sdk`, canvas wasm.

Commands:

```sh
bun run --filter @aphrody/shenron-koharu test
bun run --filter @aphrody/shenron-koharu lint
bun run --filter @aphrody/shenron-koharu typecheck
```

Rules:

- Bun only, at the `package.json#packageManager` version. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- `src/protocol.ts` reflète les types de `koharu-library` (`editor::types`) et les noms de `editor::dispatch::COMMANDS`.
- Repo-wide rules: `AGENTS.md` at the root.
