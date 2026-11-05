# packages/db

PostgreSQL partagé de Shenron: schéma Drizzle, pool postgres-js, driver Bun.SQL pour les scripts et l'API.

Commands:

```sh
bun run --filter @aphrody/shenron-db test
bun run --filter @aphrody/shenron-db lint
bun run --filter @aphrody/shenron-db typecheck
```

Rules:

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- Toute migration passe d'abord par un dry-run. `audit:migrations` et `audit:schema` restent verts.
- Repo-wide rules: `AGENTS.md` at the root.
