# Objectif — enrichissement documentaire Dragon Ball et catalogues médias

## Mission

### Priorité immédiate du 11 octobre 2026 : actualités Super

La demande courante ajoute la collecte et la publication immédiates des actualités,
articles, visuels et vidéos officiels de _Dragon Ball Super: Beerus_, avec un agent Codex
exécuté par SSH sur DBFR. Conserver les onze lots documentaires ci-dessous et leurs lacunes.

- Vérifier les annonces en temps réel, leurs dates de publication et d'événement. Le site
  officiel annonce la première japonaise le 11 octobre 2026
  ([annonce](https://en.dragon-ball-official.com/news/01_4425.html),
  [compte rendu NYCC](https://en.dragon-ball-official.com/news/01_4509.html)).
  La disponibilité internationale et l'existence d'un épisode bonus demandent leurs propres
  preuves ; aucune fiche ne doit présenter une hypothèse comme une annonce confirmée.
- Dédupliquer par URL canonique et identifiant vidéo, garder les crédits et les langues
  originales, publier des synthèses sourcées avec liens/embeds officiels. Ne pas recopier
  intégralement les articles ni réhéberger des épisodes sans droits établis.
- Écrire les contenus par les API éditoriales existantes vers PostgreSQL ; actualiser
  uniquement les clés Redis du cache concerné par le mécanisme propriétaire. Contrôler
  révisions, relecture PostgreSQL, cache, recherche et rendu public séparément.
- Lancer le travail distant borné dans tmux via Infra, credentials dans leurs stores,
  journaux privés et statut terminal explicite. Les compilations restent sur la fabrique VPS.
- Exécuter les gates du monorepo, commiter et pousser les lots verts, déployer les artefacts
  scellés et qualifier les pages réellement servies. Auditer les paquets npm et crates.io,
  publier les seuls artefacts qualifiés et autorisés dont la version n'existe pas déjà,
  sans changer implicitement les marqueurs `private`/`publish` ni publier de données privées.

État vérifié le 11 octobre à13:21UTC : collecte Codex sur DBFR terminée ;
[article publié](https://dragonballfr.com/news/dragon-ball-super-beerus-premiere-2026-10-11)
par API CMS, PostgreSQL relu, index `/news` et détail en200, deux visuels et trois
bandes-annonces officielles. Replay sans doublon et clé temporaire révoquée ; ISR du CMS
invalidé par son propriétaire. Aucun mécanisme Redis CMS confirmé. La première japonaise
est programmée à14:15UTC/16:15Paris ; aucun épisode bonus confirmé. Les douze bibliothèques
npm sont préparées avec visibilité publique explicite et allowlists auditées, mais la
première tentative `@shenron/engine@1.4.4` reçoit404 au PUT registry ; aucune publication
npm effective annoncée. Les qualifications crates.io restent distinctes.

Étendre le catalogue Dragon Ball France déjà servi par Shenron, en partant des œuvres,
fiches, volumes, épisodes, databooks, sources et événements de chronologie existants.
Compléter les lacunes avec des notices dédupliquées, des références vérifiables et des
liens vers les publications officielles. Relier les ajouts aux fiches et à la chronologie
existantes au lieu de créer un catalogue parallèle. L'exécution avance sans sollicitation
à chaque étape ; les contenus sont administrés par l'équipe Dragon Ball France.

## Point de départ obligatoire — catalogue et chronologie Shenron

- Faire l'inventaire des catalogues, identifiants, éditions, langues, URLs, références,
  états de transcription et traductions déjà présents dans le site et sa base. Les totaux
  affichés par la production sont des instantanés : relire l'état réel au début de chaque
  lot, sans les recopier comme vérité permanente.
- Réutiliser les familles de données actuelles des mangas et volumes, épisodes et séries,
  databooks/interviews, actualités officielles et chronologie. Les schémas et routes
  existants — notamment le catalogue `db_databooks` et la chronologie publique — sont des
  pistes de découverte ; auditer leur couverture avant toute évolution de contrat.
- Résoudre chaque candidate par identifiant externe, édition, ISBN ou URL canonique avant
  insertion. Rattacher les nouvelles éditions à l'œuvre déjà connue ; préserver le suivi
  des chapitres/épisodes et les liens entre événements, volumes, sources et fiches.
- Établir pour chaque collection un état initial `present`, `partial`, `missing` ou
  `unverified`. Ne jamais écraser ni republier une fiche existante pour donner l'impression
  d'un ajout.
- Pour la chronologie, enrichir les événements existants avec des références vers les
  nouveaux volumes, interviews et épisodes uniquement quand les sources établissent ce
  lien. Distinguer la date de publication réelle de la date diégétique ; ne pas ajouter les
  œuvres dérivées ou produits promotionnels comme événements du canon par défaut.

## Propriétaires techniques du monorepo

Garder chaque changement dans son paquet propriétaire et les relier par les contrats
existants. Les 12 paquets `packages/*` et les applications qui portent ce travail sont :

| Paquet/application  | Rôle dans ce chantier                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| `@shenron/config`   | Codes de séries, langues, chronologie, catégories et types partagés                                 |
| `@shenron/db`       | Schémas PostgreSQL, schémas du réplica bot, dépôts catalogue et chronologie                         |
| `@shenron/api`      | Contrats des endpoints, validation des réponses et OpenAPI                                          |
| `@shenron/auth`     | Sessions de l’interface d’administration et intégration aux routes éditoriales existantes           |
| `@shenron/pipeline` | Importeurs Bun, collecte de sources, normalisation, OCR/transcription, traduction et indexation RAG |
| `@shenron/lexicon`  | Formes ja/fr/en et normalisation des noms Dragon Ball                                               |
| `@shenron/media`    | Primitives d'OCR, sources média et empreintes de planches                                           |
| `@shenron/images`   | Déduplication et résolution des images de catalogue                                                 |
| `@shenron/ui`       | Vues catalogue, lecteurs manga/databook, filtres et présentation admin                              |
| `@shenron/native`   | Fonctions FFI locales appelées par les outils Bun de traitement                                     |
| `@shenron/koharu`   | Protocole du moteur de lecture/traduction Shenron Studio                                            |
| `@shenron/engine`   | Moteur de rendu partagé si une nouvelle vue média l'utilise                                         |
| `apps/site`         | Routes publiques/admin, pages et données affichées sur dragonballfr.com                             |
| `apps/bot`          | Réplica SQLite, commandes et consommation du catalogue par le bot                                   |
| `apps/server`       | Assemblage du site, API et capacités locales dans le binaire serveur                                |

Le sous-ensemble de code à modifier se décide après l'audit du catalogue ; la présence
d'un paquet dans cette carte n'implique pas une modification obligatoire.

## Skills du plugin Shenron

| Skill                  | Usage technique dans ce chantier                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `dragon-ball`          | Partir des références du plugin et les confronter aux pages et données courantes du site                                                    |
| `dragon-ball-canon`    | Relier chronologie et événements aux sources qui établissent explicitement le lien                                                          |
| `dragon-ball-japonais` | Conserver les titres, noms et textes japonais de référence et les relier aux formes françaises                                              |
| `databooks-ocr`        | Lire visuellement les pages et produire des transcriptions JSONL page par page, avec le texte japonais original                             |
| `shenron-admin`        | Passer par les routes éditoriales existantes puis relire séparément la fiche enregistrée                                                    |
| `source-of-truth`      | Vérifier les références générées avec `bun scripts/plugin/build-references.ts --check` et les régénérer depuis leur source après changement |
| `toriyama-svg`         | Préparer les visuels SVG associés aux fiches lorsque le catalogue en demande un                                                             |

Pour les transcriptions databook, conserver la structure JSONL attendue par le pipeline,
par exemple `{"image":"<id>-<page>.jpg","text":{"kind":"text","markdown":"..."}}`.
Le japonais reste le texte de départ ; les versions française et anglaise lui sont reliées
comme traductions distinctes. Vérifier le statut du gel des databooks avant toute saisie.

## Modèle de données déjà présent

- `bot.db_episodes` : série, numéro, titres japonais/romaji, date de diffusion, source
  officielle, sous-titres et pistes vidéo. Compléter les séries et variantes de langue dans
  ces champs/relations sans créer un modèle d'épisode parallèle.
- `bot.db_manga_volumes`, `bot.db_manga_chapters` et `bot.db_manga_pages` : éditions et
  tomes, chapitres, planches et OCR. Utiliser `media_works`, `media_editions`,
  `media_volumes` et leurs relations existantes pour les nouvelles séries et éditions
  quand elles apportent les champs manquants ; conserver les identifiants historiques.
- `bot.db_databooks` : ouvrages, artbooks, numéros de magazine et interviews avec titres
  ja/fr, auteur, date, catégorie, URL source et pages `jsonb`. Les catégories comprennent
  déjà `Weekly Shonen Jump`, `V-Jump`, `Saikyō Jump` et les interviews.
- `bot.db_media_publications` : publications dérivées raccordées à leur fiche historique ;
  `bot.dragonballcn_volumes` : catalogue d'archives/volumes déjà importé, à comparer avant
  toute insertion.
- `bot.db_timeline_events` : événements par âge diégétique. `public.ChronologyConfig` :
  ordre et ajustements de la frise publiée. Le dépôt de chronologie agrège déjà épisodes,
  films, tomes canoniques, sagas, arcs et databooks ; préserver ce contrat.
- PostgreSQL `bot` reste le catalogue éditorial principal du site ; SQLite du bot est son
  réplica. Après une écriture éditoriale par l'outil Shenron existant, vérifier la révision,
  le réplica, les index utilisés par la recherche et les pages publiques.

## Relevé DBFR vérifié le 11 octobre 2026

Lecture PostgreSQL de `shenron_site` par SSH `dbfr`. Les cinq schémas hors système recensés
contiennent 127 tables ; `pg_class.reltuples` estime environ 1,08 million de lignes et
`pg_total_relation_size` environ 2,4 Go. Ces deux mesures globales sont des estimations de
taille, pas des nombres de fiches éditoriales.

| Famille               | État observé dans DBFR                                                                                                                                                                                                                     | Travail à faire                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Épisodes              | `bot.db_episodes` contient 826 fiches réparties entre `DB`, `DBGT`, `DBS`, `DBZ`, `DBZ_KAI`, `DBZ_KAI_FINAL` et `DB_DAIMA`. Aucun groupe `SDBH` ni `ARALE` n’y apparaît.                                                                   | Ajouter les séries et épisodes demandés en réutilisant les champs de langue, sous-titres, disponibilité et sources officielles.                              |
| Sōshūhen              | 18 volumes `SOSH` visibles dans `db_manga_volumes`, avec 18 chapitres liés. Un seul chapitre apparaît visible et renseigné. Il existe aussi 18 notices `db_databooks` portant ISBN, toutes masquées.                                       | Dédupliquer les deux représentations, conserver les identifiants existants, contrôler chaque tome et compléter les relations de chapitres, pages et sources. |
| _Weekly Shōnen Jump_  | 46 notices dans `db_databooks`, dont 28 visibles ; les numéros visibles couvrent plusieurs années, sans constituer l’inventaire demandé.                                                                                                   | Compléter la liste des numéros et leur contenu, avec le repérage prioritaire des chapitres Dragon Ball.                                                      |
| Interviews            | 6 notices de catégorie `Interview`, toutes visibles ; 2 ont un tableau `pages` non vide.                                                                                                                                                   | Rechercher les autres interviews dans les notices, sources externes et publications, puis établir le texte japonais source et l’état de transcription.       |
| Databooks et artbooks | 480 notices au total. La catégorie `Art Book` en contient 14, dont 12 visibles et 11 avec un tableau `pages` non vide. Les recherches de titre `Dragon Quest`/`ドラゴンクエスト` ne retournent aucune notice correspondante.               | Examiner les notices incomplètes sur leurs champs et pages, puis chercher les artbooks Dragon Quest via leurs références alternatives.                       |
| Éditions _Full Color_ | Une édition japonaise visible est intitulée « Dragon Ball Full Color (32 tomes) » ; 42 volumes lui sont reliés dans `media_volumes`. Le code `DBFC` a 520 chapitres dans `db_manga_chapters`, sans volumes `DBFC` dans `db_manga_volumes`. | Réconcilier l’édition, les volumes et les chapitres avec les références bibliographiques avant de compléter le contenu.                                      |
| Mangas et éditions    | `ARALE` possède 18 volumes et 18 chapitres ; `DB_SD` possède un volume. Six séries manga `SDBH_*` ont chacune une notice de volume. Les 8 notices `media_editions` utilisent les langues `ja` et `fr` ; aucune édition `en` n’y apparaît.  | Compléter les œuvres et éditions japonaises, françaises et anglaises demandées, les chapitres/pages et les variantes couleur/noir et blanc.                  |
| Sources officielles   | `db_news` comporte 6 notices marquées officielles provenant de deux identifiants de source. Le site possède aussi les tables `external_source_records`, `external_source_provenance` et `canon_references`.                                | Rechercher les publications Dragon Ball Official, Toei et YouTube dans les index de sources, puis relier chaque résultat à son œuvre ou interview.           |

Le dictionnaire des tables et colonnes a été lu pour les cinq schémas ; les comptages sont
exacts pour les familles de catalogue interrogées et estimés pour la volumétrie globale.
Les lectures de contenu portent sur les notices éditoriales du périmètre. Au début de chaque
lot, rafraîchir les compteurs et les identifiants sur la production au lieu de traiter ce
relevé daté comme un état permanent.

## Périmètre éditorial

### Vidéos et anime

- Cataloguer les épisodes de _Super Dragon Ball Heroes_ en japonais avec sous-titres,
  en distinguant VOST et VOSTFR selon les versions disponibles.
- Préparer l'offre exclusive DBFR d'épisodes de _Dr. Slump_ en VOST et VOSTFR, avec
  épisodes, langues, sous-titres et disponibilité.
- Recenser les vidéos YouTube d'interviews pertinentes sur Dragon Ball et son équipe :
  Akira Toriyama, Toyotaro, Uchida, Koyama, Torishima, les comédiens de doublage et les
  autres membres du personnel. Enregistrer titre, chaîne, URL, date, participants, langue,
  sujet et statut de transcription. Utiliser les API et fonctions d'export disponibles.
- Recenser les informations et interviews publiées par le site officiel Dragon Ball et
  Toei Animation, y compris les entretiens vidéo exclusifs de Toyotaro et Uchida. Garder
  les liens, dates, transcriptions et relations avec les fiches concernées.

### Mangas, magazines et livres

- Référencer les 18 volumes _Sōshūhen_ et relever les informations bibliographiques,
  sommaires, éditions, ISBN et liens d'achat vérifiables.
- Référencer les volumes _Dragon Ball Full Color_ japonais et leurs contenus éditoriaux,
  notamment les informations et interviews de Toriyama.
- Rechercher les numéros de _Weekly Shōnen Jump_ et leurs contenus. Priorité à
  l'identification des numéros contenant _Dragon Ball_, avec table de correspondance
  numéro/date/chapitre/page si les informations sont disponibles.
- Compléter les fiches des databooks et artbooks encore incomplets dans le catalogue,
  y compris les ouvrages _Dragon Quest_. Préserver le gel éditorial des databooks et ne
  lancer aucune écriture OCR ou traduction tant que le gel n'est pas levé.
- Référencer le manga _Super Dragon Ball Heroes_ en japonais et/ou français, en indiquant
  précisément les éditions et leur disponibilité.
- Référencer les mangas _Dragon Ball_ et _Dragon Ball Super_ en anglais.
- Référencer _Dr. Slump_, _Neko Majin_, le chapitre spécial de _Jaco_ et celui de
  _Bardock_, ainsi que _Dragon Ball SD_, en japonais et en français lorsque ces éditions
  existent. Distinguer clairement les versions couleur et noir et blanc.
- Utiliser le lien B9Good fourni comme piste de repérage des épisodes de _Dr. Slump_ et
  rapprocher les informations de la fiche et de la chronologie déjà présentes.

### Interviews textuelles

- Constituer un corpus d'interviews Dragon Ball à partir du texte japonais original.
  Conserver le japonais comme source primaire pour éviter les traductions en chaîne depuis
  l'anglais.
- Pour chaque entrée, conserver la référence, l'auteur/intervieweur, les participants,
  la publication, la date, la langue, la provenance et le statut de transcription.
- Relier les traductions françaises ou anglaises au texte japonais source sans remplacer
  ni fusionner les versions.

## Méthode et livrables

1. **État initial** : comparer les données actuellement servies, les catalogues éditoriaux,
   la frise chronologique, les importeurs et les routes API. Produire un manifeste des
   entrées existantes, partielles et absentes, avec leurs identifiants et sources. Faire
   cette lecture avant toute écriture et dater le manifeste associé à chaque lot.
2. **Inventaire de couverture** : créer une entrée de suivi par œuvre, édition, numéro,
   épisode, vidéo ou interview demandés. Dédoublonner contre le catalogue existant ; noter
   langue, format (couleur/N&B), participants, dates, références, URL primaire, état de
   complétude et statut de transcription. Pour la collecte et la normalisation, s'appuyer
   sur le CLI existant `bun run --filter @shenron/pipeline pipeline <crawl|ocr|translation|unify>`
   et sur les API de sources disponibles ; faire les écritures de catalogue par l'interface
   ou les routes d'administration Shenron.
3. **Priorité de collecte** : compléter d'abord les notices bibliographiques et les liens
   officiels qui peuvent être vérifiés automatiquement ; ensuite les collections manga et
   databook manquantes ; puis les épisodes et vidéos/interviews ; enfin les références de
   _Weekly Shōnen Jump_ et les transcriptions. Ne pas laisser les médias en attente bloquer
   l'indexation des métadonnées.
4. **Mise à jour du catalogue** : employer les schémas, dépôts, contrats API et interfaces
   Shenron propriétaires après vérification de leur modèle. Préserver la source PostgreSQL,
   le reverse-sync et les audits éditoriaux. Tout changement visible utilise les
   dictionnaires `fr`, `en` et `ja`; aucune migration de production directe.
5. **Rattachement chronologique** : enrichir la chronologie existante avec les dates de
   publication et les liens de source pertinents. Ne créer un événement qu'avec une source
   explicite ; garder séparées chronologie éditoriale, continuité diégétique et ordre de
   diffusion.
6. **Contrôle qualité** : valider les doublons, formats, langues, dates, URL, attribution
   et provenance. Vérifier les liens et signaler les URL mortes sans effacer les fiches
   antérieures. Exécuter `bun install --frozen-lockfile`, `bun run typecheck`,
   `bun run lint`, `bun run format:check`, `bun packages/api/scripts/openapi.ts --check`,
   `bun packages/ui/scripts/generate-tokens.ts --check`,
   `bun packages/pipeline/scripts/ai/check-contracts.ts`, `bun run test` et
   `bun run test:scripts`, puis les tests ciblés des routes, importeurs et pages modifiés.
7. **Runtime** : exécuter les commandes Bun du chantier avec Aphrody Bun 1.4.4. Vérifier
   `bun --version`, `bun --revision`, `packageManager`, `engines` et le lockfile sur Windows
   et sur `vps` avant l'installation figée et les gates. Le runtime global Windows
   `1.4.3-aphrody.4` ne constitue pas le runtime de qualification : des binaires Aphrody
   1.4.4 isolés ont été qualifiés le 11 octobre sur Windows et la fabrique VPS, puis dans
   les images DBFR. Relire leurs versions et empreintes dans les reçus privés de livraison ;
   deux benchmarks du binaire debug Windows restent rouges. Qualifier séparément les changements Shenron et
   ceux du dépôt Bun OS ; préserver les chemins revendiqués par leurs propriétaires.
8. **Livraison** : produire des lots petits et reproductibles, chacun avec chemins possédés,
   commit, empreintes des artefacts livrables et rapports de gates.
9. **Production** : vérifier par SSH les rôles, versions Bun et chemins de release de `vps`
   et `dbfr`. Lire le routage courant de `bun scripts/ops/release.ts` et des runbooks
   [CLOUD-SESSION.md](docs/operations/CLOUD-SESSION.md),
   [CONTAINER-COMPLET.md](docs/operations/CONTAINER-COMPLET.md) et
   [INFRA-DELEGATION.md](docs/operations/INFRA-DELEGATION.md), puis exécuter
   `bun scripts/ops/release.ts` selon le parcours Shenron/Infra actif. Tous les builds
   tournent sur `vps` ; sur le parcours Docker DBFR, lancer `~/shenron-docker-build.sh`
   dans `tmux`, attendre
   `EXIT_CODE=0`, vérifier SHA, version et smoke du bot, envoyer avec `~/ship-shenron.sh`,
   puis activer sur `dbfr` via `~/deploy-shenron-image.sh <SHA> <archive>`. Consigner le
   statut terminal et le chemin de rollback. Vérifier ensuite la release active, les
   conteneurs, `/api/health`, les sondes de release, les pages catalogue et les événements
   de chronologie. En cas d'échec, reprendre à l'étape identifiée après avoir vérifié son
   résultat.

## Lots demandés et preuve attendue

| Lot                        | Couverture à inventorier                                                                               | Résultat vérifiable                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| _Super Dragon Ball Heroes_ | Épisodes, versions japonaises, VOST/VOSTFR, dates et références                                        | Fiches d'épisodes reliées à la série et aux sources                               |
| _Dr. Slump_ anime          | Épisodes japonais et sous-titres VOST/VOSTFR ; piste B9Good à vérifier                                 | Catalogue d'épisodes et présentation de l'offre exclusive DBFR                    |
| _Dragon Ball Sōshūhen_     | Les 18 tomes, identifiants et contenus éditoriaux                                                      | 18 fiches ou écarts explicitement prouvés, liées aux entrées existantes           |
| _Dragon Ball Full Color_   | Éditions japonaises, volumes et interviews/informations associées                                      | Couverture des volumes et références aux sources originales                       |
| Interviews écrites         | Interviews Dragon Ball en japonais, auteur, intervieweur, publication et date                          | Index japonais primaire ; traduction reliée à sa source                           |
| Interviews vidéo           | YouTube et autres vidéos du staff : Toriyama, Toyotaro, Uchida, Koyama, Torishima, comédiens et équipe | Métadonnées, lien canonique, langue et état de transcription par vidéo            |
| Sources officielles        | Dragon Ball Official et Toei Animation, pages et interviews vidéo                                      | Index daté avec URL primaire, sujet, participants et liens vers les notices liées |
| _Weekly Shōnen Jump_       | Numéros et contenu ; priorité aux apparitions/chapitres Dragon Ball                                    | Bibliographie numéro/date/contenu et repérage des scans disponibles               |
| Databooks et artbooks      | Notices incomplètes existantes, dont _Dragon Quest_                                                    | Rapport des lacunes et fiches enrichies ; respecter le gel OCR/traduction         |
| Mangas dérivés             | _Super Dragon Ball Heroes_, _Dr. Slump_, _Neko Majin_, _Jaco_, _Bardock_, _Dragon Ball SD_             | Éditions japonaises/françaises, volumes/chapitres et variantes couleur/N&B        |
| Éditions anglaises         | _Dragon Ball_ et _Dragon Ball Super_                                                                   | Éditions/volumes en anglais reliés à l'œuvre déjà cataloguée                      |

## Critères d'achèvement

- Toutes les catégories demandées figurent dans l'inventaire, avec couverture et lacunes
  visibles ; les éditions, langues et variantes couleur/N&B sont séparées correctement.
- Le catalogue existant n'est pas dupliqué : les ajouts sont reliés aux identifiants et aux
  fiches déjà publiés, et la chronologie n'inclut que des relations sourcées.
- Chaque entrée a une provenance vérifiable, un état de complétude et les langues/éditions
  disponibles.
- Les transcriptions japonaises sont conservées comme sources principales et reliées aux
  traductions correspondantes.
- Les databooks incomplets sont recensés sans violer le gel OCR/traduction.
- Les contrôles ciblés et les gates applicables passent, le commit est poussé sur `main`,
  le déploiement DBFR est effectué via SSH et les sondes de production confirment les
  changements livrés.
- Tout élément bloqué par une source indisponible, une dépendance ou un échec de gate est
  listé avec la prochaine action.
