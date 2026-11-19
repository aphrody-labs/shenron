# shenron-mcp

Serveur MCP (stdio) qui expose les outils `dragonball.*` et `dbfr_*` de dragonballfr.com et le corpus local.

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check -p shenron-mcp
cargo nextest run -p shenron-mcp
```

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.

## Plan de données admin

Outils `db.*` (PostgreSQL), `redis.*`, `memory.*` et ressources temps réel `shenron://db/table/<nom>` et `shenron://events/<canal>`: réservés au niveau élevé (jeton ou IP autorisée), absents de `tools/list` pour un appelant anonyme. Variables, garde-fous, migrations et provisionnement du jeton: `docs/runbooks/shenron-mcp-admin.md`. Tests d'intégration (`tests/admin_integration.rs`) sur fr2 avec `SHENRON_MCP_TEST_DATABASE_URL` et `SHENRON_MCP_TEST_REDIS_URL`.
