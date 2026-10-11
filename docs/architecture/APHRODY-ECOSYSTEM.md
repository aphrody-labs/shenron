# Frontière Shenron ↔ Aphrody

Document de référence unique pour ce que Shenron garde, ce qu'il consomme
d'Aphrody et par quelles frontières passer. Le code fait foi. Les paquets et le
graphe de dépendances sont dans [`STACK.md`](STACK.md) ; les variables dans
[`ENV.md`](../operations/ENV.md) ; l'exploitation (hôtes, unités, releases)
relève d'`aphrody-infra`, voir [`INFRA-DELEGATION.md`](../operations/INFRA-DELEGATION.md).
Aucun hôte, aucune adresse ni aucun port n'est écrit ici.

## 1. Principe

### 1.1 Ce que Shenron garde

- Le métier éditorial : wiki, canon ([`canon.md`](../products/canon.md)),
  doctrine des databooks, lexique japonais, personas, prompts, commandes
  Discord, juges OCR et traduction, publication.
- Les données : PostgreSQL éditorial (suppression logique `visible = false`,
  révisions `wiki_revisions`), réplica SQLite du bot, VFS embarquée
  (`packages/db/src/vfs/`).
- Ses applications et crates : `apps/site`, `apps/bot`, `apps/server`,
  `crates/shenron-*` (RAG, traduction, manga, CLI, MCP, FFI, bureau, studio) et
  `crates/koharu-*` (moteur Koharu, voir [`koharu/README.md`](../products/koharu/README.md)).

### 1.2 Ce qu'Aphrody fournit

- Des crates Rust épinglées par révision Git dans `[workspace.dependencies]`
  (bloc généré par `bun scripts/build/rust/workspace-deps.ts`) : socle ML
  `koharu-{llama,torch,diffusion,runtime,config}`, `aphrody-rag(-core)`,
  `aphrody-ocr(-core)`, `aphrody-models`, `aphrody-translate`,
  `aphrody-llama-server`, `aphrody-agent-home`, `aphrody-config`, Tauri 3
  (`aphrody-tauri*`).
- Des paquets npm `@aphrody/*` épinglés exactement (§3).
- Des services de calcul déclarés au catalogue d'`aphrody-infra` :
  `aphrody-ai-http` (RAG, LLM, embeddings, OCR, vision), `aphrody-shenron-embed`
  (E5), `aphrody-web-api` (crawl, scrape, extraction).
- La CLI `aphrody` pour les lots hors requête (OCR `aphrody ocr shenron`,
  traduction `aphrody translate`).

On consomme ces capacités ; on ne les copie pas.

### 1.3 Frontières autorisées

| Frontière                               | Usage                                 | Entrée Shenron                                                                                                          |
| --------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| HTTP REST Bearer `/api/v1/shenron/*`    | RAG, LLM, embeddings, OCR, vision     | `@aphrody/shenron-pipeline/ai` (résolveur unique `@aphrody/shenron-pipeline/ai/config`)                                 |
| HTTP OpenAI-compatible `/v1/embeddings` | embeddings E5                         | `@aphrody/shenron-pipeline/ai/embeddings`                                                                               |
| HTTP `/api/v1/web/*`                    | crawl, scrape                         | `@aphrody/shenron-pipeline/aphrody/web`                                                                                 |
| CLI `aphrody … --json` par `Bun.spawn`  | lots OCR, traduction                  | `@aphrody/shenron-pipeline/aphrody/cli`, scripts                                                                        |
| Crates Rust liées à la compilation      | RAG local, OCR, traduction, Koharu    | `crates/shenron-*`, `crates/koharu-*` ; exposées à Bun par `crates/shenron-ffi` → `@aphrody/shenron-native` (`bun:ffi`) |
| MCP                                     | outils `dragonball.*` pour les agents | `shenron-mcp` (stdio pour le plugin ; HTTP public en lecture seule derrière `/mcp` du site)                             |

### 1.4 Interdits

- Copier du code Aphrody dans ce dépôt, ou tenir un second registre de
  services : le catalogue d'`aphrody-infra` fait foi.
- Écrire une URL, un hôte ou un port par défaut dans le code. Les seuls
  défauts autorisés vivent dans `@aphrody/shenron-config` (voir `ENV.md`). Une capacité
  Aphrody absente échoue explicitement ; aucun calcul local silencieux ne la
  remplace.
- Laisser un client Aphrody ouvrir PostgreSQL ou écrire une donnée éditoriale :
  il passe par l'API ou le MCP de Shenron. Une sortie de modèle (OCR,
  traduction, RAG, Koharu) est une proposition, jamais un verdict.
- Placer un secret dans le dépôt, le plugin ou une commande journalisée.

## 2. Discord

| Couche                                                 | Propriétaire                                           |
| ------------------------------------------------------ | ------------------------------------------------------ |
| Transport Discord (REST, Gateway, interactions, santé) | `aphrody-discord`, consommé par `@aphrody/discord-kit` |
| Commandes, événements, gardes, canon, données, API     | Shenron (`apps/bot`, discordx + tsyringe)              |
| Releases, unités, routes, secrets                      | `aphrody-infra`                                        |

