# Sauvegarde et reprise

## Sauvegardes

- Prod produit un instantané vérifié (PostgreSQL, Redis, SQLite du bot et du serveur, manifeste). Scripts: `scripts/backup-shenron-pg.sh` et `scripts/backup-shenron-sqlite.sh`.
- Une clé SSH dédiée, limitée à rsync, copie `/srv/backups/prod-shenron/current` vers dbfr chaque jour (`shenron-dbfr-backup.timer`, vers 04:00 UTC).
- L'archive historique de dbfr est `/srv/shenron/archive/retired-dbfr-20261102` sur prod. Elle contient les dumps, profils, mémoires, sources et releases de l'ancien hôte.
- Les bases éditoriales de dbfr et de prod diffèrent. Ne jamais restaurer le dump dbfr sur prod sans comparaison explicite.
- Avant toute migration: dump vérifié par `pg_restore -f /dev/null`.

## Panne du 2026-11-04

De 17:59 à environ 23:53 UTC, dragonballfr.com a répondu 502. Une session a exécuté `docker stop` et `docker rm` sur `shenron-bot`, `shenron-chat`, `shenron-compute`, `shenron-embed` et `shenron-site`, puis `rm -rf /srv/shenron/models`, en suivant une consigne de réduire prod à nginx, docker, base et CDN.

Reprise:

1. site, bot, embed et compute relancés avec `docker compose up -d --no-deps --no-recreate <service>` sur l'image `f04de517`.
2. e5 et l'adaptateur de chat copiés depuis `/srv/shenron/archive/retired-dbfr-20261102`. Runtime llama copié depuis bunos vers `/srv/shenron/models/llama`.
3. chat restauré le 2026-11-05 vers 05:40 UTC: `base.gguf` retéléchargé sur prod à la révision Hugging Face épinglée, empreinte SHA-256 vérifiée contre celle épinglée dans la configuration du modèle de chat.
4. Le dry-run complet du compose est propre, donc un redémarrage de l'hôte est sûr.

## Ce qu'on retient

- Le compose fait dépendre site et bot de chat et compute. Un `up` simple échoue si un modèle manque; utiliser `--no-deps`.
- Garder une copie des modèles hors de `/srv/shenron/models` avant toute opération de nettoyage.
- Ne pas utiliser le GGUF Qwen3 « Uncensored » local comme base de chat.
- Un nettoyage de prod se découpe en actions nommées, vérifiées une à une. Une instruction large ne l'autorise pas.
