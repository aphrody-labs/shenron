# @aphrody/shenron-koharu

Client du moteur de traduction manga Koharu: protocole IPC typé généré depuis `koharu-app`, transport JSON Lines `koharu-sdk`, canvas wasm.

## Commandes

```sh
bun run --filter @aphrody/shenron-koharu test
bun run --filter @aphrody/shenron-koharu lint
bun run --filter @aphrody/shenron-koharu typecheck
```

Les tests utilisent `bun test`. Lancer `test` avant tout commit qui touche ce dossier.

## Règles du dossier

- `src/protocol.ts` se régénère avec `bun run --filter @aphrody/shenron-koharu protocol`.

Règles générales: `AGENTS.md` à la racine.
