# @aphrody/shenron-native

Seul paquet autorisé à charger du code natif : la liaison `bun:ffi` de `shenron-ffi`
(`crates/shenron-ffi`, voir son README pour l'ABI).

| Export      | Classe | Rôle                                                                                                      |
| ----------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `./shenron` | `bun`  | API synchrone (thread appelant) : chargement, build info, commandes, recherche locale, découpage, persona |
| `./engine`  | `bun`  | idem, plus les primitives internes                                                                        |
| `./worker`  | `bun`  | API à promesses des appels longs, sur un pool de workers, annulables par `AbortSignal`                    |

## Chargement et refus

`SHENRON_FFI_LIB`, sinon `native/<platform>-<arch>/` puis `native/` à côté du paquet, puis
(avec `SHENRON_FFI_DEV=1`) le build le plus récent de `target/{release,debug}`. À l'ouverture,
dans l'ordre : Bun dans `engines.bun` (aligné sur la racine), ABI (par le seul symbole
`shenron_abi_version`, avant de lier la table), puis `shenron_build_info` : cible
(`process.platform`/`process.arch`) et version du workspace attendue par la table générée.
`SHENRON_FFI_ALLOW_VERSION_SKEW=1` accepte une autre version de la même ABI. Les refus sont des
`ShenronLibraryMismatch` (`reason` : `abi`, `target`, `version`).

## Table et types générés

`src/generated/symbols.ts` (table `dlopen`, `SHENRON_FFI_ABI`, `SHENRON_FFI_VERSION`,
`SHENRON_STATUS`) et `src/generated/types.ts` (charges JSON) viennent de Rust :
`bun run --filter @aphrody/shenron-native generate`, porte `generate:check`. Ne jamais les éditer.

## Worker

```ts
import { shenronWorkerPool, closeShenronWorkerPool } from "@aphrody/shenron-native/worker";

const pool = shenronWorkerPool({ path, size: 2 }); // ouvre et vérifie la bibliothèque ici
const answer = await pool.localSearch("Son Goku", { limit: 8, signal: request.signal });
await closeShenronWorkerPool();
```

- Chaque worker (`src/worker-thread.ts`, embarqué comme texte puis lancé depuis une URL `blob:`,
  donc aussi dans `bun build --compile`) ouvre sa propre poignée `dlopen` et exécute les
  exports `*_job` bloquants ; la boucle d'événements principale reste libre.
- Le thread principal crée chaque tâche (`shenron_job_new`) et l'annule (`shenron_cancel`) à
  l'`abort` sans attendre le worker : la promesse est rejetée avec la raison du signal, l'appel
  natif rend `125` et libère son worker. Puis il libère l'identifiant (`shenron_job_release`,
  sans effet une fois consommé) : aucun chemin ne laisse de tâche enregistrée.
- `shenron_last_error` est lu par le worker, juste après l'appel en échec ; les chaînes
  possédées sont copiées puis libérées sur le worker. Aucun `JSCallback`.
- Pool borné (`size` 1–64, défaut 2 ; `maxQueue`, défaut 1024, au-delà refus) ; workers `unref`
  au repos. `close()` annule tout, ferme la poignée de chaque worker, le termine après 2 s ; la
  poignée principale (`close()` du moteur) est refusée tant qu'un pool est ouvert.
- Erreurs : `AbortError` (annulation, fermeture), `ShenronJobError` (`status` 1, 64, 70).

## Tests

```sh
bun run --filter @aphrody/shenron-native test                                      # sans bibliothèque : suites natives sautées
APHRODY_LOCAL_CARGO=1 cargo build -p shenron-ffi && SHENRON_FFI_DEV=1 bun run --filter @aphrody/shenron-native test
```

Avec la bibliothèque : appels concurrents, annulation (rejet < 50 ms, worker libre < 1 s),
10 000 appels sans croissance mesurable de RSS ni tâche restante, fermeture.
