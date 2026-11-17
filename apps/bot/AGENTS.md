# apps/bot

Bot Discord de Shenron (discordx sur Bun), API du bot, base `bot.*` (Drizzle), scripts d'ingestion et de seed.

Commands:

```sh
bun run --filter @aphrody/shenron-bot dev
bun run --filter @aphrody/shenron-bot start
bun run --filter @aphrody/shenron-bot build
bun run --filter @aphrody/shenron-bot test
bun run --filter @aphrody/shenron-bot lint
bun run --filter @aphrody/shenron-bot typecheck
```

Rules:

- Bun 1.4.4+ only. No Node, npm, yarn or pnpm.
- Code identifiers and comments in English; documentation in French.
- No secret, private data or generated artifact in a tracked file.
- No heavy build on the Windows PC: run builds on vps or bunos.
- Modèle de variables: `apps/bot/.env.example`. Aucune valeur dans un fichier suivi.
- Les migrations ne s'appliquent jamais automatiquement: dry-run, sauvegarde vérifiée, puis application.
- Repo-wide rules: `AGENTS.md` at the root.
