# packages/media

Logique média partagée: lecture d'épisodes, livraison vidéo, mapping Crunchyroll, manga, OCR, pipeline mediabunny.

Commands:

```sh
bun run --filter @aphrody/shenron-media test
bun run --filter @aphrody/shenron-media lint
bun run --filter @aphrody/shenron-media typecheck
```

Rules:

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- Repo-wide rules: `AGENTS.md` at the root.
