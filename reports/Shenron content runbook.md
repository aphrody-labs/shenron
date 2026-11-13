# Shenron : runbook d'exécution des chaînes de contenu

Audit en lecture seule réalisé le 2026-11-05 (environ 06:00–07:30 UTC). Dépôt `C:\src\apps\shenron` à HEAD `2e465772`. La production sert l'image `f04de517` (`/srv/shenron/current` → `releases/docker-f04de517…`).

Aucune écriture n'a eu lieu :

- aucun pipeline lancé en mode écriture ;
- aucune API ni aucun outil MCP d'écriture appelé ;
- aucune modification sur un hôte.

Les mesures viennent de quatre sources :

- **PostgreSQL de production**, `shenron-postgres`, base `shenron_site`, rôle `postgres` sur socket, chaque requête dans `BEGIN READ ONLY … ROLLBACK`.
- **Outils MCP publics** `dragonball_data_coverage`, `dragonball_sources` et `dragonball_a2a_agent_card`.
- **Requêtes HEAD publiques** sur `cdn.dragonballfr.com`.
- **L'inventaire CDN de prod** `/srv/shenron/data/cdn/inventory-9a8ecae6371f.json` (246 420 chemins), lu sans écriture et comparé aux références en base.

Les chemins de dépôt sont relatifs à `C:\src\apps\shenron`.

## 0. Constats transverses (à lire avant tout lot massif)

- **Le gel databooks est levé.** `/srv/shenron/data/server/config/databooks-freeze.json` contient `{"frozen":false}` : décision du propriétaire du 2026-10-11, restaurée le 2026-10-20. Le site le lit par `DATABOOKS_FREEZE_FILE`.
  - Le chemin documenté dans `docs/reference/root/PLAN.md:343` (`/srv/shenron/shared/server/config/…`) est périmé.
  - En production, un fichier absent signifie « gelé » (fail-closed).
- **Les « 59 995 chunks » ne sont pas un retard d'indexation.** Ce sont exactement les documents `shenron_compute.aphrody_rag_documents` sans vecteur. Tous sont `visible=false` et n'ont pas de `syncGeneration` : ce sont des générations retirées (tombstones).
  - Index réellement servi : 257 436 documents visibles, tous vectorisés avec `Xenova/multilingual-e5-small`.
  - Le vrai écart est la **fraîcheur**. Dernière synchronisation le 2026-10-20 ; depuis, on compte 12 900 révisions wiki environ (dont 937 épisodes, 899 techniques, 426 databooks et 187 personnages).
- **Prod est le seul hôte Shenron.**
  - Matériel : 8 vCPU, 31 Gio de RAM, aucun GPU, 293 Go libres.
  - Aucune session tmux active. Seuls timers : sauvegardes, audit Cloudflare et renouvellement S3.
  - **Aucun cron de contenu** (news, RAG, OCR, crawl) ne tourne sur un hôte. Les jobs périodiques du bot passent par `apps/bot/src/api/cron-registry.ts`, en processus.
  - Note : `orchestre-donnees.ts` est documenté « chaque nuit », mais aucun timer ne le lance.
- **Autres hôtes joignables**
  - `vps` : 12 cœurs, 45 Gio, 55 Go libres (disque à 82 %). Shenron en a été retiré le 2026-11-02.
  - `bunos` : 6 cœurs, 11 Gio, 25 Go libres.
  - Poste local Windows : RTX 4070. C'est le seul GPU disponible, et c'est l'« hôte GPU Windows » des scripts OCR.
  - `dbfr` n'est pas résolu depuis ce poste.
- **Ambiguïté de gouvernance à trancher.** `AGENTS.md` impose « mutations de production via API autorisées et Aphrody Infra ». Or `docs/operations/PROD-HOSTING.md` (2026-11-02) dit « opérations via SSH prod + tmux, sans Aphrody Infra ». Par ailleurs, la consigne de purge du 2026-11-04 (« réduire prod à nginx + docker + db + cdn ») n'est pas tranchée. Lancer des pipelines lourds sur prod va contre cette consigne tant que le propriétaire ne décide pas.
- **Aucun identifiant fournisseur externe dans les conteneurs prod.** `shenron-site` et `shenron-bot` n'exposent aucune variable Gemini, Anthropic, OpenAI, Jimaku, Crunchyroll ni R2.
  - Le chat prod est local : `shenron-chat-v2` sur llama-server, `127.0.0.1:8799/health` → 200.
  - L'embedding est local : e5-small dans `shenron-embed`.
  - Le service de relecture OCR (`127.0.0.1:8791`, `shenron-relecture-ocr.service`) ne répond pas.
- **Pièges de dry-run**
  - `pipeline ocr databooks` **sans** `--dry-run` lance `scripts/ops/gpu-continuous-ocr.ts` : une boucle infinie qui pousse en prod (`aphrody ocr dbfr push … --apply`).
  - Le `--dry-run` de `pipeline <ocr|translation>` (`packages/pipeline/src/cli.ts:797`) ne renvoie qu'un plan. Il ne valide rien.
  - `traduction-boucle.ts`, même en simulation, appelle les moteurs de traduction (coût et quota) et se connecte à la base.
  - `translate-databooks-session.ts` et `depose-transcriptions.ts` **écrivent par défaut**.

## 1. Tableau de synthèse

