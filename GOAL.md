<!-- SPDX-License-Identifier: Apache-2.0 -->

# Objectif courant Shenron

Ce document contient uniquement les objectifs encore pertinents. Les preuves datées et
l’historique sont dans [REPRISE.md](docs/reference/root/REPRISE.md) ; les invariants dans
[PLAN.md](docs/reference/root/PLAN.md). Une ancienne note n’est pas une nouvelle demande.

## Priorités

Demande propriétaire du 18 octobre : réunir le parcours manga de Shenron et
Shenron Studio (Koharu), afin d'exploiter les capacités communes de lecture,
édition, cases, atlas, Canvas et scènes 3D. Conserver `koharu-library` comme
propriétaire de l'état éditorial, les transports existants et les producteurs
Rust/Bun ; raccorder les capacités plutôt que dupliquer moteurs et applications.
Chaque capacité exposée doit fonctionner sur une vraie page autorisée et être
qualifiée séparément ; SVG raster, trait vectoriel et modèles 3D restent distincts.
La modernisation des fiches épisodes, du lecteur CDN, du hero et de la timeline
GIF continue jusqu'au contrôle de l'image publique activée.

Extension du même lot : restaurer les fonctions réellement perdues de l'upstream
Koharu dans Shenron Studio, avec un seul moteur et des parcours site, bureau et
mobile. Le site propose des espaces personnels authentifiés et isolés ; les
writes éditoriaux restent sous leur garde admin. L'administration entière partage
un atelier Studio moderne (explorateur, onglets, commandes, contexte), puis son
tableau de bord reprend les données et actions réelles dans cette composition.
Qualifier séparément parité source, compilation native/WASM, import réel,
responsive, image scellée et comportement de production.

Demande active du 15 octobre : corriger les bugs et trous de données des pages manga,
databooks et wiki, synchroniser l’IA et l’interface avec PostgreSQL, évaluer le RAG,
et qualifier le crawl/rendu avec Bun WebView sur la fabrique. Le propriétaire ajoute :
thème neutre, retrait des vidéos d’accueil, défilement stable et dashboard permettant
la personnalisation complète du thème, avec persistance et relecture réelles. Il demande
aussi la correction des transcriptions et la complétude du canon : lire API, écrans
public/admin, données et mémoire Aphrody agent home sur DBFR, puis décider sans
confirmation intermédiaire. Sources primaires prioritaires, œuvres et continuités
explicitement attribuées ; aucun classement ou texte japonais inventé.
Demandes ajoutées : rendre `/wiki/canon` moins verbeux, plus illustré, simple et
interactif ; automatiser le remplissage du wiki par sessions Codex `gpt-5.6-luna`
avec preuves primaires et relecture indépendante ; installer le plugin Aphrody
et son MCP dans Codex. La demande explicite de synchronisation Git, merge, déploiement complet et
mise à jour des paquets autorise la livraison site/bot via Infra et la publication
des douze bibliothèques publiques auditées en version 1.4.6 ; les applications restent privées.
Demandes ajoutées ensuite : trier `/catalog/archive_movies` et `/catalog/archive_images`
avec une sélection Dragon Ball réellement qualifiée et des filtres cohérents, puis
corriger les GitHub Actions et workflows depuis leurs échecs réels.
« star » reste à préciser ; aucun correctif arbitraire n’est déduit de ce mot.

Demande courante : compléter de bout en bout `/wiki/manga?collection=SOSH`, son
interface, ses données et son API ; collecter et indexer récursivement les sources
japonaises avec Bun et Aphrody, en utilisant le VPN configuré lorsqu’il est qualifié.
La cible propriétaire confirmée est la livraison des 17 tomes SOSH manquants
pour compléter les 18 (clarification du 15 octobre ; la mention «177» est corrigée).
Les 18 identités canoniques et leurs bornes de contrat sont conservées. Plan :
[`SOSH-DELIVERY-PLAN.md`](docs/reference/root/SOSH-DELIVERY-PLAN.md).
Après l’unique livraison de code pour invalider l’ISR,
la publication de chaque vague doit passer par workers, writer et index CDN sans
rebuild Next backend.
Les 18 notices ne prouvent pas la présence des 18 volumes lisibles : chaque tome
doit disposer de ses vrais médias, d’une pagination vérifiée et d’une provenance.
La collecte et l’indexation restent privées jusqu’à validation par leurs writers.
Précision propriétaire : les 18 tomes doivent être réellement disponibles en lecture,
puis des workers récursifs permanents, 24 h/24 et 7 j/7, doivent compléter les pages
et tomes manquants de tout le catalogue manga et publier les ressources acquises.
Extension propriétaire : compléter les 110 tomes manquants et le wiki ; établir la liste
exacte des volumes et des pages absentes, traiter les éditions séparément et vérifier
chaque publication publique par ses médias et son historique.
Les workers reprennent leurs frontières et files persistantes, respectent les budgets
par source et publient par les propriétaires éditoriaux et CDN ; aucune notice ou
page de remplacement ne vaut livraison d’un volume.

Dernière demande propriétaire : corriger Shenron Studio sur le site. Le correctif
doit être reproduit, testé en navigateur mobile et bureau, inclus dans l’image
commune puis vérifié sur la page réellement servie. Le moteur local et ses gardes
restent sous leur propriétaire ; la demande ne permet pas de déduire une nouvelle
architecture distante multi-utilisateur.

0. Demande propriétaire du 13 octobre livrée (contrôle du 15 octobre dans REPRISE) :
   accueil, catalogue épisodes/sagas, cinq GIF, aperçus et téléchargements servis par
   la release `88ac0d23`. La prochaine image commune reste coordonnée avec le dashboard.

1. Maintenir la collecte privée des sources officielles avec provenance, robots, sitemaps,
   budgets et couverture explicitement qualifiés.
2. Livrer les lecteurs manga, databooks et vidéo avec tests navigateur réels ; distinguer
   chargement, disponibilité et lecture effective.
3. Consommer HLS depuis `@aphrody/bun-video`, sans vendoring local ; respecter les licences,
   DRM et droits des fournisseurs.
4. Maintenir les catalogues par writers transactionnels, snapshots JSON validés, sauvegarde,
   relecture et réplica ; aucune écriture implicite dans RAG, Redis ou PostgreSQL.
5. Garder le monorepo modulaire : paquets `@aphrody/shenron-*`, apps privées, crates Rust
   avec leurs noms publics et notices.
6. Construire sur VPS, sceller l’artefact, activer via Aphrody Infra sur DBFR, puis vérifier
   les sondes publiques, CDN, MCP et lecteurs réellement servis.

## Portes

- Sources primaires et droits vérifiés ; Fandom interdit comme source éditoriale.
- Secrets, bases, corpus, modèles, captures complètes et cookies restent protégés.
- Une annonce ne prouve pas une lecture ; un HTTP 200 ne prouve pas un rendu ou une lecture.
- DNSSEC, délégation, TLS, cache et rollback sont des contrôles séparés.
- Outils imposés par le propriétaire : `bun check`, `bun lint`, `bun fmt`, `bun n2b`
  selon le besoin ; `tsc` et `oxlint` bannis, y compris par invocation indirecte.

## Prochain travail

Choisir le premier lot explicitement non livré dans `REPRISE.md`, revendiquer ses chemins,
reproduire le défaut, qualifier le propriétaire, commiter le lot vert et pousser sans réécrire
les migrations ni les historiques.
