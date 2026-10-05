# Documentation Shenron

Un document de référence par sujet ; les autres y renvoient. Le code fait foi,
puis `AGENTS.md` à la racine.

| Sujet | Référence |
| --- | --- |
| Paquets, graphe de dépendances, gates | [`architecture/STACK.md`](architecture/STACK.md) |
| Processus et binaires (`shenron-server`, bot, MCP, bureau) | [`architecture/RUNTIME.md`](architecture/RUNTIME.md) |
| Frontière avec Aphrody (calcul, crates, paquets, Discord) | [`architecture/APHRODY-ECOSYSTEM.md`](architecture/APHRODY-ECOSYSTEM.md) |
| Langues du site | [`architecture/i18n.md`](architecture/i18n.md) |
| RAG du bot et reconstruction | [`architecture/rag-enrichment.md`](architecture/rag-enrichment.md) |
| Refonte du wiki (média, chronologies, contributeurs) | [`architecture/architecture-refonte-wiki-dragon-ball.md`](architecture/architecture-refonte-wiki-dragon-ball.md) |
| Chaîne SVG | [`architecture/pipeline-svg.md`](architecture/pipeline-svg.md) |
| Variables d'environnement | [`operations/ENV.md`](operations/ENV.md) |
| Poste de développement | [`operations/DEV-LOCAL.md`](operations/DEV-LOCAL.md) |
| Développement Rust (crates, commandes, CI) | [`development/rust.md`](development/rust.md) |
| Dépendances Bun | [`operations/BUN-PACKAGE-MANAGER.md`](operations/BUN-PACKAGE-MANAGER.md) |
| Exploitation (déléguée à `aphrody-infra`) | [`operations/INFRA-DELEGATION.md`](operations/INFRA-DELEGATION.md) |
| Session d'enrichissement de contenu | [`operations/content-session-pipeline.md`](operations/content-session-pipeline.md) |
| Persona d'agent côté Bun | [`operations/agent-home-bun.md`](operations/agent-home-bun.md) |
| Plan directeur | [`reference/root/PLAN.md`](reference/root/PLAN.md) |
| Système graphique | [`reference/DESIGN.md`](reference/DESIGN.md) |
| Doctrine éditoriale du wiki | [`products/wiki-editorial.md`](products/wiki-editorial.md) |
| Arbitre de canonicité | [`products/canon.md`](products/canon.md) |
| Site participatif et API agents | [`products/site-participatif.md`](products/site-participatif.md) |
| Koharu | [`products/koharu/README.md`](products/koharu/README.md), doc amont archivée [`reference/koharu/upstream/`](reference/koharu/upstream/) |
| Databooks : doctrine | [`reference/databooks-doctrine.md`](reference/databooks-doctrine.md) |
| Databooks : export, OCR, API | [`guides/databooks-transcription.md`](guides/databooks-transcription.md) |
| Databooks : traduction | [`guides/TRADUCTION-DATABOOKS.md`](guides/TRADUCTION-DATABOOKS.md) |
| Manga : scans et OCR | [`guides/manga-scans.md`](guides/manga-scans.md), [`guides/ocr-manga.md`](guides/ocr-manga.md) |
| Japonais | [`guides/japonais.md`](guides/japonais.md) |
| Ingestion des données wiki | [`guides/wiki-data-ingestion.md`](guides/wiki-data-ingestion.md) |
| Pièges mesurés | [`guides/pieges.md`](guides/pieges.md) |
| Sécurité | [Politique de sécurité](SECURITY.md) |
| Licences des composants intégrés | [`licenses/`](licenses/) |

Aucune adresse, aucun hôte, port ni secret de production n'est écrit dans ces
documents ; les données privées (`data/home/`, bases, `.env`) restent hors de
Git.
