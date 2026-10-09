<!-- SPDX-License-Identifier: Apache-2.0 -->
# Recherche visuelle Dragon Ball et Xenoverse 3 — 2026-10-07

## Méthode et limites

Vérification le 7 octobre 2026 à partir de pages officielles Toei/Dragon Ball et Bandai Namco,
d'un crawl borné exécuté sur DBFR avec le profil isolé `aphrody` (25 requêtes tentées, 23 pages
indexées, 153 blocs, zéro erreur), puis de deux requêtes `aphrody home query`. Trois visuels
officiels ont été inspectés depuis des copies temporaires locales; aucune image n'est conservée
dans le dépôt. Les observations ci-dessous décrivent les visuels consultés et séparent les faits
des propositions. Aucun plan complet du monde Xenoverse 3 n'a été publié dans les sources.

## Dragon Ball Super: Beerus — affiche Super Surge et bande-annonce

La page officielle annonce la première japonaise le 11 octobre 2026 et publie le trailer
« Super Surge » avec de nouvelles séquences. Elle décrit l'ouverture par un Kamehameha, le duel
Goku/Beerus, le retour de Freezer et de nouvelles menaces; la fin révèle Freezer. La même annonce
présente « ONOGAMI » de MEGATERA・ZERO et « Kan Peki No Peki » de VK Blanka. Le trailer inclut des
combats parallèles des compagnons et un rythme musical énergique.

L'affiche verticale place Beerus en très grand au premier plan gauche, Freezer doré au-dessus
de la Terre et Goku en bas à droite, avec une lumière concentrée autour de son attaque. Le fond
spatial indigo et magenta, l'atmosphère bleue de la planète et les accents cyan/rose séparent les
plans et amplifient l'échelle. C'est une composition de confrontation et de menace, pas un guide
de modèles ou de palettes à recopier.

**Pistes originales pour Dragon Pixel :** cadrage diagonal lisible, silhouette de boss dominante,
éclairage de contre-jour coloré et progression de valeur du fond sombre vers un point d'énergie
clair. Adapter ces principes avec personnages, décors, palettes, animation et logo propres;
l'affiche, les designs et les assets officiels ne sont pas des ressources à incorporer au jeu.

Source : [annonce officielle Dragon Ball Super: Beerus / Super Surge](https://en.dragon-ball-official.com/news/01_4425.html).

## Xenoverse 3 — articles et visuels vérifiés

Bandai Namco situe le jeu en AGE 1000 et annonce West City, le Great Saiya Squad, six races
jouables dont Android, et une sortie prévue en 2027. Le trailer du 3 septembre met en avant la
création d'avatar, la personnalisation, des styles de combat et les techniques de héros. Ces
informations sont des annonces officielles, mais les captures de presse ne définissent pas une
carte exhaustive.

La vignette Gamescom montre une rue de West City en plein jour : tours futuristes arrondies,
verre bleu, végétation abondante et une voie/structure orange surélevée. La capture de combat
officielle montre au contraire un couloir glaciaire étroit, des parois de glace verticales, un
sol glacé et l'interface d'un groupe en mission. La lecture visuelle suggère un contraste
volontaire entre l'espace social urbain ouvert et un terrain de mission resserré, à froids bleus.

Le guide de combat du 11 septembre indique que les environnements servent les projections contre
sols et murs, et décrit double saut puis envol, esquive/Perfect Guard, rupture de Ki, assistance
d'allié, Soul Switch ou éveil. Il précise que l'interface et les fonctionnalités peuvent évoluer
avant la sortie. Ce contenu informe les besoins de level design; il ne valide pas les géométries
ou la disposition exacte des zones.

Sources officielles :

- [Trailer « Fight your own way » (3 septembre 2026)](https://en.bandainamcoent.eu/dragon-ball/news/fight-your-own-way-dragon-ball-xenoverse-3)
- [Démo Gamescom 2026 et expédition au glacier (26 août 2026)](https://en.bandainamcoent.eu/dragon-ball/news/dragon-ball-xenoverse-3-join-us-gamescom-2026)
- [Guide du système de combat (11 septembre 2026)](https://en.bandainamcoent.eu/dragon-ball/news/dragon-ball-xenoverse-3-battle-system-guide)

## Critères dérivés pour la carte Rust AGE 1000

Les critères suivants sont des choix de prototype, pas des éléments annoncés comme carte canon :

1. Garder West City comme nœud d'accueil et l'expédition glacier comme zone de mission séparée,
   reliée par un lancement de mission; c'est la relation attestée par l'article Gamescom.
2. Structurer les districts urbains autour d'espaces ouverts d'exploration, avec un chemin aérien
   distinct des routes à pied. Les trajets, distances, hauteurs et frontières restent hypothétiques.
3. Réserver les arènes de mission à des volumes où le combat volant, les projections au sol et
   les rebonds contre les murs peuvent être représentés. Ne pas déduire d'une capture unique la
   taille réelle de la carte ou le nombre de missions.
4. Afficher la provenance sur chaque zone et route : « annoncée » pour West City, l'escouade et
   le glacier; « prototype » pour le reste de la topologie et des coordonnées.

La carte Rust actuelle est un graphe schématique jouable de six zones, huit repères et sept
liaisons. Elle s'appuie maintenant sur les articles, captures et guides officiels récents pour
ses critères de prototype; elle ne reconstitue ni ne prétend remplacer la carte finale. Aucun
fichier de Xenoverse 2 ni asset d'un jeu n'a été redistribué.

## Vérification de recherche

Le crawl DBFR `omar-xenoverse3-latest-20261007` a terminé 25 tentatives, écrit et indexé 23 pages
avec 153 blocs, sans erreur ni expiration. `aphrody home query --profile aphrody` a retrouvé les
faits DBS (date de première, Super Surge, nouvelles séquences, thèmes musicaux) ainsi que les
éléments Xenoverse 3 (West City, AGE 1000, glacier, démo et équipe). Le crawl est borné et la
frontière reste ouverte; ce résultat n'est pas une collecte exhaustive du Web.
