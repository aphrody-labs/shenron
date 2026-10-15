<!-- SPDX-License-Identifier: Apache-2.0 -->

# Plan de livraison des 177 tomes SOSH en production

## Objectif et état de départ

Livrer en production 177 tomes SOSH identifiés sans ambiguïté, chacun avec son
identité éditoriale, ses pages manga complètes et ordonnées, son historique
d’import, ses médias publics vérifiés, et une lecture utilisable sur le site.
La progression est mesurée par tome terminé, jamais par nombre d’URLs explorées,
de couvertures ou de lignes de catalogue.

Au contrôle public du 15 octobre 2026, `/api/manga` ne présente que 18 volumes
SOSH (IDs 701–718) : le tome 1 a un chapitre et 381 pages listées ; les tomes
2–18 n’ont pas de chapitre. Les 381 URLs listées répondent en HEAD, ce qui ne
qualifie ni leur décodage ni une édition complète. La cible de 177 dépasse donc
de 159 la liste SOSH actuellement visible. **La première porte consiste à
concilier cette cible avec un inventaire primaire des 177 éditions** : aucun
numéro, ISBN ou volume ne sera extrapolé à partir des 18 notices actuelles.
Si 177 désigne un périmètre différent de 177 éditions SOSH distinctes, la liste
de référence doit exprimer ces identités avant l’ingestion.

L’audit privé du pool au 15 octobre complète ce constat : 98 163 candidats
« approved » sont des observations d’URL (11 613 URLs distinctes), pas des scans ;
160 fichiers acquis (154 images, 6 PDF) ne sont reliés à aucune planche SOSH ;
0 candidat est dans l’inbox de publication. L’index privé contient 3 580 documents
et 24 131 chunks FTS, 0 vecteur ; 264 captures à SHA divergent sont en quarantaine,
cause non déterminée. Les 17 ISBN SOSH2–18 ont des notices OpenBD reçues malgré
le refus robots ciblant l’API NDL. Ces résultats servent de référence pour ne pas
confondre crawl, indexation bibliographique, acquisition et livraison de pages.

Le suivi de preuve courant est dans [REPRISE.md](REPRISE.md), l’objectif actif
dans [GOAL.md](../../../GOAL.md), et les actions dans [TODO.md](../../../TODO.md).

## Règles de livraison

- Une édition est identifiée par les champs canoniques réconciliés (série, numéro,
  ISBN lorsqu’il existe, langue, format et couleur) et par sa notice éditeur.
- Une notice, une couverture, une page de prévisualisation ou un succès HTTP ne
  vaut pas un tome complet. Les extraits restent marqués `preview`.
- Le périmètre `full` exige un nombre de pages relu égal à l’étendue éditoriale
  documentée. Les pages, doubles pages, pages couleur et suppléments sont
  distingués ; les scans manquants ne sont jamais remplacés par des images
  fabriquées ou répétées.
- Les captures complètes et les fichiers acquis restent dans les espaces privés
  de travail. Seuls des médias ayant une provenance et une autorisation de
  republication explicites peuvent rejoindre le CDN public. Les restrictions
  `robots.txt`, paywalls et protections de fournisseurs ne sont pas contournées.
- Le contrat actuel impose des limites spécifiques à SOSH : manifestes de
  1–18 tomes, IDs 701–718 et `id = 700 + numéro`. Pour 177 identités, ces
  suppositions doivent être remplacées par des identifiants canoniques uniques
  et une plage bornée adaptée, avec migration de contrat, lecteurs et tests.
- La base de production est écrite exclusivement par le writer éditorial
  transactionnel, avec backup vérifié, comparaison optimiste/CAS, révision et
  relecture. Pas de `db:push`, de PATCH générique ni d’écriture SQL parallèle.

## Étapes et portes

### 1. Inventaire de référence des 177 éditions

Construire une liste versionnée de 177 identités à partir des catalogues primaires
Shueisha et des ISBN officiels : numéro de tome, titre japonais, ISBN/EAN,
date/format/langue/couleur, URL de notice, pagination imprimée et liens de
distribution numérique officiels. Conserver URL, date d’observation, capture
privée et SHA-256 pour chaque source.