| #   | Chaîne                        | Couverture mesurée                                                                                                                                                                                                                                             | Commande principale                                                                                                                                    | Dry-run                                                                                                 | Hôte                                                | Prochaine étape                                                                                                       |
| --- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | OCR databooks + manga         | Databooks : 16 409 / 17 093 pages scannées ont un texte JA (96 %), 683 pages de livres visibles sans OCR. Manga : 12 593 / 53 304 planches transcrites (23,6 %)                                                                                                | `bun packages/pipeline/scripts/run-manga-ocr.ts` ; `bun scripts/ops/gpu-continuous-ocr.ts` (databooks)                                                 | Manga : `--dry-run` réel (manifestes + SHA). Databooks : aucun ; sonde `aphrody ocr dbfr survey --json` | Local RTX 4070 (inférence) → API prod               | Exporter les 683 pages databook restantes avec `export-databooks-ocr.ts --plan`, puis lot GPU borné `--limite-lots 1` |
| 2   | Traduction ja→fr/en + lexique | FR : 11 351 / 16 409 pages OCR (69 %), 4 779 pages visibles OCR sans FR. EN : 0. Lexique : 772 termes, 47 avec EN (6 %), 32 techniques seulement                                                                                                               | `bun apps/site/scripts/traduction-boucle.ts [--appliquer]` ; `bun scripts/data/lexicon.ts coverage --json`                                             | Simulation par défaut, mais elle appelle les moteurs                                                    | Prod tmux ou vps (CPU NLLB) ; Gemini web en local   | Enrichir le lexique (techniques, EN), puis lots FR sur les 4 779 pages                                                |
| 3   | Wiki                          | Visibles : 683 personnages (666 sourcés), 597 techniques (62 `name_ja`, 554 sourcées), 28 transformations (0 description), 20 lieux, 61 planètes, 103/468 variantes (365 masquées à relire, 21 images)                                                         | `bun scripts/ops/wiki-fill-agents.ts inventory                                                                                                         | run                                                                                                     | status`→`publish-wiki-proposals.ts plan             | apply`                                                                                                                | `status` et `plan` sont en lecture seule | Local ou vps (codex) → API wiki-admin                             | `wiki-fill-agents.ts status` puis inventaire ciblé techniques `name_ja` et variantes |
| 4   | News                          | `bot.db_news` 2 013 lignes (le chiffre « 2 064 » ne se retrouve pas en PG). Dernier fetch le **2026-09-19**. 99 % viennent de salons Discord                                                                                                                   | `apps/bot/src/events/NewsScan.ts` (temps réel) ; `bun apps/bot/scripts/ingest/bxc-ingest.ts [--dry-run]` ; `db:sync-news`                              | `bxc-ingest` : `--dry-run` ; `sync-news` : aucun                                                        | Bot prod (évènement) ; ingest sur vps               | Diagnostiquer pourquoi NewsScan n'écrit plus depuis le 19/09, puis `bxc-ingest --dry-run`                             |
| 5   | Crawl sources externes        | 59 248 `external_source_records` (dernier fetch 2026-10-15), 0 `canonical_eligible`. Ingest canon : dernier run 2026-09-20                                                                                                                                     | `pipeline crawl <cible> --dry-run` ; `bun scripts/ops/publish-source.ts … [--apply]`                                                                   | Oui (`--dry-run`, `plan.json` sans `--apply`)                                                           | vps (Aphrody Web)                                   | `pipeline crawl kanzenshuu --dry-run` avec `config/soshuhen-reference-crawl.json`                                     |
| 6   | Databooks                     | 482 notices, 428 visibles (407 databooks au sens strict). 17 378 pages, dont 17 093 avec scan. OCR 16 409 ; relues (`verifiee`) **1 082 (6,6 %)** ; FR 11 351. 11 notices visibles sans aucune page                                                            | `bun apps/site/scripts/databooks.ts etat                                                                                                               | sante                                                                                                   | verifie --json`; API`/api/admin/databooks/campaign` | `etat`, `sante` et `verifie` sont en lecture seule                                                                    | Prod tmux (DB)                           | Masquer ou compléter les 11 notices vides ; campagne de relecture |
| 7   | Manga                         | 53 304 planches déclarées, **toutes présentes sur R2**. 12 593 transcrites (DB 8 238, DBS 4 355). 0 transcrite pour DBJP, DBKZ, anime comics, films, ARALE, SOSH                                                                                               | `export-manga-ocr.ts --plan` → `run-manga-ocr.ts --dry-run` → `deposit-manga-transcriptions.ts [--appliquer]`                                          | Oui sur les trois                                                                                       | Local GPU → prod                                    | Ce qui bloque : l'OCR et la politique d'édition, plus les scans. Décider des séries prioritaires                      |
| 8   | SVG Toriyama                  | Pas de métrique de couverture : la vectorisation automatique est interdite. 51 SVG de techniques référencés en base sont **absents de R2** (servis par le site seulement)                                                                                      | `plugin/skills/toriyama-svg/scripts/*.ts` ; `bun scripts/design/build-toriyama-catalog.ts --check`                                                     | `--check`                                                                                               | Local                                               | Publier les 51 SVG sur R2 (ligne 13)                                                                                  |
| 9   | Épisodes                      | 878 fiches visibles : 878 avec synopsis FR, 830 avec image, 52 avec lecteurs, 878 avec `availability`, 684 avec `official_source_url`. Sous-titres : JA seulement, 816 épisodes (814 Jimaku), **0 FR/EN**                                                      | `bun apps/bot/scripts/ingest/jimaku-subtitles.ts [--appliquer]` ; `scripts/ops/crunchyroll-sync.ts [--apply]` ; `complete-episode.ts --id N [--apply]` | Oui (simulation par défaut)                                                                             | vps ou prod tmux                                    | Combler les 48 SDBH et les 2 Beerus en métadonnées et sous-titres JA                                                  |
| 10  | Chronologie                   | 32 `db_timeline_events` (0 article), 92 `narrative_events`, 4 frises. RAG : 708 `timeline_episode`                                                                                                                                                             | Curation `/admin/chronologie` ; API `/api/timeline`                                                                                                    | Aucun builder                                                                                           | —                                                   | Rédiger les 32 articles d'évènements avec sources                                                                     |
| 11  | Index RAG                     | 257 436 docs visibles vectorisés e5-small (384 dimensions), plus 59 995 tombstones. Dernière synchronisation le 2026-10-20. News et frames ne sont pas indexées                                                                                                | `bun packages/pipeline/scripts/rag-sync-aphrody.ts --toutes [--appliquer]`                                                                             | Oui (sans `--appliquer`)                                                                                | Prod tmux, hors conteneur bot                       | Lancer le dry-run `--toutes` avec rapport, puis `--appliquer` en tmux                                                 |
| 12  | Frames                        | 830 / 878 épisodes avec frames (6 736 frames ; moyenne 8, entre 7 et 41). 41 PNG de l'épisode 876 absents de R2. 0 frame pour les 48 SDBH                                                                                                                      | `bun apps/bot/scripts/build-frame-catalog.ts [--check]` ; `scripts/ops/index-frames.ts --dry-run`                                                      | Oui (`--check`, `--dry-run`)                                                                            | vps (téléchargement + ffmpeg)                       | Recaler le catalogue (826 épisodes contre 830 en base) avec `--check`                                                 |
| 13  | CDN R2                        | Inventaire de 246 420 chemins. Références en base : databooks 17 084/17 084, manga 53 304/53 304, sous-titres 2 738/2 738, personnages 683/683. **Manquants** : 51 SVG de techniques, 41 frames de l'ép. 876, couverture 486 (introuvable partout)             | `deploy/cloudflare/cli/transfer.ts status` ; `publish-catalog.ts --options F` ; `scripts/ops/audit-cdn-gaps.ts`                                        | Oui (sans `--apply`)                                                                                    | Prod (origine 9077, `shenron-cdn-origin` actif)     | Plan `publish-catalog.ts` pour les 92 objets manquants                                                                |
| 14  | Outils média                  | Bun Video épinglé `1.4.4-video.1`. FilmCraft **toujours en sous-module** (`crates/filmcraft`, exclu du workspace). Remotion : libellés seulement. PhotoCraft : absent. **Hermes : inexistant**. Pas de service d'images autonome (`/_next/image`)              | `scripts/video/render.ts` ; `packages/images` (bibliothèque)                                                                                           | —                                                                                                       | Local ou vps                                        | Retirer le sous-module FilmCraft ou acter sa conservation                                                             |
| 15  | Fournisseurs IA               | Prod : `shenron-chat-v2` local, puis gemma4-e2b, puis gemini-web (repli désactivé en prod), e5 local. Pas de clé Gemini API (mode web par cookies). Anthropic par HTTP direct (`ANTHROPIC_API_KEY`), pas de SDK Agent. `locally-uncensored` absent de `C:\src` | `packages/config/src/chat-model.ts` ; `packages/pipeline/src/ai/config.ts`                                                                             | —                                                                                                       | —                                                   | Décider quels fournisseurs payants utiliser pour 1, 2 et 3                                                            |

## 2. Détail par chaîne

### 1. OCR (databooks et planches manga)

**Couverture.** Voir aussi les lignes 6 et 7.

- **Databooks.**
  - 17 378 pages déclarées, dont 17 093 avec image.
  - 16 409 pages ont un texte OCR, dont 11 425 de plus de 200 caractères.
  - Livres visibles : 683 pages avec scan mais sans OCR, et 14 424 pages OCR non relues.
- **Manga.** 12 593 planches dans `bot.db_manga_pages`. 5 544 ont du japonais (`has_ja=1`) ; la langue principale est `fr` sur 12 528. `bot.media_chapters.ocr_status` vaut `unprocessed` sur les 561 chapitres : aucun code n'écrit ce champ.

**Commandes.**

- Sonde en lecture seule : `aphrody ocr dbfr survey --json --top 50`, ou le CLI natif `shenron dbfr survey --include-hidden --top 20` (`crates/shenron-cli/src/ocr_dbfr.rs:59`).
- Export des lots databooks : `bun apps/site/scripts/export-databooks-ocr.ts --sortie <dir> --plan`. Avec `--plan`, rien n'est écrit.
- Boucle OCR databooks : `bun scripts/ops/gpu-continuous-ocr.ts --limite-lots N`.
  - Moteur PP-OCR `ppocr-v5-mobile` sur le serveur Aphrody AI, puis `aphrody ocr audit`, puis `aphrody ocr db ingest`, puis `aphrody ocr dbfr push --apply`.
  - Variables : `SHENRON_ADMIN_TOKEN`, `APHRODY_AI_HTTP_URL`, `APHRODY_AI_HTTP_TOKEN`, `APHRODY_BIN`.
  - **Aucun dry-run.**
