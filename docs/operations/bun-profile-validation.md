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

## Synchronisation du profil métier

Bun synchronise désormais le profil `users` après une mise à jour Better Auth
et après la création d'un lien Discord. Sa résolution de session répare aussi
une divergence laissée par une synchronisation interrompue. Les noms et avatars
viennent de `ba_user` en base, jamais du contenu d'un ancien cookie signé.
Les droits staff définis par l'environnement élèvent le profil ; les droits
admin accordés manuellement en base sont conservés, comme dans le site.
La résolution d'identité des API Bun relit aussi la session en base pour
observer sa révocation sans attendre l'expiration du cache signé.

Le dépôt partagé `@shenron/db/repos/accounts` lit le lien Discord et le profil
dans une transaction qui verrouille la ligne `ba_user`. Il ne réécrit pas un
profil inchangé. L'upsert conserve l'identifiant métier, la date de création et
les données liées ; le calcul des droits dans l'upsert préserve aussi une
élévation admin concurrente. Une erreur de synchronisation remonte au demandeur.
L'écriture Better Auth déjà commise n'est pas annulée : une résolution ultérieure
de session peut reprendre la synchronisation. Ce mécanisme ne remplace pas la
file durable restant nécessaire à la purge de compte.

Next demande une session fraîche à Bun (`disableCookieCache=true`) afin que son
ancienne synchronisation locale ne remette pas les valeurs d'un cookie périmé
dans le profil métier. Le cache Next peut encore afficher le profil précédent
pendant son TTL de 60 secondes. Le retrait de cette résolution DB locale et son
remplacement par un contrat de profil hébergé sur Bun restent à faire.

## Qualification

Le test HTTP utilise les options réelles de l'hôte et l'adaptateur mémoire
Better Auth : refus des types invalides et des URL non HTTPS, bornes du pseudo,
trim, mises à jour partielles, retrait d'avatar, absence d'écriture lors d'un
refus, rafraîchissement du cookie et refus sans session. Les hooks de
synchronisation sont exercés sur un lien Discord de test et une modification
HTTP, avec relecture fraîche malgré l'ancien cookie. Les requêtes Drizzle sont
vérifiées avec les pilotes postgres-js et Bun.SQL.

Une instance PostgreSQL 18 temporaire locale, sans données produit, qualifie
le dépôt Bun.SQL : premier lien, réparations, résolutions concurrentes,
attente d'une écriture auth verrouillée, préservation des droits admin et
rollback d'une synchronisation refusée par une contrainte DB. Le test est
`packages/db/test/account-profile.pg.test.ts`, activé uniquement par
`SHENRON_PROFILE_PG_URL` vers la base locale dédiée `shenron_profile_fixture`.
Il ne qualifie ni OAuth Discord réel, ni PostgreSQL de production, ni
l'invalidation immédiate du cache Next. La validation historique du site demeure.

Contrat vérifié dans les types et la route `update-user.mjs` de la version
installée ; documentation amont :
[hooks de base de données](https://www.better-auth.com/docs/concepts/database#database-hooks).

Validation du 7 octobre 2026 : 248 tests API, 131 tests DB et 3 tests de relais
d'authentification du site passants. La suite DB ordinaire ignore 6 tests live ;
le test PostgreSQL du profil a passé séparément sur l'instance temporaire.
Typechecks API, DB et site, lint et format ciblés, conformité des paquets API/DB
et liens locaux vérifiés. Aucun profil réel modifié.
