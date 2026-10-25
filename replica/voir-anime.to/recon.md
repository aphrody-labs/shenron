<!-- SPDX-License-Identifier: Apache-2.0 -->

# Voir Anime — reconnaissance publique

Relevé du 25 octobre 2026. Cible : web public de <https://voir-anime.to/>.
Demande : cartographier les écrans, parcours, routes, endpoints, réseau et stack avec
Replica Recon, Aphrody Web et Bun. Aucun compte nécessaire aux parcours étudiés.
Ce dossier décrit le fonctionnement observé ; il ne contient ni catalogue copié,
ni source du site, ni média vidéo. Les captures restent locales et ignorées par Git.

## État de couverture

**L'inventaire des sitemaps est complet ; le crawl HTML ne l'est pas.** Les 109 documents
déclarés par l'index ont répondu 200 et leurs empreintes ont été relues : 104 556 URL
uniques, dont 6 752 fiches séries, 97 719 pages d'épisodes, 59 archives d'années,
20 archives de genres et six autres pages. Ce sont des URL déclarées, pas autant de
pages chargées ou de vidéos lisibles.

Le premier lot Aphrody Web a effectué 250 tentatives : 248 pages HTTP 200, 242 contenus
extraits distincts et un chemin de protection d'adresse électronique en 404, réessayé.
Certaines extractions sont très courtes : l'extraction texte seule ne prouve pas le rendu.
Un second lot reprend la même frontière SQLite, avec un plafond de 2 000 requêtes,
un seul accès simultané par hôte, délai minimal d'une seconde et arrêt sur restrictions
répétées 403/429. Il est encore en cours au moment de cette rédaction.

Les preuves privées et scripts reproductibles vivent dans
`var/reports/voir-anime-20261025/{root,crawl,assets,network}/`.
L'état actualisé est dans `crawl/native-crawl-batch2-progress.json`, puis
`crawl/native-crawl-batch2-terminal.json` après sa fin. Ne pas lancer un doublon.

## Sources

| Source publique | Usage et preuve locale |
| --- | --- |
| <https://voir-anime.to/> | Shell, catalogue, formulaires ; `root/home.json`, captures S01 |
| <https://voir-anime.to/liste-danimes/> | Annuaire A–Z et filtres ; `root/directory.json`, capture S02 |
| <https://voir-anime.to/nouveaux-ajouts/> | Nouveaux ajouts ; `root/additions.json` |
| <https://voir-anime.to/prochainement/> | Prochaines sorties ; `root/upcoming.json` |
| <https://voir-anime.to/anime/aoashi-2/> | Fiche et épisodes ; `root/series.json`, capture S05 |
| <https://voir-anime.to/anime/aoashi-2/aoashi-2-04-vostfr/> | Sélecteurs et fournisseurs ; `root/episode.json`, capture S06 |
| <https://voir-anime.to/?s=Dragon%20Ball&post_type=wp-manga> | 57 résultats ; `root/search-direct.json`, capture S07 |
| <https://voir-anime.to/robots.txt> | Règles publiques ; preuves `crawl/` |
| <https://voir-anime.to/sitemap_index.xml> | Index de 109 sitemaps ; `crawl/sitemap-audit.json` |
| <https://voir-anime.to/feed/> | Flux XML public, réponse 200 ; `root/public-endpoints.json` |

Pas de documentation API, tarification ou aide exhaustive qualifiée. Les pieds de page
observés exposent contact et réseaux sociaux ; cela ne démontre pas l'absence de conditions
d'utilisation ailleurs. Aucun abonnement, paiement ni parcours de compte n'a été testé.

## Inventaire des écrans

