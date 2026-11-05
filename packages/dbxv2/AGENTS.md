# packages/dbxv2

Client typé de la passerelle DBXV2 et imports Bun des ressources publiques immuables approuvées.

Commands:

```sh
bun run --filter @aphrody/shenron-dbxv2 test
bun run --filter @aphrody/shenron-dbxv2 lint
bun run --filter @aphrody/shenron-dbxv2 typecheck
```

Rules:

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- Repo-wide rules: `AGENTS.md` at the root.
