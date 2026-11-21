# @aphrody/shenron-site

Site dragonballfr.com actuel (Next.js 16, pages fr/en/ja, wiki, lecteurs). Remplacement prévu : ADR 0008 (`gpui-kit`), conflit ouvert avec l'ADR 0009 (Leptos), voir `docs/plans/base-ui-vers-gpui.md`.

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

- Aucune nouvelle dépendance de pile (Next, Tailwind, Base UI): le dossier sera remplacé.
- Textes visibles dans `apps/site/messages/{fr,en,ja}.json` et `apps/site/messages/<espace>/{fr,en,ja}.json`, jamais en dur.
- Migrations dans `apps/site/src/db/migrations`; `db:push` est interdit.

Règles générales: `AGENTS.md` à la racine.