| ID | Écran / route | But et composants | États réellement observés |
| --- | --- | --- | --- |
| S01 | `/` | Dernières publications, cartes, filtres VF/VOSTFR, pagination, recherches latérales | HTML 200 ; rendu 1280 et 390 ; liste remplie |
| S02 | `/liste-danimes/` | Annuaire alphabétique, lettres, filtre langue | HTML 200 ; rendu 1280 ; paramètres `start` et `filter` annoncés |
| S03 | `/nouveaux-ajouts/` | Découverte des ajouts | HTML 200 ; liens et titres extraits ; interactions non qualifiées |
| S04 | `/prochainement/` | Catalogue à venir | HTML 200 ; liens et titres extraits ; interactions non qualifiées |
| S05 | `/anime/:series/` | Affiche, titres alternatifs, synopsis, note, métadonnées, genres, épisodes, bande-annonce | Aoashi rempli ; rendu 1280 ; iframe YouTube annoncée |
| S06 | `/anime/:series/:episode/` | Lecteur intégré, choix fournisseur, épisode, précédent/suivant | Rendu 1280 et 390 ; quatre iframes sélectionnées ; navigation 04 → 03 ; lecture non tentée |
| S07 | `/?s=…&post_type=wp-manga` | Recherche, filtres avancés, tris et résultats détaillés | Panneau mobile ouvert ; recherche directe 57 résultats ; formulaire perdant la saisie |
| S08 | `/anime-genre/:slug/` | Archive par genre | 20 URL dans les sitemaps ; Action reçu en 200 et affiché ; R+ affiche zéro résultat et un message vide explicite |
| S09 | `/anime-release/:slug/` | Archive par année | 59 URL dans les sitemaps ; 2026 reçu en 200 ; pas de qualification visuelle dédiée |
| S10 | `/user-settings/` | Page déclarée dans le sitemap | Inventoriée seulement ; ni session ni réglage modifié |
| S11 | `/manga/` | Page déclarée dans le sitemap | Inventoriée seulement ; rôle précis non établi |

Captures : `screens/S01-home-{1280,390}.jpg`, `S02-directory-1280.jpg`,
`S05-series-1280.jpg`, `S06-episode-1280.jpg`, `S06-episode03-390.jpg`,
`S07-advanced-390.jpg`, `S07-search-dragon-ball-1280.jpg`. Elles ne sont pas commitées.
L'accueil et l'épisode mobile ont une largeur documentaire mesurée de 375 px pour un
viewport de 390 px, sans débordement horizontal mesuré sur ces états.

## Parcours

| ID | Objectif et étapes | Actions / limites |
| --- | --- | --- |
| F01 | Découvrir : S01 → S05 → S06 | Deux liens depuis une carte vers la fiche puis un épisode ; lecture non qualifiée |
| F02 | Chercher par titre : S07 → résultat → S05 | URL GET directe validée avec 57 résultats ; soumission du formulaire testée deux fois perd la valeur `s` |
| F03 | Explorer : S02 → lettre / langue → fiche | Contrôles et URL annoncés ; chaîne complète des filtres non testée |
| F04 | Changer de fournisseur : S06 → sélection → autre iframe | Une sélection ; quatre fournisseurs observés ; remplacement d'iframe prouvé, démarrage vidéo non prouvé |
| F05 | Changer d'épisode : S06/04 → sélection 03 → S06/03 | Une sélection ; fil d'Ariane et précédent/suivant mis à jour après navigation ; fournisseur par défaut rétabli |
| F06 | Affiner : S07 → Advanced → filtres → résultats | Panneau ouvert ; champs inventoriés ; pas de combinaison exhaustive ni d'état vide qualifié |
| F07 | Recherche latérale : S08 → saisir Dragon Ball → loupe → suggestions | Suggestions affichées sur la même page ; 18 titres visibles relevés ; endpoint AJAX non capturé dans cette fenêtre réseau |

Le formulaire S07 affichait bien « Dragon Ball » dans `input[name=s]` avant envoi,
mais la navigation observée contenait `s=` vide et affichait 6 817 résultats.
La cause n'est pas établie. Le GET direct fonctionne : ce défaut ne justifie pas de
déclarer tout le moteur de recherche défaillant. La recherche latérale Ajax Search Pro
affiche des suggestions Dragon Ball après saisie et clic sur la loupe. Le lien d'une
suggestion n'a pas été suivi ; son endpoint n'a pas été qualifié par le relevé réseau.

