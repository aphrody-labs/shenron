# packages/pipeline

Clients de calcul et pipeline de données Dragon Ball: IA, crawl, OCR, RAG. Binaire `pipeline` (`src/cli.ts`).

Commands:

```sh
bun run --filter @aphrody/shenron-pipeline build
bun run --filter @aphrody/shenron-pipeline test
bun run --filter @aphrody/shenron-pipeline lint
bun run --filter @aphrody/shenron-pipeline typecheck
```

Rules:

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- Lancer toute commande d'écriture avec `--dry-run` d'abord. `pipeline ocr databooks` sans `--dry-run` démarre une boucle qui écrit en production.
- Détail des chaînes: `docs/runbooks/content.md`.
- Repo-wide rules: `AGENTS.md` at the root.
