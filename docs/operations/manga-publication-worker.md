<!-- SPDX-License-Identifier: Apache-2.0 -->

# Consommateur permanent des acquisitions manga

`scripts/ops/manga-publication-worker.ts` consomme les acquisitions du propriétaire
`manga-source-pool.ts`. Le processus découvre les candidats à chaque cycle,
réutilise les octets acquis du pool, construit des lots avec un snapshot
administratif frais, puis exécute les writers de provenance, catalogue et CDN.
L'activation du service et la configuration des accès appartiennent à Infra.

```sh
bun scripts/ops/manga-publication-worker.ts --help
bun scripts/ops/manga-publication-worker.ts once /chemin/prive/config.json
bun scripts/ops/manga-publication-worker.ts watch /chemin/prive/config.json
```

Le mode permanent est protégé par le même verrou noyau `flock` que la collecte.
La mort du processus libère le verrou, sans effacement d'un fichier de verrou
supposé périmé. Les appels programmatiques à `runMangaWorker` exigent le même
superviseur exclusif. La file SQLite et les preuves restent dans un dossier 0700.

## Configuration et raccordement

La configuration privée `WorkerConfig` contient :

- `version: 1`, `job`, `outbox` : chemins absolus privés ;
- `candidateInbox` : candidats produits depuis les captures structurées du pool ;
- `sourcePoolJob` : foyer du pool sur la même machine. Le planner lit uniquement
  son `frontier.sqlite`, les reçus `acquisition/done` et les originaux `acquired/` ;
- `handoff` : inbox des archives scellées reçues du VPS, dossier d'import privé
  et SHA du modèle et de la politique. DBFR reconstruit seulement le sous-ensemble
  acquis référencé ; ni credentials ni corpus brut ne circulent ;
- `allowedSeries` : codes exacts des éditions autorisées ;
- `publication` : options du writer CDN, avec son état partagé et ses capacités
  Infra réellement qualifiées. La cible est
  `https://dragonballfr.com/publications/manga-catalogue`, l'index lecteur est
  `https://cdn.dragonballfr.com/publications/manga-catalogue/index.json` ;
- `nativeOriginPreparation` et `editorialBackup` : capacités Infra épinglées par
  SHA. La première prépare l'activation CDN depuis son état courant ; la seconde
  produit un dump PostgreSQL complet et vérifie son inventaire ;
- `replica` : `{kind:"infra",command:"/usr/local/sbin/<writer-proprietaire>"}`
  pour appeler sur DBFR, via Aphrody Infra, les modes `apply` puis `verify`
  produisant chacun `{"ok":true}`. Le wrapper utilise le binaire canonique du
  bot avec `--replica-sync` et les seules tables manga. Un mode
  `{kind:"local",hostname:"<hote-production-qualifie>"}` existe pour un service
  installé directement sur DBFR ; il refuse un autre hostname. `DATABASE_PATH`
  désigne alors le réplica partagé réel du bot ;
- `maxItemsPerCycle` (défaut 2, maximum 32), `maxOutboxFiles` (défaut 5000,
  maximum 10000), `intervalMs` (défaut 60000).

Le processus sur VPS peut lire le pool local ; son réplica passe par DBFR.
Les chemins du profil S3, du manifeste, du module d'activation et du writer de
réplica doivent être qualifiés pour cet hôte. Un fichier d'options appartenant
à DBFR ne prouve pas que ses chemins sont utilisables sur VPS.
Le credential administratif reste dans `SHENRON_API_ADMIN_TOKEN` ; le writer
de provenance utilise la configuration PostgreSQL et le profil de store existants.
Aucun secret n'entre dans les candidats, les arguments ou les journaux.

## Pont automatique depuis une capture

Le schéma exact vit dans
`packages/pipeline/src/dragon-ball/manga-publication-contract.ts` :
`mangaCandidateSchema`, puis `mangaBundleSchema` pour le lot matérialisé.
Le collecteur produit un candidat seulement lorsque sa capture structurée permet
d'identifier une édition, un tome et les images de lecture. Le planner ne classe
pas une image en page manga à partir de son extension.

Un candidat `shenron-manga-acquisition-candidate/v1` fournit :

- `series`, `volumeNumber`, `chapterNumber`, `isbn` ;
- `source.config`, `source.input`, `source.policy` : fichiers absolus et SHA256.
  Le premier est un modèle du pipeline Bun avec un store canonique ; le second
  est l'export natif JSONL ; le troisième porte les droits et domaines existants ;
- `source.documentUrl`, `editionToken`, `volumeToken`, `isbnToken` : repères exacts
  présents dans le titre ou corps de la capture ;
