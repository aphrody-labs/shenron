# Déploiement

## Sur `main`

`scripts/deploy/release.sh` enchaîne `build-image.sh` puis `ship-image.sh`. Le raccourci est `bun run ship`.

```sh
scripts/deploy/release.sh [revision]
scripts/deploy/release.sh --build-only [revision]   # image localhost/shenron:<sha>, vérifiée
scripts/deploy/release.sh --ship-only [revision]
```

- `build-image.sh` construit le site, le bot et les composants natifs dans un worktree réutilisable (`SHENRON_BUILD_REPO`, par défaut `$HOME/build/shenron`), puis l'image avec `deploy/docker/Dockerfile`. Il tourne sur Linux x64 avec Git, Bun, Rust et Docker ou Podman. Les variables sont listées dans son en-tête.
- `ship-image.sh` envoie l'image vers la cible `SHENRON_DEPLOY_TARGET` (`ssh:<hôte>`, `registry:<dépôt>` ou `local`; défaut `ssh:prod`), puis lance `SHENRON_DEPLOY_COMMAND`.
- Garde de retour arrière: le script refuse une révision qui ne descend pas de la release active, sauf `SHENRON_ALLOW_ROLLBACK=1`.
- Par défaut, il applique les migrations du site en attente avant l'activation, après un dump, une transaction par migration (`deploy/prod/apply-migrations.py`). `SHENRON_REMOTE_MIGRATE=0` les saute.
- Ne jamais copier de fichier dans une release scellée.

Le build se lance depuis vps ou bunos. Le poste Windows ne construit pas.

## Voies de déploiement automatique

La branche `claude-deploy` ajoute des voies de build par lane, un activateur par service avec retour automatique au tag précédent, et `docs/operations/AUTO-DEPLOY.md` (sur cette branche). Elle n'est pas intégrée à `main`. Sur cette branche, les commandes sont `just deploy-plan`, `just deploy-history` et `just deploy-check`, et un diff qui touche des migrations met la release en attente (HOLD).

## Migrations manuelles

Procédure: dry-run, sauvegarde vérifiée (`docs/operations/backup-recovery.md`), application, vérification. Les fichiers SQL ponctuels sont dans `deploy/sql/`, le script d'application dans `deploy/prod/apply-migrations.py`.

## CDN

Worker Cloudflare dans `deploy/cloudflare`. Test local: `bun test deploy/cloudflare/cdn-worker.test.ts`, puis `bun check -p deploy/cloudflare`.
