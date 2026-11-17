# @aphrody/shenron-server

`shenron-server`: site, API Shenron et API locales empaquetés en un binaire Bun autonome.

## Commandes

```sh
bun run --filter @aphrody/shenron-server dev
bun run --filter @aphrody/shenron-server start
bun run --filter @aphrody/shenron-server build
bun run --filter @aphrody/shenron-server test
bun run --filter @aphrody/shenron-server lint
bun run --filter @aphrody/shenron-server typecheck
```

Les tests utilisent `bun test`. Lancer `test` avant tout commit qui touche ce dossier.

## Règles du dossier

- Le binaire se construit avec `scripts/build/server.ts`.

Règles générales: `AGENTS.md` à la racine.
