# @shenron/bot

Bot Discord de Shenron (discordx sur Bun), API du bot, base `bot.*` (Drizzle), scripts d'ingestion et de seed.

## Commandes

```sh
bun run --filter @shenron/bot dev
bun run --filter @shenron/bot start
bun run --filter @shenron/bot build
bun run --filter @shenron/bot test
bun run --filter @shenron/bot lint
bun run --filter @shenron/bot typecheck
```

Les tests utilisent `bun test`. Lancer `test` avant tout commit qui touche ce dossier.

## Règles du dossier

- Modèle de variables: `apps/bot/.env.example`. Aucune valeur dans un fichier suivi.
- Les migrations ne s'appliquent jamais automatiquement: dry-run, sauvegarde vérifiée, puis application.

Règles générales: `AGENTS.md` à la racine.
