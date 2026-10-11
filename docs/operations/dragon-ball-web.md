<!-- SPDX-License-Identifier: Apache-2.0 -->

# Dragon Ball dans Aphrody Web

Le code produit Shenron s’exécute nativement en Bun et appelle par FFI le
module Dragon Ball d’Aphrody Web. La collecte, la
frontière persistante, les parseurs bibliographiques et les exports historiques
BXC appartiennent à Aphrody ; la décision éditoriale et les écritures PostgreSQL
restent dans Shenron.

Le point d’entrée produit existant est conservé :

```sh
bun run --filter @aphrody/shenron-pipeline pipeline crawl official --dry-run --max-requests 1 --max-depth 0
bun run --filter @aphrody/shenron-pipeline pipeline crawl kanzenshuu --max-requests 100
bun run --filter @aphrody/shenron-pipeline pipeline crawl databooks --max-requests 100
bun run --filter @aphrody/shenron-pipeline pipeline crawl guides --max-requests 5
bun run --filter @aphrody/shenron-pipeline pipeline crawl dragonballcn --max-requests 100
bun run --filter @aphrody/shenron-pipeline pipeline crawl universal --max-requests 500
bun run --filter @aphrody/shenron-pipeline pipeline unify
bun run --filter @aphrody/shenron-pipeline pipeline dragon-ball sources
bun run --filter @aphrody/shenron-pipeline pipeline dragon-ball catalogue-enrich --catalogue /chemin/prive/catalogue.json
```

Un dry-run construit la commande sans lancer de processus ni écrire de données.
Le module natif expose aussi `aphrody web dragon-ball plan` et `status` pour
consulter le plan et l’état d’une campagne. `crawl custom URL` appelle
`aphrody web crawl-index`, toujours avec le profil `shenron`.

| Source Shenron | Source native                                |
| -------------- | -------------------------------------------- |
| official       | official                                     |
| kanzenshuu     | kanzenshuu                                   |
| databooks      | kanzentai,neoseeker-databooks,databook-other |
| guides         | guides                                       |
| dragonballcn   | dragonballcn                                 |
| universal      | Sources activées dans le plan du module      |

La frontière `@aphrody/shenron-native/web/pipeline` consomme
`@aphrody/bun/web/pipeline`, qui charge la bibliothèque native vérifiée ;
`APHRODY_FFI_LIB` sélectionne explicitement un artefact accompagné de son manifeste compatible.
Sans cette variable, le SDK recherche son payload puis la bibliothèque compagnon
du pin installé par le lien canonique `~/.local/bin/aphrody`. Le manifeste,
le SHA-256, l’ABI et la provenance restent vérifiés avant chargement ; aucun
processus n’est lancé pour cette résolution.
Les descriptions de commandes conservent la syntaxe `aphrody web`, mais la liaison
produit n’exécute aucun binaire CLI. Les anciens binaires BXC ne sont pas lancés.
Le module peut lire leurs bases
SQLite avec `aphrody web dragon-ball export-bxc` ; ces bases sont ouvertes en
lecture seule et restent dans leurs stores protégés.

Les exports sont déposés dans
`$APHRODY_CORPUS_CRAWL_DIR/corpus`, sinon
`$APHRODY_HOME/workspaces/dbfr/crawl/corpus` (défaut de `APHRODY_HOME` :
`~/.aphrody`). `crawl --out DIR` remplace le répertoire d’export pour cette
collecte. `APHRODY_CORPUS_CRAWL_CONFIG` peut sélectionner un plan privé explicite.
L’index appartient au profil `shenron`, séparé du profil général Aphrody.

Les budgets de profondeur et de requêtes sont validés avant exécution. Les
rapports de frontière et les erreurs définissent l’avancement réel : un budget
atteint ne prouve pas que toutes les pages ont été collectées. Fandom est interdit.
Les URL contenant des identifiants sont refusées. Aucun corpus, scan, cookie,
poids ou contenu de conversation n’entre dans Git.

Le gel éditorial des databooks reste applicable : cette migration de code ne
lève aucun gel et n’exécute aucun dépôt OCR, traduction ou migration PostgreSQL.

Les points d’entrée Bun `@aphrody/shenron-pipeline/dragon-ball` regroupent catalogue,
couvertures et import manga. Les dépôts PostgreSQL utilisent les ports éditoriaux
existants. Les fichiers acquis sont vérifiés par SHA-256 et les fichiers revus
ne sont pas écrasés. `catalogue-enrich` prépare un résultat par défaut ; `--apply`
exige le gel levé et un `--output` distinct du snapshot natif.

