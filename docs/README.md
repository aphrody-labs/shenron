# Documentation Shenron

Documentation de Shenron, la plateforme de [dragonballfr.com](https://dragonballfr.com).

## Dossiers

- [`architecture/`](./architecture/README.md) : Modèle architectural, runtimes Bun et Rust 2024, topologie réseau WireGuard.
- [`decisions/`](./decisions/) : Architecture Decision Records (ADR) conformes au standard `yolo-stack`.
- [`operations/`](./operations/) : Runbooks de production, pipelines de déploiement zstd, sauvegardes PostgreSQL et reprises après incident.
- [`runbooks/`](./runbooks/) : Guides opérationnels reproductibles :
  - [`content.md`](./runbooks/content.md) : Chaînes de contenu (OCR, traduction Koharu, wiki, news, RAG, CDN).
  - [`video-r2-rclone-rsync-beerus.md`](./runbooks/video-r2-rclone-rsync-beerus.md) : Pipeline d'acquisition vidéo, stockage Cloudflare R2, synchronisation rclone/rsync et Open Graph / oEmbed.
  - [`deployd.md`](./runbooks/deployd.md) : `shenron-deployd`, déploiement par manifeste signé sans SSH (ADR 0009, étape 1).
  - [`cdn-garage-cutover.md`](./runbooks/cdn-garage-cutover.md) : cluster Garage, miroir R2, parité et bascule du CDN (étape 4).
  - [`shenron-mcp-admin.md`](./runbooks/shenron-mcp-admin.md) : niveau admin du serveur MCP (Postgres, Redis, ressources temps réel, mémoire auto-apprise).
- [`research/`](./research/) : relevés datés de versions et de sources, par sujet (pile Rust 2026 : [`rust-stack-2026-11-19.md`](./research/rust-stack-2026-11-19.md)).
- [`coordination/`](./coordination/) : notes entre produits et agents (Rose Griffon, Garage).
- [`plans/`](./plans/) : Feuilles de route d'ingénierie et plans de refonte.
- [`licenses/`](./licenses/) : Licences des dépendances embarquées (Koharu, etc.).
- [`reference/`](./reference/) : [`root/PLAN.md`](./reference/root/PLAN.md).

## Règles

- Pas d'emoji ni de mention d'IA (`AGENTS.md`, section Rules).
- Tout fait daté ou chiffré provient du code, de la configuration active ou d'un relevé d'infrastructure vérifié.
- Les chemins `crates/...` cités dans les ADR, plans et runbooks désignent `../wiki/crates` (`docs/development/rust.md`), pas ce dépôt.
