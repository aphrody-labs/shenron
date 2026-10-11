<!-- SPDX-License-Identifier: Apache-2.0 -->
# CLI Cloudflare et persistance DBFR

Les scripts de [deploy/cloudflare/cli](../../deploy/cloudflare/cli) s'installent via Infra SSH. Le runtime Bun et Wrangler restent ceux installés sous /home/ubuntu/.local/share/aphrody/cloudflare-cli ; aucune dépendance globale supplémentaire. Le wrapper cloudflare-ops est dans ~/.local/bin. Installer depuis un stage vérifié avec sh install-cli.sh ; cela ne remplace ni manifest réel ni credentials.

## Contrat des commandes

cloudflare-ops status|r2|worker|dns|tunnel|migrate|reconcile --manifest FILE

status/reconcile observent les cinq domaines. Une erreur d'un domaine ne cache pas les autres ; une absence d'auth échoue avant réseau. r2 --apply crée seulement le bucket absent. worker --apply exige les checksums configuration/source, déploie par Wrangler strict et relit le déploiement ; une répétition du même manifest avec le même déploiement distant n'en crée pas un nouveau. dns --apply modifie uniquement l'ID de record désigné, après comparaison exacte de l'état précédent et zone active. Il impose aussi une preuve locale épinglée de copie vérifiée, import désactivé et santé, liée au hash du record désiré. Aucun DELETE ni bascule de délégation DNS.

Toute mutation exige --manifest-sha256 HASH correspondant aux octets exacts du manifest, un verrou exclusif et l'accès live au compte. tunnel lit uniquement état/connexions ; création/configuration/token appartiennent au lot propriétaire séparé. migrate vérifie les shards locaux et leurs entrées, ne prétend pas vérifier la copie R2. La copie du corpus reste dans le lot migration, pas dans l'audit journalier.

La CLI reçoit le credential seulement par CLOUDFLARE_API_TOKEN_FILE, fichier propriétaire sans accès groupe/autres, ou credential scellé de systemd sous /run/credentials. Aucun token en argument ni log. L'OAuth Wrangler seul ne constitue pas une authentification REST DNS de cette CLI. Wrangler reçoit le token dans l’environnement enfant CLOUDFLARE_API_TOKEN, avec sortie supprimée, CI et sans métriques ; les erreurs API enregistrent HTTP/codes uniquement.

État privé ~/.local/state/aphrody/cloudflare : latest.json, last-success.json seulement après succès complet, rapports horodatés, worker-applied.json pour idempotence de déploiement. Verrou non volé, erreurs persistées et exit1. Les états anciens peuvent être archivés par une politique Infra ultérieure ; aucune purge implicite.

## Services propriétaires

Catalogue canonique DBFR : /home/ubuntu/src/aphrody/tools/config/service-catalog.json ; scheduler-policy.json et production-topology.json. register-infra.ts prépare sans --apply les ajouts, sauvegarde les catalogues avant, refuse les contrats déjà divergents ; --apply est réservé au lot Infra sous claims. Il conserve toutes les entrées étrangères. Le modèle de boot dérive le tunnel et déclare le timer ; la oneshot est retenue car le timer possède son exécution.

shenron-cloudflared.service : User ubuntu, Restart on-failure, token root:root0400 /etc/aphrody/cloudflare/tunnel-token copié par Infra depuis le store privé existant, LoadCredential et cloudflared --token-file. Métriques 127.0.0.1:20243 uniquement. Aucun hostname ou DNS créé par cette unit.

shenron-cloudflare-audit.timer : chaque jour 04:40 UTC avec délai aléatoire ≤15min, Persistent=true, commande reconcile toujours RO. Sans API credential, le rapport authenticated:false et exit1 signalent le manque réel ; timer reste actif. Après provisionnement root:root0400 de /etc/aphrody/cloudflare/api-token, installer le drop-in audit-credentials.conf.example via Infra et relire l'audit. Le credential n'est jamais inclus au dépôt.

Qualification du 2026-10-11 : tunnel enabled/active, /ready200, loopback20243 ; timer enabled/active. Cela prouve le connecteur, pas le routage de chaque hostname ni une bascule CDN. Le credential natif existant a été réutilisé depuis le store protégé ; audit API réussi, compte/R2/Worker/tunnel qualifiés et zone pending. Les tests ciblés portent les guards DNS, checksum, auth absente sans réseau, état/verrou, permissions Unix, poursuite des lectures après erreur indépendante et transmission interne du credential à l’enfant. Runbook propriétaire : skill aphrody:deploy et docs/operations/infra/BOOT.md du dépôt Infra.

La [référence des déploiements Cloudflare](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/) garantit que deployments[0] est le déploiement actif le plus récent ; cette relecture fonde la garde d'idempotence.

