<!-- SPDX-License-Identifier: Apache-2.0 -->

# Livraison des 17 tomes SOSH manquants

## Objectif confirmé

Le propriétaire a précisé le 15 octobre 2026 que la demande porte sur les
17 tomes manquants pour compléter les 18 SOSH. La mention précédente « 177 »
est remplacée par cette clarification. La collection contient bien 18 tomes
selon [le communiqué primaire Shueisha du 12 mai 2016](https://www.dreamnews.jp/press/0000131506).
Conserver les identités canoniques existantes : série `SOSH`, volumes 701–718,
numéros 1–18. Aucune extension à 177 ni création de 159 notices n’est nécessaire.

La livraison attendue est une lecture publique complète de chaque édition,
avec vraies planches ordonnées, pagination vérifiée, provenance, historique
éditorial et contrôle du lecteur réellement servi. Le tome 1 reste inclus dans
l’audit final : ses 381 images listées et leurs réponses HEAD ne prouvent pas encore le
décodage, le rendu ni la conformité intégrale à l’édition imprimée.

Suivi : [GOAL.md](../../../GOAL.md), [TODO.md](../../../TODO.md),
[REPRISE.md](REPRISE.md). Les autres 110 tomes du catalogue et le wiki restent
des demandes distinctes ; leur progression ne compte pas pour SOSH.

## État vérifié et manque réel

Au contrôle public du 15 octobre :

- `/api/manga` présente 18 notices SOSH ; tome 1/ID 701 possède le chapitre 35001,
  avec 381 images listées, sans échec HEAD sur ces URLs.
- Les tomes 2–18/IDs 702–718 n’ont pas de chapitre public lisible.
- L’index CDN épinglé contient 381 fichiers dans le dossier du tome 1 et un seul
  `001.jpg` par dossier des tomes 2–18. Les fichiers des tomes 2,3,18 ont été
  téléchargés, vérifiés par SHA/taille et vus : ce sont des couvertures.
- Le pool a acquis 160 fichiers privés (154 images,6 PDF),7589431 octets vérifiés,
  dont aucun n’est qualifié comme planche SOSH ; inbox de publication vide.
- L’index privé compte 3580 documents et 24131 fragments FTS,0 vecteur. Les candidats
  `approved` sont des observations d’URL et ne sont pas des scans validés.
- Les 17 ISBN disposent de notices OpenBD reçues. Le refus robots de NDL concerne
  `/api` bibliographique et ne doit pas être traité comme un refus de 17 galeries.

Le pool Bun est installé sur la fabrique avec 16 slots et une frontière SQLite
persistante ; le timer de handoff et le consommateur de publication DBFR sont
actifs/activés. Les captures privées, les index et les refus demeurent protégés.

## Ordre d’exécution

### 1. Registre précis des 17 tomes

Pour chaque ID 702–718, rapprocher les snapshots canoniques du catalogue, du
chapitre/stub et de la notice primaire : ISBN, titre japonais, date, pagination,
langue, format et source. Les titres et numéros ne sont pas extrapolés d’un
autre tome. Les bornes actuelles du contrat SOSH (18 volumes,IDs 701–718) sont
cohérentes avec le périmètre confirmé et sont conservées.

Produire un registre privé par tome contenant : source bibliographique,
pagination imprimée attendue, galerie/source réelle des scans, nombre d’images
attendues, doubles pages, couvertures, suppléments, pages acquises/absentes,
qualifications et dernier reçu de publication. Toute contradiction reste
explicite et empêche de déclarer le tome complet.

**Porte 1 :**17 identités/ISBN réconciliés ; pagination étayée pour chaque tome ;
snapshots complets et hashes conservés. Une notice ne fournit pas des scans.

### 2. Sources de pages et collecte récursive

Utiliser Aphrody Web pour crawl, scrape et extraction ; Obscura uniquement pour
les pages nécessitant un navigateur ; le pool Bun orchestre budgets, files,
reprises et reçus. Le worker de campagne consomme déjà les propriétaires
`aphrody web dragon-ball crawl` et `index`. Ajouter une dépendance externe
seulement si un manque réel subsiste dans ces capacités.

Pour chaque tome, trouver une distribution autorisée de ses planches ou des
originaux identifiés fournis dans le périmètre autorisé. Relier chaque image à
sa capture native et à l’édition exacte. La permission de publication doit être
explicite dans la politique source, selon l’attestation propriétaire existante
et la provenance des médias. Respecter robots, restrictions d’accès et budgets ;
aucun contournement de paywall, DRM ou contrôle d’accès.

Les fichiers complets restent privés jusqu’à qualification. Un reçu `asset done`
de GET/HEAD, une couverture, un PDF de communication ou une URL découverte ne
vaut pas une planche acquise. La recherche Google anonyme indisponible reste
consignée ; les sources directes permises continuent indépendamment.

**Porte 2 par tome :** source exacte et autorisée de toutes les images, pagination
de référence, captures immuables et politique de publication épinglées.

### 3. Fiabilité des captures et acquisition privée

Le process du pool doit charger le code réellement qualifié. Le service a été
rechargé par Infra à 15:23, PID 140289, après qualification et installation CAS
des deux fichiers du correctif `efb921af`. Il a rétabli 241 captures legacy ayant
perdu uniquement le BOM UTF-8 : taille et SHA reconstruits sont exactement ceux
du reçu d’origine. La reprojection et l’indexeur natif réel ont intégré ces 241
documents ; les 23 captures EUC-JP altérées restent refusées. La frontière et les
reçus originaux sont conservés. Les nouvelles captures utilisent les gardes
charset strictes déjà testées, sans réparation spéculative.

Acquérir les pages par `manga-source-pool`, projeter les candidats exacts par
`manga-source-pool-projection`, épingler les objets par
`manga-acquisition-planner`, puis valider par `manga-publication-validation`.
Conserver source, taille, type raster, SHA256, dimensions et ordre par image.
Les acquittements et checkpoints permettent une reprise sans doublons.

Commencer par un tome pilote intégral. Ajuster ensuite la concurrence à la
capacité observée du VPS et aux limites par source, en conservant le budget
mémoire et la place nécessaires aux builds. Une machine occupée ne démontre
pas une couverture utile ; mesurer les pages réellement acquises.

**Porte 3 par tome :** toutes les images privées présentes et décodables, SHA et
tailles exacts, pagination et doubles pages rapprochées, absence de doublons ou
trous inexpliqués, relecture visuelle indépendante. `publicationExtent.kind`
vaut `full` seulement après cette qualification. Les aperçus gardent `preview`.

### 4. Publication backend sans rebuild Next par tome

Le chemin de données est : source privée qualifiée → bundle épinglé → objets
CDN → writer éditorial transactionnel → projection/index manga CDN → réplica →
invalidation runtime → relecture publique. `manga-publication-worker` orchestre
ces propriétaires avec phases persistantes et reprises idempotentes.

Préparer chaque tome avec snapshots frais du volume et du chapitre, backup
vérifié et plan du writer. Appliquer par `manga-publication-editor` et
`import-sosh-readers`, puis relire données et `wiki_revisions`. Les stubs vides
ne deviennent visibles qu’avec un manifeste exact et une activation explicite.
Les conflits CAS déclenchent une nouvelle préparation, sans écraser une édition
staff. Pas de `db:push`, de PATCH générique des pages ni de writer SQL parallèle.

Les médias utilisent les chemins déterministes collection/tome/hash et un index
de publication atomique. L’index manga publié est déjà lu au runtime ; la source
CDN du site se rafraîchit toutes les 30 secondes, mais les pages/API déclarent
encore `revalidate=3600`. Le correctif `f5427c5b` implémente la revalidation
authentifiée et bornée aux routes manga, après qualification du nouvel index,
et la branche au worker avant sa relecture finale. Il réinitialise le cache
processuel concerné et garde l’exclusivité du lot pendant les reprises. Il
doit maintenant être inclus dans l’image et qualifié au runtime ; il ne prétend
pas purger les caches edge. La relecture de l’URL réellement publique reste
la porte de succès.

Une livraison de code est nécessaire pour installer cette capacité. Ensuite,
l’ajout des 17 tomes et leurs corrections sont des publications de données sans
`next build`, rebuild de l’image du site ou redéploiement de code par tome.

**Porte 4 par tome :** objets publics conformes aux hashes, chapitre/pages/étendue
exacts, backup/révision/relecture présents, invalidation runtime acquittée et
API publique concordante. Une publication CDN seule ne clôture pas le tome.

### 5. UI, API et lecteur public

Préserver les 18 identités, filtrage SSR/client SOSH, recherche liée à l’édition,
pagination et liens voisins. Chaque carte indique correctement aperçu, lecture
complète ou indisponibilité. Vérifier catalogue, détail de volume, chapitre et
route de chaque image, sans charger toutes les planches dans la grille initiale.

Tester les cas 17 stubs vides, absence/mauvais ordre d’image, conflits CAS,
reprises, aperçu/intégral et cache ancien. Les chaînes d’interface passent par
les dictionnaires fr/en/ja. Les corrections du code sont qualifiées avec les
gates propriétaires Bun et les tests ciblés ; les migrations historiques restent
immuables.

**Porte 5 :** source, API, UI et contrat d’étendue cohérents ; aucune carte ou
couverture ne fait croire à un tome complet ; aucune régression du tome 1.

### 6. Livraison progressive et réception

Livrer le code depuis un SHA épinglé, construire et livrer par
`scripts/deploy/release.sh` (image vérifiée, activation via l’entrée Infra de DBFR). Un
seul propriétaire de build/ship ; ne pas déplacer ses entrées pendant le lot.
Vérifier version/image/release active, santé, CDN et chemin de rollback.

Après le tome pilote complet, publier les 16 autres par vagues de 2–4, sans build
Next pour ces vagues de données. Pour chaque tome, vérifier toutes les images
et les parcours réels à 390/1280 px : décodage (`naturalWidth>0`), largeur positive,
pagination, ordre, changements de mode, retour/rechargement et absence de
débordement. Refaire les erreurs réseau après stabilisation avant de conclure.

**Porte 6 :**18/18 tomes lisibles et complets, provenance/pagination de chacun
prouvées,17 nouveaux reçus de livraison, audit intégral du tome 1, zéro image
manquante et aucun conflit/reprise de publication non résolu.

## Compteurs de progression

| Mesure | Cible |
|---|---|
| Identités existantes réconciliées |18/18|
| Tomes manquants avec source intégrale qualifiée |17/17|
| Tomes manquants acquis et relus |17/17|
| Nouveaux chapitres et médias publiés vérifiés |17/17|
| Éditions complètes rendues en production |18/18|

Les compteurs proviennent des manifestes, reçus et readbacks réels. Les détails
de collecte restent privés ; le public voit les ressources autorisées et les
statuts éditoriaux utiles. Le wiki et les autres collections avancent en
parallèle, sans gonfler ces compteurs SOSH.
