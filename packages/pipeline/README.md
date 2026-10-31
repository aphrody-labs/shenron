# @aphrody/shenron-pipeline

CLI de coordination des imports Dragon Ball : OCR, RAG, crawl, IA et traduction.
Les calculs OCR/RAG/LLM et le crawl Web passent par Aphrody lorsque leurs
backends distants sont activés. Les scripts conservent l'extraction et la
validation éditoriales propres à Shenron.

Le serveur MCP Shenron n'est plus dans ce dépôt : il est porté par
`aphrody-ai/apps/shenron-mcp` et déployé par `aphrody-infra` (`shenron-mcp.service`).

```bash
bun run pipeline <ocr|rag|ia|translation|crawl> [options]
```

The `crawl` command asks Aphrody Web to index the selected campaign in the
`shenron` profile. Aphrody owns embedding, indexing and storage; the local Rust
command `aphrody rag ingest-shenron` remains available for offline/local corpus
work, but is not the product pipeline's default storage path.

## Workers de crawl

`pipeline crawl <source>` reste l'exécution directe, bornée, des sources déclarées
par `CrawlTarget`. Pour placer une collecte sur un worker Aphrody Jobs, le site,
le bot ou un orchestrateur passe `createCrawlJobIntent(key, target)` à
`AphrodyWebJobs.submit`. Les arguments natifs commencent par
`dragon-ball` (catalogue Dragon Ball) ou `crawl-index` (source personnalisée),
conformément au contrat du worker `web-pipeline`.

Les intents catalogués demandent `--browser playwright` pour utiliser le bridge
Obscura loopback configuré sur le worker ; les requêtes HTTP restent soumises aux
contrôles robots et au scope/budget du crawl. Le navigateur est explicite pour le
catalogue seulement : `crawl-index` personnalisé conserve son transport distinct.

Les budgets de requêtes/profondeur sont inclus dans la tâche. Les chemins de sortie
et d'état restent propres à l'hôte worker : `outDir` est refusé pour une tâche
distante. Les sources personnalisées exigent une URL HTTP(S) sans identifiants,
refusent Fandom et reçoivent un label persistant dérivé de l'URL. Les workers
doivent rester `workerReady=false` tant que leur MCP authentifié et leur file locale
n'ont pas passé les sondes Infra ; leurs bases SQLite ne se partagent pas entre hôtes.
Chaque intent de campagne cataloguée passe le `--output` officiel du crawl vers un
dossier isolé sous `/home/ubuntu/.aphrody/workspaces/dbfr/crawl/campaigns/<sha256-clé>`.
Les unités worker VPS et DBFR déclarent actuellement ce même `APHRODY_HOME`; le reçu
`AphrodyWebJobs` expose `crawlOutputDir` uniquement après l'état `succeeded` et seulement
si le chemin correspond à la clé de l'intent. Les tâches personnalisées `crawl-index`
conservent leur sortie native distincte. Cette attribution donne un chemin récupérable,
elle ne transfère pas les fichiers et ne produit pas le manifeste d'import à elle seule.

Après succès du job, l'orchestrateur peut sceller le JSONL fermé dans un dossier d'artefact de deux
fichiers (`shenron-documents.jsonl` et `manifest.json`) : taille, SHA-256 octet par octet,
nombre de documents, ID/statut du job et empreinte de la politique sont liés au manifeste.
L'export refuse les jobs autre que `succeeded`, les fichiers symboliques, les exports vides,
les captures invalides et les limites dépassées (512 Mio, 10 000 documents). Le manifeste
n'est pas un mécanisme de transport : son transfert VPS→DBFR reste à la charge d'Aphrody Infra.
Ne transférer que ce dossier scellé, jamais la base SQLite/frontière, les fichiers WAL/SHM ou
les sessions du worker.

```sh
bun packages/pipeline/src/cli.ts dragon-ball export-crawl \
  --input /chemin/prive/shenron-documents.jsonl --output /chemin/prive/job-123 \
  --policy /chemin/prive/policy.json --job-receipt /chemin/prive/job-123-receipt.json
```

`--job-receipt` est le reçu terminal `AphrodyWebJobs` conservé par l'orchestrateur ; seuls
les reçus `state=succeeded` avec hôte et ID distant sont acceptés. Ne pas fabriquer ce reçu
à partir d'un statut saisi à la main.

À réception, `ingest-crawl --manifest /chemin/prive/job-123/manifest.json` vérifie le dossier
exact (aucun fichier additionnel), les empreintes, la taille, le compte de lignes, le statut et
l'empreinte de politique avant toute connexion DB. `--apply` exige ce manifeste. Le dossier est
à conserver privé et immuable pendant le transfert ; aucun secret n'est inclus dans le manifeste.

Pour obtenir des candidats OCR Koharu depuis un projet natif, utiliser
`bun run pipeline koharu-native-candidate <manga|databook> <manifest.json>
<project-root> <project-name> <candidates.jsonl> [--sdk <koharu-sdk>]`.
Le binaire Rust doit être installé ou fourni avec `--sdk`. La commande vérifie
le SHA-256 des images du manifeste contre les images stockées dans le projet,
puis écrit uniquement un artefact `decision=unreviewed`, sans dépôt éditorial.
Voir `docs/products/koharu/README.md` pour la frontière de provenance.

