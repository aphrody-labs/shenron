# Documentation Shenron

Documentation officielle et guides d'architecture de Shenron, la plateforme souveraine pour [dragonballfr.com](https://dragonballfr.com).

## Structure des Dossiers

- [`architecture/`](./architecture/README.md) : Modèle architectural, runtimes Bun v1.4.4+ et Rust 2024, topologie réseau WireGuard.
- [`decisions/`](./decisions/) : Architecture Decision Records (ADR) conformes au standard `yolo-stack`.
- [`operations/`](./operations/) : Runbooks de production, pipelines de déploiement zstd, sauvegardes PostgreSQL et reprises après incident.
- [`runbooks/`](./runbooks/) : Guides opérationnels reproductibles :
  - [`content.md`](./runbooks/content.md) : Chaînes de contenu (OCR, traduction Koharu, wiki, news, RAG, CDN).
  - [`video-r2-rclone-rsync-beerus.md`](./runbooks/video-r2-rclone-rsync-beerus.md) : Pipeline d'acquisition vidéo, stockage Cloudflare R2, synchronisation rclone/rsync et Open Graph / oEmbed.
- [`plans/`](./plans/) : Feuilles de route d'ingénierie et plans de refonte.
- [`licenses/`](./licenses/) : Licences des dépendances embarquées (Koharu, etc.).
- [`reference/`](./reference/) : Doctrine éditoriale et spécifications de référence.

## Règles de Documentation

1. Strictement **aucun emoji** dans toute la documentation et les fichiers de code.
2. Tout fait daté ou chiffré dans ces pages provient directement du code source, de la configuration active ou d'un relevé d'infrastructure vérifié.
3. Les spécifications techniques respectent la doctrine No Human In The Loop (NHITL), Bun v1.4.4+ natif et Rust 2024.
