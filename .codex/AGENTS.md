# Contexte Codex — Shenron

Lire aussi `.codex/SHENRON-MEMORY.md` pour la carte factuelle du dépôt. Cette
carte est un index de navigation ; les fichiers de code et les sources de
vérité qu’elle cite priment en cas d’écart.

Lire aussi `.codex/SHENRON-MEMORY.md` pour la carte factuelle du dépôt. Cette
carte est un index de navigation ; les fichiers de code et les sources de
vérité qu’elle cite priment en cas d’écart.

Répondre et documenter en français. Pour une question sur Dragon Ball, Shenron ou
les données publiées par dragonballfr.com, utiliser le MCP **Shenron** configuré
dans ce dépôt sous le nom `shenron` (`https://dragonballfr.com/mcp`). Ne pas le
confondre avec Claude Code ni avec les serveurs MCP Aphrody (`aphrody_vps_admin`,
`aphrody-tunnel`) : ils ont des propriétaires et des droits distincts.

Le MCP Shenron public donne accès à la lecture. Ses outils d’écriture et
d’administration nécessitent un jeton accepté par le serveur Shenron ou une IP
autorisée par sa configuration. Ne pas présenter une connexion publique comme
un accès admin ; ne pas réutiliser un jeton Aphrody ou un jeton d’API admin
Shenron comme jeton MCP sans validation explicite du serveur.

Le serveur Shenron de production est `https://dragonballfr.com/mcp`. Son jeton
admin dédié est `SHENRON_MCP_TOKENS` (Bearer) ; le jeton API
`SHENRON_ADMIN_TOKEN` n’est pas interchangeable. Codex lit le jeton de
`SHENRON_MCP_TOKENS` depuis l’environnement de son processus.

La configuration d’un connecteur ne garantit pas que le transport MCP soit
disponible : vérifier `codex mcp list` et la réponse du serveur avant d’affirmer
que les outils sont utilisables.
