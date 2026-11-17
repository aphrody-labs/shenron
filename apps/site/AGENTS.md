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

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- Aucune nouvelle dépendance de pile (Next, Tailwind, Base UI): le dossier est en fin de vie.
- Textes visibles dans `apps/site/messages/{fr,en,ja}.json`, jamais en dur.
- Migrations dans `apps/site/src/db/migrations`; `db:push` est interdit.
- Repo-wide rules: `AGENTS.md` at the root.
