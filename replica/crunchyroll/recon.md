# Recon : plateforme de streaming d'animés grand public (web desktop + mobile), tranche « découvrir, regarder, suivre »

Portée : la boucle centrale « découvrir -> fiche série -> regarder un épisode -> liste de suivi », sur le web.
Public : dragonballfr.com, produit propre, catalogue Dragon Ball uniquement.
Date : 2026-11-02. Document interne (le produit livré ne cite aucun tiers ; composants et flux sont en termes génériques).

## Avertissement en tête : conditions d'utilisation

Les conditions d'utilisation publiques du service étudié (page /tos, lue le 2026-11-02) interdisent notamment : l'accès automatisé
(robot, spider, scraper), l'exploitation commerciale (construire ou exploiter une activité à partir du service), les œuvres dérivées
du contenu, la rétro-ingénierie et la copie ou capture de flux. Conséquence retenue : ce recon se limite à l'observation, à vitesse
humaine, de trois pages publiquement accessibles dans le navigateur du propriétaire (une lecture, quelques défilements, aucune
lecture vidéo, aucun flux, aucun jeton, aucun bundle JS, aucun journal réseau), plus l'inventaire des pages publiques. Aucune donnée
de compte n'a été exploitée : la page de liste de suivi n'a PAS été ouverte (voir « Non lu »). Aucune copie de texte, logo, image ou code.
Note : le navigateur du propriétaire était connecté, donc les captures montrent un état connecté (bouton « reprendre », pastilles de
progression) ; seules des structures y sont relevées, aucune donnée personnelle n'est reprise ici.

## Non lu (à ne pas présenter comme observé)

