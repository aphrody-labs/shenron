# Build local (Docker, Linux et Windows)

Construit les livrables Bun de Shenron dans `dist/local/` avec `docker buildx bake` (`docker-bake.hcl`, `Dockerfile.build`). Pilote : `bun scripts/build/local.ts` ou `just build-local`.

```sh
just build-local <site|bot|server|image|all> [--target linux-x64|windows-x64|all] [--flavor desktop|production] [--vfs <public.sqlite>] [--allow-no-vfs] [--force] [--no-guard] [--dry-run]
just build-local-guard        # garde des données privées (--static --context --artifacts <dir>)
just build-local-windows      # étapes natives Windows (doctor, smoke, signature)
```

Composants : `site`, `bot`, `server`, `image`, `all` (et `refresh`). Sans `--target`, le composant est construit pour `linux-x64` et `windows-x64` ; l'image n'existe que pour `linux-x64`. Pour chaque artefact : garde (aucun fichier privé ou DBXV2), SHA-256, contrôle du format (PE ou ELF), `--version` quand un runtime existe ; sorties `dist/local/manifest.json` et `dist/local/SHA256SUMS`. Le build refuse de démarrer sans l'espace disque libre requis (`--force` pour passer outre).

## Binaires Rust

Rust n'est jamais compilé ici. L'image a besoin de `shenron-mcp`, `libshenron_ffi.so` et `koharu-sdk`, construits dans `aphrody-labs/wiki` : `SHENRON_NATIVE_DIR`, sinon `<SHENRON_WIKI_DIR>/target` (`../wiki/target` par défaut). Ils entrent dans le build comme contexte nommé `native` (`NATIVE_DIR` dans `docker-bake.hcl`). Le détail des variables est dans `docs/development/rust.md`.

## Contexte

Le filtre du contexte est `Dockerfile.build.dockerignore` (liste d'autorisation), vérifié par `bun scripts/build/local-guard.ts`. Les versions épinglées (Bun, image de base) viennent de `deploy/environment.json` ; `bun scripts/deploy/environment.ts --check` échoue si `Dockerfile.build` s'en écarte.
