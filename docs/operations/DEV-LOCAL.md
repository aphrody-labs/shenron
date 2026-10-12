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
  `@aphrody/shenron-config`. Référence des noms : [`ENV.md`](ENV.md).
- L'accès aux services distants (PostgreSQL, calcul Aphrody) passe par les
  tunnels et fichiers d'environnement fournis par `aphrody-infra` ; ils mènent
  aux services de production : écritures éditoriales par les procédures du dépôt
  seulement, jamais de `rag:build`.
- `just env` (`bun scripts/dev/env-pull.ts pull`) lit `/etc/rose-griffon/shenron-{site,bot}.env`
  du `vps` par SSH, en garde la copie privée dans `~/.aphrody/private/shenron/env`, la vérifie
  par `aphrody-infra secrets check` (contrat `config/secrets-contract.json` des outils
  d'Aphrody) et en dérive `apps/site/.env.local` et `apps/bot/.env` : origines
  `localhost`, sans analytique ni jeton de passerelle Discord de production (jeton de dev par
  `SHENRON_BOT_DEV_TOKEN`). `just env remote` écrit les mêmes fichiers dans `~/shenron-dev` du
  VPS ; `just env tunnel` relaie PostgreSQL (15433) et le chat IA (8799) en local ;
  `just env status` compte les clés sans afficher de valeur.
- `bun scripts/dev/env-pull.ts pull --local-services --host vps` conserve le jeu de clés site/bot
  de l'environnement d'exploitation, mais remplace DB, Redis, API et assets par les services
  Docker locaux (`shenron_site_local`, `127.0.0.1:6379`, API `:5006`, gateway `:8080`) et
  génère de nouveaux secrets locaux d'authentification. Le jeton de passerelle Discord de
  production reste retiré. La base locale est un snapshot privé distinct; aucune écriture
  applicative n'est dirigée vers PostgreSQL/Redis de production.
- La passerelle Docker sert d'abord le volume local `shenron-local-cdn`; si un asset manque,
  elle le relaie au Worker CDN public réel. Ce mode couvre les routes CDN en ligne sans
  recopier le corpus R2 de 31,7 Go; il ne constitue pas un miroir hors ligne. Le relais
  transmet uniquement `Accept`, `Range` et les validateurs, jamais cookie ni autorisation.

## Lancer

```sh
bun --filter @aphrody/shenron-site dev                   # Next dans .next-dev ; predev copie packages/ui/assets vers public/
bun --filter @aphrody/shenron-bot dev                    # bun --watch src/index.ts
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
bun run --filter @aphrody/shenron-db test      # un seul paquet
cd apps/site && bun test --isolate tests/<fichier>.test.ts
bun run test:live                      # services réels (SHENRON_LIVE=1)
bun run clippy:rust && bun run test:rust
```

## Pièges de poste

- **Windows natif** : utiliser le runtime Aphrody Bun et les outils Windows du poste ;
  ne pas démarrer WSL pour ce workflow. Si Turbopack exige un processus `node`,
  installer uniquement le runtime/outillage natif requis ou utiliser le build Linux
  qualifié sur la fabrique VPS, sans détourner le poste vers WSL.
- **`next dev` réécrit `apps/site/tsconfig.json`** : restaurer le fichier avant
  de committer.
- Autres faits mesurés : [`pieges.md`](../guides/pieges.md).