`@aphrody/shenron-pipeline/aphrody/jobs` conserve les intentions et les résultats dans un
SQLite privé local. Il appelle les outils natifs MCP de soumission, suivi et
annulation via le client HTTP natif et sa configuration authentifiée. Chaque
hôte garde sa propre file SQLite. Le placement estime la charge à partir des
statistiques distantes et des accusés de réception locaux reçus pendant leur
lecture. Les intentions sans accusé restent réservées. Les slots déclarés
pondèrent ce calcul ; seuls les workers explicitement qualifiés sont candidats.
Après une réponse perdue, la même clé idempotente retourne au même hôte.

Les parseurs portables partagent leur propriétaire Rust avec la cible WASM.
La qualification des artefacts FFI/WASM et le déploiement restent distincts des
tests de code. Les anciens scripts encore présents ne sont retirés qu’après
validation de leur remplacement.

L’inventaire Bun vérifie les 16 familles, les fichiers réels et leurs SHA-256,
la recension datée, la relecture et les droits distincts RAG/entraînement :

```sh
bun run --filter @aphrody/shenron-pipeline pipeline dragon-ball coverage \
  --catalogue /chemin/prive/datasets/catalogue.json \
  --manifests /chemin/prive/datasets/manifests \
  --assets /chemin/prive/datasets/assets
```

Chaque manifeste est rangé sous `<famille>/<identifiant>.json`. Le rapport
affiche uniquement les métadonnées de couverture ; les textes, les justificatifs
et les chemins privés restent dans les stores protégés. Une recension absente
ou périmée ne permet pas de conclure qu’une famille est complète. Le gel lu
dans le plan directeur reste applicable même si son fichier de coordination
est absent.

`dragon-ball automate` reprend collecte, ingestion RAG, vérification hybride,
préparation du dataset, entraînement et évaluation séparée. Ses checkpoints ne
contiennent que des empreintes et des preuves de statut. Les accusés perdus
réutilisent la même clé ; la vérification RAG expire après une heure.

```sh
bun run --filter @aphrody/shenron-pipeline pipeline dragon-ball automate \
  --catalogue /chemin/prive/datasets/catalogue.json \
  --manifests /chemin/prive/datasets/manifests \
  --assets /chemin/prive/datasets/assets \
  --ledger /chemin/prive/automation/checkpoints.sqlite \
  --mcp-config /chemin/prive/mcp/config.toml --watch
```

`--hosts`, `--jobs-ledger` et `--collection-plans` ajoutent les collectes revues
sur les workers qualifiés. Chaque passe relit les manifestes et le gel. Sans
`--watch`, la commande réalise une passe et renvoie le code 2 si des étapes
restent incomplètes. La commande câble les adaptateurs natifs de collecte et
RAG ; la préparation supervisée, l’entraînement et l’évaluation exigent encore
leurs ports qualifiés. Leur absence produit un blocage explicite, jamais un
succès simulé.

La qualification opérationnelle du 2026-10-07 a relevé une erreur 503
« RAG database unavailable » sur l’ancien processus MCP stdio de la session.
Le profil protégé référence désormais la base RAG du propriétaire courant,
son schéma et le tunnel persistant existant. Un nouveau processus du binaire
qualifié expose actuellement 661 outils et réussit une recherche RAG en lecture seule.
Le catalogue peut varier avec les capacités des bridges disponibles ; le total
antérieur de 672 ne constitue pas une garantie de disponibilité permanente.
Le processus déjà ouvert conserve son environnement jusqu’à sa reconnexion.
Les statistiques du service `shenron-compute` ne prouvent ni la couverture des
16 familles ni celle du corpus PostgreSQL Shenron. Les DSN et jetons restent
dans l’environnement protégé du propriétaire.

Les exports et anciens poids locaux ne prouvent ni une ingestion actuelle avec
vecteurs ni un entraînement validé. Le poste Omar WSL reste le propriétaire de l’entraînement ;
son accès authentifié, son GPU et le runtime doivent être qualifiés avant
exécution. Le runner d’entraînement historique utilise encore un sous-processus
Python ; il ne constitue pas un handler natif en processus admissible pour cette
automatisation.

