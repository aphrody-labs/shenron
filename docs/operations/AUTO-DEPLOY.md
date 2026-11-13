# Déploiement automatique de Shenron

Dernière mise à jour : 2026-11-05. État : **inerte**. Rien ne se déploie tant que la variable de
dépôt `AUTO_DEPLOY_ENABLED` n'est pas exactement `true` et que les changements Infra listés plus
bas ne sont pas installés.

## Chaîne

1. Push sur `main` → `.github/workflows/server-artifact.yml`, sur un runner `shenron-prod`.
2. `scripts/deploy/release.sh --plan` lit la révision que chaque service exécute réellement
   (`scripts/deploy/active-release.sh` : tag d'image du conteneur, puis `.env` ; jamais
   `/srv/shenron/current`) et compare les clés de lanes (`scripts/deploy/lanes.ts`).
3. Rien de déployable (docs, tests, scripts hors build) : fin, code 0, en quelques secondes.
   Diff touchant des migrations : **HOLD**, code 78, rien n'est construit ni appliqué.
4. `release.sh --auto` : `build-image.sh` ne construit que les lanes dont la clé a changé ; une
   clé déjà produite est restaurée depuis le store adressé par contenu
   (`scripts/deploy/artifacts.ts`).
5. `ship-image.sh` passe à l'activateur les seuls services atteints (`SHENRON_SERVICES`).
6. `deploy/activation/activate.sh` (installé par Infra) bascule chaque service par
   `docker compose up -d --no-deps --wait <service>`, sonde sa santé et revient seul au tag
   précédent en cas d'échec. postgres, redis, embed, compute, chat et cloudflared ne sont jamais
   touchés : un modèle absent ne peut plus bloquer le site (panne du 2026-11-04).

## Environnement unique

`deploy/environment.json` est la seule définition : versions (Rust, Bun, sccache, image de
base), caches, paquets et `ENV` du runtime, services et sondes, lanes (entrées, sorties,
services atteints), classification des chemins, holds. `bun scripts/deploy/environment.ts
--check` échoue si `rust-toolchain.toml`, `packageManager`, `Dockerfile.build` ou
`deploy/docker/Dockerfile` divergent ; `lanes.ts --check` échoue si un chemin suivi n'est pas
classé. Les deux tournent dans `ci.yml`.

Chemin primaire : **natif sur l'hôte de production** (`"primary": "native"`). Raison : Prod
construit déjà les releases (journaux `/srv/shenron/build/prod-build-*.log`), a 8 CPU et
31 Gio, et garde sur disque le checkout unique, son `node_modules`, `target/`, le cache sccache,
le cache Turbopack et le cache Bun global (`$HOME/.bun/install/cache`). Aucun octet ne traverse
le réseau, la livraison coûte donc zéro. `Dockerfile.build` reste le chemin hermétique
secondaire (autre hôte, CI, Windows), avec les mêmes versions et des cache mounts BuildKit
(registre et git Cargo, sccache, `target/`, cache Bun, cache Turbopack). Cloudflare n'est pas un
chemin d'exécution : il ne peut héberger ni le serveur Next standalone, ni la FFI Rust, ni le
bot ; il reste le CDN (`deploy/cloudflare`).

Compose de production : `deploy/prod/compose.yaml`, gabarit sans secret relu sur Prod le
2026-11-05 ; seules différences voulues : un tag par service (`SHENRON_SITE_TAG`,
`SHENRON_BOT_TAG`, repli sur `SHENRON_IMAGE_TAG`) et compute/chat facultatifs pour site et bot.
Rendu `docker compose config` identique au fichier vivant hors de ces points et de deux valeurs
masquées à la lecture (chemin de la clé PostgreSQL, montage du jeton cloudflared), à vérifier
par Infra avant installation.

## Mesures

Base, mesurée (journaux GitHub des runs réussis du 2026-11-01/02 sur `aphrody-vps-shenron`,
journaux de Prod du 2026-11-02/03) :

| Cas                               | Avant                                                                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit sans changement d'artefact | 90–134 s de build (paquet serveur 46–76 s, image et vérification 44–77 s) + 78–85 s de livraison (image entière de 1,94 Go, environ 55 s de transfert), soit 8,6–12,7 min par run |
| Site seul, cache chaud            | 214 s de build + 64 s de livraison (run du 2026-11-01 22:47) ; sur Prod en local 41–183 s + 20–26 s                                                                               |
| Site, cache Turbopack froid       | 1101 s ; 3235 s avec attente mémoire                                                                                                                                              |
| Crate Rust                        | cargo 616–1093 s ; `build-image.sh` ne posait pas `RUSTC_WRAPPER`, sccache n'était donc utilisé que si l'hôte le configurait                                                      |
| Activation                        | `up -d --wait --remove-orphans` de toute la pile, site et bot recréés à chaque release                                                                                            |
| Depuis le 2026-11-03              | 15 runs mis en file puis annulés : runner hors ligne après la purge du VPS                                                                                                        |

Cibles :

