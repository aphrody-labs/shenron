<!-- SPDX-License-Identifier: Apache-2.0 -->

# Dragon Ball dans Aphrody Web

Le code produit Shenron s’exécute nativement en Bun et appelle par FFI le
module Dragon Ball d’Aphrody Web. La collecte, la
frontière persistante, les parseurs bibliographiques et les exports historiques
BXC appartiennent à Aphrody ; la décision éditoriale et les écritures PostgreSQL
restent dans Shenron.

Le point d’entrée produit existant est conservé :

```sh
bun run --filter @shenron/pipeline pipeline crawl official --dry-run --max-requests 1 --max-depth 0
bun run --filter @shenron/pipeline pipeline crawl kanzenshuu --max-requests 100
bun run --filter @shenron/pipeline pipeline crawl databooks --max-requests 100
bun run --filter @shenron/pipeline pipeline crawl guides --max-requests 5
bun run --filter @shenron/pipeline pipeline crawl dragonballcn --max-requests 100
bun run --filter @shenron/pipeline pipeline crawl universal --max-requests 500
bun run --filter @shenron/pipeline pipeline unify
bun run --filter @shenron/pipeline pipeline dragon-ball sources
bun run --filter @shenron/pipeline pipeline dragon-ball catalogue-enrich --catalogue /chemin/prive/catalogue.json
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

La frontière `@shenron/native/web/pipeline` consomme
`@aphrody/bun/web/pipeline`, qui charge la bibliothèque native vérifiée ;
`APHRODY_FFI_LIB` sélectionne un artefact accompagné de son manifeste compatible.
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

Les points d’entrée Bun `@shenron/pipeline/dragon-ball` regroupent catalogue,
couvertures et import manga. Les dépôts PostgreSQL utilisent les ports éditoriaux
existants. Les fichiers acquis sont vérifiés par SHA-256 et les fichiers revus
ne sont pas écrasés. `catalogue-enrich` prépare un résultat par défaut ; `--apply`
exige le gel levé et un `--output` distinct du snapshot natif.

`@shenron/pipeline/aphrody/jobs` conserve les intentions et les résultats dans un
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
bun run --filter @shenron/pipeline pipeline dragon-ball coverage \
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
bun run --filter @shenron/pipeline pipeline dragon-ball automate \
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
qualifié expose 672 outils et réussit une recherche RAG en lecture seule.
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
révision propre `cafa8b3e8ef494a4cfa5243a7304902057fb0380`. Les archives
source et leurs SHA-256 sont dans `vendor/aphrody-sdk/manifest.json` ; elles
contiennent le code et aucune bibliothèque native, donnée ou authentification.
L’artefact FFI privé `41c2fd83145c` a passé les six tests natifs du pipeline
sans test ignoré. Le vrai serveur RMCP a également passé les appels CLI et FFI
avec authentification par référence d’environnement, session HTTP/SSE,
idempotence et annulation des jobs dans un store de test isolé.
Le contrôle Rust MCP/client compte 175 tests réussis et un test ignoré ;
Clippy strict est vert. Le consommateur Shenron appelle réellement le module
Dragon Ball par FFI. Les 24 alias Aphrody de WSL pointent vers le binaire
qualifié ; leur contrôle est vert et leurs anciennes cibles sont conservées.
Cette installation ne prouve pas encore l’activation des workers de chaque hôte.

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
