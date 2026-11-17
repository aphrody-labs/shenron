# @aphrody/shenron-lexicon

Lexique de traduction Dragon Ball (ja/fr/en) côté TypeScript: recherche, repli de graphies, masquage de termes.

## Commandes

```sh
bun run --filter @aphrody/shenron-lexicon test
bun run --filter @aphrody/shenron-lexicon lint
bun run --filter @aphrody/shenron-lexicon typecheck
```

Les tests utilisent `bun test`. Lancer `test` avant tout commit qui touche ce dossier.

## Règles du dossier

- `src/terms.generated.ts` est généré.

Règles générales: `AGENTS.md` à la racine.
