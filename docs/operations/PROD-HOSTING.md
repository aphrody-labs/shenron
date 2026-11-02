# Hôte unique de production — Shenron

Dernière mise à jour : 2026-11-02. État vérifié depuis SSH `prod`.

## Topologie

~~~mermaid
flowchart LR
  Operateur["Opérations propriétaire"]
  Prod["Prod — Shenron actif<br/>Site · API · Bot · PostgreSQL · Redis · chat temps réel · origine CDN"]
  DBFR["DBFR — disque de secours Shenron<br/>réception rsync restreinte · auto-minio · auto-extraction-ia"]
  VPS["VPS — autres projets préservés<br/>services et résidus dédiés Shenron purgés"]
  Archive["Archives Prod<br/>historique DBFR · snapshots Prod"]
  Operateur -->|SSH prod + tmux| Prod
  Prod -->|snapshot vérifié quotidien| DBFR
  DBFR -->|données DBFR archivées| Archive
~~~

Prod porte l’application Shenron et son stockage de production. DBFR ne sert plus Shenron en direct : il reçoit une copie de secours quotidienne et conserve ses deux workloads indépendants. Le VPS héberge Bun OS et d’autres projets indépendants ; aucun service Shenron n’y tourne. Les dépôts, caches, données et unités Shenron dédiés ont été purgés du VPS sans conserver d’archive de ces résidus. L’archive historique DBFR reste séparée.

## Procédure d’exploitation

- Piloter Shenron par SSH `prod`, avec tmux pour les tâches longues et leurs journaux. Cette migration a été faite directement, sans Aphrody Infra.
- Runtime global : `/usr/local/bin/bun`, upstream officiel oven-sh canary `1.4.4-canary.1+a4c3a5eee`. Les services systemd CDN, audit Cloudflare, renouvellement S3 et copie DBFR l’utilisent. L’ancien binaire Aphrody isolé sous `/srv/shenron/config/cloudflare/runtime/bun` a été retiré.
- Le pair WireGuard Prod↔VPS utilise le port d’écoute UDP fixe 52244 et l’endpoint IPv6 épinglé `[2001:41d0:404:200::4d8e]:51821`. Le handshake, le ping privé et SSH vers `10.200.77.1` ont été rétablis et vérifiés.
- Le timer Prod `shenron-autodeploy.timer` reste désactivé : il pointait vers l’ancienne cible de fabrique.
- DBFR reçoit `/srv/backups/prod-shenron/current` par une clé SSH dédiée limitée à rsync. Le service `shenron-dbfr-backup.timer` copie l’instantané vérifié chaque jour vers 04:00 UTC, avec délai aléatoire et rattrapage au démarrage.
- Conserver séparément les archives DBFR et les sauvegardes Prod : les bases éditoriales diffèrent. Ne jamais restaurer le dump DBFR par-dessus Prod sans comparaison explicite.
- Préserver sur DBFR `auto-minio` et `auto-extraction-ia`, et sur le VPS Bun OS ainsi que les workloads sans lien avec Shenron.

## Prod — état observé le 2026-11-02

Le checkout de build est propre à `3fdad5b8` avant les changements de modèles et de documentation de ce lot. L’image `localhost/shenron:aac017cec3887c7f445284fcfd22fb22dbdf0bae` est active sur `shenron-site` et `shenron-bot` ; les deux sont sains. `shenron-gateway`, `shenron-cloudflared`, `shenron-compute`, `shenron-embed`, `shenron-chat`, `shenron-postgres` et `shenron-redis` sont aussi actifs sur Prod. L’origine CDN écoute sur `127.0.0.1:9077` et répond `cdn ok`. `/api/health` répond 200 ; `/api/local/health` avait rapporté `chat.available=true`. La route `/api/v1/chat/ws` est montée et protégée (401 sans session) ; aucun handshake WebSocket authentifié n’a été qualifié.

Le pointeur historique `/srv/shenron/current` référence encore une ancienne release Docker scellée. Compose fournit l’image réellement active ; le pointeur n’a pas été modifié.

Les migrations 0049 et 0050 ont été appliquées après sauvegardes Prod vérifiées. Le backup pré-déploiement fait 645287642 octets (955 entrées pg_restore) ; le backup pré-0049 fait 645287891 octets en mode 600.

## DBFR — archive historique et secours

L’archive Prod `/srv/shenron/archive/retired-dbfr-20261102` conserve les dumps et données DBFR, profils, secrets, mémoires, sources, rapports, sauvegardes de déploiement, releases et caches. Le dump PostgreSQL de 643981581 octets a été entièrement lu par `pg_restore -f /dev/null` (951 entrées) ; le snapshot Redis de 13556892 octets a le même SHA-256 source/archives. Les conteneurs, images, unités et fichiers Shenron ont été retirés de DBFR ; environ 3 Go de répertoires de données PostgreSQL/Redis ont été libérés. `auto-minio` et `auto-extraction-ia` sont préservés.

Le snapshot Prod `20261102T030452729859Z` est reçu dans `/srv/backups/prod-shenron/current` (PostgreSQL, Redis, SQLite bot et serveur, manifeste). La lecture de retour avec la clé restreinte et `rsync --checksum --dry-run` ne rapporte aucun delta par rapport au snapshot vérifié sur Prod. Le dernier lancement manuel du service de copie s’est terminé avec le code 0. La clé de lecture est volontairement limitée à rsync ; la capacité disque libre de DBFR n’a donc pas été mesurée dans cet audit.

## VPS — résidus Shenron supprimés

Les unités et le timer utilisateur Shenron ont été désactivés, puis les dépôts, releases, workspaces privés, modèle, configurations, caches, outils et artefacts dédiés ont été supprimés du VPS. Les chemins dédiés ont été vérifiés absents ; aucun service, timer, processus, conteneur ou session tmux Shenron ne reste. Aucune archive des résidus VPS n’est conservée sur Prod : l’archive temporaire de 99 Go et son supplément ont été supprimés à la demande du propriétaire. Bun OS et les autres workloads ont été préservés. Les sources et références d’intégration Shenron ont aussi été supprimées du dépôt Bun Video sur le VPS.
