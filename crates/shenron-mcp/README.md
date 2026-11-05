# shenron-mcp

Serveur MCP (stdio) qui expose les outils `dragonball.*` et `dbfr_*` de dragonballfr.com et le corpus local.

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check -p shenron-mcp
cargo nextest run -p shenron-mcp
```

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.