Comparer cette liste aux 18 lignes publiques existantes, aux chapitres, aux autres
séries/éditions et à la base canonique. Détecter les doublons d’ISBN, les éditions
distinctes du même numéro, les numéros absents et les contradictions. Les 159
identités non présentes ne sont créées qu’après cette comparaison, par les
writers canoniques avec snapshots, backup, CAS et historique. Une notice d’éditeur
peut établir le nombre de pages imprimées, mais jamais fournir des scans.

**Porte 1 :** 177 identités uniques approuvées, aucun conflit de série/ISBN/
édition, écart documenté entre source primaire et catalogue courant, sauvegarde
et relecture des lignes préparées. Tant que cette porte est rouge, aucun lot de
177 ne peut être déclaré.

### 2. Qualification des sources et des droits médias

Pour chaque édition, relier la notice primaire à une source réelle des pages :
distribution officielle intégrale ou ressource fournie dans le périmètre autorisé.
Enregistrer distinctement la notice bibliographique, la preuve de pagination et
la source de chaque image. Les politiques de collecte déclarent domaine, robots,
budget, limites de taille et permission de publication ; les droits éditoriaux
déjà attestés par le propriétaire ne dispensent pas d’établir la provenance de
chaque ressource et de respecter les contrôles d’accès du fournisseur.

Le crawl récursif Bun/Aphrody est limité aux sources officielles autorisées,
conserve captures et fichiers dans les profils privés, et écrit des index/reçus
reprenables. Une tâche `asset done` qui a seulement fait un GET/HEAD n’est pas une
acquisition : il faut un fichier privé, un SHA, une taille, un type raster et une
preuve de lecture possible. Les refus robots sont conservés et ne sont pas
réessayés avant la fenêtre prévue.

Réutiliser les capacités déjà propriétaires plutôt que d’installer des crawlers
concurrents : Aphrody Web fournit crawl/scrape/extraction, navigateur Obscura pour
les pages officielles rendues par JavaScript, et l’indexeur privé Dragon Ball ;
`manga-source-campaign-worker.ts` orchestre déjà `aphrody web dragon-ball crawl`
et `index`, tandis que `manga-source-pool.ts` gère files, limites et reçus Bun.
Les workers persistants observés sur la fabrique n’ont pas encore produit de
bundle SOSH publiable. L’index privé observé comporte 0 vecteur à ce contrôle ;
un crawl ou un statut de fichier indexé n’est donc pas une preuve de planche ni
de disponibilité publique.

**Porte 2 par tome :** source de page exacte, pagination attendue, règles de
publication, provenance et captures immuables épinglées ; aucun média ne vient
uniquement d’une recherche par similarité ou d’une page de couverture.

### 3. Acquisition privée et contrôle de complétude

Traiter d’abord un tome pilote représentatif, puis des vagues de 4–10 tomes. Le
pool actuel est configuré pour 16 workers persistants et un timer de handoff ;
un seul worker était actif au snapshot récent. Garder 16 comme plafond initial,
puis ajuster la concurrence par source selon les
budgets, les réponses et la capacité observée de la fabrique. Séparer le travail
réseau du traitement CPU (validation, décodage et transformations). Mesurer CPU,
mémoire, débit et espace avant d’augmenter la concurrence ; préserver la place du
build et du store de production. La permanence du service ne justifie pas des
requêtes agressives ou des retries sans limite.

Le pipeline de chaque tome est : découverte privée → candidat exact → acquisition
des octets → qualification → outbox privée. Utiliser les contrats existants de
`manga-source-pool.ts`, `manga-source-pool-projection.ts`,
`manga-acquisition-planner.ts` et `manga-publication-validation.ts`. Le candidat
doit relier chaque image à sa capture source native ; l’inventaire distingue
pages manga, couverture et suppléments.

Contrôler le tome par deux passes indépendantes :

1. Vérification machine : compte des images, SHA-256, type, dimensions, lecture
   du fichier, unicité, ordre, continuité, doublons, pages en vis-à-vis, couverture
   et rapprochement avec pagination/source.
2. Relecture visuelle éditoriale de toutes les planches ou d’une procédure de
   comparaison exhaustive reproductible, avec revue humaine des anomalies,
   coupures, pages blanches attendues, couleur et ordre de lecture. Aucun OCR ni
   correction de texte n’est inclus implicitement dans la livraison du lecteur.

