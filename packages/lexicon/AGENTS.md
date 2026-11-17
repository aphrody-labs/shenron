# packages/lexicon

Lexique de traduction Dragon Ball (ja/fr/en) côté TypeScript: recherche, repli de graphies, masquage de termes.

Commands:

```sh
bun run --filter @aphrody/shenron-lexicon test
bun run --filter @aphrody/shenron-lexicon lint
bun run --filter @aphrody/shenron-lexicon typecheck
```

Rules:

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- `src/terms.generated.ts` est généré.
- Repo-wide rules: `AGENTS.md` at the root.
