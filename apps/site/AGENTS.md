# apps/site

Site dragonballfr.com actuel (Next.js 16, pages fr/en/ja, wiki, lecteurs). Le site Leptos décrit dans `docs/decisions/0001-pile-du-site.md` le remplace.

Commands:

```sh
bun run --filter @aphrody/shenron-site dev
bun run --filter @aphrody/shenron-site start
bun run --filter @aphrody/shenron-site build
bun run --filter @aphrody/shenron-site test
bun run --filter @aphrody/shenron-site lint
bun run --filter @aphrody/shenron-site typecheck
```

Rules:

- Bun only, at the `package.json#packageManager` version. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- Aucune nouvelle dépendance de pile (Next, Tailwind, Base UI): le dossier est en fin de vie.
- Textes visibles dans `apps/site/messages/{fr,en,ja}.json`, jamais en dur.
- Migrations dans `apps/site/src/db/migrations`; `db:push` est interdit.
- Repo-wide rules: `AGENTS.md` at the root.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