Qualification native du 2026-10-07 : le SDK Bun 3.3.8 est produit depuis la
révision propre `c8134dd39f84f0e51e2b8c14d50e83dc931c8722`. Les archives
source et leurs SHA-256 sont dans `vendor/aphrody-sdk/manifest.json` ; elles
contiennent le code et aucune bibliothèque native, donnée ou authentification.
Le pin propre CLI/FFI `bdc0c91d825c054862b8f55de208b5e03505005c`, construit
sur l’usine avec les trois features `jobs`, a passé les six tests natifs
du pipeline sans test ignoré ni mode développement. Son manifeste privé
porte la provenance propre, les ABI et les empreintes des deux artefacts. Le vrai serveur RMCP a également passé les appels CLI et FFI
avec authentification par référence d’environnement, session HTTP/SSE,
idempotence et annulation des jobs dans un store de test isolé.
Le contrôle Rust MCP/client compte 175 tests réussis et un test ignoré ;
Clippy strict est vert. Le consommateur Shenron appelle réellement le module
Dragon Ball par FFI. Les 24 alias Aphrody de WSL pointent vers le binaire
qualifié ; leur contrôle est vert et leurs anciennes cibles sont conservées.
Les workers natifs VPS, DBFR et WSL ont ensuite été activés et qualifiés par
une nouvelle tâche Web sur chacun : affinité exacte, un bail, journal de début
et de fin, PID vivant et SHA-256 du processus inchangés. Le manifeste privé
déclare respectivement 4, 2 et 2 slots. Les accès anonymes et les mauvais jetons
sont refusés. Le relais WireGuard conserve son URL privée et présente au
listener l’en-tête d’hôte loopback déclaré ; sa protection d’hôte reste active.

Le consommateur Shenron a réussi neuf tâches réelles : trois ciblées, puis
six simultanées réparties VPS 3, DBFR 2 et WSL 1. La fermeture et la réouverture
des ledgers conservent l’hôte et l’identifiant distant ; une soumission répétée
reste idempotente. Ces tâches lisent le registre de sources, sans ingestion
éditoriale. Une première passe utilisait le snapshot de développement
`41c2fd83145c` ; le pin propre `bdc0c91d825c` est maintenant installé sur
les trois hôtes. La FFI consommateur est chargée automatiquement depuis le
pin canonique WSL, sans `APHRODY_FFI_LIB` ni `APHRODY_FFI_DEV`.
La nouvelle passe Shenron sur ce pin propre réussit également les neuf
tâches, avec la même répartition 3/2/1 et les mêmes contrôles de réouverture
et d’idempotence, sans override FFI ni mode développement.
La répartition observée n’est pas un benchmark. Les fixtures RMCP de
redémarrage utilisaient un store RAMFS ; elles ne prouvent pas la résistance
à un crash disque. Les ledgers du consommateur sont privés et sur disque.

Le module Workspace `yolo ops mcp-environment prepare|probe|apply` conserve
l’environnement dans un JSON privé (dossier 0700, fichier 0600) et ne publie
que des noms de variables et des empreintes. La vérification utilise le client
MCP natif, puis une recherche RAG en lecture seule ; les configurations globales
ne sont écrites qu’après réussite. Chaque agent référence le même fichier par
`APHRODY_MCP_ENV_FILE`, en préservant ses autres serveurs et options. Une
préparation ultérieure conserve les références d’authentification existantes,
sans importer le `DATABASE_URL` générique d’un autre domaine. Ces opérations
d’administration ne remplacent pas les appels FFI du pipeline produit.
Les quatre configurations globales Codex, Claude, AGY et client Aphrody ont
été appliquées après le probe canonique réussi : elles utilisent `aphrody-mcp`
et cette unique référence privée, avec sauvegardes protégées. Le serveur MCP
déjà ouvert dans la session a été conservé.

## Export natif, registre PostgreSQL et audit des médias

`dragon-ball ingest-crawl` consomme directement `shenron-documents.jsonl` du
propriétaire Aphrody Web. Le mode par défaut planifie sans ouvrir PostgreSQL.
`--apply` utilise le `DATABASE_URL` protégé du domaine DBFR et les tables déjà
migrées `public.external_source_records` et `public.external_source_provenance`.
Il ne crée aucune table. Une source et sa provenance s’écrivent dans la même
transaction ; reprendre le fichier réutilise l’URL comme clé. Une source déjà
canonique, une capture plus récente ou un média déjà sondé sont préservés.
L’import ne promeut aucune source au canon et n’écrit aucune page de wiki,
traduction ou planche de databook.

