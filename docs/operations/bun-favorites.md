# Favoris sur l’hôte Bun

Les favoris connectés sont lus par `GET /api/v1/account/favorites` et enregistrés
par `POST` sur la même adresse. L’hôte ouvre et ferme son pool Bun.SQL avec sa
capacité DB. Le site conserve `GET` et `PUT /api/favorites` comme transport HTTP
vers `SHENRON_HOST_URL`, sans DB ni résolution de session dans Next.

La session Better Auth fournit le profil applicatif. Seul `profile.id` désigne
la clé `u:<id>` de `user_preferences` : ni l’ID Better Auth, ni l’ID Discord,
ni un champ du corps, ni un propriétaire local ou un jeton admin. Un profil
absent retourne `503`, sans écrire sous une autre identité. Un anonyme peut
toujours utiliser les favoris locaux ; le backend renvoie une liste vide à sa
lecture et refuse son écriture. Les réponses personnelles sont `private, no-store`.

L’upsert JSONB remplace seulement `favorites` et conserve les autres clés, sans
lecture préalable exposée à une course. Les favoris sont normalisés et dédoublonnés,
avec un plafond de 200 entrées. La limite de 512 Kio porte sur les octets réels,
y compris un corps chunked, avant désérialisation. Les écritures avec un Origin
non autorisé sont refusées. La table existante est réutilisée sans migration.
La fusion utilise l’[opérateur JSONB `||` de PostgreSQL](https://www.postgresql.org/docs/current/functions-json.html)
dans le même upsert, avec des paramètres liés.

Sans hôte configuré ou lorsqu’il est indisponible, le transport Next retourne
une erreur explicite. Il ne réactive pas de stockage Next et ne transforme pas
une panne DB en favoris vides. Le stockage local du navigateur reste disponible.
L’activation et la qualification des cookies/OAuth en production restent ouvertes.

Le client attend une lecture valide avant de déclarer la synchronisation prête.
Les lectures simultanées partagent une requête ; les sauvegardes sont sérialisées
et regroupent les modifications locales récentes. Une réponse ancienne ne peut
pas annuler une suppression faite pendant la lecture. Les suppressions en attente
restent dans le stockage local après un échec et un rechargement, jusqu’à la
confirmation de la sauvegarde courante. Les requêtes expirent après dix secondes.
Le client désactive `keepalive` lorsque le corps dépasse la
[limite navigateur de 64 Kio](https://developer.mozilla.org/en-US/docs/Web/API/RequestInit).
Cette qualification ne couvre pas la fusion entre plusieurs appareils ni les
changements de compte dans le même navigateur.

## Qualification

```sh
bun scripts/testing/integration/postgres.ts
bun run test:integration --no-browser
cd apps/site && bun test --isolate tests/favorites-sync.test.ts
```

Le cluster PostgreSQL temporaire et isolé vérifie le stockage JSONB réel, la
conservation des préférences lors d’écritures concurrentes, la séparation des
profils et la suppression des favoris. Aucune base produit n’est utilisée.
Les tests HTTP vérifient les refus d’identité, d’Origin et de corps trop gros,
ainsi que la transmission des credentials par Next. La session de test est
synthétique ; elle ne prouve pas le fonctionnement OAuth réel.
