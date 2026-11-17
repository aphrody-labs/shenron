# @aphrody/shenron-site

Site dragonballfr.com actuel (Next.js 16, pages fr/en/ja, wiki, lecteurs). Le site Leptos décrit dans `docs/decisions/0001-pile-du-site.md` le remplace.

## Commandes

```sh
bun run --filter @aphrody/shenron-site dev
bun run --filter @aphrody/shenron-site start
bun run --filter @aphrody/shenron-site build
bun run --filter @aphrody/shenron-site test
bun run --filter @aphrody/shenron-site lint
bun run --filter @aphrody/shenron-site typecheck
```

Les tests utilisent `bun test`. Lancer `test` avant tout commit qui touche ce dossier.

## Règles du dossier

- Aucune nouvelle dépendance de pile (Next, Tailwind, Base UI): le dossier est en fin de vie.
- Textes visibles dans `apps/site/messages/{fr,en,ja}.json`, jamais en dur.
- Migrations dans `apps/site/src/db/migrations`; `db:push` est interdit.

Règles générales: `AGENTS.md` à la racine.
