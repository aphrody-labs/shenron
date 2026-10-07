<!-- SPDX-License-Identifier: Apache-2.0 -->

# Alignement sur Aphrody livré le 7 octobre 2026

Objectif : aligner les dépendances, le runtime, le bureau, les outils et la livraison
de Shenron sur Aphrody `fdd0a036b135497fb36ce278ca0e50707a8e2adc`, puis qualifier
les produits de bout en bout. Ce chantier reste ouvert.

## Écarts du premier audit

Au premier audit, le manifeste Rust de Shenron épinglait `df3ff0dd30d42c83e62ef3016b784b60e2f447ed`.
Ses alias de chat local utilisaient séparément `30b0e8a4147d0d07415ea7b47a458d3772317b4d`.
Le générateur synchronise désormais ces alias lorsqu'on relève la révision ; il
préserve leurs noms, versions, features et noms de packages.

La commande suivante refusait alors le relèvement avant toute écriture :

```sh
bun scripts/build/rust/workspace-deps.ts --aphrody /home/aphro/aphrody --rev fdd0a036b135497fb36ce278ca0e50707a8e2adc --check
```

Les entrées absentes du workspace Aphrody cible sont `aphrody-stdio-capture`,
`koharu-config`, `koharu-diffusion`, `koharu-llama`, `koharu-runtime`, `koharu-torch`,
`rfd` et `tauri-runtime-wry`. Leur migration exige de vérifier les packages
réels et les consommateurs ; les déclarer artificiellement comme dépendances
propres à Shenron ne résout pas leur retrait.

Le nouveau workspace expose notamment `aphrody-ml-config`, `aphrody-diffusion`,
`aphrody-ml-runtime`, `aphrody-torch` et `tauri-runtime-cef`. Shenron Studio
instanciait alors `tauri_runtime_wry::Wry` dans son entrée native.

Le catalogue Bun épingle `@aphrody/m3-reader` à `3.3.4`, contre `3.3.6` dans le
manifeste Aphrody. Vérifier la disponibilité du paquet publié et son contrat
avant de modifier le lockfile. Les autres versions communes inspectées concordent.
Les packages Tauri JS se trouvent hors des répertoires `packages/` et
`m3/packages/` : cette inspection ne conclut pas à leur disparition.

Le CLI installé `/home/aphro/.local/bin/aphrody` expose encore des commandes
retirées du code de la livraison. Ses capacités ne constituent pas une preuve
d'activation de cette révision. Le MCP canonique reste `aphrody-mcp` ; aucune
configuration des anciens alias n'est nécessaire.

## Travail restant

- [x] Synchroniser les révisions des dépendances Rust écrites à la main avec le bloc généré.
- [ ] Migrer et qualifier les contrats ML, capture stdio, Specta et chat local.
- [ ] Migrer Studio vers CEF, son packaging et ses bibliothèques système.
- [x] Relever la révision Rust et régénérer le lockfile en préservant les modifications concurrentes.
- [ ] Vérifier les publications npm, aligner les consommateurs et le lockfile Bun.
- [ ] Vérifier le fork Bun installé, les contrats SDK/FFI et WASM utilisés par Shenron.
- [ ] Aligner les scripts, CI, Docker, installateurs et documentation concernés.
- [ ] Exécuter les portes Bun et Rust sur les cibles concernées, puis les parcours réels serveur, bot, MCP et Studio.
- [ ] Livrer les lots qualifiés ; traiter les changements d'hôtes par le propriétaire Infra.

## Preuves du premier lot

Le 7 octobre 2026 : six tests du générateur et de l'alignement des manifestes
réussis ; TypeScript des scripts, oxlint et format des trois fichiers concernés réussis.
Le lint explicite utilise la configuration du dépôt sans ses exclusions de
`**/build/**`, qui écartent normalement ces scripts.
Le contrôle de dépendances contre la nouvelle révision échoue explicitement sur
les huit contrats cités ci-dessus, sans modifier le manifeste.

Le `Cargo.lock` modifié et `crates/shenron-gpu/` non suivi préexistaient au chantier.
Ils restent hors de ce lot. Le `TODO.md` est revendiqué par un autre agent ; cette
liste porte uniquement le suivi de l'alignement Aphrody.

## Migration Rust en qualification

Les consommateurs ML utilisent les identités `aphrody-ml-config`,
`aphrody-ml-runtime`, `aphrody-llama`, `aphrody-diffusion` et `aphrody-torch`.
La capture stdio utilise `aphrody_backend::stdio_capture`. Les alias temporaires
de chat local sont retirés au profit des dépendances canoniques.
Studio sélectionne `tauri-runtime-cef` et porte `cef_entry_point` pour ses
processus Chromium. La CI installe GTK 4, X11 et xkbcommon.

Le manifeste épingle désormais la révision cible ; le contrôle du bloc généré
réussit. La résolution Cargo du snapshot `aa0395efe4e9` a réussi sur le VPS et
la vérification `check -p shenron-ffi -p shenron-desktop --all-targets`
a réussi en 2 min 12 s (job `2026-10-07T10-07-03-076Z-aa0395efe4e9`).
Les alias de chat ont ensuite été retirés ; le Clippy strict du nouvel état
est lancé. Les tests et la livraison de ce lot restent à qualifier.