- Manga :
  1. `bun packages/pipeline/scripts/export-manga-ocr.ts --sortie data/manga-ocr --plan`
  2. `bun packages/pipeline/scripts/run-manga-ocr.ts --root data/manga-ocr --dry-run [--lot X --limit N]`
  3. `bun packages/pipeline/scripts/deposit-manga-transcriptions.ts` (simulation ; `--appliquer` écrit `db_manga_pages` et `wiki_revisions`)
- Moteur Koharu (Studio) : OCR `paddleocr-vl-1.6`, détection `koharu-layout-rfdetr-seg-2xl` (`crates/koharu-pipeline/src/config.rs:33-34`). Les candidats vont en fichier local par `pipeline koharu-*-candidate`. `pipeline koharu-submit` POSTe vers `/api/manga/candidates`.
- Second avis : `GET /api/databooks/:id/ocr-review?page=N` vers `shenron-relecture-ocr.service` (127.0.0.1:8791). **Ce service est hors ligne en prod.**

**Hôte et ressources.**

- Inférence : poste Windows local (RTX 4070), avec `aphrody` compilé avec la feature `ocr`.
- Dépôt : par l'API prod.
- Prod n'a pas de GPU.
- Relecture : `gemini-web/flash` (`APHRODY_AI_VISION_MODEL`), qui demande des cookies Google.

**Coûts.** PP-OCR est local et gratuit. La relecture Gemini web reste dans le quota du compte Google. Les arbitres `gpt-5.6-luna` et `claude-sonnet-5` sont payants.

**Dépendances.** L'OCR alimente 2, puis 6, puis 11.

**Risques.**

- Provenance : `run-manga-ocr.ts` estampille toujours `engine:"hybrid-luna-ppocr"`, `model:"gpt-5.6-luna"`, quel que soit le modèle réel (`packages/pipeline/src/manga-ocr.ts:321,376`). C'est à corriger avant tout lot massif.
- Contrainte éditoriale : les scans, le manga et Toriyama priment ; Fandom est interdit.

**Prochaine étape.**

1. `export-databooks-ocr.ts --plan` sur les livres visibles, pour cibler les 683 pages restantes.
2. Corriger l'estampille de provenance manga.
3. Lancer un lot GPU unique `gpu-continuous-ocr.ts --limite-lots 1` dans une session surveillée.

### 2. Traduction ja→fr/en et lexique partagé

**Couverture.**

- 11 351 pages databook ont `text_fr`. Attribution (`text_fr_by`) :
  - `shenron-massive-vps` : 8 559
  - `machine:sonnet` : 1 110
  - sans auteur : 398
  - `machine:fable-5.1` : 319
  - `machine:google` : 312
  - `machine:agy` : 238
  - `machine:aphrody-translate` : 126
  - `tesseract-5-fra` : 120
  - `shenron-vps-agent` : 86
  - `traducteur-officiel-shenron` : 23
- 4 779 pages visibles ont un OCR sans FR.
- Aucune sortie EN n'existe : seuls `text_fr`, `text_fr_by` et `text_fr_at` sont stockés.
- Lexique `data/lexicon/terms.json` : 772 termes, tous en `ja` et `fr`, 47 en `en`, 11 en `romaji`. Répartition : 645 personnages, 32 techniques (le wiki en compte 597), 35 lieux.

**Commandes.**

- `bun apps/site/scripts/traduction-boucle.ts [--lots N --taille N --databook ID --moteur auto|aphrody|aphrody-translate|agy|google|nllb --modele Xenova/nllb-200-distilled-600M --shards K --shard-index i] [--appliquer]`
- Ou la même chose via `bun run --filter @aphrody/shenron-pipeline pipeline translation …`
- Statut : `bun scripts/ops/translate-databooks-corpus.ts --statut`
- Lexique : `bun scripts/data/lexicon.ts coverage --json` (en lecture seule, exécuté pour cet audit), `--check`, `build`

**Dry-run.** La simulation est le défaut de `traduction-boucle.ts`, mais elle appelle les moteurs et se connecte à la base. `translate-databooks-session.ts` **écrit par défaut**.

**Lexique réellement consommé.** Le lexique par lot est lu en direct depuis `bot.db_characters`, `db_planets`, `db_races`, `db_sagas` et `db_techniques` (`name_ja`/`name`, voir `apps/site/scripts/planches-a-traduire.ts:185-191`). Le masquage des termes vient de `@aphrody/shenron-lexicon`. Koharu lit `KOHARU_GLOSSARY` ; son modèle local est `gemma4-12b-it`.

**Hôte.** NLLB tourne sur CPU : prod en tmux (31 Gio) ou vps. Gemini web et `agy` tournent en local, là où sont les cookies.

**Coûts.** `google`, `agy`/Gemini et sonnet ont des quotas ou sont payants. NLLB et aphrody-translate sont locaux.

**Dépendances.** Il faut l'OCR (1). Le lexique dépend du wiki (3) : seules 62 techniques visibles ont un `name_ja`.

**Risques.** Les traductions machine doivent rester signées `machine:<moteur>`. Il n'y a pas de gel actif.

**Prochaine étape.**

1. Compléter `name_ja` des techniques (ligne 3) et le lexique EN.
2. Lancer `traduction-boucle.ts --lots 1 --taille 20 --moteur nllb` en simulation pour mesurer.
3. Puis `--appliquer` en tmux, avec des shards.

### 3. Wiki (personnages, techniques, transformations, lieux, variantes)

**Couverture** (lignes visibles) :

| Catégorie       | Visibles / total | Image  | `name_ja` | Article | Sources       | Description             |
| --------------- | ---------------- | ------ | --------- | ------- | ------------- | ----------------------- |
| Personnages     | 683 / 1 324      | 683    | 679       | 683     | 666           | 683                     |
| Techniques      | 597 / 828        | 596    | **62**    | 569     | 554           | 562                     |
| Transformations | 28 / 33          | 28     | —         | 26      | 27            | **0** (colonne absente) |
| Lieux           | 20 / 35          | 17     | 20        | 20      | 20            | 20                      |
| Planètes        | 61 / 62          | 61     | 61        | 61      | 61            | 61                      |
| Variantes       | 103 / 468        | **21** | 14        | 40      | 86 (evidence) | 103                     |

Notes sur la couverture :

- Les 365 variantes masquées sont générées (`origin` vaut `ocr-manga` et/ou `synopsis-episodes`) et attendent une relecture.
- `wiki_contributions` : 85 acceptées, 30 remplacées, aucune en attente.
- Images réellement absentes du CDN : 51 SVG de techniques. Un personnage a un chemin sans extension (`assets/dbz/characters/Kaio-shin`), qui renvoie 404.

**Commandes.**

- `bun scripts/ops/wiki-fill-agents.ts status|inventory|run|export --db <var/reports/…/queue.sqlite> [--evidence] [--smoke | --campaign --limit N] [--concurrency 4]`
  - `status` est en lecture seule.
  - `inventory` exige `SHENRON_API_ADMIN_TOKEN`.
  - `run` pilote `codex exec --sandbox read-only` avec `gpt-5.6-luna`.
  - `--campaign` refuse de partir sans smoke qualifié.
  - Fandom est rejeté, et les sources doivent figurer dans `OFFICIAL_HOSTS`.
