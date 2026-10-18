<!-- SPDX-License-Identifier: Apache-2.0 -->

# File d’exécution

Ce fichier ne duplique ni l’objectif ni les preuves :

- objectif courant : [GOAL.md](GOAL.md) ;
- invariants et architecture : [PLAN.md](docs/reference/root/PLAN.md) ;
- reprise, preuves et incidents : [REPRISE.md](docs/reference/root/REPRISE.md) ;
- consignes agents : [AGENTS.md](AGENTS.md) et [START-HERE.md](START-HERE.md).

## Actions ouvertes

- Terminer la qualification navigateur du lecteur CDN unique Beerus 1 et 2
  (875/876), de la timeline et du générateur GIF du lot `114a2829`, selon
  [le lot vidéo du plan](docs/reference/root/PLAN.md#timeline-vidéo-et-gif--demande-du-18-octobre-2026).
  Sources CDN et writers livrés ; metadata, WebP et GIF publics qualifiés sous
  `ea8ad532`. Le lot final ajoute le filmstrip et les réglages durée/FPS/largeur ;
  28 tests ciblés passent. Vérifier la lecture et le seek publics en 390/1280
  dès que le navigateur de contrôle redevient disponible ; celui-ci ne présente
  actuellement aucun navigateur connecté. Suivre aussi le correctif Infra du
  cache CDN 876 pour garantir les réponses Range 206 sur toutes les régions.

- Exécuter la livraison des 17 tomes SOSH manquants pour compléter 18 selon
  [le plan confirmé](docs/reference/root/SOSH-DELIVERY-PLAN.md). Conserver les
  identités existantes et le contrat 18 tomes. Réconcilier pagination/provenance,
  acquérir un tome pilote intégral puis les 16 autres ; chaque vague passe par
  relecture, backup/CAS, CDN, API et rendu réel en production. Une fois
  l’invalidation runtime déployée, les vagues de données passent par le
  worker/CDN/writer sans rebuild Next par tome.
  Réutiliser l’Aphrody Web crawl/scrape/indexeur et le pool Bun existants ; ne pas
  ajouter un crawler concurrent. Le manque opérationnel est l’acquisition de pages
  SOSH qualifiées et l’invalidation runtime des caches, pas l’absence de moteur web.
- Livrer le correctif Studio `cad30390` dans l’image commune : régression DOM et
  contrôle isolé en 390/1280 verts ; vérifier ensuite `/studio` réellement déployé.
- Compléter les 110 tomes manquants : 93 sans ligne chapitre et 17 stubs SOSH
  masqués vides, inventaire API/PostgreSQL rapproché sans divergence. Le writer doit
  couvrir création avec comparaison d’absence et publication contrôlée des stubs.
- Compléter SOSH : corriger le filtre SSR et les libellés du lecteur, rattacher la
  recherche API aux éditions, corriger la bibliographie sur preuves primaires,
  acquérir les pages manquantes des tomes 2–18 puis vérifier lecture et pagination.
- Reprendre les frontières japonaises privées Bun/Aphrody, qualifier le chemin VPN,
  indexer les captures permises et mesurer les résultats réels ; conserver les refus
  d’accès et distinguer notices collectées, scans disponibles et OCR relu.
- Vérifier la publication de bout en bout des workers permanents, actifs via Infra :
  16 slots de collecte sur la fabrique et consommateur DBFR persistant. Le prévol
  attend le contrat `readerExtent` de la prochaine image ; aucune acquisition ne
  vaut livraison avant vérification des vraies pages, dont SOSH 2–18.

- Terminer la livraison site/bot et vérifier le comportement de la release réellement active.
- Trier archive_movies/archive_images par sélection DragonBall qualifiée, avec compteurs,
  pagination, détails et provenance cohérents ; conserver les éléments incertains hors sélection.
- Corriger les workflows GitHub depuis les erreurs réelles ; distinguer la correction
  du dépôt du blocage de compte Actions lié à la facturation.

- Qualifier au navigateur le thème neutre et l’accueil sans vidéo, puis la sauvegarde
  admin des couleurs et des réglages avec relecture PostgreSQL et rendu public.
- Rejouer l’évaluation chat après livraison du bornage à 256 tokens. Compute/E5
  restaurés via Infra ; retrieval réel mesuré, Recall@5 à 78,49 % sous la porte de 80 %.
  Les fiches masquées exclues de l’index ne sont pas des pertes de synchronisation.
- Livrer l’image commune depuis la fabrique, activer via Infra, puis rejouer les
  parcours manga/databooks, les changements de mode et le défilement dans Bun WebView.
- Appliquer après activation les trois corrections wiki préparées avec snapshots
  et comparaison atomique ; vérifier fiches et historique, poursuivre l’audit sourcé.
- Terminer l’audit des 68 988 images et conserver séparément les preuves HTTP,
  les captures de rendu et les interactions de lecture.

- Livrer le lot canon : compteurs réels, sauvegarde concurrente protégée, distinction
  SSJ4 GT/DAIMA et relecture publique/admin. Conserver les autres données éditoriales.
- Relire les trois scans signalés, corriger uniquement les défauts visuellement prouvés,
  puis déposer par le writer canonique avec sauvegarde, gardes et révisions.

- Qualifier puis exécuter la file de remplissage wiki `gpt-5.6-luna` : 37 tables,
  10 754 lignes visibles auditées, 108 contenus vides/provisoires ; découverte
  officielle, validation des preuves, rédaction/relecture distinctes et publication CAS.

- Reprendre uniquement les lots explicitement ouverts dans `GOAL.md`.
- Qualifier séparément source, artefact, déploiement et comportement public.
- Construire sur VPS, transférer des artefacts scellés vers DBFR via Infra.
- Ne jamais publier une capture, un modèle, une base ou un secret sans preuve et autorisation.

Les tâches livrées et les anciennes décisions restent dans `REPRISE.md`, pas dans cette file.
