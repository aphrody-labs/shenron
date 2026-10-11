<!-- SPDX-License-Identifier: Apache-2.0 -->

# Limite de débit de l'authentification Bun

L'hôte `@aphrody/shenron-api/host` active en production la limite Better Auth :
100 requêtes par fenêtre de 60 secondes, avec les règles spécifiques des
endpoints de Better Auth 1.7.6. Les sessions restent en PostgreSQL via Bun.SQL.

Avec `REDIS_URL`, les instances partagent le compteur dans l'espace de clés
`dbfr:ba-rate-limit:` déjà employé par le site. Une commande Lua `EVAL` groupe
l'incrément, la pose de l'expiration et la lecture du délai restant ; elle répare
aussi une clé héritée sans expiration. Aucun stockage de session n'est déplacé.

Sans Redis ou en cas de panne (attente Redis bornée à une seconde), un compteur
mémoire maintient une protection par processus. Ce repli ne garantit pas un
budget global pendant la panne.
Il conserve au maximum 10 000 fenêtres actives et refuse de nouvelles clés
tant qu'aucune place n'expire. L'arrêt de l'hôte ferme le client Redis et
le pool PostgreSQL de l'authentification.

Validation du 7 octobre 2026 : suite API complète, 241 tests passants, aucun
échec ; typecheck du paquet API, oxlint/oxfmt ciblés et conformité du paquet
sans erreur. Un Redis isolé sans persistance a confirmé 5 acceptations sur
40 requêtes concurrentes provenant de deux compteurs, l'expiration de la fenêtre
et la réparation d'une clé sans TTL. Le parcours OAuth Discord réel et la
bascule de production restent à qualifier séparément.
