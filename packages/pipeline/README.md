# @aphrody/shenron-pipeline

Clients de calcul et pipeline de données Dragon Ball: IA, crawl, OCR, RAG. Binaire `pipeline` (`src/cli.ts`).

## Commandes

```sh
bun run --filter @aphrody/shenron-pipeline build
bun run --filter @aphrody/shenron-pipeline test
bun run --filter @aphrody/shenron-pipeline lint
bun run --filter @aphrody/shenron-pipeline typecheck
```

Les tests utilisent `bun test`. Lancer `test` avant tout commit qui touche ce dossier.

## Règles du dossier

- Lancer toute commande d'écriture avec `--dry-run` d'abord. `pipeline ocr databooks` sans `--dry-run` démarre une boucle qui écrit en production.
- Détail des chaînes: `docs/runbooks/content.md`.

Règles générales: `AGENTS.md` à la racine.