- `bun scripts/ops/wiki-fill-supervisor.ts once|smoke --job <abs>` : intervalle de 6 h, mais **non planifié**.
- `bun scripts/ops/publish-wiki-proposals.ts plan|apply MANIFEST SHA256 PLAN [BACKUP_RECEIPT]` : `plan` est le dry-run. `apply` exige un plan de moins d'une heure, un reçu de sauvegarde et une approbation indépendante.
- MCP agent : `dragonball.agent_wiki_schema`, `agent_wiki_entities` et `agent_wiki_contribute`, avec `SHENRON_AGENT_API_KEY`. Les contributions vont dans une file de modération humaine.

**Hôte.** Local ou vps (codex CLI), puis l'API `wiki-admin`.

**Coûts.** Abonnement codex (`gpt-5.6-luna`). En option : `ANTHROPIC_API_KEY` (`claude-haiku-5-5`, via `packages/pipeline/src/auto/workers.ts:104`).

**Dépendances.** Le wiki alimente 2 (lexique), 10 et 11.

**Risques.**

- Provenance : uniquement des sources officielles, le manga et les databooks.
- Suppression : toujours logique (`visible=false`), avec `wiki_revisions`.
- Publication : aucune page publique vide.

**Prochaine étape.**

1. `wiki-fill-agents.ts status`.
2. Inventaire ciblé de `name_ja` pour les techniques (535 manquants), avec preuves tirées des databooks par `scripts/ops/wiki-corpus-enricher.ts`.
3. File de relecture des 365 variantes masquées.

### 4. Suivi des news

**Couverture.**

- `bot.db_news` compte 2 013 lignes. Les sources sont 21 salons Discord, plus `dbo-fr` (5), `dragon-ball-official-(fr)` (1) et `bandai-namco-news` (1).
- Dernier `published_at` et dernier `fetched_at` : **2026-09-19**, soit environ 47 jours sans nouvelle entrée.
- Le chiffre de 2 064 n'apparaît pas en PostgreSQL ; il vient peut-être du SQLite du bot.
- Les news ne sont pas dans l'index RAG.

**Commandes.**

- Temps réel : `apps/bot/src/events/NewsScan.ts`, qui capture les salons d'annonce Discord (persona `grandPretre`) dans le bot prod.
- `bun apps/bot/scripts/ingest/bxc-ingest.ts [--dry-run]` : scrape `dragonball.news/fr` et `en.bandainamcoent.eu/news` par Aphrody Web (`APHRODY_BIN`, `APHRODY_WEB_PROFILE`).
- `bun --filter @aphrody/shenron-bot db:sync-news` → `scripts/sync-news.ts` : prend les 5 dernières URL du sitemap officiel FR. **Pas de dry-run.**
- `NewsService.syncFromSitemap` n'est qu'un stub (`apps/bot/src/services/NewsService.ts:146`).

**Cadence.** Aucune hors des évènements Discord : pas de cron ni de timer.

**Hôte.** Le bot prod pour NewsScan. `bxc-ingest` sur vps.

**Coûts.** Aucun.

**Risques.** Les excerpts reproduisent des annonces tierces : garder la citation courte et la source.

**Prochaine étape.**

1. Vérifier en lecture les journaux du bot (`docker logs shenron-bot`, événements NewsScan) et le réglage `channel.announce`.
2. `bxc-ingest.ts --dry-run`.
3. Ajouter une cadence au `cron-registry` (développement, hors audit).

### 5. Crawl de sources externes (Soshuhen, publish-source)

**Couverture.**

- `public.external_source_records` compte 59 248 lignes : media 31 592, reference 18 420, archive 8 692, statistics 207, community 199, official 104, publisher 34.
- Dernier fetch le 2026-10-15. **0 ligne `canonical_eligible`.**
- `canon_ingest_runs` : derniers runs le 2026-09-20 (manga 523 runs, databooks 853, aphrody 853), sans erreur.
- `bot.db_sources` compte 18 sources sous licence.

**Configuration.**

- `config/soshuhen-crawl.json` : pages éditeur Shueisha pour les ISBN 978-4-08-111165… à 111182. Limites : robots respectés, 2 s par hôte, concurrence 1, profondeur 2, 64 pages.
- `config/soshuhen-reference-crawl.json` : articles Kanzenshuu. Limites : 3 s, concurrence 1, profondeur 1, 96 pages.

**Commandes.**

- `bun run --filter @aphrody/shenron-pipeline pipeline crawl <dragonballcn|kanzenshuu|official|databooks|guides|custom|universal> [URL] --dry-run [--max-depth --max-requests --out]`. Cela délègue à `aphrody web dragon-ball crawl --profile shenron --json --index`. La cible `custom` refuse Fandom.
- `pipeline unify --dry-run` : réindexe les exports existants sans recrawler.
- Skill publish-source : `bun scripts/ops/publish-source.ts --source URL --target https://dragonballfr.com/publications/<slug> --job /abs/private [--apply]`.
  - Sans `--apply`, il ne produit que `plan.json`.
  - Limites : `--max-requests` ≤ 256, profondeur ≤ 10.
  - Variables : `DATABASE_URL`, `SHENRON_SOURCE_CDN_MODULE`, `SHENRON_SOURCE_CDN_CONFIG`.
  - Il n'alimente pas le RAG.

**Hôte.** vps (Aphrody Web, profils navigateur). Publication par la configuration CDN de prod (`/srv/shenron/config/cloudflare/source-publication.json`).

**Coûts.** Aucun, au-delà de la politesse envers les sites (robots, délais).

**Dépendances.** Les crawls alimentent 3, 10 et 11 (`--corpus-crawl` de `rag-sync-aphrody.ts`).

**Risques.** Droit d'auteur : extraits seulement, citation documentaire. Fandom interdit.

**Prochaine étape.** `pipeline crawl kanzenshuu --dry-run` avec la config de référence Soshuhen, puis `publish-source.ts` en mode plan pour une source.

### 6. Databooks

**Couverture.**

- 482 notices, 428 visibles. Par type :
  - databook : 407 (355 visibles)
  - guidebook : 52
  - artbook : 16
  - interview : 7
- Pages et avancement par type :

| Type      | Livres avec pages | Pages  | OCR    | FR    | Relues |
| --------- | ----------------- | ------ | ------ | ----- | ------ |
| databook  | 405               | 14 432 | 13 976 | 9 850 | 1 050  |
| guidebook | 52                | 1 866  | 1 863  | 1 115 | 0      |
| artbook   | 11                | 1 061  | 557    | 382   | 23     |
| interview | 3                 | 19     | 13     | 4     | 9      |

- Entonnoir global : 17 378 pages déclarées → 17 093 scannées → 16 409 OCR → **1 082 relues** → publiées (visibles) 16 055.
- Images : 17 084 locales (`./assets/wiki/databooks/…`), toutes présentes sur R2 ; 9 externes.
- **11 notices visibles sans aucune page**, contraire à la directive « aucune page publique vide » : IDs 8, 14, 39, 40, 41, 42, 43, 55, 56, 57 et 486. La couverture de la 486 (`/assets/databooks/covers/486.webp`) renvoie 404 partout.

**Vue admin (Chrome, session du propriétaire, lecture seule)** : `https://dragonballfr.com/api/admin/databooks/campaign`, consultée le 2026-11-05.

- Chiffres concordants avec PostgreSQL : 482 ouvrages, 17 378 planches, 16 409 transcrites, 11 351 traduites.
- 414 ouvrages restent en attente, 5 058 planches restent à traduire et 3 424 982 signes JA restent à traiter.
- Plusieurs ouvrages sont marqués `sourceQuality: "to-retranscribe"`, avec une majorité de planches fautives :
  - 438 « CD Consoles HS n°2 » : 80/84 fautives
  - 442 « Top Consoles HS n°1 » : 73/84
  - 440 « Jam n°1 » : 75/84
  - 441 « Joypad n°31 » : 30/32
  - 439 « Catalogue Manga Distribution » : 31/32
  - 409 « Manga de Légende fasc. 24 » : 20/20
