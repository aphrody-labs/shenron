# deploy/cloudflare

Worker CDN (`cdn-worker.ts`) devant le bucket R2 `shenron-cdn`, origine locale (`cdn-origin.ts`, `shenron-cdn-origin.service`) et outils d'opérations dans `cli/`.

Le Worker ne sert que les chemins présents dans les manifests du bucket. Configuration: `wrangler.jsonc`.

```sh
bun test deploy/cloudflare/cdn-worker.test.ts
bun check -p deploy/cloudflare
```

Aucun secret ni manifeste réel dans ce dossier. Les exemples de configuration sont les fichiers `*.example*`.