Pour des sorties `aphrody.ocr.result/v2` (y compris une projection OCR Koharu),
`bun run pipeline aphrody-ocr-candidate <manga|databook> <manifest.json>
<ocr-v2.jsonl> <candidates.jsonl>` conserve le texte, les blocs, la qualité et
la provenance dans le candidat de revue déjà utilisé par Shenron. Chaque
résultat doit porter le SHA-256 de l'image traitée ; le pipeline revérifie les
octets et les dimensions de cette image dans l'export Shenron. Son
`page_id` peut être l'identité du manifeste (`DB:...`/`DBS:...` pour le manga,
`databook:<id>:<page>` pour les databooks) ou égaler `image.path` pour un lot
PP-OCR générique. Ce chemin reste une trace du fichier traité : seul le SHA-256
unique du manifeste établit l'identité éditoriale. Seuls les états
`text` et `needs-review` avec du texte peuvent produire un candidat. `no-text`,
`unreadable` et `processing-error` sont refusés ; aucun de ces états ne peut
effacer une transcription ni lever une quarantaine. Le manifeste reste
l'autorité pour l'identité de page et le SHA-256 du scan original.

Pour faire entrer ces candidats manga dans la revue visuelle hors ligne :

```bash
bun packages/pipeline/scripts/manga-revue-agents.ts prepare <racine-run> --lot <n> --sortie <revues> --candidates <candidates.jsonl>
```

`prepare` revérifie le schéma, l'identité, les deux SHA-256 du manifeste et les
octets de chaque image concernée. Le paquet de revue contient les régions ou
preuves OCR sous `candidatNonRelu`, en plus des indices PP-OCR existants.
L'arbitre doit toujours lire l'image réelle ; le candidat ne fournit aucune
revue visuelle, confirmation de couverture ou décision éditoriale. La commande
`sceller` attend toujours ses deux revues indépendantes. Les candidats databook
n'ont pas encore d'entrée offline équivalente : `planches-a-relire.ts` construit
sa file depuis PostgreSQL et les scripts de dépôt attendent des transcriptions
déjà jugées au format `{image,text}`, pas `shenron.databook.review-candidate/v1`.

Pour les règles de bascule et les preuves de production, voir
`docs/architecture/APHRODY-ECOSYSTEM.md` (§6.2).

La commande `pipeline translation` délègue la traduction à
`apps/site/scripts/traduction-boucle.ts`, qui consomme le propriétaire
Rust `aphrody-translate` pour le moteur et conserve les règles de validation et
de dépôt propres aux databooks. L'ancien démon Google du processus Shenron
n'est plus utilisé par ce flux. Voir
[`docs/guides/TRADUCTION-DATABOOKS.md`](../../docs/guides/TRADUCTION-DATABOOKS.md) pour les
compteurs et le protocole d'arrêt/reprise.

## Pipeline unifiée

`bun run pipeline run` enchaîne dataset, canon et RAG, décision (`bun:yolo`), wiki et agent home,
puis plugin, comme un DAG (`src/orchestrator-stages.ts`) : étapes parallèles par vague,
timeouts, reprises avec backoff, étapes dépendantes sautées après un échec. L'état est écrit
atomiquement dans `var/reports/pipeline/last-run.json`.

- Chaque étape déclare des globs `inputs` : empreinte SHA-256 (`Bun.Glob` + `Bun.CryptoHasher`) ; inchangée depuis le dernier succès, l'étape est `cached` (`--force` l'ignore). L'historique des runs vit dans `var/reports/pipeline/history.sqlite` (`bun:sqlite`, affiché par `status`). Identifiants `Bun.randomUUIDv7`, durées `Bun.nanoseconds`, sorties nettoyées par `Bun.stripANSI`.
- `plan` : ordre d'exécution sans rien lancer ; `status` : dernier état.
- `run --only rag,wiki` (dépendances incluses), `--resume` (saute les étapes `ok`), `--concurrency N`, `--json`.

## Chaîne automatisée (`auto`)

`bun packages/pipeline/src/cli.ts auto --seed <url> --allow <hôte> [--out dir] [--max-pages n] [--skip-eval]` :
crawl allowlisté (`Bun.FetchSession` si présent, robots.txt respecté, Fandom refusé, captures complètes privées
sous `var/reports/auto/crawl`) → passages JSONL (cible `Bun.VectorIndex` si disponible) → brouillons wiki
concurrents par runner (`src/auto/workers.ts` : Haiku 5.5 via `ANTHROPIC_API_KEY`, Luna via
`SHENRON_WIKI_LUNA_MODEL` + `SHENRON_OPENAI_API_KEY`, `SHENRON_WIKI_LUNA_HOST=dbfr` pour le mux, effort `low`) →
arbitrage `bun:yolo` (Jev/TypeSafe, abstention sous 0,6) → `wiki-candidates.jsonl` en review-only, sans écriture en
base ; puis évaluation (étapes `rag`, `canon`, `decision-probe`). Sondes de capacités : `src/auto/capabilities.ts`
(`Bun.Crawl`, `Bun.VectorIndex`, `bun:adblock`, `bun vpn` sont absents du runtime local : repli documenté).
