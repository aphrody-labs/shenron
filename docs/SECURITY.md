# Politique de sécurité

## Signaler une vulnérabilité

Ne pas ouvrir d'issue publique pour une faille de sécurité. Utiliser le canal
privé de GitHub : **Security → Report a vulnerability** sur
`github.com/aphrody-labs/shenron`. À défaut : **contact@aphrody-code.dev**.

Inclure si possible la description de la faille et son impact, les étapes de
reproduction et les versions ou commits concernés.

## Délais indicatifs

- Accusé de réception : sous 72 h.
- Évaluation initiale et plan de correction : sous 7 jours.
- Un correctif est publié avant toute divulgation publique coordonnée.

## Périmètre sensible

- L'API du bot (`apps/bot`) et ses jetons d'administration ;
- l'authentification du site (`apps/site`, Better Auth, OAuth Discord) et les
  clés d'agents `dbfr_agent_…` ;
- le serveur MCP public (`shenron-mcp --public`, lecture seule) ;
- les binaires livrés (`shenron-server`, bot, bureau) et leur garde de données
  privées ;
- l'exposition de données membres.

## Règles pour les contributeurs

- Aucun secret dans le dépôt : `.env` et `data/home/` sont ignorés ; les
  secrets de production sont fournis par l'environnement de l'opérateur
  (`aphrody-infra`). Modèle du bot, valeurs factices uniquement :
  `apps/bot/.env.example`.
- Ne jamais committer une base (`apps/bot/data/*.db`, SQLite, dumps), un corpus
  privé ni un export de données utilisateurs.
- Le build public passe la garde de `scripts/build/server.ts`, qui échoue sur
  toute donnée privée.
