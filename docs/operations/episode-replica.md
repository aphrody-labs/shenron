<!-- SPDX-License-Identifier: Apache-2.0 -->

# Migration du réplica des épisodes

PostgreSQL `bot.db_episodes` reste la source éditoriale. Un numéro inconnu reste
`NULL` dans SQLite et GraphQL ; aucune valeur zéro n'est fabriquée. Le réplica
conserve désormais les métadonnées officielles, les sous-titres, lecteurs,
offres, flux et compteurs de reprise présents dans PostgreSQL.

La migration propriétaire `apps/bot/src/db/migrations/0020_episode_replica.ts`
est idempotente. `ensureWikiReplicaSchema` l'appelle après les migrations SQL
historiques au démarrage et dans la CLI de migration. Le synchroniseur canonique
la projette aussi sur un schéma privé pour son `--dry-run` avant toute écriture.
Les fichiers SQL et le journal historiques restent inchangés.

SQLite exige une reconstruction pour retirer `NOT NULL`. La transaction courte
conserve toutes les colonnes existantes, y compris les extensions locales,
vérifie la copie des valeurs et du nombre de lignes, restaure les index et
triggers et conserve la séquence AUTOINCREMENT. Dix-sept colonnes manquantes sont
ajoutées sans remplacer les colonnes déjà installées. Une définition inconnue,
un changement de schéma avant verrou ou une référence entrante avec contrôle
des clés étrangères actif bloque la migration et annule la transaction.

Application en production uniquement par Infra, sur artefact source scellé :

1. Sauvegarder par l'API SQLite ou `VACUUM INTO` sur un chemin privé, vérifier
   `quick_check`, les permissions, les comptes et le SHA256 de la sauvegarde.
   Une copie brute du fichier ouvert sans son WAL n'est pas une sauvegarde.
2. Qualifier la migration et la synchronisation canonique sur une copie privée
   restaurée : données initiales conservées par la migration, numéro nullable,
   métadonnées communes complètes, aucune substitution de numéro NULL et reprise
   sans divergence. Réviser le rapport avant de toucher le réplica actif.
3. Appliquer avec un seul écrivain et relire `quick_check`, les identifiants,
   les 48 épisodes SDBH attendus à numéro NULL et les métadonnées. Conserver le
   rollback de base complet et éviter tout remplacement d'une base ouverte.

Les tests hors production couvrent la migration/reprise, un BLOB local, les
index, triggers et séquences, le plan canonique et une sauvegarde WAL restaurée.
Ils ne constituent pas une preuve d'application sur la base du bot.

Le binaire scellé embarque aussi le synchroniseur propriétaire :
`shenron-bot --replica-sync --help`, puis
`shenron-bot --replica-sync --dry-run`. Ces commandes quittent avant le démarrage
du bot : aucune connexion Discord ni migration du runtime. Elles partagent
`apps/bot/src/db/replica-cli.ts` avec
`apps/bot/scripts/sync-neon-to-sqlite.ts` ; `DATABASE_PATH` doit pointer vers le
réplica protégé. Le plan à blanc lit PostgreSQL en lecture seule et projette le
schéma en mémoire. Les tables `users` et `guild_settings` restent hors allowlist :
ce synchroniseur ne restaure pas les profils métier depuis une copie historique.

L'application sans `--dry-run` reste une opération Infra après les trois portes
ci-dessus et une sauvegarde hors hôte récente, vérifiée et restaurée. L'ajout de
la commande au binaire n'active aucun timer et ne synchronise rien au démarrage.