| Cas                             | Après                                                                                                                            | Nature                              |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Docs, tests, scripts hors build | plan en 4,3 s contre Prod, aucun build                                                                                           | mesuré                              |
| 30 derniers commits             | 24 déploient, 6 non (docs et tests)                                                                                              | mesuré (`just deploy-history`)      |
| Bot seul                        | lane bot 2–16 s, paquet serveur sauté, image en cache, bascule du bot seul (santé en environ 10 s) : environ 40–60 s             | estimé                              |
| Site seul                       | wasm sauté sauf crates wasm, site 12–48 s, paquet 8–12 s, image environ 13 s, gateway puis site environ 15 s : environ 1–1,5 min | estimé à partir des phases mesurées |
| Crate Rust                      | sccache posé par `build-image.sh` dès qu'il est installé (il l'est sur Prod) : 2–5 min avec cache chaud                          | estimé, non mesuré                  |
| Revert, branche reconstruite    | restauration depuis le store, quelques secondes                                                                                  | estimé                              |

## Ce que le propriétaire approuve pour activer

Secrets : aucun nouveau secret GitHub pour le chemin primaire. Le build reste sur Prod avec
l'accès git Aphrody déjà configuré sur l'hôte. Le runner ne reçoit aucun secret de production ;
les fichiers `.env` restent sur l'hôte.

Changements Infra hors de ce dépôt, dans cet ordre :

1. Installer `deploy/activation/activate.sh` en `/srv/shenron/bin/deploy-image.sh` (le lien
   `/root/deploy-shenron-image.sh` reste valable) et, à côté, `activation.env` produit par
   `bun scripts/deploy/environment.ts --emit activation`. L'activateur refuse de tourner tant que
   le compose n'a pas de tags par service.
2. Vérifier les deux valeurs masquées, puis installer `deploy/prod/compose.yaml` en
   `/srv/shenron/compose.yaml`. L'installation ne recrée rien : l'image résolue reste la même.
3. Enregistrer un runner GitHub auto-hébergé sur Prod, labels `self-hosted, Linux, X64,
   shenron-prod`, sous un compte dédié non root avec une seule règle sudo vers
   `/srv/shenron/bin/deploy-image.sh`, puis poser la variable
   `SHENRON_DEPLOY_COMMAND=sudo -n /srv/shenron/bin/deploy-image.sh`. Le build exige l'accès Docker,
   donc le groupe `docker`, qui équivaut à root sur l'hôte : c'est le prix du chemin natif, à
   accepter explicitement. Le workflow ne s'exécute
   que sur `push` vers `main` et `workflow_dispatch`, jamais sur une pull request.
4. Désenregistrer l'ancien runner `aphrody-vps-shenron` (hors ligne). `shenron-autodeploy.timer`
   reste désactivé : son script vise encore la fabrique VPS purgée (`10.200.77.1`).
5. Facultatif : épingler `cloudflare/cloudflared` par digest.

Variables de dépôt :

- `SHENRON_PROD_RUNNER_READY=true` : permet un `workflow_dispatch` en `plan_only` pour vérifier
  le runner sans rien déployer.
- `AUTO_DEPLOY_ENABLED=true` : **l'interrupteur**. Le retirer arrête le déploiement automatique
  au push suivant.
- Facultatives : `SHENRON_BUILD_REPO`, `SHENRON_VFS_SOURCE`, `SHENRON_DEPLOY_TARGET` (défaut
  `local`).

## Migrations

Jamais en automatique. Un diff qui touche `apps/site/src/db/migrations`,
`apps/bot/src/db/migrations` ou les schémas Drizzle met la release en HOLD. Infra applique les
migrations par son runbook, puis relance le workflow en `workflow_dispatch` avec
`accept_holds`. `ship-image.sh` n'applique plus de migration par défaut
(`SHENRON_REMOTE_MIGRATE=1` pour un usage manuel).

## Retour arrière

- Automatique : un service qui n'est pas sain revient à son tag précédent ; l'autre garde ce
  qu'il exécute ; la gateway revient au répertoire de release précédent si le site échoue.
- Manuel, par Infra sur Prod : `SHENRON_SERVICES=site /srv/shenron/bin/deploy-image.sh <sha>`
  vers une révision encore présente (4 images, 6 répertoires de release gardés).
- Depuis le dépôt : `release.sh` refuse une révision qui ne descend pas de celle qui tourne,
  sauf `SHENRON_ALLOW_ROLLBACK=1`.
- Arrêt : retirer `AUTO_DEPLOY_ENABLED`.

## Points d'intégration

- Slice vendor (sans sous-module) : `vendor?` est une entrée facultative ; `build-image.sh` ne
  lance `git submodule update` que si `.gitmodules` existe ; `setup-bun` n'initialise plus
  `packages/config`. Conflit d'une ligne attendu dans `Dockerfile.build.dockerignore`
  (`!/vendor/`), à résoudre en gardant les lignes `data/lexicon` de ce slice.
- Slice aot-build (sorties de service modifiées) : mettre à jour `lanes.<lane>.outputs` et
  `runtime.files` dans `deploy/environment.json` ; `environment.ts --check` impose ensuite les
  deux Dockerfiles. Si l'emplacement des fichiers statiques du site change dans l'image,
  ajuster `prepare_release` dans `deploy/activation/activate.sh`.
- `bunfig.toml` (hors périmètre) garde `globalStore = false` ; le cache Bun est global
  (`BUN_INSTALL_CACHE_DIR`) et le checkout de Prod n'a qu'un `node_modules`. Passer à un store
  global partagé est une décision séparée.

## Commandes

```sh
just deploy-plan                 # plan contre Prod, lecture seule
just deploy-history 30           # simulation sur les commits récents
just deploy-check                # versions, classification, tests de scripts/deploy
bun scripts/deploy/lanes.ts plan --base <sha actif> --head origin/main --format text
```
