# Documentation Shenron

Documentation officielle et guides d'architecture de Shenron, la plateforme souveraine pour [dragonballfr.com](https://dragonballfr.com).

## Structure des Dossiers

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
- [`reference/`](./reference/) : Doctrine éditoriale et spécifications de référence.

## Règles de Documentation

1. Strictement **aucun emoji** dans toute la documentation et les fichiers de code.
2. Tout fait daté ou chiffré dans ces pages provient directement du code source, de la configuration active ou d'un relevé d'infrastructure vérifié.
3. Les spécifications techniques respectent la doctrine No Human In The Loop (NHITL), Bun natif et Rust 2024.
