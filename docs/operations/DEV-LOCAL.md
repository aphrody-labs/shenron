# Développement local

Procédure de poste, Linux, WSL ou Windows. Les commandes de référence sont
celles d'`AGENTS.md` ; ce document les ordonne et ajoute les pièges de poste.

## Installer

```sh
bun install --frozen-lockfile          # ou bun ci
```

Bun 1.4.2 (`packageManager`), linker isolé ; règles de dépendances dans
[`BUN-PACKAGE-MANAGER.md`](BUN-PACKAGE-MANAGER.md). Rust suit
`rust-toolchain.toml` ; sur les machines Aphrody, compiler par
`~/aphrody/scripts/build/rust/cargo-serial.sh`.

## Configurer

- Les `.env` sont privés, ignorés par Git et jamais affichés. Modèle commenté du
  bot : `apps/bot/.env.example`.
- Le site lit son environnement par `apps/site/src/lib/env.ts` (t3-env) ; le bot
  par `apps/bot/src/lib/env.ts`. Les défauts codés ne vivent que dans
  `@shenron/config`. Référence des noms : [`ENV.md`](ENV.md).
- L'accès aux services distants (PostgreSQL, calcul Aphrody) passe par les
  tunnels et fichiers d'environnement fournis par `aphrody-infra` ; ils mènent
  aux services de production : écritures éditoriales par les procédures du dépôt
  seulement, jamais de `rag:build`.

## Lancer

```sh
bun --filter @shenron/site dev                   # Next dans .next-dev ; predev copie packages/ui/assets vers public/
bun --filter @shenron/bot dev                    # bun --watch src/index.ts
bun apps/server/src/cli.ts serve|doctor|paths|init
```

Le fonctionnement du binaire `shenron-server` et du bot est décrit dans
[`RUNTIME.md`](../architecture/RUNTIME.md).

## Vérifier

```sh
bun run typecheck
bun run lint
bun run test                           # *.live.test.ts exclus
bun run format:check
bun run --filter @shenron/db test      # un seul paquet
cd apps/site && bun test --isolate tests/<fichier>.test.ts
bun run test:live                      # services réels (SHENRON_LIVE=1)
bun run clippy:rust && bun run test:rust
```

## Pièges de poste

- **Windows** : Turbopack lance un processus `node` pour PostCSS/Tailwind, absent
  d'un poste Bun seul. Le dev et le build du site se font dans WSL ; typecheck,
  lint et tests restent utilisables sous Windows.
- **`next dev` réécrit `apps/site/tsconfig.json`** : restaurer le fichier avant
  de committer.
- Autres faits mesurés : [`pieges.md`](../guides/pieges.md).