Le registre npm public répond HTTP 404 pour `@aphrody/m3-reader/3.3.6` ;
l’épingle publiée `3.3.4` est conservée jusqu’à disponibilité du remplacement.

Le Clippy strict des huit crates modifiées, toutes cibles, a réussi sur le
snapshot `435690da6d17` en 49,85 s. Les tests nextest de ces huit crates sont
lancés dans le job `2026-10-07T10-10-31-763Z-64aaf6beb2df`.
La préparation du lockfile de livraison se fait dans un worktree isolé pour
ne pas commiter la crate GPU concurrente. Le lockfile du worktree principal
contient toujours cette entrée, identique à celle présente avant la migration.

Le lockfile de livraison est maintenant résolu par Cargo : 1 211 packages,
aucune entrée des anciennes crates ML, Wry ou capture stdio. Par rapport au
lockfile qualifié sur le VPS, seule la crate GPU concurrente est retirée ;
aucune autre identité, version ou source de package ne change.
`bun install --frozen-lockfile` a vérifié 990 installations sans modification.

Nextest a terminé avec succès sur `64aaf6beb2df` : 292 tests réussis,
21 sautés selon le profil du dépôt, 32 binaires recensés. La compilation des
tests a duré 3 min 41 s, leur exécution 2,376 s. Le contrôle Windows MSVC
`xwin check -p shenron-ffi -p shenron-desktop --all-targets --locked
--target x86_64-pc-windows-msvc` est en cours sur `832a9ca63455`, job
`2026-10-07T10-15-40-980Z-832a9ca63455`. Le contrôle WASM reste à faire.

L’essai Windows initial échoue dans l’environnement : le volume `/srv` est
plein lors du téléchargement CEF, et cargo-xwin remplace les CFLAGS de cible
sans SSE4.1. Le nouvel essai `afa22061c8c9` utilise, par overrides Cargo du
job, le cache `/home/ubuntu/shenron-build/cache/cef` sur le volume libre et
`env.CFLAGS.value="-msse4.1"` avec `force=true`. Aucun cache partagé n’est supprimé.

La bibliothèque FFI debug du VPS se charge sous Bun local : ABI 4. Les
35 tests réels de `packages/native/test` réussissent (aucun échec), y compris
capture stdout, mémoire par agent, concurrence, annulation et arrêt des workers.
SHA-256 local : `a2d1c7d9a67e078ed5fb12095d83da5874e72e3a1d11983c74e3789dbb6eed5b`.
Il s’agit d’une qualification debug, pas d’un artefact de release installé.

Le runner de bureau passe désormais SSE4.1 à cargo-xwin via les CFLAGS
génériques, en conservant ceux fournis par l’appelant. Le test de sérialisation
TOML, TypeScript des scripts, oxlint et format réussissent ; sept tests du
runner et des générateurs sont verts. Cette adaptation ne concerne que les
builds MSVC croisés, pas les builds Linux ou Windows natifs.

Le contrôle Windows MSVC de la FFI et de Studio, toutes cibles Rust, a réussi
sur `afa22061c8c9` en 3 min 17 s. Le cache CEF dédié occupe environ 595 Mo ;
le volume système garde environ 110 Go libres. Cette compilation croisée
ne prouve pas une exécution sur Windows physique.

Le premier job WASM `37f4aa64abab` est terminé avec code 64 avant compilation :
le routage automatique a choisi dbfr, mais le wrapper ne reconnaît pas
`APHRODY_BUILD_HOST=dbfr` comme hôte de compilation. La porte est relancée
avec `--host vps`, sans désactiver le wrapper ni ses verrous. Cet écart de
routage automatique appartient à Workspace/Infra.

## Session Windows native

Directive propriétaire du 7 octobre 2026 : poursuivre cette session exclusivement
sur Windows natif, sans VPS. Le second essai WASM sur VPS a également terminé
avant compilation (code 64) ; aucun job distant de ce chantier ne reste lancé.

Accès natif vérifié : Windows 11, Rust/Cargo 1.98.1 MSVC, Bun 1.4.2, Git
2.55.0.windows.5, Visual Studio Build Tools 18 et cible wasm32-unknown-unknown.
Le snapshot NTFS contient le code suivi et les modifications de ce lot, sans
base, secret ni store protégé. Les builds sont sérialisés et gardent sccache.
Son port Windows est isolé du serveur Linux relayé par WSL ; l’authentification
Git Windows existante sert les dépendances privées, sans copie de clé.

La configuration Studio retire le bootstrapper WebView2. Le bundler Aphrody
épinglé détecte CEF et copie sa distribution et ses locales ; le packaging et
l’exécution de l’installeur natif restent à qualifier.

Sur Windows natif : `bun install --frozen-lockfile` réussit (953 packages),
sept tests des scripts réussissent, TypeScript scripts et oxlint explicite
rendent zéro erreur. Le format des scripts et de la configuration Studio est
validé ; le document de suivi est formaté avec oxfmt natif.

La porte `check -p koharu-canvas --lib --locked --target wasm32-unknown-unknown`
a réussi en 11,79 s depuis Windows. Exception limitée à cette cible : sccache
0.18 échoue à lancer rustc pour web-sys avec sa longue liste de features ; le
wrapper est désactivé uniquement pour la porte WASM, sans effacer de cache.
Le contrôle MSVC garde sccache, sur le port Windows 4227 forcé par la
configuration Cargo du processus pour éviter le relais Linux 4226 de WSL.
