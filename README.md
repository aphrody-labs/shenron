# Shenron

Shenron est le produit de dragonballfr.com: site, bot Discord, API, chaîne éditoriale (OCR et traduction des databooks), Shenron Studio (éditeur de traduction manga) et serveur MCP. Le dépôt migre vers Rust et Bun seuls, selon les décisions de `docs/decisions/`.

## État

- Site en production: Next.js 16 (`apps/site`), Bun, PostgreSQL et Redis sur un hôte unique.
- Cible: Leptos 0.8 SSR avec îlots sur Axum pour le site, Dioxus pour Studio. Voir `docs/decisions/0001-pile-du-site.md`.

## Démarrer

```sh
just install
just check
just test
```

`just` sans argument liste toutes les recettes. Les builds lourds tournent sur vps ou bunos, pas sur un poste Windows.

## Carte

- `apps/`: site, bot, serveur, Activité Discord.
- `packages/`: paquets Bun `@aphrody/shenron-*`.
- `crates/`: workspace Rust (`shenron-*`, `koharu-*`, `dragon-pixel`).
- `deploy/`: Docker, compose, worker CDN, migrations SQL.
- `docs/`: index dans `docs/README.md`.

Règles de contribution et d'exploitation: `AGENTS.md`.

## Licence

Apache-2.0, voir `LICENSE`.