Le bot a un seul client Gateway ; discordx et discord.js viennent du registre
par le catalogue. Une façade de compatibilité doit avoir un consommateur mesuré
et une échéance de retrait ; aucun second client Discord n'est admis.

## 3. Paquets `@aphrody/*` consommés

| Paquet                                                              | Consommateurs                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `@aphrody/api` (Tauri 3)                                            | `@aphrody/shenron-ui`, `@aphrody/shenron-koharu`                                                        |
| `@aphrody/plugin-opener`                                            | `@aphrody/shenron-ui`, `@aphrody/shenron-site`                                                          |
| `@aphrody/m3-primitives`, `@aphrody/m3-reader`, `@aphrody/m3-theme` | `@aphrody/shenron-ui`                                                                                   |
| `@aphrody/http`                                                     | `@aphrody/shenron-api`, `@aphrody/shenron-pipeline`, `@aphrody/shenron-media`                           |
| `@aphrody/inference`, `@aphrody/runtime-sdk`                        | `@aphrody/shenron-pipeline`                                                                             |
| `@aphrody/paths`                                                    | `@aphrody/shenron-config`, `@aphrody/shenron-pipeline`, `@aphrody/shenron-bot`, `@aphrody/shenron-site` |
| `@aphrody/sql`                                                      | `@aphrody/shenron-db`                                                                                   |
| `@aphrody/discord-kit`                                              | `@aphrody/shenron-bot`, `@aphrody/shenron-site`                                                         |
| `@aphrody/bun-test-dom`                                             | tests de `@aphrody/shenron-ui`                                                                          |

Les versions exactes sont dans les `package.json` ; `bunfig.toml` les exclut
du délai de publication (`minimumReleaseAgeExcludes`).

## 4. Opérations lourdes

| Opération             | Calcul                                                                                                                             | Entrée Shenron                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Chat LLM              | `aphrody-ai-http` `llm/chat`                                                                                                       | `@aphrody/shenron-pipeline/ai/chat` ; repli de persona si le LLM est indisponible                                             |
| Embeddings            | `aphrody-ai-http` `embed`, `aphrody-shenron-embed`                                                                                 | `@aphrody/shenron-pipeline/ai/embeddings`                                                                                     |
| Recherche RAG         | `aphrody-ai-http` `rag/*` avec `RAG_BACKEND=aphrody` ; sinon index local du bot (`apps/bot/src/lib/rag.ts`) et VFS (`shenron-rag`) | bot, site, `@aphrody/shenron-pipeline/ai`                                                                                     |
| Indexation RAG        | `rag/ingest`, `rag/sync/finish`                                                                                                    | `packages/pipeline/scripts/rag-sync-aphrody.ts`                                                                               |
| OCR, vision           | `aphrody-ai-http` `ocr`, `vision/structured` ; lots par `aphrody ocr shenron`                                                      | `@aphrody/shenron-pipeline/ai`, [`databooks-transcription.md`](../guides/databooks-transcription.md)                          |
| Traduction JA→FR      | `aphrody-translate`                                                                                                                | `@aphrody/shenron-pipeline` ; juges et dépôt restent Shenron ([`TRADUCTION-DATABOOKS.md`](../guides/TRADUCTION-DATABOOKS.md)) |
| Crawl, scrape         | `aphrody-web-api`                                                                                                                  | `@aphrody/shenron-pipeline/aphrody/web`                                                                                       |
| Pipeline manga Koharu | `crates/koharu-*` sur le socle ML Aphrody                                                                                          | `@aphrody/shenron-koharu`, candidats non arbitrés                                                                             |

Le détail par paquet est dans [`STACK.md`](STACK.md) §5.

## 5. Contrat d'environnement

Noms canoniques, alias historiques et absence de défaut d'adresse :
[`ENV.md`](../operations/ENV.md), section « IA Aphrody ». Le jeton
d'`aphrody-ai-http` est fourni par l'environnement de l'opérateur et n'est
jamais journalisé.

## 6. Manques et gates

### 6.1 Côté Aphrody et infra

L'état des releases et des services actifs s'établit par sonde, via
`aphrody-infra` ; un commit de ce dépôt ou d'Aphrody ne prouve pas un
déploiement.

### 6.2 Gate de réactivation de `RAG_BACKEND=aphrody`

Toutes les conditions sont requises, sinon la bascule reste `NON_FAIT` :

- la release active d'`aphrody-ai-http` répond à `rag/stats` ;
- `health` annonce `rag` et `llm` disponibles ;
- la recherche renvoie le mode `hybrid` ;
- sur le jeu d'or `apps/bot/tests/rag-gold.jsonl`, le Recall@5 atteint le seuil
  `RAG_CI_RECALL5_MIN` (0,8 par défaut) : `bun scripts/ops/eval-aphrody-rag.ts --ci` ;
- aucune erreur 503 sous la rafale d'évaluation du démarrage du bot.

Le corpus local se recopie vers Aphrody par `scripts/ops/offload-rag-to-aphrody.ts --db <copie>`
(prévisualisation par défaut, `--apply` explicite, sur une copie cohérente de la
base SQLite, jamais sur la base servie), puis se tient à jour par
`rag-sync-aphrody.ts`, qui masque logiquement les passages retirés.
