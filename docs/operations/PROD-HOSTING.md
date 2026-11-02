# Hôte unique de production — Shenron

Dernière mise à jour : 2026-11-02. Cette page décrit la cible de consolidation demandée par le propriétaire.

## Topologie

~~~mermaid
flowchart LR
  Prod["Prod — seul hôte Shenron<br/>Site · API · Bot · PostgreSQL · Redis · WebSocket"]
  Archive["Archives DBFR<br/>/srv/shenron/archive/retired-dbfr-20261102"]
  DBFR["DBFR — Shenron retiré après purge<br/>auto-minio et auto-extraction préservés"]
  VPS["VPS — Shenron retiré<br/>Bun OS et autres travaux préservés"]
  Operateur["Opérations propriétaire"]
  Operateur -->|SSH prod + tmux| Prod
  DBFR -->|Dumps et données vérifiés avant retrait| Archive
~~~

Prod est le seul hôte qui sert le site, le bot, l’API et le chat WebSocket temps réel. Les rôles PostgreSQL et Redis de DBFR ne restent pas des réplicas actifs après la migration. DBFR et VPS peuvent continuer à héberger leurs services indépendants.

## Procédure de consolidation

- Piloter le travail par SSH sur prod ; garder les tâches longues dans tmux avec journaux durables.
- Construire avec le Bun officiel upstream canary installé globalement. Vérifier bun --version et bun --revision ; ne pas substituer un runtime dérivé.
- Avant de retirer DBFR : terminer le dump PostgreSQL au format custom, vérifier son contenu par pg_restore --list, exécuter redis-cli SAVE, transférer le RDB puis comparer son SHA-256 entre les hôtes.
- Archiver les données utiles dans /srv/shenron/archive/retired-dbfr-20261102. Les bases DBFR et Prod sont des instantanés différents : conserver le dump DBFR séparé et comparer les données avant toute fusion, remplacement ou suppression de l’archive.
- Après vérification des sauvegardes, retirer uniquement les conteneurs, images, unités et fichiers Shenron de DBFR. Préserver auto-minio, auto-extraction-ia et tout service sans lien avec Shenron.
- Sur VPS, supprimer uniquement les ressources Shenron. Préserver les sessions et tâches Bun OS ainsi que les autres projets.
- Retirer la clé SSH de migration temporaire et ses fichiers sous /run/shenron-migration après les derniers transferts.

## État observé le 2026-11-02

Prod a une sauvegarde PostgreSQL pré-déploiement vérifiée par pg_restore --list (955 entrées). La tentative e9 est rejetée : 0049 a échoué puis rollbacké sur la séquence id absente de db_character_continuities. Le correctif aac017cec3887c7f445284fcfd22fb22dbdf0bae est poussé ; 0049 et 0050 ont ensuite été appliquées avec succès après une sauvegarde pré-0049 de 645287891 octets. Le build aac017 est encore en cours et n’est pas activé.

DBFR : les conteneurs site/bot/gateway et les services applicatifs sont arrêtés. PostgreSQL et Redis restent actifs seulement pour finir et vérifier l’archivage. Ne pas les retirer avant la porte de sauvegarde ci-dessus. VPS : aucune application Shenron ou checkout actif n’a été trouvé lors du contrôle ; les sessions Bun OS sont conservées.
