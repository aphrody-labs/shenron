# ADR 0004 : Migration complète de TypeScript vers Rust

- **Statut** : Accepté
- **Date** : 2026-11-15
- **Décideurs** : aphrody-dev
- **Pilier(s) concerné(s)** : tout le dépôt (apps, packages, scripts, deploy)

## Contexte

Le propriétaire demande une migration complète de Shenron de TypeScript vers Rust, qui passe à l'échelle et se reproduise. Le 2026-11-15, le dépôt compte 660 745 lignes TypeScript (`apps/site` 276 321, `apps/bot` 107 538, `scripts` 75 702, `packages/ui` 48 056, `packages/pipeline` 44 885) pour 109 281 lignes de Rust. L'ADR 0001 laissait le bot et les scripts en TypeScript ; cette décision étend la cible à tout le dépôt. Un seul paquet avait déjà son double Rust vérifié : le lexique (`packages/lexicon` et `crates/shenron-lexicon`), dont les deux versions rejouent les mêmes fixtures (`data/lexicon/fixtures`).

## Décision

La migration avance unité par unité, selon le motif de l'étrangleur (strangler fig), avec trois verrous mécaniques : un registre, des cas de référence partagés et le contrat OpenAPI.

1. **Registre** `migration/rust.toml` : chaque fichier TypeScript appartient à une unité (le chemin le plus long l'emporte). Chaque unité a un crate cible et un état `ts`, `dual` ou `rust`. Son `ts_lines` joue le rôle de cliquet : le TypeScript d'une unité peut diminuer, jamais augmenter.
2. **Cas de référence** `data/<domaine>/fixtures` : une unité `dual` en a au moins un, et les deux implémentations le rejouent. Pour le contrat HTTP, `data/api/fixtures/*.json` est enregistré depuis l'hôte TypeScript (`bun packages/api/scripts/api-fixtures.ts`). Le routeur Axum (`crates/shenron-api`, `tests/parity.rs`) doit rendre le même statut, le même `cache-control` et le même JSON.
3. **Contrat** : `packages/api/openapi/public.json`, généré depuis le catalogue zod, reste la source. Chaque opération servie par Rust (`shenron_api::OPERATIONS`) doit y figurer et avoir au moins un cas de référence.

Ordre de bascule d'une unité :

1. Porter la logique, puis ajouter les cas de référence (`dual`).
2. Faire servir le chemin par Rust : le proxy frontal n'envoie au binaire `shenron-api` que les chemins de `OPERATIONS`.
3. Supprimer le TypeScript (`rust`, 0 ligne).
4. Abaisser le cliquet avec `just migrate-ratchet`.

## Options considérées

| Option                                          | Avantages                                                           | Inconvénients                                           |
| ----------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| Étrangleur par unité, cas de référence partagés | Production intacte à chaque étape, parité mesurée, reprise par lots | Deux implémentations le temps de la bascule             |
| Réécriture en bloc                              | Une seule pile plus tôt                                             | Aucune parité vérifiable, gel des fonctionnalités       |
| Transpilation automatique TS vers Rust          | Rapide sur la logique pure                                          | Code non idiomatique, inutilisable pour React et le DOM |

## Conséquences

- Positives :
  - Toute croissance du TypeScript échoue en CI (`.github/workflows/migrate.yml`, `just ci`).
  - La parité est prouvée cas par cas.
  - L'avancement se lit avec `cargo run -p shenron-migrate -- status`.
- Négatives : une unité `dual` doit être tenue des deux côtés ; un changement de l'hôte TypeScript impose de réenregistrer les cas.
- Travaux induits :
  - Couche HTTP commune d'abord, car chaque groupe en hérite. Elle comprend : `ApiError` (`IntoResponse`, `WithRejection`), CORS (`tower_http::cors`), CSRF (`tower_http::csrf`), limite de débit par IP, cache public avec ETag et 304, IP cliente (`ConnectInfo`) et traces (`MatchedPath`). Ses cas de référence enregistrent les en-têtes CORS et `ETag`. Correspondance détaillée entre l'hôte TypeScript et Axum : `C:\aphrody\docs\axum\FEATURES.md`. Règles : skill `axum`.
  - Groupes HTTP suivants par ordre de dépendance : wiki, VFS (`ServeDir`), compte (cookies), puis chat (SSE et WebSocket).
  - Proxy frontal vers `shenron-api` (Infra), puis `apps/server` en Axum, `apps/site` en Leptos (ADR 0001), le bot et les scripts en sous-commandes `shenron`.
- Premier constat : écrire les cas du lexique a révélé un défaut de l'hôte TypeScript. Le cache public d'une heure était indexé par l'URL seule, alors que la réponse suit `Accept-Language`. Correction : le cache est indexé par langue, et une réponse sans `lang` part en `private` avec `Vary: Accept-Language`.

## Vérification

```sh
bun packages/api/scripts/api-fixtures.ts --check     # cas = réponses de l'hôte TypeScript
cargo test -p shenron-api -p shenron-migrate          # Rust = cas, opérations dans le contrat
cargo run -p shenron-migrate -- check                 # registre, cliquet, chemins de parité
```

## Références

- `migration/rust.toml`, `crates/shenron-migrate`, `crates/shenron-api`, `data/api/fixtures`
- ADR 0001 (`0001-pile-du-site.md`) : cible Leptos et Axum du site
- `crates/shenron-lexicon/tests/fixtures.rs` : premier double vérifié
