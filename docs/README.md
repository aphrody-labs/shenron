# Shenron documentation

One reference document per topic; other documents link to it. Code is authoritative, followed by
the root `AGENTS.md`.

| Topic                                                        | Reference                                                                                                                                           |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packages, dependency graph, and gates                        | [`architecture/STACK.md`](architecture/STACK.md)                                                                                                    |
| Processes and binaries (`shenron-server`, bot, MCP, desktop) | [`architecture/RUNTIME.md`](architecture/RUNTIME.md)                                                                                                |
| Aphrody boundary (compute, crates, packages, Discord)        | [`architecture/APHRODY-ECOSYSTEM.md`](architecture/APHRODY-ECOSYSTEM.md)                                                                            |
| Website languages                                            | [`architecture/i18n.md`](architecture/i18n.md)                                                                                                      |
| Bot RAG and reconstruction                                   | [`architecture/rag-enrichment.md`](architecture/rag-enrichment.md)                                                                                  |
| Wiki redesign (media, timelines, contributors)               | [`architecture/architecture-refonte-wiki-dragon-ball.md`](architecture/architecture-refonte-wiki-dragon-ball.md)                                    |
| SVG pipeline                                                 | [`architecture/pipeline-svg.md`](architecture/pipeline-svg.md)                                                                                      |
| Environment variables                                        | [`operations/ENV.md`](operations/ENV.md)                                                                                                            |
| RAG and LLM compute (compute host, databases, tunnels)       | [`operations/compute-rag.md`](operations/compute-rag.md)                                                                                            |
| Development workstation                                      | [`operations/DEV-LOCAL.md`](operations/DEV-LOCAL.md)                                                                                                |
| Rust development (crates, gates, CI)                         | [`development/rust.md`](development/rust.md)                                                                                                        |
| Développement distant (VPS, VS Code, WSL propre, sauvegarde) | [`development/remote-dev.md`](development/remote-dev.md) |
| Bun dependencies                                             | [`operations/BUN-PACKAGE-MANAGER.md`](operations/BUN-PACKAGE-MANAGER.md)                                                                            |
| Operations (delegated to `aphrody-infra`)                    | [`operations/INFRA-DELEGATION.md`](operations/INFRA-DELEGATION.md)                                                                                  |
| Content enrichment session                                   | [`operations/content-session-pipeline.md`](operations/content-session-pipeline.md)                                                                  |
| Bun agent persona                                            | [`operations/agent-home-bun.md`](operations/agent-home-bun.md)                                                                                      |
| Master plan                                                  | [`reference/root/PLAN.md`](reference/root/PLAN.md)                                                                                                  |
| Design system                                                | [`reference/DESIGN.md`](reference/DESIGN.md)                                                                                                        |
| Wiki editorial policy                                        | [`products/wiki-editorial.md`](products/wiki-editorial.md)                                                                                          |
| Canon adjudication                                           | [`products/canon.md`](products/canon.md)                                                                                                            |
| Powerscaling methodology (VSBW tools)                        | [powerscaling-vsbw.md](products/powerscaling-vsbw.md)                                                                                    |
| Recherche Dragon Radar partagée, filtres et reprise          | [`products/dragon-radar.md`](products/dragon-radar.md)                                                                                              |
| Shenron Chat (desktop, website, bot): models, memory, homes  | [`products/chat-shenron.md`](products/chat-shenron.md)                                                                                              |
| OpenAI compatibility, MCP, A2A, skills, and plugin           | [`architecture/openai-compatibility.md`](architecture/openai-compatibility.md)                                      |
| Website home and shell invariants                            | [`products/accueil-et-shell.md`](products/accueil-et-shell.md)                                                                                      |
| Participatory site and agent API                             | [`products/site-participatif.md`](products/site-participatif.md)                                                                                    |
| Shenron Studio                                               | [`products/koharu/README.md`](products/koharu/README.md), with archived upstream docs in [`reference/koharu/upstream/`](reference/koharu/upstream/) |
| Databooks: policy                                            | [`reference/databooks-doctrine.md`](reference/databooks-doctrine.md)                                                                                |
| Databooks: export, OCR, API                                  | [`guides/databooks-transcription.md`](guides/databooks-transcription.md)                                                                            |
| Databooks: translation                                       | [`guides/TRADUCTION-DATABOOKS.md`](guides/TRADUCTION-DATABOOKS.md)                                                                                  |
| Manga scans and OCR                                          | [`guides/manga-scans.md`](guides/manga-scans.md), [`guides/ocr-manga.md`](guides/ocr-manga.md)                                                      |
| Japanese                                                     | [`guides/japonais.md`](guides/japonais.md)                                                                                                          |
| Wiki data ingestion                                          | [`guides/wiki-data-ingestion.md`](guides/wiki-data-ingestion.md)                                                                                    |
| Measured pitfalls                                            | [`guides/pieges.md`](guides/pieges.md)                                                                                                              |
| Security                                                     | [Security policy](SECURITY.md)                                                                                                                      |
| Licenses of bundled components                               | [`licenses/`](licenses/)                                                                                                                            |

These documents contain no production addresses, hosts, ports, or secrets. Private data
(`data/home/`, databases, `.env`) remains outside Git.
