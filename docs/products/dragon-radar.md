<!-- SPDX-License-Identifier: Apache-2.0 -->

# Dragon Radar : recherche partagée et reprise

La vue de recherche appartient à `@shenron/ui/public/DragonRadarSearch`. Elle est
issue du composant du site présent dans `691e28e` : écran radar, icônes, suggestions,
filtres, cartes et destinations existantes sont conservés. Le site fournit ses
liens Next, sa garde de navigation et les URL des assets. La vue et son comportement
ne dépendent pas de Next et acceptent le transport de leur hôte, notamment Bun.

Les dix familles prises en compte par le radar sont affichées. Les sagas,
transformations, combats et tournois étaient comptés mais absents du rendu ; leurs
cartes sont rétablies. Les transformations ouvrent leur personnage, les combats et
tournois ouvrent le hub d’événements avec son filtre et sa recherche, et les sagas
ouvrent leur fiche. Un filtre sans résultat affiche une explication.
Le transport accepte les personnages sans slug et adapte `number_in_series` de
l’API actuelle au numéro d’épisode attendu par la vue ; l’ancien rendu utilisait
un champ absent et pouvait afficher un libellé sans numéro.

La saisie est différée de 300 ms ; choisir une suggestion ou effacer la recherche
agit immédiatement. Une nouvelle requête ou un changement de transport annule les
opérations précédentes et masque leurs résultats. Les réponses tardives sont
ignorées. Chaque opération dispose d’un délai maximal de dix secondes, même si son
transport ignore l’annulation. Une erreur HTTP ou une réponse mal formée affiche
un message avec reprise au lieu de conserver des résultats périmés.

Les filtres documentaires réutilisent les résultats de la requête courante sans
relancer sa recherche. L’arbitre n’est consulté que dans le filtre Canonicité ; son
opération est indépendante et sa lenteur ne bloque pas la recherche documentaire.
Un verdict inconnu ou absent est expliqué. Sortir du filtre annule sa consultation.

Les textes de contrôle vivent dans les dictionnaires français, anglais et japonais
du paquet UI. Les suggestions du site utilisent le lexique canonique embarqué,
avec son repli linguistique officiel. Les cibles sans entrée dans ce lexique gardent
leur requête historique ; aucune nouvelle table de traduction des personnages
n’est créée. Les identifiants des champs de recherche sont uniques par instance,
les filtres indiquent leur sélection et les états de chargement sont annoncés.
Les boutons mesurent au moins 44 px en hauteur ; les animations décoratives
respectent la réduction des mouvements.

## Qualification du 7 octobre 2026

Six tests DOM couvrent les réponses tardives, les erreurs, les annulations,
le changement de transport, une opération qui ne finit jamais, la reprise,
les dix familles, les destinations restaurées, les filtres sans requêtes répétées,
les trois langues et les réponses HTTP invalides. Le contrôle du site conserve
l’invariant d’une recherche générale sans appel à l’arbitre.

Dans Chromium réel, la fixture précédente restait en chargement face à un serveur
qui ne répondait pas ; la nouvelle en sort vers son état d’erreur, puis réussit une
reprise après HTTP 503. La même réponse produit six liens dans l’ancien composant
et dix dans le nouveau. Les vues de 390 et 1440 px utilisent les styles partagés
et les polices du site. À 390 px, aucun débordement horizontal n’a été mesuré,
les boutons respectent 44 px et les animations sont désactivées avec la préférence
de mouvement réduit. Le filtre japonais et l’appel explicite à l’arbitre sont
également vérifiés. Les preuves restent dans `var/reports/dragon-radar/`, ignoré.

Cette fixture utilise des résultats synthétiques et des liens natifs fournis à la
vue partagée. Elle ne qualifie ni la recherche éditoriale réelle, ni Next en
production, ni Tauri sur une machine physique, ni la fidélité manga de toute l’UI.
Les routes `/api/search` et `/api/canon` du site restent à transférer sur Bun :
extraire leur interface ne constitue pas leur migration serveur.
