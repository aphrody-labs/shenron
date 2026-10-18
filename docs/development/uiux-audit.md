# Crawl complet et audit UI/UX Pro Max

Chaîne qualifiée le 2026-10-18 sur la fabrique de développement (Linux, sans Chrome).

## Moteur navigateur : Obscura (`aphrody-web`)

- `aphrody package install` crée les liens multicall dans `~/.local/bin`, dont `aphrody-web`.
  Le binaire `aphrody` doit rester un vrai fichier : contrôler `aphrody package doctor` avant
  et après, et ne jamais l'exécuter si `~/.local/bin/aphrody` est déjà un lien.
- `aphrody-web launch --port N` ouvre un serveur CDP (Chrome/145, V8) ; `aphrody-web --help`
  liste `launch`, `response`, `fetch`, `scrape`, `crawl`, `chrome-path`.
- `startEngine` de `@aphrody/agent-browser` exige `libaphrody_ffi.so` (build Cargo, fabrique VPS).
  `scripts/testing/obscura.ts` (`withObscura`) lance `aphrody-web` directement et branche
  `@aphrody/web-test` ; `APHRODY_WEB_BIN` remplace l'exécutable.
- Limite : Obscura n'est pas Chrome. Une mise en page suspecte (par exemple le logo du hero)
  se confirme sur un vrai navigateur avant correction.

## Commandes

```sh
bun run crawl:site                  # crawl résumable, file dans var/reports/site-crawl/frontier.sqlite
bun run audit:uiux                  # règles statiques sur chaque page crawlée → var/reports/uiux/
bun scripts/audit/uiux-audit.ts --render --sample 2   # + débordement, cibles, images, captures PNG
bun run capture:page /wiki          # captures desktop (1280) et mobile (390) → var/reports/captures/
```

Le crawl commence par ensemencer la file depuis les sitemaps (environ 23 500 URL, plusieurs
minutes de CPU) : le lancer dans tmux. Les règles viennent de `.claude/skills/ui-ux-pro-max`
(`scripts/audit/uiux-rules.ts`, testées par `uiux-rules.test.ts`) ; `--fail-on critical|high|none`
fixe le seuil d'échec.
