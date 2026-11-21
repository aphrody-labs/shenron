# Pile Rust de bout en bout : versions relevées le 2026-11-19

Relevé fait le 2026-11-19 pour l'ADR 0009. Source des crates : `https://crates.io/api/v1/crates/<nom>` (champ `max_stable_version`, date `updated_at`). Source des projets hors crates : `releases/latest` de l'API GitHub. Les colonnes « Rôle » viennent de l'ADR, pas du relevé. Une version pré-publication est signalée comme telle. Relancer le relevé avant de fixer une dépendance : ces numéros datent du jour indiqué.

## Compilateur et runtime

| Élément | Version | Date | Note |
| --- | --- | --- | --- |
| Rust | 1.100.0 | 2026-11-12 | égal à `rust-toolchain.toml` de `../wiki` |
| Bun | 1.4.5 | 2026-11-19 | correctif de sécurité, aucun changement d'API ; épinglé par `package.json#packageManager` |
| Valkey | 9.2.0 | 2026-11-19 | seulement pour comparer pendant l'étape 5 ; la cible est de retirer Redis |

## Bord, TLS, DNS (étapes 3 et 8)

| Crate | Version | Date | Rôle |
| --- | --- | --- | --- |
| pingora | 0.9.1 | 2026-11-03 | proxy, cache disque, répartition (`shenron-edge`) |
| rustls | 0.23.46 | 2026-11-12 | TLS |
| instant-acme | 0.8.5 | 2026-02-24 | ACME ; dernier ajout il y a neuf mois, à surveiller |
| hickory-server | 0.26.3 | 2026-09-10 | DNS autoritaire |
| hyper | 1.12.0 | 2026-10-06 | HTTP |

## Services (étapes 1, 6 et 7)

| Crate | Version | Date | Rôle |
| --- | --- | --- | --- |
| tokio | 1.54.1 | 2026-10-21 | runtime asynchrone |
| axum | 0.8.9 | 2026-04-14 | HTTP des services |
| leptos / leptos_axum | 0.8.23 / 0.8.10 | 2026-10-31 | site en SSR |
| twilight-gateway / twilight-http | 0.18.0 / 0.18.0 | 2026-11-01 | bot Discord |
| rmcp | 3.11.0 | 2026-11-17 | MCP en Rust |
| reqwest | 0.13.5 | 2026-09-08 | client HTTP |
| dioxus | 0.7.10 | 2026-10-16 | UI native (Studio) |
| image / ravif | 0.25.10 / 0.13.0 | 2026-03-10 / 2026-01-19 | variantes AVIF et WebP à la publication |

## Données, cache, secrets (étapes 2 et 5)

| Crate | Version | Date | Rôle |
| --- | --- | --- | --- |
| sqlx | 0.9.1 | 2026-11-18 | accès Postgres, files `SKIP LOCKED` |
| tokio-postgres | 0.7.18 | 2026-06-12 | alternative bas niveau |
| moka | 0.12.16 | 2026-08-09 | cache en mémoire (remplace Redis) |
| ed25519-dalek | 3.0.0 | 2026-07-06 | signature des manifestes de `shenron-deployd` |
| age | 0.12.1 | 2026-07-14 | secrets chiffrés |
| object_store | 0.14.2 | 2026-09-15 | accès S3 vers Garage |

## Observabilité

| Élément | Version | Date | Note |
| --- | --- | --- | --- |
| tracing | 0.1.44 | 2025-12-18 | stable depuis près d'un an |
| opentelemetry | 0.33.1 | 2026-10-09 | export OTLP |
| OpenObserve | v1.2.0-rc2 | 2026-11-12 | **pré-publication** : ne pas l'installer en production avant une version stable |

## Observé sur la flotte

- Garage 2.5.0 tourne sur `fr1` et `fr2` (facteur de réplication 2), `prd` rejoint comme troisième zone. Ce numéro vient du cluster, pas de l'API GitHub : le dépôt amont est hébergé hors GitHub et l'appel `releases/latest` n'a renvoyé aucune version.
- PostgreSQL 18 et Redis 8 ont servi à la preuve de l'étape 1b sur `fr2`. La version de PostgreSQL sur `prd` n'a pas été relevée ici.

## Écarts avec l'ADR 0009

- L'ADR écrit « Garage répliqué sur trois nœuds ». Le cluster en compte deux aujourd'hui et `fr2` est à 95 % de disque, donc l'ajout de `prd` n'est pas facultatif.
- OpenObserve n'a qu'une version candidate ; l'ADR ne prévoit pas de plan de repli. Garder `tracing` vers des fichiers JSON sur `fr2` tant qu'aucune version stable n'existe.
- Déjà alignés sur le relevé : `shenron-deployd` (`ed25519-dalek` 3.0.0, `rustls` 0.23.46) et `shenron-edge` (`pingora` 0.9.1, `instant-acme` 0.8.5, `rustls` 0.23.46). Restent à fixer quand leur étape démarre : `leptos`, `twilight`, `sqlx`, `moka`, `hickory-server`.
