# packages/auth

Briques Better Auth partagées entre le site, le bot et l'API: secret, origines, cookies, fournisseur Discord, handler Request/Response.

Commands:

```sh
bun run --filter @aphrody/shenron-auth test
bun run --filter @aphrody/shenron-auth lint
bun run --filter @aphrody/shenron-auth typecheck
```

Rules:

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- Repo-wide rules: `AGENTS.md` at the root.