- `expectedImages` : nombre de fichiers attendu selon la source, ou `null` ;
- `pages` ordonnées : `sourceUrl`, `kind` (`manga`, `cover`, `supplement`) et
  `printedPages` (une ou deux pages imprimées, ou `null`).

Toutes les URL image doivent être réellement présentes dans les médias embarqués
de la capture native épinglée. Une notice seule, deux couvertures, un ISBN ambigu
ou un format non pris en charge restent en quarantaine. Le planner recherche
l'unique volume existant correspondant à l'ISBN, la série et le numéro.
L'absence de chapitre est conservée comme telle ; le writer manga canonique
alloue son identifiant sous verrou au commit. Aucun volume ni édition n'est créé.

Le planner vérifie octets, SHA, taille, MIME et signature raster des reçus du pool.
Il conserve une reprise par fichier, avec un budget de 100 nouveaux fichiers et
64 Mio par candidat et par cycle. Il construit le manifeste des médias et une
configuration épinglée du pipeline Bun, puis les snapshots administratifs complets
du volume et du chapitre. Les caches d'acquisition alimentent le pipeline existant
sans relancer un crawl ou fabriquer de nouvelle image.

## Effets et reprise

Les phases persistées sont `queued`, `acquired`, `assets-publishing`,
`assets-published`, `editing`, `edited`,
`publishing`, `published`, `replicated`, `complete` ; un conflit éditorial devient
`conflict`. Les erreurs de disponibilité gardent leur phase avec un délai de
reprise croissant, plafonné à une heure. La file déduplique le SHA du lot.
Les candidats tournent avec un curseur persistant ; un candidat indisponible
n'empêche pas les candidats suivants de progresser.

1. Le pipeline `autoSourcePipeline` possède l'acquisition, le CAS distant,
   sa relecture et la provenance PostgreSQL. Cette étape ne publie pas de média,
   n'active ni entraînement, ni canon, ni indexation implicite.
2. Le writer CDN publie d'abord les images réelles, en conservant le catalogue
   courant. L'importer peut ainsi vérifier les octets publics avant sa transaction.
3. `manga-publication-editor.ts` délègue au writer manga canonique avec snapshot
   complet, dump frais vérifié, comparaison optimiste, révision et relecture.
   Il remplit un placeholder vide ou crée un chapitre réellement absent, sans
   écraser un lecteur existant. La projection superpose ensuite le chapitre relu
   au catalogue public. Les deux étapes CDN ont leurs plans persistés distincts ;
   le propriétaire réconcilie l'état actif avant toute reprise.
4. Le writer du réplica de production est exécuté, puis relu. Le consommateur
   demande ensuite la revalidation runtime décrite ci-dessous, avant de relire
   l'identité, l'étendue et les images exactes dans l'API publique du chapitre.

### Revalidation runtime des lecteurs

Une image contenant `POST /api/admin/manga/revalidate` doit être livrée une fois.
Les lots suivants utilisent cette route sans reconstruire Next. Avant toute
écriture d'un lot, le consommateur vérifie la capacité `readerExtent` de l'API et
interroge cette route avec
`{"schema":"shenron-manga-revalidation/v1","action":"capabilities"}`.
Un ancien serveur ou une capacité incompatible arrête le lot avant les writers.
La route réutilise la garde administrative existante : session administrateur ou
token `SHENRON_API_ADMIN_TOKEN`, transmis uniquement à l'origine canonique.

La demande d'invalidation contient exactement `schema`, `action:"revalidate"`,
`volumeId`, `chapterId`, `pageCount`, `pagesSha256` et `indexSha256`. Le chapitre
est celui relu par l'importer, y compris son identifiant alloué lors d'une création.
`pagesSha256` est le SHA256 de `JSON.stringify` du tableau ordonné des URL HTTPS
absolues des images publiques ; `indexSha256` vient du reçu complet du writer CDN.
Les identifiants sont des entiers positifs, le compte est borné à 2500 images,
le corps JSON à 1024 octets effectivement lus. Aucun chemin n'est accepté.

La route oublie le cache source local de 30 secondes et charge à nouveau la
projection CDN qualifiée, sans repli vers la base éditoriale. Elle exige le digest
d'index demandé, l'appartenance exacte chapitre/tome/édition et le compte et
digest des URL de lecture avant toute invalidation. Elle marque seulement les
chemins littéraux manga : index, recherche API, tome, lecteur, voisins réellement
présents et API des pages du chapitre. Le writer actuel remplit une absence ou
un chapitre vide ; il ne remplace pas une plage existante plus longue.