## Composants et états

| Composant | Variantes / états | Écrans |
| --- | --- | --- |
| Shell | En-tête sombre, logo clair, navigation, barre de genres, menu mobile | S01–S07 |
| Carte catalogue | Affiche, titre, liens d'épisodes, date et langue | S01, S03, S04 |
| Résultat détaillé | Titres alternatifs, genres, format, statut, année, note | S07 |
| Annuaire | Lettres, caractères non alphabétiques, VF / VOSTFR / tous | S02 |
| Recherche avancée | Genres OR/AND, auteur, artiste, année, adulte, statut, format, langue, recherche et réinitialisation | S07 |
| Tris | Pertinence, date, alphabet, note, populaire, vues, nouveautés | S07 |
| Métadonnées et épisodes | Titres natif/romaji/anglais, studio, statut, dates, total et liens | S05 |
| Lecteur externe | Iframe, fournisseur, épisode, précédent/suivant ; contrôles dupliqués selon largeur | S06 |
| Pagination | Pages numérotées ; 105 pages affichées sur l'accueil observé | S01, S07 |

Deux comboboxes visibles de S06 ont un libellé accessible constitué d'une icône,
peu explicite. Les états erreur fournisseur, chargement, clavier complet,
reprise, favoris et synchronisation de compte ne sont pas établis.

## Modèle de données inféré

Ce sont des entités de produit déduites de l'interface, pas un schéma de base extrait.

| Entité | Champs déduits | Relation et confiance |
| --- | --- | --- |
| Series | slug, titres alternatifs, synopsis, affiche, format, statut, studio, année, date début, total épisodes | Épisodes et genres multiples ; forte, S05/S07 |
| Episode | slug, numéro affiché, langue, série, précédent/suivant | Appartient à une série ; forte, S05/S06 |
| ProviderLink | libellé, URL iframe, épisode | Plusieurs fournisseurs par épisode ; forte, changement réel S06 |
| Genre | slug, libellé | Archive et relation séries ; forte, liens et sitemaps |
| ReleaseYear | année, URL archive | Relation aux séries ; forte, S07 et sitemaps |
| RatingSummary | moyenne, nombre de votes | Agrégat visible ; forte pour l'affichage, mécanisme de vote inconnu |
| ViewCounter | identifiant série, événement de visite | Action automatique `manga_views` observée ; compteur et stockage internes inconnus |

## Réseau, stack et endpoints

Voir [stack.md](stack.md) et [endpoints.csv](endpoints.csv) pour la séparation entre
ressource annoncée, requête testée et appel observé en navigateur.
Cloudflare frontal, WordPress et la famille Madara sont étayés ; version PHP,
moteur SQL, origine, routes privées et présence d'une API IA restent inconnus.
Les iframes des fournisseurs ne révèlent pas à elles seules le CDN des octets vidéo.

## Périmètre restant et réutilisation

11 familles d'écrans, sept parcours, sept entités inférées. La matrice
[features.csv](features.csv) sert une éventuelle implémentation ultérieure ; aucune
implémentation de clone n'a été demandée dans ce lot. Priorités proposées, non engagements.
Complexité L pour un service complet avec vrais médias et persistance ; un catalogue
et des liens de lecture seuls sont un périmètre plus petit. Les trois difficultés sont
la disponibilité des fournisseurs, les droits et sources des médias, et la persistance
personnelle avec reprise multiappareil.

Restent : terminer la frontière HTML bornée, étendre la qualification des archives et des états vides,
terminer le parcours d'une suggestion latérale et distinguer systématiquement les ressources
bloquées au client direct des ressources chargées par le navigateur. Une nouvelle phase
d'architecture ne remplace pas ces contrôles. Le catalogue, les images, la marque,
les comptes et les médias de Voir Anime ne sont pas des livrables à réutiliser.
