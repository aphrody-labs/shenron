# packages/images

Hachage d'images, déduplication, choix de variantes et sélection d'illustrations sourcées (Bun et sharp).

Commands:

```sh
bun run --filter @aphrody/shenron-images test
bun run --filter @aphrody/shenron-images lint
bun run --filter @aphrody/shenron-images typecheck
```

Rules:

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- Repo-wide rules: `AGENTS.md` at the root.
