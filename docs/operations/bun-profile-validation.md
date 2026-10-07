<!-- SPDX-License-Identifier: Apache-2.0 -->

# Validation du profil sur Bun

L'hôte Bun applique désormais la validation des mises à jour de profil dans
le hook `databaseHooks.user.update.before` de Better Auth 1.7.6. Le pseudo est
une chaîne, nettoyée de ses espaces extérieurs, de 2 à 48 unités UTF-16 comme
dans le site existant. L'avatar est une URL HTTPS ; `null` et la chaîne vide
permettent de le retirer. Un champ absent conserve sa valeur. Les autres
champs du payload du hook restent transmis à Better Auth.

Une mise à jour invalide renvoie HTTP 400 avant l'écriture, y compris si le
pseudo est valide mais l'avatar invalide. L'endpoint reste soumis à la session
Better Auth. Après une mise à jour réussie, Better Auth rafraîchit le cookie de
session signé avec le profil enregistré.

Le test HTTP utilise les options réelles de l'hôte et l'adaptateur mémoire
Better Auth : refus des types invalides et des URL non HTTPS, bornes du pseudo,
trim, mises à jour partielles, retrait d'avatar, absence d'écriture lors d'un
refus, rafraîchissement du cookie et refus sans session. Il ne qualifie ni
OAuth Discord réel, ni PostgreSQL de production, ni la synchronisation du
profil métier `users` et l'invalidation du cache Next. Ces derniers restent
des travaux de migration distincts ; la validation historique du site demeure.

Contrat vérifié dans les types et la route `update-user.mjs` de la version
installée ; documentation amont :
[hooks de base de données](https://www.better-auth.com/docs/concepts/database#database-hooks).

Validation du 7 octobre 2026 : 246 tests API passants, typecheck API et lint
ciblé passants ; format et liens locaux vérifiés. Aucun profil réel modifié.
