<!-- SPDX-License-Identifier: Apache-2.0 -->
# Alignement sur Aphrody livré le 7 octobre 2026

Objectif : aligner les dépendances, le runtime, le bureau, les outils et la livraison
de Shenron sur Aphrody `fdd0a036b135497fb36ce278ca0e50707a8e2adc`, puis qualifier
les produits de bout en bout. Ce chantier reste ouvert.

## Écarts constatés

Le manifeste Rust de Shenron épingle `df3ff0dd30d42c83e62ef3016b784b60e2f447ed`.
Ses alias de chat local utilisent séparément `30b0e8a4147d0d07415ea7b47a458d3772317b4d`.
Le générateur synchronise désormais ces alias lorsqu'on relève la révision ; il
préserve leurs noms, versions, features et noms de packages.

La commande suivante refuse actuellement le relèvement avant toute écriture :

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
instancie encore `tauri_runtime_wry::Wry` dans son entrée native.

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
- [ ] Relever la révision Rust et régénérer le lockfile en préservant les modifications concurrentes.
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
