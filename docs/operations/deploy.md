# Deploiement Zero-Downtime

## 1. Pipeline de Release (`bun run ship`)

`scripts/deploy/release.sh` orchestre la construction sur `vps` et l'expedition vers `prod` :

```sh
scripts/deploy/release.sh [revision]                # Build + Ship + Activation zero-downtime
scripts/deploy/release.sh --plan [revision]         # Calcul de la lane (noop, site, bot, full, hold)
scripts/deploy/release.sh --build-only [revision]   # Construction de localhost/shenron:<sha>
scripts/deploy/release.sh --ship-only [revision]    # Transfert Zstd et activation sur prod
```

### Etapes Automatisees et Reduction de Latence
1. **Detection de Lane (`scripts/deploy/lanes.ts`)** : Analyse le diff Git entre la revision active sur `prod` et la revision cible :
   - `noop` : Changement documentaire ou hors runtime -> aucun build ni redemarrage.
   - `cdn` : Mise a jour du worker Cloudflare uniquement.
   - `bot` : Reconstruit et ne redemarre que `shenron-bot`.
   - `site` : Reconstruit et ne redemarre que `shenron-site`.
   - `full` : Reconstruit et met a jour `shenron-site` et `shenron-bot`.
   - `hold` : Bloque l'auto-deploy si une migration SQL destructive est detectee sans validation.
2. **Build Cache BuildKit (`scripts/deploy/build-image.sh`)** :
   - S'execute sur `vps` (`10.200.77.1`) dans un worktree dedie (`$HOME/build/shenron`).
   - Utilise Docker BuildKit avec `--mount=type=cache` pour le store Bun et les artefacts Cargo.
3. **Streaming Zstd Multi-Coeur (`scripts/deploy/ship-image.sh`)** :
   - Transfere les couches de l'image Docker via `docker save | zstd -T0` sur le tunnel WireGuard directement vers `docker load` sur `prod` (`10.200.77.5`).
4. **Migrations Transactionnelles (`deploy/prod/apply-migrations.py`)** :
   - Avant activation, effectue un dump PostgreSQL verifie puis applique chaque migration SQL en attente dans sa propre transaction.
5. **Activation Sans Coupure** :
   - Met a jour uniquement les conteneurs cibles via `docker compose up -d --no-deps <services>` et verifie les healthchecks HTTP (`/api/health`). En cas d'echec, bascule automatiquement sur le tag precedent.

## 2. Commandes de Verification (`just`)

```sh
just deploy-check     # Verifie deploy/environment.json, les lanes et execute la suite de tests de deploiement
just deploy-plan      # Affiche le plan de deploiement face a la revision en production
just deploy-history   # Simule la classification des lanes sur les 30 derniers commits
```

## 3. CDN Edge (`deploy/cloudflare` & `ssh cdn`)

Le worker CDN (`deploy/cloudflare/cdn-worker.ts`) assure la distribution des assets medias depuis R2 (`shenron-cdn`) et le noeud `ssh cdn` (`10.200.77.3`, Garage S3 + Pingora + Workerd) :
- Verification : `bun test deploy/cloudflare/cdn-worker.test.ts` et `bun check -p deploy/cloudflare`.