- Liste de suivi (`/fr/watchlist`) : page protégée par connexion, non ouverte. Son contenu est inféré depuis les liens et boutons visibles
  des trois autres pages (icône de liste dans l'en-tête, bouton retirer/ajouter sur bandeau, fiche et lecture) et depuis notre propre
  implémentation (`apps/site/src/app/watchlist`). Confiance : moyenne à faible.
- Largeur 390 px : non capturée (pas de redimensionnement de la fenêtre du propriétaire). Comportement mobile : inféré, à vérifier.
- Centre d'aide et page des formules : pages rendues côté client, la lecture texte n'a rien renvoyé. Non lues. Les URL figurent
  ci-dessous pour une lecture manuelle par le propriétaire.
- Menus (utilisateur, catégories, langues audio/sous-titres, options d'épisode, vitesse, paramètres) : non ouverts, uniquement leurs
  déclencheurs et leurs étiquettes d'accessibilité.
- Lecture réelle (tampon, erreur de lecture, épisode suivant automatique, passage d'intro) : non lancée.

## Sources

| #   | source                                                        | URL                                                                       | notes                                          |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | conditions d'utilisation                                      | https://www.crunchyroll.com/tos                                           | lue ; voir l'avertissement                     |
| 2   | page « découvrir »                                            | https://www.crunchyroll.com/fr/discover                                   | lue (1 capture, arbre d'accessibilité)         |
| 3   | fiche série                                                   | https://www.crunchyroll.com/fr/series/GT00389311/dragon-ball-super-beerus | lue (2 captures, défilement)                   |
| 4   | page de lecture                                               | https://www.crunchyroll.com/fr/watch/GE00389316JAJP/the-god-of-saiyans    | lue à l'arrêt, 0:00, sans lecture (2 captures) |
| 5   | liste de suivi                                                | https://www.crunchyroll.com/fr/watchlist                                  | protégée, non lue                              |
| 6   | centre d'aide (liste de suivi, historique, audio/sous-titres) | https://help.crunchyroll.com/hc/fr                                        | rendu client vide, non lu                      |
| 7   | formules et tarifs                                            | https://www.crunchyroll.com/fr/premium                                    | rendu client vide, non lu                      |
| 8   | fiche de la boutique d'applications iOS                       | https://apps.apple.com/fr/app/crunchyroll/id329913454                     | non lue (hors portée web)                      |

Captures de référence (non livrées) : `replica/crunchyroll/screens/` (ignoré par Git). Les captures n'ont pas été écrites sur disque
(elles restent dans la session) ; les mesures de `design/` en sont tirées, à ±2 px sur une capture de 1475 px (échelle 1,11 vers le viewport 1638 px).

## Boucle centrale

Ouvrir la plateforme, voir tout de suite quoi reprendre ou quoi lancer, lire un épisode sans friction, retrouver ses séries au même endroit.

## Écrans

| ID  | écran                                    | route / accès                   | but                                                 | composants clés                                                                | états vus                       |
| --- | ---------------------------------------- | ------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------- |
| S01 | Découvrir                                | `/discover` (accueil connecté)  | point d'entrée, reprise, tendances                  | en-tête global, bandeau héros à diapositives, rails de cartes                  | rempli, vignettes en chargement |
| S02 | Fiche série                              | `/series/{id}/{slug}`           | présenter, lancer ou reprendre, lister les épisodes | héros, méta, bouton principal, grille d'épisodes, rail « titres similaires »   | rempli, vignettes en chargement |
| S03 | Lecture d'épisode                        | `/watch/{id}/{slug}`            | regarder, enchaîner                                 | lecteur 16:9, barre de contrôles, infos épisode, panneau latéral, pied de page | arrêt à 0:00                    |
| S04 | Liste de suivi                           | `/watchlist`                    | retrouver les séries sauvegardées                   | grille de cartes, tri, état vide (inféré)                                      | non lu                          |
| S05 | Recherche                                | `/search`                       | trouver un titre                                    | champ + résultats                                                              | non ouvert (lien vu)            |
| S06 | Listes par genre, nouveautés, populaires | `/videos/{genre, new, popular}` | parcourir                                           | grille ou rail                                                                 | non ouvert (liens vus)          |
| S07 | Menu utilisateur                         | déclencheur en en-tête          | profils, liste, compte                              | menu déroulant                                                                 | non ouvert                      |

Hors tranche : jeux, boutique, actualités, agenda, simulcast, compte et facturation.

## Flux

```
F01 Reprendre où l'on s'est arrêté
    S01 bandeau (bouton « reprendre E4 ») -> S03
    clics : 1 depuis l'accueil
    edge : épisode terminé (propose le suivant, inféré), langue indisponible

F02 Découvrir une série et la lancer
    S01 rail -> carte série -> S02 -> bouton principal ou carte d'épisode -> S03
    clics : 3
    edge : série sans épisode publié (état vide), épisode hors région

F03 Regarder et enchaîner
    S03 lecture -> panneau « épisode précédent / voir plus d'épisodes » -> S03 épisode voisin
    clics : 1 pour changer d'épisode
    edge : dernier épisode (pas de suivant), reprise à la position enregistrée

F04 Sauvegarder dans la liste de suivi
    S01 (bandeau) | S02 (en-tête) | S03 (infos) -> bouton marque-page -> état « retirer de la liste »
    clics : 1 ; présent sur 3 écrans, même icône, même bascule
    edge : non connecté (renvoi connexion, inféré), échec réseau (retour à l'état précédent)

F05 Consulter la liste de suivi
    en-tête (icône liste) -> S04 -> carte -> S02 ou S03
    clics : 2 ; non lu, inféré

F06 Choisir langue audio / sous-titres
    S03 bouton « langues audio et sous-titres » -> menu -> choix
    clics : 2 ; menu non ouvert
```

Clics à battre pour la boucle découvrir -> regarder : 1 depuis une reprise, 3 sinon.

## Composants (termes génériques)

| composant                              | variantes                                                                                      | états                                              | écrans        |
| -------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------- |
| En-tête global                         | liens de rubriques, recherche, liste, menu utilisateur                                         | défaut, lien actif, menu ouvert                    | tous          |
| Bandeau héros                          | 6 diapositives, flèches, pastilles de pagination avec progression                              | auto, pause, focus                                 | S01           |
| Rail horizontal                        | cartes 16:9 ou 2:3, flèche de défilement                                                       | début, milieu, fin, chargement                     | S01, S02      |
| Carte série                            | vignette portrait, coin « dans ma liste »                                                      | défaut, survol, dans la liste, image en chargement | S01, S02, S04 |
| Carte épisode                          | vignette 16:9, bouton lecture central, pastille « temps restant », barre de progression, kebab | non vu, en cours, terminé, survol                  | S02, S03      |
| Bouton principal et bouton marque-page | « reprendre En » ou « lancer », bascule liste                                                  | défaut, reprise, ajouté, chargement                | S01, S02, S03 |
| Bloc méta de série                     | classification, version, genres en liens, note moyenne                                         | replié, déplié                                     | S02           |
| Sélecteur de saison, tri, options      | libellé de saison, tri, menu options                                                           | défaut, ouvert                                     | S02           |
| Lecteur                                | barre de lecture, -10 s, lecture, +10 s, volume, langues, vitesse, paramètres, plein écran     | arrêt, lecture, pause, tampon, erreur              | S03           |
| Panneau latéral de lecture             | épisode précédent, « voir plus d'épisodes »                                                    | avec ou sans précédent                             | S03           |
| Infos d'épisode                        | série, titre, classification, date de mise en ligne, j'aime / je n'aime pas, partage, résumé   | replié, déplié                                     | S03           |
| Pied de page                           | colonnes de liens                                                                              | statique                                           | S03           |

## Modèle de données inféré

```
Series        id, slug, title, synopsis, rating_label, genres[], audio_languages[], subtitle_languages[], avg_rating, rating_count, key_art, logo
              evidence: S02 en-tête, genres en liens, note moyenne ; confidence: high
Season        id, series_id, title, order
              evidence: S02 libellé de saison, tri, options ; confidence: high
Episode       id, season_id, number, title, synopsis, duration_s, published_at, thumbnail, likes, dislikes, rating_label, audio_language, subtitle_languages[]
              evidence: S02 cartes, S03 infos (date de mise en ligne, compteurs) ; confidence: high
WatchProgress user_id, episode_id, position_s, completed, updated_at
              evidence: pastille « temps restant », barre sous la vignette, bouton de reprise ; confidence: high
WatchlistEntry user_id, series_id, added_at
              evidence: bouton marque-page sur S01/S02/S03, icône d'en-tête, coin des cartes ; confidence: medium
Reaction      user_id, episode_id, kind (like | dislike)   evidence: S03 compteurs ; confidence: medium
Rating        user_id, series_id, stars 1-5                evidence: S02 étoiles ; confidence: medium
Profile       user_id, display name, avatar                evidence: lien « changer de profil » du pied de page ; confidence: guess
```

Relations : Series 1-n Season 1-n Episode ; User 1-n WatchProgress (par Episode) ; User 1-n WatchlistEntry (par Series) ; User 1-n Reaction.
Chez nous, progression et liste de suivi existent déjà (`packages/db/src/repos/watch-progress.ts`, `/api/progress`, `/api/watchlist`).

## États vide, chargement, erreur, mobile

- Chargement : les vignettes des rails apparaissent d'abord en cases sombres unies, puis les images (vu sur « titres similaires »). Pas de squelette de texte vu.
- Vide : série sans épisode, liste de suivi vide, recherche sans résultat : non vus, à spécifier (nous avons `EmptyState`).
- Erreur : lecture, réseau, région : non vus.
- Mobile 390 px : non capturé. Hypothèse : rails tactiles, panneau latéral sous le lecteur, kebab en feuille basse.

## Ce qui ne se clone pas (skip)

- Catalogue sous licence, doublages et sous-titres du tiers : le nôtre est Dragon Ball, sources autorisées.
- Base d'utilisateurs, notes, compteurs de réactions, effet réseau.
- DRM, ingestion et chiffrement du flux : aucune extraction de flux protégé ni contournement ; lecture de médias autorisés par le lecteur existant.
- Paiements, abonnement, partenaires, publicité.
- Applications TV, consoles, téléchargement hors ligne, diffusion vers un écran distant.
- Jeux, boutique, actualités, agenda simulcast.
- Marque, logo, couleurs de marque, illustrations, textes.

## Taille

Écrans 7 (4 dans la tranche), flux 6, entités 8 (4 existent déjà côté site). Difficultés :

1. Rail horizontal à accrochage (snap), flèches, clavier et lecteur d'écran, sans débordement à 390 px (aucun composant du kit).
2. Reprise fiable : position, fin d'épisode, fusion appareil / compte, enchaînement automatique (partiel : `watch-sync`).
3. Lecteur : langues et sous-titres, états erreur et tampon, panneau d'enchaînement ; dépend d'un média autorisé réel (hors DRM).

Taille : M pour la tranche (la plupart des briques existent), L pour la parité complète.
