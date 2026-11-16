# @shenron/db

PostgreSQL partagé de Shenron: schéma Drizzle, pool postgres-js, driver Bun.SQL pour les scripts et l'API.

## Commandes

```sh
bun run --filter @shenron/db test
bun run --filter @shenron/db lint
bun run --filter @shenron/db typecheck
```

Les tests utilisent `bun test`. Lancer `test` avant tout commit qui touche ce dossier.

## Règles du dossier

- Toute migration passe d'abord par un dry-run. `audit:migrations` et `audit:schema` restent verts.

Règles générales: `AGENTS.md` à la racine.
