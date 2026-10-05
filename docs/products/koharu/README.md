<!-- SPDX-License-Identifier: Apache-2.0 -->
# Koharu dans Shenron

Koharu est le moteur de traduction de manga absorbé dans ce dépôt (projets,
scènes, détection, OCR, traduction, nettoyage, rendu, export). Référence unique
pour son emplacement, son interface et sa frontière éditoriale. Documentation
amont (en/ja/zh) : [`docs/koharu/`](../../koharu/) ; journal amont :
[`docs/koharu/CHANGELOG.md`](../../koharu/CHANGELOG.md) ; licences MIT/Apache-2.0
d'origine : [`docs/licenses/koharu/`](../../licenses/koharu/).

## Emplacement

| Surface | Chemin |
| --- | --- |
| Moteur Rust | `crates/koharu-*` (`library`, `app`, `pipeline`, `ml`, `translator`, `scene`, `storage`, `renderer`, `rasterizer`, `psd`, `canvas`, `desktop`, `agent`, `metrics`, `secrets`) |
| Socle ML | `koharu-{llama,torch,diffusion,runtime,config}`, fournis par Aphrody (voir [`APHRODY-ECOSYSTEM.md`](../../architecture/APHRODY-ECOSYSTEM.md)) |
| Client Bun | `@shenron/koharu` (`packages/koharu`) : protocole typé, transports Tauri et natif, réglages, médias, canvas WASM |
| Interface | `@shenron/ui`, montée par le site sous `/koharu` |

`koharu-library` est le point d'entrée Rust sans Tauri. Son exécutable
`koharu-sdk` parle JSON Lines sur stdin/stdout (`{ id, method, params }` →
`{ id, result }` ou `{ id, error }`) ; `--root <dossier>` choisit la collection de
projets. Les méthodes sont listées dans `crates/koharu-library/README.md`.

```sh
cargo build -p koharu-library --bin koharu-sdk
bun --filter @shenron/koharu protocol      # régénère packages/koharu/src/protocol.ts (Specta)
bun --filter @shenron/koharu build:wasm    # reconstruit koharu-canvas
```

Les fichiers générés (protocole, WASM) ne s'éditent jamais à la main.

## Candidats vers Shenron

Une sortie Koharu ou de l'OCR Aphrody n'entre dans Shenron que comme
**candidat non arbitré**, lié par empreintes au manifeste Shenron :

```sh
bun run --filter @shenron/pipeline pipeline koharu-candidate <manifeste-manga.json> <résultats.jsonl> <candidats.jsonl>
bun run --filter @shenron/pipeline pipeline koharu-databook-candidate <manifeste-haché.json> <résultats.jsonl> <candidats.jsonl>
bun run --filter @shenron/pipeline pipeline koharu-native-candidate <manga|databook> <manifeste.json> <racine-projets> <projet> <candidats.jsonl> [--sdk <koharu-sdk>]
bun run --filter @shenron/pipeline pipeline aphrody-ocr-candidate <manga|databook> <manifeste-haché.json> <ocr-v2.jsonl> <candidats.jsonl>
```

- L'adaptateur exige que l'empreinte SHA-256 de l'image traitée corresponde à
  une entrée unique du manifeste ; il refuse les pages inconnues, dupliquées ou
  aux empreintes divergentes. Les manifestes databooks sans empreinte sont
  refusés : régénérer l'export.
- Le candidat garde géométrie, textes, confiances et provenance par étape ; sa
  décision reste `unreviewed`.

## Frontière éditoriale

- PostgreSQL, les scans sources, le lexique japonais canonique, les juges, la
  quarantaine OCR, les révisions et la publication restent l'autorité Shenron.
- Aucun adaptateur n'écrit en base ni ne pose de verdict. Un candidat manga ne
  sert que d'indice dans le paquet de relecture visuelle hors ligne ; la
  relecture de l'image et l'audit de couverture restent obligatoires.
- Un run Koharu ne lève pas une quarantaine databooks, ne marque pas une
  traduction comme acceptée et ne change pas le canon. Une traduction fluide
  n'est pas une acceptation éditoriale ([`TRADUCTION-DATABOOKS.md`](../../guides/TRADUCTION-DATABOOKS.md)).
- Les révisions de scène, l'annulation et le stockage de projet appartiennent à
  Koharu ; ils ne remplacent pas `wiki_revisions`.

## Règles de travail sur les crates

- Garder les API sûres séparées du FFI, du chargement dynamique et de
  l'intégration de build. Quand un contrat change, migrer tous ses consommateurs
  du dépôt et retirer l'ancienne forme, sans alias de compatibilité.
- Portages de modèles : conserver la structure, les noms et l'ordre
  d'exécution amont, documenter toute divergence ; examiner un écart de poids
  avant de toucher au chargeur. Convertir le device une seule fois à la
  frontière du modèle, réutiliser les runtimes, désactiver les gradients en
  inférence.
- Mesures : entrées identiques et sorties structurées comparées ; chauffer les
  modèles hors des régions mesurées ; rapporter device, entrée, référence et
  écarts.
- Poids, jeux de données, identifiants et sorties locales restent hors de Git.
- Le travail de scène et d'export durable reste natif ; l'interaction
  transitoire du canvas reste dans le navigateur (WASM/WebGPU).
