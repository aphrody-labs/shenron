# Hôte unique de production — Shenron

Dernière mise à jour : 2026-11-02. Cette page décrit la consolidation réalisée à la demande du propriétaire.

## Topologie

~~~mermaid
flowchart LR
  Operateur["Opérations propriétaire"]
  Prod["Prod — hôte Shenron<br/>Site · API · Bot · PostgreSQL · Redis · chat temps réel"]
  Archive["Archives DBFR<br/>/srv/shenron/archive/retired-dbfr-20261102"]
  DBFR["DBFR — Shenron retiré<br/>auto-minio · auto-extraction-ia préservés"]
  VPS["VPS — aucun service Shenron<br/>Bun OS et autres projets préservés"]
  Operateur -->|SSH prod + tmux| Prod
  DBFR -->|données vérifiées avant purge| Archive
~~~

Prod est le seul hôte Shenron. DBFR et VPS restent disponibles pour leurs services indépendants ; ils ne servent plus l’application Shenron.

## Procédure d’exploitation

- Piloter les opérations Shenron par SSH `prod`, avec tmux pour les tâches longues et leurs journaux. Cette migration a été faite directement, sans Aphrody Infra.
- Le Bun global utilisé est l’upstream officiel oven-sh : `/root/.bun/bin/bun`, `1.4.4-canary.1+129f3c7a8` (`Bun.revision` `129f3c7a8`). Ne pas employer le runtime dérivé Aphrody pour ce projet.
- Conserver les instantanés DBFR dans l’archive : la base DBFR était différente de la base Prod. Ne pas restaurer son dump par-dessus Prod sans comparaison explicite.
- Préserver sur DBFR `auto-minio` et `auto-extraction-ia` ; sur VPS préserver Bun OS et les workloads sans lien avec Shenron.
- Retirer les clés et fichiers temporaires de migration après la fin des transferts.

## État observé le 2026-11-02

Le checkout Prod est sur `6b24de0f` (`origin/main`), qui intègre le correctif `aac017cec3887c7f445284fcfd22fb22dbdf0bae`. Le build officiel canary a réussi et l’image `localhost/shenron:aac017cec3887c7f445284fcfd22fb22dbdf0bae` est active pour `shenron-site` et `shenron-bot` ; les deux conteneurs sont sains. `/api/health` répond 200. `/api/local/health` rapporte `chat.available=true`. La route `/api/v1/chat/ws` est montée et protégée : sans session, elle répond 401. Une connexion WebSocket authentifiée n’a pas été exercée.

Les migrations 0049 et 0050 ont été appliquées après sauvegardes Prod vérifiées. Le backup pré-déploiement fait 645287642 octets (955 entrées pg_restore) ; le backup pré-0049 fait 645287891 octets en mode 600.

### DBFR

L’archive Prod `/srv/shenron/archive/retired-dbfr-20261102` conserve les dumps et données utiles, ainsi que les profils, secrets, mémoires, sources, rapports, sauvegardes de déploiement, releases et caches. Le dump PostgreSQL de 643981581 octets a été entièrement lu par `pg_restore -f /dev/null` (951 entrées) ; le snapshot Redis de 13556892 octets a le même SHA-256 sur source et archive (`19056f30eddc00f5b06b3b1d399ed483b9df14028403c242909ce15a73d29d37` pour PostgreSQL, `5cd5fc1d53537d836fe51cc08459d4fd9c6fd77cf3f8c40949a918ca92df5c87` pour Redis). Les services, conteneurs, images et fichiers Shenron ont été retirés ; environ 3 Go de répertoires de données PostgreSQL/Redis ont été libérés. Seuls `auto-minio` et `auto-extraction-ia` restent parmi les conteneurs observés.

Un résidu systemd `shenron-sqlite-sync.service` était encore visible comme `not-found/failed`, sans fichier d’unité installé. Il n’a pas été possible de vérifier ou réinitialiser cet état d’exécution après le retrait de l’accès temporaire. La mesure disque finale DBFR n’a pas été obtenue.

### VPS

Aucun conteneur, image, unité installée ou chemin Shenron n’a été trouvé lors de l’audit conduit depuis Prod. Les sessions tmux sans lien Shenron ont été préservées ; l’espace libre observé était de 32 Go sur `/` et 47 Go sur `/home`. `webos-qualify` n’était présent dans aucun des sockets tmux contrôlés ; aucune conclusion n’est tirée sur d’autres sockets non contrôlés.