**Porte 3 par tome :** totalité des médias épinglée ; toutes les pages attendues
expliquées ; aucune anomalie bloquante ; revue signée ; `publicationExtent.kind`
vaut `full` seulement si la pagination complète est prouvée. Sinon le tome reste
privé ou est publié explicitement comme aperçu si cela correspond à la demande.

### 4. Préparation, publication CDN et import éditorial

Pour chaque tome qualifié, produire un bundle indépendant et un manifeste de vague
avec identité, URL source, étendue, ordre, pages, dimensions, tailles et hashes.
Le bundle passe `qualifyBundle`, qui vérifie snapshots complets du tome et du
chapitre, capture native, ISBN, domaines et inventaire image. Le préparer par
`manga-publication-editor.ts`, faire un backup de catalogue contrôlé et relu, puis
exécuter le plan du writer avant l’application.

Publier les médias avec le chemin de projection CDN géré par
`manga-publication-worker.ts`, des chemins déterministes par collection/tome/hash
et un index de publication atomique. En cas de reprise après interruption,
réutiliser les reçus idempotents ; en cas de conflit CAS, arrêter et rebaser sur un
nouveau snapshot au lieu d’écraser le travail du staff. Importer le chapitre et
les pages par `import-sosh-readers.ts` / le writer dédié, relire le réplica bot,
l’API publique et l’historique `wiki_revisions`. Activation visible après que les
assets publics sont vérifiables ; toute correction/retrait reste logique et
auditée.

**Porte 4 par tome :** médias CDN servis depuis l’URL finale et hashes conformes ;
un chapitre visible avec pagination exacte et étendue complète ; historique,
backup, plan et réponse de relecture archivés ; aucune page publique ne pointe
vers une ressource manquante.

### 5. Contrats SOSH et expérience publique à l’échelle 177

Avant d’importer au-delà de la capacité actuelle, généraliser le schéma
`sosh-reader-manifest.ts` : retirer la borne 18 et l’équation d’ID séquentiel,
fixer une borne adéquate, imposer l’unicité des identifiants/numéros/chapitres et
garder la validation exacte des pages/étendues. Revoir aussi
`manga-reader-handoff.ts`, le writer/importer, l’API `/api/manga`, les types
client/serveur et le rendu de `/wiki/manga?collection=SOSH`. Ajouter des tests
de contrats pour 18 puis 177 identités, trous de numérotation, ISBN dupliqués,
numéros répétés sous formats différents, collisions d’ID, doublons de pages,
aperçus et tomes complets.

Le catalogue public n’affiche que les volumes éditorialement visibles ; les
filtres de collection et recherche restent corrects en SSR et après hydratation.
Chaque entrée indique distinctement lecture complète, aperçu ou indisponibilité.
Tester liste et détail, API, pagination, ordre de lecture, langues fr/en/ja,
retour arrière, URL directe et état après rechargement. La page SOSH doit présenter
les 177 entrées sans charger tout leur contenu média au premier rendu.

**Porte 5 :** aucun chapitre/page perdu dans la migration de contrat ; tests de
régression verts ; pas de faux statut « complet » ou de titre de tome fabriqué.

### 6. Déploiement progressif en production

#### Publication de données sans rebuild Next

Séparer strictement la livraison du code de celle des éditions. Le changement de
contrat pour 177 identités et les invalidations de cache sont un déploiement de
code unique. Ensuite, chaque lot de données suit les workers backend : import
transactionnel PostgreSQL → projection et objets médias CDN versionnés → mise à
jour atomique de l’index manga → relecture API/CDN. Ce chemin n’exécute ni
`next build` ni reconstruction d’image Next par tome.

Le site lit déjà l’index publié `.../publications/manga-catalogue/index.json` ;
`manga-data.ts` le sonde sans cache HTTP et conserve sa source 30 secondes. Les
pages `/wiki/manga`, `/wiki/manga/volume/[id]` et les API manga déclarent
actuellement `revalidate = 3600`, et le worker de publication n’appelle pas encore
de revalidation Next runtime. Le plan doit donc inclure une invalidation ISR
au runtime, appelée par le worker uniquement après commit/lecture CDN réussis,
pour la page catalogue, les API et les routes de tomes/chapitres touchés. Cette
invalidation est signée, limitée aux chemins manga autorisés et idempotente ; si
elle est momentanément indisponible, l’ISR existant sert de repli, avec une
fraîcheur maximale nominale d’une heure. Elle ne déclenche jamais un build.

