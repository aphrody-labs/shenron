<!-- SPDX-License-Identifier: Apache-2.0 -->

# Suppression de compte sur l'hôte Bun

L'hôte Bun active `/api/auth/delete-user` avec les contrôles de session fraîche
de Better Auth 1.7.6. Il capture l'identité Discord et le profil métier avant
la suppression des tables d'authentification, puis appelle la purge partagée
de `@shenron/db/repos/accounts`. Le site Next utilise la même purge : son
implémentation DB locale a été retirée.

L'identité temporaire est attachée à la requête, pas à un identifiant global.
Deux suppressions simultanées ne peuvent donc pas remplacer les données de
l'autre requête. Pour les appels Better Auth sans objet Request, le même
objet utilisateur sert de clé. Le contrat correspond aux appels before/after
de la version installée dans `better-auth/dist/api/routes/update-user.mjs`.

La transaction DB efface les événements personnels, préférences, votes,
notes et brouillons. Elle anonymise les signalements, contributions, révisions
et le profil métier ; elle conserve les publications, discussions et leur
historique. Un compte sans profil métier lié perd aussi les événements
associés à son identifiant d'authentification. Les requêtes sont séquentielles
dans la transaction ; une erreur arrête le lot et remonte au demandeur.

La suppression Better Auth et la purge métier restent deux opérations
distinctes. Une panne après la suppression d'authentification peut donc laisser
la purge à reprendre. Le hook conserve l'identité pour une nouvelle tentative
dans la même requête, mais ne constitue pas une file de reprise durable après
un arrêt du processus. Aucune suppression n'a été exécutée sur les données
réelles pour qualifier ce lot.

Les tests ciblés couvrent le parcours HTTP Better Auth sur un adaptateur mémoire,
la révocation de session, les requêtes concurrentes, les erreurs, les comptes
sans profil et la génération SQL avec les deux pilotes Drizzle PostgreSQL.
Ils ne qualifient pas un parcours OAuth Discord réel ni un rollback sur un
PostgreSQL de production.

Validation du 7 octobre 2026 : 245 tests API, 125 tests DB et 6 tests de
confidentialité du site passants ; 5 tests PostgreSQL live ignorés. Les
typechecks API, DB et site, le lint et le format ciblés, l'audit des migrations
et la conformité des paquets API/DB passent. Le test de décompte des migrations
a été actualisé pour les migrations 0021 et 0022 déjà enregistrées dans le
journal et son snapshot ; aucun fichier de migration ni snapshot n'a changé.
