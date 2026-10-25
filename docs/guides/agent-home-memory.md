<!-- SPDX-License-Identifier: Apache-2.0 -->
# Mémoire visuelle, Obsidian et retrieval privé

Les notes revues du domaine DBFR vivent dans le dossier `memory/` de son home
canonique. Ce dossier peut être ouvert comme coffre Obsidian ; les mêmes fichiers
alimentent les consommateurs existants. Les brouillons et les reçus restent sous
`notes/`, hors du corpus mémoire. Les scans originaux sont archivés par SHA-256
dans `memory/attachments/`. Une illustration générée ne sert pas de preuve.

La documentation officielle consultée par Context7 confirme le stockage en
[fichiers Markdown](https://obsidian.md/help/data-storage) et l’ouverture d’un
[dossier existant comme coffre](https://obsidian.md/help/manage-vaults). Aucun
plugin tiers n’est nécessaire. Ne pas imbriquer deux coffres. La commande URI
`obsidian://open` cible un coffre déjà enregistré ; elle ne remplace pas son
enregistrement initial par l’interface officielle.

## Curater une observation

`scripts/ops/agent-home-notes.ts` réutilise la résolution de home, l’écriture
atomique et la détection de données sensibles de leurs propriétaires. Son
manifeste privé de version1 contient un identifiant anglais, un titre, la
continuité, la date d’observation, les observations, leurs limites et les sources
locales avec SHA-256 et localisateur. Une source peut aussi porter son URL HTTPS.
Une note revue ajoute l’identité du relecteur et sa date.

Les SHA-256 écrits dans `observations` sont réservés aux pièces de preuve et
doivent tous figurer dans `sources[]` avec leur archive vérifiée. Les hashes de
manifestes, d’index ou d’artefacts techniques restent dans leurs métadonnées et
reçus, pour éviter de les confondre avec une source visuelle.

Un brouillon (`status:draft`) reste dans `notes/inbox/`. Une note revue
(`status:reviewed`, `visibility:private`) rejoint `memory/`. L’application exige
le SHA du manifeste ; le remplacement d’une note différente exige aussi le SHA
de la version précédente.

```sh
bun scripts/ops/agent-home-notes.ts --manifest <manifest-prive.json> --home <home-canonique>
bun scripts/ops/agent-home-notes.ts --manifest <manifest-prive.json> --home <home-canonique> --apply --expected-sha <sha-manifeste>
```

`--init-notes` crée uniquement le dossier de notes d’un home canonique absent ;
ce mode ne prétend pas initialiser le persona ou un profil Aphrody complet.
Pour une mise à jour, ajouter `--previous-sha <sha-markdown-actuel>`.
Les sources et leurs archives sont vérifiées avant écriture, les liens vers les
pièces archivées sont relatifs au coffre.

## Index Shenron dérivé

```sh
bun scripts/ops/agent-home-notes-index.ts --home <home-canonique>
bun scripts/ops/agent-home-notes-index.ts --home <home-canonique> --apply
```

Le CLI ne prend que les notes présentes dans le registre de revue et dont le
Markdown correspond encore au SHA revu. Une édition dans Obsidian doit donc
être relue et réimportée avant réindexation. Il réutilise le chunker natif
`aphrody pure rag chunk --profile shenron_parity`, puis le writer et le schéma
VFS/RAG existants. Il écrit son dérivé privé sous
`notes/private-notes-vfs.sqlite`, sans remplacer un VFS étranger au bridge.
Un échec de découpage ou de validation conserve le précédent dérivé.

Ce fichier peut être fourni explicitement à un hôte **local privé**, par
`SHENRON_VFS_DB`. Le moteur de chat commun peut alors le consommer sur ses
surfaces site, bot et desktop. Le backend extractif existant permet de qualifier
retrieval et citations sans appeler de modèle externe. La mémoire de conversation
par utilisateur conserve son propriétaire distinct.

Le MCP propriétaire en stdio peut lire ce même schéma par
`APHRODY_DRAGONBALL_RAG_DB`, avec `SHENRON_LOCAL_RAG=1` et
`dragonball.rag_search({query:"…",local:true})`. Cette configuration privée ne
se transporte pas sur un daemon MCP public. Les endpoints RAG publics gardent
leur filtre `publicOnly` ; une note privée ne devient pas un article publié.

## CLI Windows et connexion Codex locale

La livraison qualifiée du 25 octobre 2026 utilise le commit
`d774025545e1a40037711674f7812ed2256b063b`. Les exécutables Windows 1.4.5 ont
été construits depuis cet arbre propre, puis installés sans écrasement sous
`<home-canonique>/bin/`. Leur nom versionné et leur SHA identifient la livraison :

| Exécutable | SHA-256 |
| --- | --- |
| `shenron-d7740255.exe` | `4d4fa07f0484e4c2d27103eecced890b8e9025e8558d2a647c6293360cac0f72` |
| `shenron-mcp-d7740255.exe` | `05a6d5b3f6e4a1091679cecddf63d93e8e916565f3aee95f7270b7861ccc85d5` |

Dans un terminal PowerShell local privé dédié, la lecture du home Windows
standard du profil DBFR se reproduit ainsi :

```powershell
$dbfrHome = Join-Path $env:USERPROFILE ".aphrody/workspaces/dbfr"
$env:APHRODY_DRAGONBALL_RAG_DB = Join-Path $dbfrHome "notes/private-notes-vfs.sqlite"
$env:SHENRON_LOCAL_RAG = "1"
$env:APHRODY_AUTO_FALLBACK = "0"
& (Join-Path $dbfrHome "bin/shenron-d7740255.exe") rag local "Nail" --limit 3 --json
```

Cette commande lit l'index existant. Les extraits sont centrés sur les termes
recherchés, avec des bornes Unicode sûres ; un identifiant de source privée
reste opaque, sans URL publique inventée.

Le serveur global **du poste** `shenron_memory` est enregistré dans la
configuration Codex utilisateur, suivant la
[configuration MCP officielle](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).
Son transport stdio lance le MCP versionné depuis le home. Sa liste
`enabled_tools` contient seulement `dragonball.rag_search` et
`dragonball.rag_context`, avec annotations de lecture seule. Les trois variables
de l'exemple sont imposées au serveur : moteur local forcé ; repli automatique
désactivé. Les lectures qualifiées restent hors réseau, sans secret de connexion.

Le helper privé revu `bind-memory.ts` a appliqué ce binding avec sauvegarde
protégée, comparaison des SHA et lecture indépendante de la configuration
résultante. Les reçus restent dans
`var/reports/wiki-codex-memory-binding-20261025/`, hors Git. Le serveur installé
a répondu aux deux outils sans argument `local:true`, ce qui vérifie le
forçage local par l'environnement. L'enregistrement global et ces appels stdio
ne prouvent pas le chargement dans la session Codex courante ; ce chargement
reste à contrôler après rafraîchissement ou dans une nouvelle session.
Le corpus est mémorisé pour la durée du processus MCP : après réindexation,
recréer ce processus privé puis vérifier le passage effectivement retourné.

## Carte du coffre et procédure de capture

```sh
bun scripts/ops/agent-home-knowledge-map.ts --home <home-canonique>
bun scripts/ops/agent-home-knowledge-map.ts --home <home-canonique> --apply
```

Cette commande génère `memory/Knowledge-map.md` avec des liens relatifs vers les
notes du registre de revue dont le SHA courant correspond encore à la version
relue. Elle partage cette validation avec le consommateur VFS, ignore les
brouillons et ne remplace pas une note manuelle de même nom. La carte est un
outil de navigation, pas une preuve canonique ; elle reste hors du registre
des observations indexées par le bridge. Une seule note disponible ne constitue
pas un second cerveau complet.

Le parcours commun est **capture → revue → archive → index → consommateur**.
La capture conserve la continuité, le localisateur, le scan et les limites dans
un brouillon hors mémoire. La revue vérifie les faits et les SHA. L’archive
préserve chaque pièce originale ; la promotion compare la version précédente.
L’indexation passe ensuite par le VFS privé ou l’indexeur natif borné, puis la
qualification vérifie le chemin exact du résultat et les citations du vrai
consommateur privé. Toute édition Obsidian exige une nouvelle revue avant
réindexation.

Une analyse de qualité d’image candidate peut avoir sa note distincte et
explicitement non canonique. Une illustration générée, un rendu candidat ou
une appréciation visuelle ne remplace jamais un scan primaire comme preuve
d’un fait du récit.

## Index natif du home

Le home natif Aphrody et le VFS Shenron sont deux consommateurs existants :
copier le Markdown ne synchronise pas leurs index. Le préparateur vérifie
les SHA du manifeste, de la note et de chaque pièce avant d’émettre un plan :

```sh
bun scripts/ops/agent-home-native-note.ts --home <home-canonique> --manifest <manifest-prive.json> --expected-source-sha <sha-markdown> --expected-manifest-sha <sha-manifeste> --out <plan-prive.json>
```

Il n’exécute aucune mutation distante et n’a pas d’option d’application. Le
propriétaire Infra réalise ensuite le transfert privé, le backup natif et
`aphrody home --profile dbfr index` sur un répertoire ne contenant que la note,
avec un label dédié. L’indexeur retire les documents disparus de son label :
un label existant associé à un corpus plus large ne se réutilise pas pour une
note isolée. Le contrôle final porte sur le chemin exact du hit, le nombre
de documents, l’absence de suppression et l’idempotence.

## Qualification et limites

Les preuves datées du lot restent privées sous `var/reports/`. Elles couvrent
la recherche sur le véritable SQLite dérivé, le moteur commun et ses citations,
un POST HTTP local ainsi qu’un appel MCP stdio. Une capture de configuration ou
un fichier produit ne prouve pas à lui seul le branchement d’un service actif.

Un ancien essai de chat à deux tours a retrouvé une note, mais sa réponse a
rendu ambigu ou inversé le sens de l'assimilation. Ce reçu historique est
invalidé comme preuve factuelle de direction. La version finale revue (V3) place
en tête de section « Piccolo assimile Nail ; Nail est assimilé par Piccolo ».
Les quatre appels aux outils installés `rag_search`/`rag_context` et la lecture
native DBFR retrouvent cette direction. La fenêtre bornée peut toutefois couper
l'URL primaire : les preuves complètes restent à ouvrir dans la note et ses
archives. Une complétion V3 unique a ensuite donné la bonne direction et la
séquence visuelle attendue, avec un contexte de 842 caractères fourni depuis la
note verbatim. Les pages étaient identifiées, mais les balises de citation
attendues manquaient. Ce contrôle ne valide ni une récupération de bout en bout
depuis l'index ni le partage entre deux chats distincts. Le refus observé sur un
contrôle négatif historique conserve sa portée limitée à cet essai.

Le binding local ne raccorde pas les notes au site, au bot ou au MCP publics.
Un usage privé de production exige son admission autorisée et sa configuration
par le propriétaire Infra ; fournir ce fichier aux processus publics exposerait
le corpus. Les preuves locales ne valent pas déploiement d'un chat privé de
production.

Le dérivé de notes de ce lot est lexical (`vectors:0`). Le client E5 existant
appartient à `packages/db/src/vfs/rag.ts` ; le fournisseur et son espace doivent
être qualifiés avant enrichissement vectoriel. Le CLI home inspecté construit
son indexeur sans embedder et fusionne des canaux lexicaux : son appellation
« hybrid » ne prouve pas une recherche sémantique. Aucun `rag:build` global au
premier plan ou sur le bot de production n’est nécessaire à l’import borné.

L'expérience E5 a produit des passages non pertinents sur les contrôles
négatifs. Son artefact reste expérimental et le chemin privé standard reste
lexical ; ces essais ne qualifient pas une qualité sémantique générale.

## Option vectorielle privée

L’indexeur privé possède une option explicite `--embedding aphrody`, avec les
préconditions `--expected-note`, `--expected-source-sha`,
`--expected-manifest-sha`, `--expected-index-sha` et `--expected-chunks`.
Le défaut reste lexical. Le job refuse un corpus différent, un batch dépassant
seize passages ou un passage de plus de1400 caractères effectifs ; la limite
du chunker natif peut être souple sur certains blocs Markdown. Aucun fait
ne se tronque silencieusement pour satisfaire cette limite.

Le transport est celui du client propriétaire `createAphrodyCompute` :
`POST /api/v1/shenron/embed`, avec `texts` et `kind` query/passage.
Ce client n’ajoute pas de préfixe ; le serveur applique le préfixe E5.
Ne pas le remplacer par l’ancien client direct `/embeddings`, qui applique
ses propres préfixes. L’option `requireModel` vérifie le namespace exact du
modèle de réponse sans modifier le protocole HTTP existant.

La génération privée vérifie modèle, dimension384, valeurs finies et normeL2,
préserve une sauvegarde lexicale0600 et publie par comparaison du SHA précédent
puis remplacement atomique. Une erreur d’embedding ou de qualification conserve
l’index précédent. Les artefacts d’expérience et leurs métriques restent privés.

Le host reçoit l’adaptateur de requête par `privateQueryEmbedding`, seulement
dans un processus local privé. Cette injection est refusée sur les profils
public **et production**, sur le backend éditorial Aphrody, ou lorsque le modèle
ne correspond pas au namespace qualifié et aux métadonnées du VFS. Le port RAG
public conserve sa propre voie filtrée. Le MCP local natif actuel demeure lexical,
même si un fichier de recherche contient des vecteurs.

Une citation ou un voisin vectoriel ne prouve pas la pertinence d’un passage.
La qualification compare des paraphrases sourcées et des requêtes négatives
sans rapport, avec rangs/scores et contrôle public vide. Si la projection de la
note n’est pas discriminante, garder le lexical par défaut et revoir la
projection avec le chunker propriétaire ; ne pas fabriquer un seuil de score.
