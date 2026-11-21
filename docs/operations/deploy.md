# Deploiement

## 1. Pipeline de Release (`just ship`)

`scripts/deploy/release.sh` enchaine `build-image.sh` et `ship-image.sh` sur un builder Linux x64 (`fr1`, alias `vps`, voir `ssh -G`) vers `prod` :

```sh
scripts/deploy/release.sh [revision]                # Build + transfert + activation
scripts/deploy/release.sh --plan [revision]         # Plan : services reconstruits et redemarres, holds
scripts/deploy/release.sh --build-only [revision]   # Construction de localhost/shenron:<sha>
scripts/deploy/release.sh --ship-only [revision]    # Transfert Zstd et activation sur prod
```

### Etapes

1. Detection des lanes (`scripts/deploy/lanes.ts`) : compare la revision active de chaque service (`scripts/deploy/active-release.ts`) a la revision cible. Les lanes sont `site`, `bot`, `server` et `image` (`deploy/environment.json`). `release.sh --plan` affiche pour chaque service ce qui est reconstruit et redemarre. Sortie 0 sans rien a faire quand aucun artefact ne change, 78 si le diff touche des migrations SQL (reprise avec `SHENRON_ACCEPT_HOLDS=1`), 65 si un chemin n'est pas classe.
2. Build (`scripts/deploy/build-image.sh`) : worktree reutilisable `$HOME/build/shenron`, cache BuildKit pour le store Bun et le cache Next (`Dockerfile.build`). Les binaires Rust viennent de `aphrody-labs/wiki` (`SHENRON_NATIVE_DIR`), ils ne sont pas compiles ici.
3. Transfert (`scripts/deploy/ship-image.sh`) : cible par defaut `ssh:prod`, image envoyee par `zstd -T0` puis activee par `SHENRON_DEPLOY_COMMAND`.
4. Migrations (`deploy/prod/apply-migrations.py`) : executees par `ship-image.sh` seulement si `SHENRON_REMOTE_MIGRATE=1` ; sauvegarde `pg_dump`, puis chaque migration en attente dans sa propre transaction.
5. Activation (`deploy/activation/activate.sh`) : `docker compose up -d --no-deps` sur les seuls services atteints, sonde de sante, retour au tag precedent en cas d'echec. Details : `docs/operations/AUTO-DEPLOY.md`.

## 2. Commandes de Verification (`just`)

```sh
just deploy-check     # Verifie deploy/environment.json, les lanes et execute la suite de tests de deploiement
just deploy-plan      # Affiche le plan de deploiement face a la revision en production
just deploy-history   # Simule la classification des lanes sur les 30 derniers commits
```

## 3. CDN Edge (`deploy/cloudflare` & `ssh cdn`)

Le worker CDN (`deploy/cloudflare/cdn-worker.ts`) assure la distribution des assets medias depuis R2 (`shenron-cdn`) et le noeud `ssh cdn` (`10.200.77.3`, Garage S3 + Pingora + Workerd) :

- Verification : `bun test deploy/cloudflare/cdn-worker.test.ts` et `bun check -p deploy/cloudflare`.

## 4. Hôtes et coordination

- `fr1` construit (`Dockerfile.build`, BuildKit), `fr2` sert les previews et l'edge, `prd` héberge la production (shenron et rosegriffon seulement).
- Sur `prd`, postgres (`pgvector/pgvector:pg18`), redis, embeddings (text-embeddings-inference), chat (llama.cpp) et cloudflared sont des images upstream ; site, bot et compute utilisent `localhost/shenron:<tag>` (`deploy/prod/compose.yaml`).
- Avant tout déploiement : `flock -n $DEPLOY_LOCK.flock` et lecture de `$DEPLOY_LOCK` (projet et date). Un verrou de rosegriffon interdit le déploiement. Ne jamais toucher aux conteneurs `rosegriffon-*`, aux unités `rg-*` ni au nginx de rosegriffon.
- Bascule d'un service : `docker compose up -d --no-deps <service>`, images précédentes et `compose.yaml` d'avant conservés dans `$SHENRON_ROOT/deploy-backups/`.
- Bascule de postgres sans coupure notable : réplication physique (`pg_basebackup -R`) vers la nouvelle image, arrêt de l'ancienne, `pg_ctl promote`, puis `compose up -d --no-deps postgres`.
- Unité de démarrage : `deploy/prod/shenron-stack.service`.
- Preuves : `docs/operations/proof/` (capture du site live, réponses d'API vérifiées sur leur contenu).