Le reçu privé `revalidation.json` accompagne `publication.json`. La phase reste
`replicated` jusqu'à la relecture publique réussie. Une réponse perdue ou une API
encore ancienne provoque une nouvelle invalidation et relecture, sans rejouer
les écritures, l'upload ni le réplica. Dès qu'un lot dépasse `queued`, il garde
l'exclusivité du catalogue, y compris pendant son délai de reprise : un second
lot ne peut pas remplacer son index global avant sa qualification. Un changement
concurrent de l'index par un autre propriétaire reste une erreur de digest
visible ; aucun nouveau plan ni acquittement n'est inventé.

Selon la [documentation Next de revalidatePath](https://nextjs.org/docs/app/api-reference/functions/revalidatePath),
un Route Handler programme la régénération à la prochaine visite. Ce reçu ne
prouve pas un rendu navigateur. Il ne purge ni un CDN externe ni les caches des
navigateurs ; les en-têtes HTTP existants conservent leur portée. Le cache source
est local au processus : une autre instance peut garder son ancienne source
jusqu'à 30 secondes, puis doit être régénérée. Les reprises répètent le marquage
si la relecture publique demeure ancienne. Les caches externes restent soumis à
leur propre expiration ou invalidation propriétaire ; le reçu expose explicitement
`edgeCacheInvalidated:false`. Aucun rebuild par lot ne remplace ces contrôles.

`status.json`, les snapshots et les manifestes privés permettent la surveillance.
Une file vide signifie attente d'acquisitions, pas catalogue complet. La présence
de fichiers lisibles n'établit pas une pagination exhaustive : les doubles pages,
couvertures, suppléments et pages imprimées sont des comptes distincts. La preuve
de couverture reste `partial-until-independent-pagination-audit`. Les tests
unitaires du consommateur et du planner ne prouvent ni activation de service,
ni publication réelle, ni rendu navigateur de nouvelles pages.

La diffusion Dragon Ball est couverte par l'attestation propriétaire du
13 octobre 2026 et la demande explicite de publication permanente ; aucune nouvelle
approbation manuelle n'est ajoutée. Une source dont les droits sont refusés reste
refusée. Les manques de scans, d'identité ou de capacités opérationnelles sont
rapportés sans remplacer des pages par des notices ou du texte inventé.

### Lire les compteurs sans les confondre avec des chapitres

Le statut public du pool décrit sa file de recherche. Il conserve le sens
historique de `catalog.verifiedAssets` ; ce nombre n'est pas une couverture
éditoriale ni un total de nouvelles planches.

| Observation                  | Preuve disponible                                                                                 | Limite                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `catalog.verifiedAssets`     | Nombre de tâches `kind='asset' AND state='done'` dans la frontière SQLite                         | Contrôle des références déjà connues du catalogue ; ne compte pas les nouveaux fichiers acquis                                 |
| Acquisitions terminées       | Tâches `kind='acquisition' AND state='done'`, reçus HTTP, SHA, taille et fichier dans `acquired/` | Une acquisition peut être une couverture, un logo, un PDF institutionnel ou un doublon ; vérifier chaque octet et son identité |
| Candidats de publication     | Candidats validés dans `derived/candidate-inbox/`                                                 | L'identité, la galerie ordonnée, les octets, les droits et l'étendue doivent encore traverser les propriétaires canoniques     |
| Quarantaines                 | Reçus dans `derived/candidate-quarantine/` et rapport `derived/progress.json`                     | Le nombre de reçus conservés et le compte du dernier cycle peuvent différer ; une quarantaine n'est pas un chapitre            |
| Chapitres réellement publiés | Reçus du writer canonique, historique, projection CDN et relecture de l'API                       | Ce résultat ne se déduit d'aucun des compteurs précédents ; un extrait reste `readerExtent.kind='preview'`                     |

Un futur champ `acquiredFiles` devrait dédupliquer les SHA et vérifier leurs
fichiers, plutôt que renommer le compteur des tâches. Un champ
`qualifiedChapters` nécessite la preuve du propriétaire de publication ; le pool
seul ne peut pas le calculer. Aucun de ces champs n'est inventé pour combler un
manque de télémétrie.

Le timer de handoff peut sortir avec succès sans transférer de données :
`{"complete":true,"empty":true,"artifacts":0}` indique une file de candidats vide.
Un transfert réel exige l'archive scellée, le descripteur prêt sur DBFR après les
deux SFTP, puis l'accusé durable `export-state.json`. L'import crée ensuite son
propre reçu dans `imports/`, et le consommateur produit un outbox validé. Un état
systemd « success » ne remplace aucun de ces reçus.
