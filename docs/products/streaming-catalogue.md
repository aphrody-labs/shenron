<!-- SPDX-License-Identifier: Apache-2.0 -->
# Catalogue vidéo

`/wiki/episodes` compose la vidéothèque depuis les épisodes et sagas éditoriaux visibles.
Le visuel principal présente un épisode ayant une source référencée et une image. Les
images Beerus proviennent des frames déjà qualifiées dans `home-hero-frames.ts` ; le logo
officiel utilise les fichiers anglais et japonais existants. Aucun média de démonstration
ni capture d'un abonnement tiers n'est publié.

Le catalogue réutilise `WikiPageShell`, `TabNav`, `BackgroundImage`, `WikiImg`,
`StreamRail`, `EmptyState` et la garde `ClientGatedWrap`. Les rôles de couleur suivent les
thèmes existants, sans palette indépendante. Les commandes des rails peuvent rester
visibles ; le mode historique au survol demeure le défaut pour les autres pages.

La recherche interroge `/api/episodes` par titre, texte et série, avec des pages de
24 résultats. Une nouvelle recherche annule la précédente. Les filtres sont conservés
dans l'URL ; une panne propose de réessayer et un résultat vide permet d'effacer les
filtres. Les rails initiaux restent bornés à quatorze épisodes par série.

Les épisodes enregistrés sont une vue des **favoris existants**, avec le même stockage,
le même événement et le même service de synchronisation de compte que les fiches et
`/favorites`. L'adaptateur du catalogue ne crée pas une deuxième liste. Les métadonnées
inconnues d'un ancien favori restent inconnues ; aucune durée ou progression n'est
inventée. La navigation relie aussi le catalogue des films déjà disponible.

La reprise exige une lecture native mesurée : position, durée et fin sont enregistrées
sur l'appareil par identifiant d'épisode ou de film. Une simple visite ne constitue pas
un visionnage. Le rail écarte les lectures terminées et les débuts de moins de quinze
secondes. Les événements sont observés uniquement dans le lecteur principal, jamais
sur les vidéos de décoration. Les iframes des fournisseurs externes ne donnent pas une
progression native observable. Le journal de visites reste intact.

Les actions de lecture et de reprise ouvrent la fiche complète ; les cartes conservent
l'aperçu rapide déjà disponible. Le lecteur, ses sous-titres, les langues et la timeline
restent détenus par leurs composants actuels et par Bun Video. Cette composition ne
prétend ni garantir la lecture d'un fournisseur par sa seule présence au catalogue,
ni reproduire les recommandations, le DRM ou la synchronisation de visionnage d'un
service commercial.

Les chaînes ajoutées vivent dans `messages/streaming` et `messages/streaming-list`
en français, anglais et japonais. Les mesures de qualification et les captures restent
dans `var/reports/streaming-20261025`, hors Git.
