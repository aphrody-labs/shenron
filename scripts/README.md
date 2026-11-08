# Scripts d'Ingénierie & d'Exploitation Shenron

Ce répertoire contient l'ensemble des outils d'automatisation, de compilation, de déploiement et de vérification pour Shenron.

Conformément à la doctrine du dépôt, tous les scripts s'exécutent avec **Bun v1.4.4+** ou des commandes shell POSIX strictes sans dépendance Node.js externe.

## Arborescence

- [`audit/`](./audit/) : Outils d'audit statique, analyse de code mort, conformité licences et vérification de sécurité.
- [`build/`](./build/) : Scripts de packaging et compilation :
  - `build/server.ts` : Compilation du binaire unique Bun servant l'application web et les API.
  - `build/assets.ts` : Optimisation des médias statiques et génération des bundles.
- [`data/`](./data/) : Scripts de traitement des données brutes, catalogues et lexiques Dragon Ball.
- [`deploy/`](./deploy/) : Orchestration des déploiements souverains multi-hôtes :
  - `deploy/release.sh` : Pipeline de release construisant l'image Docker sur le VPS et la diffusant par streaming zstd à travers le tunnel WireGuard vers la production.
  - `deploy/lanes.ts` : Gestion des corridors de déploiement sélectif (site, bot, proxy, services).
  - `deploy/rollback.sh` : Procédure de retour arrière immédiat sans perte de données.
- [`design/`](./design/) : Scripts de génération d'assets vectoriels, tokens de design et bannières.
- [`dev/`](./dev/) : Utilitaires pour le développement local et simulateurs d'environnement.
- [`editorial/`](./editorial/) : Outils d'aide à la publication éditoriale, synchronisation des tomes et chapitres.
- [`i18n/`](./i18n/) : Gestion et synchronisation des catalogues de traduction (fr, en, ja).
- [`media/`](./media/) : Outils de traitement multimédia, découpe vidéo, encodage MP4/HLS et pipeline R2.
- [`ops/`](./ops/) : Exploitation courante, maintenance des bases de données et surveillance de la flotte souveraine :
  - `ops/sync-site-cdn.ts` : Synchronisation des fichiers de release Next.js/Bun vers Cloudflare R2.
  - `ops/purge-edge-cache.ts` : Invalidation immédiate du cache de bordure Cloudflare.
  - `ops/check-fleet-health.ts` : Vérification de la connectivité du maillage WireGuard (`vps`, `cdn`, `prod`).
- [`plugin/`](./plugin/) : Compilation et tests des extensions Bun Engine et plugins d'émulation.
- [`release/`](./release/) : Automatisation des publications de releases GitHub et versionnement sémantique.
- [`testing/`](./testing/) : Suites de tests end-to-end (Playwright), tests de non-régression et qualification des rendus.
- [`tools/`](./tools/) : CLI internes pour les tâches administratives et l'ingénierie de rétro-ingénierie.
- [`video/`](./video/) : Pipeline d'acquisition Crunchyroll / VoirAnime et extraction automatisée.

## Utilisation Standard

Toutes les tâches standard doivent être invoquées via `just` ou `bun run` :

```sh
just check          # bun check sur packages et scripts + cargo check
just lint           # bun lint + cargo clippy
just test           # bun tests, tests de scripts, cargo nextest
just deploy-check   # validation de l'environnement de déploiement
bun run ship        # compilation sur VPS et déploiement zstd vers prod
```