#### Crawler, scraper, indexeur et publication automatisés

Le service 24/7 produit des reçus privés et des candidats. Un orchestrateur de
publication séparé consomme seulement les candidats qui satisfont les portes
d’identité, pagination, provenance, autorisation, acquisition et revue. La file
persiste chaque phase et reprend de façon idempotente ; les conflits CAS,
changements de source, quota disque, erreurs robots et images manquantes sont
des états bloquants observables, pas des exceptions à contourner. Chaque lot
qualifié enchaîne sans intervention de build : CDN, writer, miroir, invalidation
ISR, API publique et reçu final. Le dashboard affiche séparément candidats,
acquisitions réelles, tomes relus, publications et rendus vérifiés.

Utiliser Aphrody pour l’automatisation web et les traitements d’index qui lui
appartiennent, et Shenron pour les identités, décisions éditoriales et publication
du lecteur. Les nouvelles dépendances externes ne sont ajoutées qu’en présence
d’un manque mesuré que ces propriétaires ne couvrent pas ; plusieurs crawlers
parallèles augmenteraient les doublons et le risque de franchir les limites par
source.

Après le pilote, publier par vagues de 4–10 tomes et conserver pour chaque vague
un reçu de source, acquisition, revue, backup, CAS, publication CDN, historique,
relecture d’API et rendu. Le nombre de vagues dépend de la taille réelle des tomes
et des limites des sources ; ne pas promettre une durée avant le pilote et le
débit mesuré.

Le code et l’image commune sont construits sur la fabrique sous le verrou lourd,
sur un SHA épinglé. Vérifier que l’image active contient les changements de
contrat et du lecteur ; transférer l’image scellée vers DBFR et l’activer par
Aphrody Infra. Ne pas lancer un build concurrent ou déplacer le SHA pendant le
ship. Après activation, vérifier release active, santé, API et CDN, puis contrôler
avec Bun WebView aux largeurs 390 et 1280 px. Pour chaque tome, confirmer au
navigateur que les images se décodent (`naturalWidth > 0`), que largeur affichée
et pagination sont positives, et qu’il n’y a ni trou ni débordement.

**Porte 6 par vague :** sondes publiques saines, aucune régression de lecteur,
rapport de couverture conservé, chemin de rollback disponible. La vague suivante
ne part qu’après qualification complète de la précédente.

## Tableau de bord d’avancement

Le tableau de bord expose, par vague et par édition :

| Étape | Compteur de réussite |
|---|---|
| Inventaire | identités uniques confirmées / 177 |
| Sources | tomes avec source de pages et pagination qualifiées / 177 |
| Acquisition | tomes avec toutes les images privées hachées / 177 |
| Relecture | tomes avec contrôle complet signé / 177 |
| Publication | tomes avec chapitre et médias publics intègres / 177 |
| Rendu | tomes lus et décodés sur production / 177 |

Chaque compteur est calculé depuis les reçus privés et les sources canoniques,
pas à partir d’une progression déclarative. Les rapports et erreurs de détail
restent privés ; le public voit seulement les statuts éditoriaux utiles.

## Critères finaux de réception

La livraison est terminée uniquement lorsque les 177 identités attendues sont
réconciliées et que, pour chacune :

- l’identité correspond à l’édition officielle et à ses sources primaires ;
- le chapitre public comporte toutes les pages attendues, dans l’ordre, avec une
  étendue `full` prouvée ;
- chaque objet CDN est disponible, décodable et conforme à son SHA de manifeste ;
- backup, comparaison CAS, révision éditoriale et relecture API sont présents ;
- le navigateur de production rend la liste, le lecteur et la pagination sans
  erreur aux largeurs mobile et bureau.

Réception globale : 177/177 à chacune des six étapes du tableau, zéro tâche de
publication en conflit ou en reprise, aucun média manquant, et audit final de
l’API/catalogue/publication CDN après la dernière vague.
