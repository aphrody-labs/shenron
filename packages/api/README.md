# @shenron/api

Contrat de l'API publique Shenron: routes typées, client et schéma OpenAPI (`openapi/public.json`, généré).

## Commandes

```sh
bun run --filter @shenron/api test
bun run --filter @shenron/api lint
bun run --filter @shenron/api typecheck
```

Les tests utilisent `bun test`. Lancer `test` avant tout commit qui touche ce dossier.

## Règles du dossier

- `openapi/public.json` se régénère avec `bun run --filter @shenron/api openapi`; `openapi:check` détecte l'écart.

Règles générales: `AGENTS.md` à la racine.