- Ces ouvrages sont à ré-OCR avant toute traduction.
- `https://dragonballfr.com/admin/dashboard` n'affiche, en texte, que l'état de l'API du bot.

**Commandes.**

- `bun apps/site/scripts/databooks.ts etat|sante|verifie --json` : lecture seule.
- `scripts/ops/batch-databooks-ocr.ts --statut` : lecture seule.
- API admin `GET /api/admin/databooks/status|campaign`.
- Écritures : `POST /api/databooks/:id/transcription`, `PATCH /api/databooks/:id/pages` (`verified`), ou MCP `dbfr_deposit` (dry-run sauf `apply:true`).
- Anomalies : MCP `dragonball_databook_anomalies` (accès élevé, non disponible ici).

**Hôte.** Prod en tmux pour les scripts qui lisent `DATABASE_URL` ; sinon l'API publique authentifiée.

**Dépendances.** Les databooks consomment 1 et 2, et alimentent 11.

**Risques.** Fichier de gel (aujourd'hui `false`). Relecture humaine (`verifiee`), qu'on ne peut pas automatiser sans décision du propriétaire.

**Prochaine étape.**

1. Décider, pour les 11 notices vides : masquer (`visible=false` par API, avec révision) ou déposer les scans.
2. Lancer une campagne de relecture sur les databooks les plus consultés.

### 7. Manga (tomes, chapitres, planches)

**Couverture.**

- 329 volumes catalogués et 942 chapitres en base.
- `GET /api/manga` déclare 53 304 planches (somme de `db_manga_chapters.pages` sur les volumes et chapitres visibles).
- **Les 53 304 sont toutes dans l'inventaire R2** : contrôle exhaustif sur l'inventaire, plus 300 HEAD → 200.
- Planches et transcription par série :

| Série                      | Planches | Transcrites |
| -------------------------- | -------- | ----------- |
| DB (régulier + Full Color) | 15 919   | 8 238       |
| DBS                        | 8 703    | 4 355       |
| DBJP                       | 8 031    | 0           |
| DBKZ                       | 8 202    | 0           |
| DBZ_ANIME_COMICS           | 5 604    | 0           |
| ARALE                      | 3 342    | 0           |
| DB_MOVIES                  | 3 070    | 0           |
| SOSH                       | 381      | 0           |
| DB_GAIDEN_YAMCHA           | 32       | 0           |
| DB_SD                      | 20       | 0           |

- `media_editions` : seules les éditions FR tankobon (42 volumes, 7 965 pages) et FR Full Color (42 volumes, 7 935 pages) sont `self_hosted`. Les éditions JA sont `metadata_only`.
- Le RAG contient 10 030 documents `manga_page`, contre 12 593 planches transcrites.

**Ce qui bloque le reste.**

1. L'OCR n'a jamais été lancé sur les séries JA ou dérivées.
2. La politique d'édition : DBKZ et DBJP reprennent le récit de DB ; leur transcription est redondante en texte, et leur `scan_policy` est `metadata_only` pour JA.
3. Le dépôt passe par `deposit-manga-transcriptions.ts`, dont la provenance est mal estampillée (voir ligne 1).
4. Le pool de sources (`manga-source-pool.ts`) : 0 worker actif et 51 544 tâches en attente, selon REPRISE.

**Commandes.** Voir ligne 1, plus `scripts/ops/manga-publication-worker.ts` et `docs/operations/manga-publication-worker.md`.

**Hôte.** Local GPU pour l'OCR, prod pour le dépôt.

**Coûts.** OCR local. Relecture Gemini web ou arbitres payants.

**Risques.** Droit d'auteur : les planches sont publiées sous la directive propriétaire du 2026-10-18, mais la reproduction intégrale de texte est à confirmer par série.

**Prochaine étape.** Le propriétaire choisit l'ordre des séries. Proposition : DBS restants, puis DB_MOVIES et anime comics (texte distinct), puis ARALE. On ne fait pas DBKZ ni DBJP. Ensuite : `run-manga-ocr.ts --dry-run` sur un lot.

### 8. Extraction SVG (Toriyama)

**État.**

- Le dépôt interdit la vectorisation automatique de planches (« c'est du décalque », `docs/architecture/pipeline-svg.md:28-37`, `plugin/skills/toriyama-svg/SKILL.md:31-33`). Les SVG sont construits à la main à partir de mesures.
- Un seul vrai traceur existe, limité au logo du site : `scripts/design/trace-dragonballfr-logo.ts`.
- Constat CDN : 51 fichiers `/assets/techniques/*.svg` référencés par `bot.db_techniques.image` renvoient 200 depuis le site et **404 depuis `cdn.dragonballfr.com`**. Ils sont absents de l'inventaire R2.

**Commandes.**

- `bun plugin/skills/toriyama-svg/scripts/mesurer.ts img`
- `rendu.ts x.svg --compare ref.png`
- `icones.ts`
- `bun scripts/design/build-toriyama-catalog.ts --check`
- `bun scripts/design/wiki-mascots/index.ts --check`

**Hôte.** Local (Bun.WebView ou resvg).

**Risques.** Droit d'auteur (pas de décalque) et charte visuelle (`docs/products/wiki-art-direction.md`).

**Prochaine étape.** Publier les 51 SVG sur R2 avec la ligne 13. Les nouveaux SVG ne se font qu'à la demande, par le skill.

### 9. Épisodes animés

**Couverture.** 878 fiches visibles :

| Série         | Fiches |
| ------------- | ------ |
| DB            | 153    |
| DBZ           | 291    |
| DBGT          | 64     |
| DBZ_KAI       | 97     |
| DBZ_KAI_FINAL | 70     |
| DBS           | 131    |
| DB_DAIMA      | 20     |
| SDBH          | 48     |
| DBS_BEERUS    | 4      |

- 878 avec synopsis FR, 823 avec synopsis original, 830 avec image (les 48 SDBH n'en ont pas en local).
- Lecteurs : 52 fiches seulement (SDBH et Beerus) ; les autres passent par `video_url` et `streams`.
- 878 avec `availability`, 684 avec `official_source_url`.
- Sous-titres : **JA uniquement**, 816 épisodes et 2 738 pistes, dont 814 Jimaku et 1 924 sur le CDN. Il manque les SDBH (48), 6 KAI_FINAL, 2 Beerus et quelques autres.
- La plage « 826 à 876 » correspond à l'ancienne réplique SQLite (max id 826) et aux épisodes ajoutés après en PG (875–877 Beerus).

**Commandes.**

- `bun apps/bot/scripts/ingest/jimaku-subtitles.ts --series S [--entry N] [--limite N] [--appliquer]` : simulation par défaut. `JIMAKU_API_KEY` est optionnelle.
- `bun scripts/ops/crunchyroll-sync.ts --series DBS_BEERUS --locale fr-FR [--apply]` : métadonnées seulement. Identifiants : `BUN_VIDEO_CRUNCHYROLL_ACCESS_TOKEN`, ou `CRUNCHYROLL_EMAIL`, `CRUNCHYROLL_PASSWORD` et `BUN_VIDEO_CRUNCHYROLL_BASIC_AUTHORIZATION`. Sans identifiants, il sort en code 0.
- `bun scripts/ops/complete-episode.ts --id N --dir <stage> [--frames 36] [--subtitle-vtt …] [--synopsis-fr …] [--apply]` : sans `--apply`, il produit `plan.json`.
- `scripts/ops/beerus-episode-monitor.ts --once --out <dir>` : sondage en lecture seule.

**Hôte.** vps ou prod en tmux.

**Coûts.** Compte Crunchyroll (abonnement). Clé Jimaku (gratuite, optionnelle).

**Risques.** Pas d'extraction de flux protégé ni de contournement DRM (`AGENTS.md:121`). Aucun lecteur recopié d'un épisode sur un autre.

**Dépendances.** Les épisodes alimentent 12 et 11.

**Prochaine étape.** `jimaku-subtitles.ts --series SDBH` en simulation, puis la même chose pour KAI_FINAL. Décider s'il faut des sous-titres FR (aucune source autorisée identifiée).

### 10. Chronologie

**Couverture.**

- `bot.db_timeline_events` : 32 évènements, tous visibles, canon et sourcés (`source_ref`), mais **aucun article**.
- `narrative_timelines` : 4 frises (manga, anime, film, xenoverse). `narrative_events` : 92.
- RAG : 708 `timeline_episode`, 16 `timeline_manga`, 9 `timeline_movie`, 32 `timeline_event`.

**Commandes.**

- Aucun builder. Le graphe vient de la migration `0019_narrative_graph_and_contributors.sql`, puis de la curation dans `/admin/chronologie`.
- API : `/api/timeline`, `/api/wiki/timelines`, et MCP `dragonball.timeline`.

**Dépendances.** La chronologie dépend de 3 (sagas, arcs) et de 9.

**Prochaine étape.** Rédiger les articles des 32 évènements via l'agent wiki, en modération. Ne jamais reconstruire l'ordre à partir des dates de diffusion.

### 11. Index RAG

**Couverture.**

- Index servi : `shenron_compute.aphrody_rag_documents` (317 431 lignes) et `aphrody_shenron_vectors` (257 436 vecteurs `Xenova/multilingual-e5-small`, créés entre le 2026-10-07 et le 2026-10-20).
- Les 59 995 documents sans vecteur sont tous `visible=false` et sans génération ; ce sont des résidus. Leur répartition : databook 33 738, manga_page 10 030, canon 7 512, character_section 1 819, etc.
- Corpus visibles :

| Corpus        | Documents |
| ------------- | --------- |
| wiki_pages    | 181 636   |
| databooks     | 46 270    |
| manga         | 10 030    |
| canon         | 6 905     |
| kz            | 1 925     |
| db_episodes   | 1 666     |
| db_characters | 1 311     |

- Le MCP `data_coverage` rapporte `model:"aphrody"`, `dim:null`, `builtAt:null` : les métadonnées d'index sont mal renseignées.
- Absents de l'index : news, frames, planches 10 031 à 12 593, et toutes les révisions postérieures au 2026-10-20.

**Commandes.**

- Dry-run, sans `--appliquer` : `bun packages/pipeline/scripts/rag-sync-aphrody.ts --toutes --report=<abs>/rag-dry.json`
- Écriture : `… --toutes --appliquer`
- Incrémental : `rag-resync-entites.ts <source> --appliquer`
- Chaîne complète : `apps/bot/scripts/orchestre-donnees.ts` (dry-run par défaut ; `--appliquer`, `--sans-canon|--sans-rag|--sans-corpus`)
- Évaluation : `scripts/ops/eval-aphrody-rag.ts --ci`
- Variables : `APHRODY_MCP_DATABASE_URL` (présente dans `shenron-compute`), `APHRODY_AI_EMBED_BASE_URL`, `APHRODY_AI_HTTP_URL` et `APHRODY_AI_HTTP_TOKEN`. Le bot et le site ont `RAG_BACKEND=aphrody`.

**Hôte.** Prod en tmux, **jamais au premier plan ni dans le conteneur bot** (`AGENTS.md`). L'embedding passe par `shenron-embed` sur CPU.

**Coûts.** Aucun (local). Temps CPU : par lots de 16, pour environ 13 000 documents modifiés.

**Dépendances.** L'index dépend de tout le reste ; il passe en dernier dans chaque vague.

**Risques.**

- Ne pas mélanger les espaces d'embedding (le script refuse).
- La documentation cite le schéma `aphrody_ai`, alors que la prod utilise `shenron_compute` : vérifier le DSN avant `--appliquer`.

**Prochaine étape.** Dry-run `--toutes` avec rapport, puis `--appliquer` en tmux, puis `eval-aphrody-rag.ts --ci`. En option : purger les 59 995 tombstones, ce qui demande une décision.

### 12. Frames par épisode

**Couverture.**

- 830 / 878 épisodes ont des frames : 6 736 au total, de 7 à 41 par épisode, dont 6 600 en `./assets/ext/db_episodes_frames/<SERIE>/epNNN/frame-NNNNN.webp` (source ffmpeg).
- 788 aperçus de scène.
- Le catalogue `apps/bot/assets/render/frame-catalog.json` couvre 826 épisodes et 6 600 frames.
- Les 48 SDBH n'ont aucune frame.
- 41 PNG de l'épisode 876 (`/assets/wiki/episode-876/*.png`) sont servis par le site mais **absents de R2**.

**Commandes.**

- `cd apps/bot && bun scripts/build-frame-catalog.ts --check` (déterminisme). Options : `--source db|api`, `--nice`, `--offline`.
- `bun scripts/ops/index-frames.ts --dry-run [--series S --limit 10 --fps 1]` : index ColorLayout bxc. Il dépend de `/api/hls/<id>/download`, qui renvoie 502 ou 404 sur les flux expirés. Garde-fou : 4 Gio libres.
- Recherche : `POST /api/frames/search` (bxc, `APHRODY_FFI_LIB`).
- Nouveaux épisodes : `complete-episode.ts --frames 36`.

**Hôte.** vps, qui télécharge puis supprime : 55 Go libres, donc un épisode à la fois.

**Risques.** La source vidéo doit être autorisée (pas de DRM). Les frames sont des captures, à usage éditorial.

**Prochaine étape.** Lancer `build-frame-catalog.ts --check` pour recaler 826 → 830. Les SDBH (vidéos promotionnelles YouTube) demandent de décider d'une source.

### 13. CDN (R2 `shenron-cdn`, Worker, origine)

**État.**

- `shenron-cdn-origin.service` est actif sur prod (127.0.0.1:9077). Il exécute `bun /srv/shenron/config/cloudflare/cli/cdn-origin.mjs origin-cdn.json`.
- Inventaire : `/srv/shenron/data/cdn/inventory-9a8ecae6371f.json`, daté du 2026-11-01, 246 420 entrées et 154 344 objets uniques.
- Le catalogue public `https://cdn.dragonballfr.com/catalog/assets/index.json` est plus ancien : 2026-10-15, 112 718 fichiers, 54 Go.
- Le Worker est `deploy/cloudflare/cdn-worker.ts`. Il ne sert que les chemins des manifestes `_migration/manifests/`, et les objets sous `_objects/<sha256>`.

**Couverture R2** (comparaison exhaustive références en base / inventaire) :

| Référence                                   | Présentes       | Manquantes                |
| ------------------------------------------- | --------------- | ------------------------- |
| Pages databook                              | 17 084 / 17 084 | 0                         |
| Planches manga                              | 53 304 / 53 304 | 0                         |
| Assets de pages manga                       | 15 900 / 15 900 | 0                         |
| Sous-titres                                 | 2 738 / 2 738   | 0                         |
| Aperçus épisode                             | 788 / 788       | 0                         |
| Images épisode                              | 830 / 830       | 0                         |
| Personnages                                 | 683 / 683       | 0                         |
| Planètes, lieux, transformations, variantes | toutes          | 0                         |
| Images de techniques                        | 545 / 596       | **51 SVG**                |
| Frames                                      | 6 695 / 6 736   | **41 (ép. 876)**          |
| Couvertures databook                        | 480 / 481       | **486** (absente partout) |

- Échantillon HEAD de 1 300 URL : 1 291 en 200, 9 en 404 (8 SVG de techniques et `Kaio-shin` sans extension).
- `bot.db_assets` (1 018 lignes) est un registre de provenance aux chemins relatifs non alignés sur les chemins publics ; il n'est pas comparable directement.

**Commandes.**

- `bun deploy/cloudflare/cli/transfer.ts status --manifest … --objects … --state …` : hors ligne, en lecture seule.
- `bun deploy/cloudflare/cli/publish-catalog.ts --options F` : plan. `--apply --plan-sha256 H` écrit.
- `cloudflare-ops.ts status|r2|worker` : lecture seule sans `--apply`.
- `scripts/ops/audit-cdn-gaps.ts` : HEAD publics.
- `scripts/ops/cdn-origin-add.ts` : ajout à l'inventaire de l'origine.
- Variables : `CLOUDFLARE_API_TOKEN(_FILE)`, `CLOUDFLARE_ACCOUNT_ID` ; profil S3 dans `/srv/shenron/config/cloudflare/shenron-s3.json`, renouvelé par timer.

**Hôte.** Prod.

**Coûts.** R2 : stockage d'environ 54 Go et plus, et opérations de classe A. Le quota du Worker a déjà été atteint une fois (« repli quota Worker 1027 », MEMORY).

**Risques.**

- Ne jamais modifier une release scellée.
- Il y a 60 sauvegardes `origin-cdn.json.*.bak` dans `/srv/shenron/config/cloudflare` : à nettoyer par Infra, pas par nous.

**Prochaine étape.**

1. Plan `publish-catalog.ts` pour les 92 objets manquants (51 SVG, 41 PNG), sources prises dans la release active.
2. Corriger l'image `Kaio-shin`.
3. Couverture 486 : la déposer ou la retirer.

### 14. Outils média

- **Bun Video.** `@aphrody/bun-video` est épinglé en `1.4.4-video.1` (`package.json:223-231`), avec les exports `/hls`, `/playback` et `/crunchyroll`. Il dispose d'une exception `minimumReleaseAge` accordée par le propriétaire. La version `.6` n'était pas publiée au 25/10, faute de 32 Gio de disque.
- **FilmCraft.** Contrairement à l'énoncé, le crate est **toujours présent** : sous-module `crates/filmcraft` → `github.com/aphrody-labs/filmcraft` (v0.7.2-187-g87b84513), exclu du workspace Cargo (`Cargo.toml:10`). Il pèse 400 700 lignes de Rust.
- **Remotion.** Seulement des libellés dans `apps/site/src/app/studio/video/*`. Le vrai rendu est `scripts/video/render.ts` (Bun.WebView vers l'encodeur, `SHENRON_VIDEO_*`).
- **PhotoCraft.** Absent de `C:\src`. Il n'est cité que dans le README FilmCraft (`github.com/storytold/photocraft`).
- **Hermes.** **N'existe pas** : aucun dépôt, paquet ou service ; les seules occurrences de grep sont des faux positifs.
- **Archives.** Scripts `scripts/ops/apply-archive-catalog.ts`, `enrich-internet-archive.ts`, `archive-bot-sqlite-variants.ts [--apply]` et `shenron-offsite-backup.ts`. En base, `bot.archive_catalog_files` compte 62 lignes.
- **Images.** `packages/images` est une bibliothèque sharp (hash, variantes, WebP), pas un service. Le redimensionnement passe par `/_next/image` derrière `origin-cdn.dragonballfr.com`. **Il n'existe pas de service d'images Bun auto-hébergé.**
- **Prochaine étape.** Retirer le sous-module FilmCraft ou acter sa conservation. Si on veut un service d'images Bun, c'est un développement à spécifier.

### 15. Fournisseurs IA et replis

- **Chat.** `packages/config/src/chat-model.ts:39-45` définit l'ordre : `shenron-chat-v2` (Qwen3-4B Q4_K_M + LoRA), puis `gemma4-e2b`, puis `gemini-web/flash`.
  - En prod, `SHENRON_CHAT_BACKENDS` vaut `local` uniquement (`apps/server/src/chat-model.ts:102`).
  - Sur prod : `/srv/shenron/models/{qwen3/base.gguf, adapter/shenron-chat-v2.gguf, e5, llama}`, restaurés le 2026-11-05 après la purge du 2026-11-04.
- **Embedding.** e5-small local (`shenron-embed`, `APHRODY_AI_EMBED_MODEL=Xenova/multilingual-e5-small`).
- **Gemini.** Aucune `GEMINI_API_KEY` dans le dépôt. Le mode est web (`aphrody-gemini-web`, cookies `APHRODY_GOOGLE_COOKIES_JSON` ou `~/.aphrody/cookies/gemini-web.json`). Il sert à la relecture OCR (`APHRODY_AI_VISION_MODEL`) et au repli du chat hors prod. Le pair A2A `agycli` (Gemini 3.8 Flash) est décrit dans `config/ai.json`.
- **Anthropic.** Pas de Claude Agent SDK ni de `@anthropic-ai`. Le runner HTTP direct est dans `packages/pipeline/src/auto/workers.ts:104` (`ANTHROPIC_API_KEY`, `claude-haiku-5-5`). Les traductions `machine:sonnet` (1 110 pages) prouvent un usage passé.
- **OpenAI/codex.** `gpt-5.6-luna` via `codex exec` (wiki-fill, arbitre OCR). `SHENRON_OPENAI_API_KEY` en option.
- **locally-uncensored.** Absent de `C:\src`. Le dépôt GitHub `aphrody-dev/locally-uncensored` n'a pas été consulté (pas d'appel réseau authentifié). Mémoire projet : ne pas utiliser le GGUF Qwen3 « Uncensored » HauhauCS comme base du chat.
- **yolo-ai** (`C:\src\yolo-ai`). Crates Rust neutres vis-à-vis des fournisseurs (`yolo-model-client` : Anthropic, Ollama, OpenAI-compatible, vLLM ; `yolo-rag-core`, `yolo-agent-engine`). Aucun pipeline Shenron ne les consomme encore, et ce n'est pas un checkout Git.
- **A2A.** `apps/site/src/app/api/a2a/route.ts`. Carte publique v1.4.5 (`dragonballfr.com/api/a2a`), skills `rag_query`, `ocr_dispatch`, `subagent_task`, `model_infer` et `task_update`. Écriture avec `SHENRON_A2A_TOKEN`. Une tâche reste `submitted` tant qu'un pair ne rend pas de résultat.
- **Agent wiki.** Les outils `dragonball.agent_*` demandent `SHENRON_AGENT_API_KEY` ; les contributions passent en modération.
- **Commandes admin du bot.** `dragonball.admin_bot_commands` et `…_execute` (`/api/bot/commands/catalog|exec`) demandent `SHENRON_API_ADMIN_TOKEN`. Non appelés, car l'accès élevé est indisponible.

## 3. Ordre d'exécution proposé (vagues)

Règles générales :

- Un seul écrivain par chemin ou table.
- Chaque lot commence par son dry-run et produit un rapport sous `var/reports/<date>/` (local) ou `~/reports/shenron/` (hôte).
- Pas de build concurrent à une release en cours.
- Les jobs longs tournent dans tmux avec un journal durable.

### Vague 0 : décisions et lectures (aucune écriture, en parallèle, environ 1 h)

- **Local**
  - Faire trancher les décisions de la section 4.
  - Corriger l'estampille de provenance dans `packages/pipeline/src/manga-ocr.ts` (code, commit, puis release normale).
  - Corriger les métadonnées `data_coverage` (`model`, `dim`, `builtAt`).
- **Prod, lecture seule**
  - `databooks.ts etat --json`
  - `translate-databooks-corpus.ts --statut`
  - `rag-sync-aphrody.ts --toutes --report=…` (dry-run)
  - `build-frame-catalog.ts --check`
  - `transfer.ts status`
  - Journaux NewsScan du bot
- **vps** : `pipeline crawl kanzenshuu --dry-run`, `bxc-ingest.ts --dry-run`, `jimaku-subtitles.ts --series SDBH` (simulation).

### Vague 1 : réparations sans dépendance (en parallèle, sur des tables disjointes)

| Hôte      | Ligne | Action                                                                                        |
| --------- | ----- | --------------------------------------------------------------------------------------------- |
| Prod      | 13    | Publier les 92 objets manquants sur R2 (`publish-catalog.ts` plan puis `--apply`)             |
| API admin | 6     | Masquer ou compléter les 11 databooks vides, corriger `Kaio-shin`                             |
| Bot       | 4     | Relancer la capture des news (réglage `channel.announce` ou correctif) ; `bxc-ingest` sur vps |
| vps       | 9     | Sous-titres JA manquants (Jimaku `--appliquer`, SDBH et KAI_FINAL)                            |

Ces quatre actions touchent R2, `db_databooks.visible`, `db_news` et `db_episodes.subtitles` : on peut les lancer en même temps.

### Vague 2 : production de texte (GPU local et CPU, en parallèle)

| Hôte                          | Ligne | Action                                                                                                                                                   |
| ----------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local RTX 4070                | 1     | OCR databooks : 683 pages restantes, lots bornés `--limite-lots`, dépôt par l'API                                                                        |
| Local RTX 4070, en alternance | 7     | OCR manga des séries décidées : lots `run-manga-ocr.ts`, puis dépôt `--appliquer`. Partage le GPU avec la ligne 1 : alterner, ne pas lancer en parallèle |
| Local ou vps (codex)          | 3     | `wiki-fill-agents` sur `name_ja` des techniques, puis relecture des variantes ; publication par `publish-wiki-proposals.ts`                              |
| Local                         | 2     | Enrichir le lexique (`data/lexicon/terms.json`, `lexicon.ts --check`) à partir des `name_ja` validés                                                     |

Les lignes 1 et 3 peuvent tourner en même temps (`db_databooks` contre les tables wiki).

### Vague 3 : traduction et dérivés (dépendent de la vague 2)

| Hôte                   | Ligne | Action                                                                                                                         |
| ---------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------ |
| Prod tmux ou vps (CPU) | 2     | `traduction-boucle.ts --appliquer` en shards (NLLB) sur les 4 779 pages, avec Gemini web en local pour la relecture si accordé |
| vps                    | 12    | Frames manquantes (`index-frames`, `complete-episode`) pour les épisodes à source autorisée                                    |
| Local ou vps           | 10    | Articles des 32 évènements de chronologie (agent wiki, modération)                                                             |
| Prod                   | 5     | `publish-source.ts --apply` des sources validées en vague 0                                                                    |

Les lignes 2 et 6 ne doivent jamais écrire en même temps sur le même livre : partager par `--databook`, ou sérialiser.

### Vague 4 : indexation et contrôle (en dernier, sur prod)

| Hôte      | Ligne | Action                                                                                                  |
| --------- | ----- | ------------------------------------------------------------------------------------------------------- |
| Prod tmux | 11    | `rag-sync-aphrody.ts --toutes --appliquer`, puis `eval-aphrody-rag.ts --ci`                             |
| Prod      | 13    | Régénérer le catalogue public CDN (`public-cdn-catalog.ts`)                                             |
| Local     | —     | `audit-readers.ts --origin https://dragonballfr.com --embeds`, plus un contrôle Chrome à 1280 et 390 px |

### Chaînes hors vagues

- **Ligne 8 (SVG)** : à la demande seulement.
- **Ligne 14 (outils média)** : décisions de dépôt, pas de contenu.
- **Ligne 15** : configuration.

## 4. Décisions et identifiants que seul le propriétaire peut fournir

1. **Hébergement des pipelines.** Faut-il autoriser des jobs longs (traduction NLLB, RAG, tmux) sur prod, malgré la consigne de purge du 2026-11-04 ? Sinon, quel hôte : vps à 82 % de disque, ou bunos à 11 Gio ?
2. **Gouvernance.** Les mutations de prod passent-elles par SSH + tmux (`PROD-HOSTING.md`) ou par Aphrody Infra (`AGENTS.md`) ? Les deux textes se contredisent.
3. **Séries manga à transcrire,** et confirmation du droit de publier le texte intégral par série. Faut-il transcrire DBKZ et DBJP, ou les exclure comme doublons ?
4. **Relecture humaine des databooks.** Seulement 1 082 pages sont relues sur 16 409. Une relecture par IA (Gemini web, sonnet) peut-elle poser `verifiee=true`, ou ce champ reste-t-il réservé aux humains ?
5. **Traduction EN.** Faut-il produire `text_en` (aucun champ de stockage n'existe ; développement de schéma) ?
6. **Sous-titres FR des épisodes.** Existe-t-il une source autorisée ? Sinon, on n'en publie pas.
7. **Les 11 databooks visibles sans pages :** masquer, ou fournir les scans (artbooks Toriyama The World, Dragon Quest 486 et sa couverture) ?
8. **Purge des 59 995 tombstones RAG,** et des 60 sauvegardes `origin-cdn.json.*.bak` (Infra).
9. **Sous-module FilmCraft :** le conserver ou le retirer de `crates/filmcraft`.
10. **Identifiants à fournir** (aucun n'est présent dans les conteneurs prod) :
    - `SHENRON_ADMIN_TOKEN` et `SHENRON_API_ADMIN_TOKEN` (OCR, inventaire wiki, commandes admin)
    - `SHENRON_DATABOOKS_API_TOKEN` et `DBFR_TOKEN`
    - `SHENRON_AGENT_API_KEY`
    - `SHENRON_A2A_TOKEN`
    - `APHRODY_AI_HTTP_URL` et `APHRODY_AI_HTTP_TOKEN` (serveur OCR, vision)
    - Cookies Gemini web (`~/.aphrody/cookies/gemini-web.json`)
    - `ANTHROPIC_API_KEY` et/ou un abonnement codex (`gpt-5.6-luna`), selon les quotas accordés
    - `JIMAKU_API_KEY` (optionnelle)
    - Identifiants Crunchyroll (`BUN_VIDEO_CRUNCHYROLL_ACCESS_TOKEN`, ou e-mail, mot de passe et `BASIC_AUTHORIZATION`)
    - `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`, pour toute publication R2 hors de l'origine prod
11. **Budget.** Plafond de dépenses Gemini, Anthropic et OpenAI pour les vagues 2 et 3, et limites R2/Worker acceptées.

## Annexe : requêtes de mesure (lecture seule, reproductibles)

Accès : `ssh prod "docker exec -i shenron-postgres psql -h /run/postgresql -U postgres -d shenron_site -At"`, chaque requête entourée de `BEGIN READ ONLY; … ROLLBACK;`.

- **Databooks** : `jsonb_array_elements(bot.db_databooks.pages)`, avec les clés `image`, `text`, `text_fr`, `text_fr_by`, `verifiee`.
- **Manga** :
  - `bot.db_manga_pages` (series, lang, has_ja)
  - `bot.db_manga_chapters.pages` (somme = 53 304)
  - `bot.media_editions`, `media_volumes`, `media_chapters.ocr_status`
- **Épisodes** : `bot.db_episodes` (frames, subtitles, players, availability, synopsis_fr).
- **Wiki** :
  - `bot.db_characters`, `db_techniques`, `db_transformations`, `db_locations`, `db_planets`, `db_character_variants` (image, name_ja, article, article_sources, origin)
  - `public.wiki_contributions`, `public.wiki_revisions`
- **News** : `bot.db_news` (source_id, published_at, fetched_at en epoch).
- **RAG** : `shenron_compute.aphrody_rag_documents` (`metadata->>'kind'`, `'visible'`, `'syncGeneration'`), et `shenron_compute.aphrody_shenron_vectors` (model).
- **Sources** : `public.external_source_records`, `public.canon_ingest_runs`, `bot.db_sources`.
- **CDN** : clés de `entries` dans `/srv/shenron/data/cdn/inventory-9a8ecae6371f.json`, comparées aux chemins ci-dessus après normalisation `./` → `/`.
