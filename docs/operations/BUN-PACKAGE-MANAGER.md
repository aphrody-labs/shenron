# Dépendances Bun

Bun 1.4.2 est épinglé par `packageManager` dans le `package.json` racine ;
`bun.lock` (texte) est le lockfile canonique et se commite. Les workspaces sont
`apps/*` et `packages/*`.

## Règles

- **Linker isolé** (`bunfig.toml` : `linker = "isolated"`, `hoist = false`) :
  chaque paquet déclare toutes ses dépendances ; rien n'est garanti à la racine
  de `node_modules`.
- **Catalogue** : les versions tierces partagées vivent dans
  `workspaces.catalog` du `package.json` racine et s'écrivent `"catalog:"` dans
  les paquets. Les dépendances internes s'écrivent `workspace:*`.
- **`@aphrody/*`** : épinglés exactement, exclus du délai de publication
  (`minimumReleaseAgeExcludes`). Les autres résolutions observent un délai de
  trois jours (`minimumReleaseAge`).
- **Scripts de cycle de vie** : seuls les paquets de `trustedDependencies`
  exécutent les leurs ; n'élargir la liste qu'après vérification.
- `bun.lock` ne s'édite jamais à la main. La CI installe par `bun ci`.

## Modifier

```sh
bun add zod --filter @shenron/site --catalog          # version au catalogue, "catalog:" dans le paquet
bun add -d typescript --filter @shenron/site --catalog
bun add @shenron/db --filter @shenron/api             # dépendance interne : vérifier "workspace:*"
```

Après toute modification :

```sh
bun install --frozen-lockfile --dry-run
bun scripts/audit/check-workspace-catalog.ts
bun scripts/audit/check-workspace-packages.ts --strict
```

`check-workspace-packages.ts` contrôle la conformité des paquets `@shenron/*`
(graphe, classes `shenron.runtime`, exports) ; voir
[`STACK.md`](../architecture/STACK.md) §4.3.

## Entretien

```sh
bun outdated          # versions disponibles, sans mise à jour
bun why <paquet>      # origine d'une dépendance
bun audit             # avis de sécurité sur bun.lock
bun dedupe            # réduit les versions dupliquées (relire le diff du lock)
```

`bun update`, `bun dedupe` et `bun audit fix` réécrivent le lockfile : relire
le diff, puis repasser les portes (`bun run typecheck`, `bun run test`,
`bun run lint`) avant de committer.