```sh
bun packages/pipeline/src/cli.ts dragon-ball ingest-crawl \
  --input /chemin/prive/corpus/shenron-documents.jsonl \
  --policy /chemin/prive/corpus/policy.json --max-documents 10000
```

La politique privée déclare chaque domaine exact, sa classe, la preuve de
recension et ses droits. Exemple de structure :

```json
{
  "version": 1,
  "profile": "dbfr",
  "sources": [
    {
      "domain": "dragon-ball-official.com",
      "kind": "reference",
      "reviewed": true,
      "evidence": "https://dragon-ball-official.com/",
      "rights": {
        "ragPermitted": true,
        "trainingPermitted": false,
        "publicImagesPermitted": false
      }
    }
  ]
}
```

`reviewed: true` représente une recension réalisée ; copier l’exemple ne
constitue pas une qualification des droits. Classes possibles : `reference`,
`publisher`, `archive`, `statistics`, `community`, `bibliography`, `translation`.
Fandom, y compris une URL enveloppée par une archive, est refusé. L’export est
lu en flux avec une limite par ligne et par passe. Le code 2 indique un budget
atteint avant la fin du fichier. Les rapports ne contiennent que des comptes.
Les textes complets restent dans le corpus protégé ; le registre reçoit un
extrait de 8 000 caractères et les empreintes de la capture et de la politique.

Les médias découverts sont des références non sondées (`http_status = 0`) :
la disponibilité de la page parente ne prouve pas celle de son image.
L’audit suivant exige aussi les domaines CDN exacts dans la politique :

```sh
bun packages/pipeline/src/cli.ts dragon-ball audit-crawl-media \
  --input /chemin/prive/corpus/shenron-documents.jsonl \
  --policy /chemin/prive/corpus/policy.json --max-files 250 --concurrency 2
```

Il utilise HEAD, puis une requête Range de 512 octets si HEAD est indisponible.
Il annule les corps, applique un délai maximal par fichier et ne suit aucune
redirection. Les candidats à réparer sont les 404, 410 et réponses de type
incompatible. Le rapport conserve des empreintes d’URL et les statuts, jamais
les URL signées. Ce contrôle mesure la disponibilité des liens autorisés,
pas les empreintes des fichiers ni la couverture de tout le CDN. La remise
en ligne exige un fichier acquis et vérifié, sa provenance et ses droits,
puis le transfert déclaré par Infra ; aucun proxy général ni faux fichier
de remplacement n’est créé par l’audit.

## Réception native VPS et DBFR du 9 octobre 2026

Le crawl natif officiel respecte `robots.txt`, avec un budget de 25 requêtes
et une profondeur de deux. Il a exporté 17 documents HTTP 200 sur les cinq
domaines officiels sélectionnés. Le pipeline a d'abord planifié 453 entrées,
dont 436 références de médias. Après vérification SHA-256 de la sauvegarde
PostgreSQL des deux tables du registre, l'application sur DBFR a traité
396 entrées et préservé 57 entrées existantes ; aucune promotion canonique.
Une référence de média ne constitue toujours pas une image vérifiée.

Le paquet Linux a été construit avec Bun `1.4.3-aphrody.3` depuis la révision
`1545a33f`. Zod reste une dépendance externe du paquet, fournie par le lock
du consommateur : son intégration dans le bundle provoquait une erreur
`ZodLiteral` avant toute exécution. Le paquet livré et cette dépendance
verrouillée ont réussi le même plan sur VPS et l'application réelle sur DBFR.
La commande `build` du pipeline conserve ce contrat ; une distribution
autonome doit aussi fournir Zod, son manifeste et le lock qualifié.

L'audit de production a demandé les 381 images listées du premier volume
Soshuhen et obtenu 381 réponses HTTP 206 de type image. Les 17 autres
volumes existent dans l'API mais n'ont aucune page listée. Le rapport reste
incomplet : il ne qualifie ni ces sources manquantes, ni l'OCR, ni leur
présence dans le RAG, ni l'intégralité du CDN. Les rapports et exports
restent dans le profil privé `dbfr` des hôtes ; aucune donnée n'est commitée.
