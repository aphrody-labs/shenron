# @aphrody/shenron-activity-app

Serveur de l'Activité Discord Arène Shenron: Bun.serve, échange du code OAuth, salons WebSocket, règlement signé, et son client React.

## Commandes

```sh
bun run --filter @aphrody/shenron-activity-app dev
bun run --filter @aphrody/shenron-activity-app start
bun run --filter @aphrody/shenron-activity-app build
bun run --filter @aphrody/shenron-activity-app test
bun run --filter @aphrody/shenron-activity-app lint
bun run --filter @aphrody/shenron-activity-app typecheck
```

Les tests utilisent `bun test`. Lancer `test` avant tout commit qui touche ce dossier.

## Règles du dossier

- Les règles de jeu vivent dans `packages/activity`. Ce dossier sert et relaie.

Règles générales: `AGENTS.md` à la racine.
