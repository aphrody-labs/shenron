# shenron-ffi

ABI C de Shenron (`shenron_*`): commande shenron, découpage et recherche RAG, persona, corpus local, jobs annulables.

## Commandes

Sur vps ou bunos, jamais sur le poste Windows.

```sh
cargo check -p shenron-ffi
cargo nextest run -p shenron-ffi
```

Lint du workspace: `cargo lint`. Règles générales: `AGENTS.md` à la racine.
