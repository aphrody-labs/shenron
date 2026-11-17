# packages/api

Contrat de l'API publique Shenron: routes typées, client et schéma OpenAPI (`openapi/public.json`, généré).

Commands:

```sh
bun run --filter @aphrody/shenron-api test
bun run --filter @aphrody/shenron-api lint
bun run --filter @aphrody/shenron-api typecheck
```

Rules:

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- `openapi/public.json` se régénère avec `bun run --filter @aphrody/shenron-api openapi`; `openapi:check` détecte l'écart.
- Repo-wide rules: `AGENTS.md` at the root.
