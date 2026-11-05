# apps/server

`shenron-server`: site, API Shenron et API locales empaquetés en un binaire Bun autonome.

Commands:

```sh
bun run --filter @aphrody/shenron-server dev
bun run --filter @aphrody/shenron-server start
bun run --filter @aphrody/shenron-server build
bun run --filter @aphrody/shenron-server test
bun run --filter @aphrody/shenron-server lint
bun run --filter @aphrody/shenron-server typecheck
```

Rules:

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- Le binaire se construit avec `scripts/build/server.ts`.
- Repo-wide rules: `AGENTS.md` at the root.
