# Connexion et session du site sur Bun

La route Next `/api/auth/*` et la façade `sessionAuth` ne démarrent plus
d'instance Better Auth locale. Le serveur Bun possède la connexion Discord,
les cookies, la lecture de session et les transactions d'authentification.
Le relais conserve les redirections OAuth sans les suivre.

`SHENRON_HOST_URL` est obligatoire pour un site Next lancé indépendamment. Sans
cette configuration, les endpoints retournent `503 auth_unavailable` sans
cache ; les composants serveur n'obtiennent aucune session. Une panne du
backend suit le même comportement, sans repli vers une base locale.

Le serveur autonome fournit automatiquement au rendu standalone une URL
`http://127.0.0.1:<port du frontal Bun>` après avoir ouvert son frontal. Les
routes d'authentification sont servies par Bun avant le relais vers Next, y
compris pendant le démarrage du rendu. L'adresse d'écoute publique ne devient
pas une adresse de connexion au backend.
Le backend revendique `/api/auth/*` même lorsque sa configuration est absente :
il répond alors directement `503`. Le frontal ne renvoie jamais ces requêtes
à Next, ce qui évite une boucle entre le relais et le backend désactivé.

Les tests du relais emploient un serveur HTTP jetable : cookie transmis,
session fraîche, redirection Discord conservée, configuration absente et
backend inaccessible. Ils ne valident pas un parcours OAuth réel chez Discord.
Les anciens modules du site qui servent encore les outils administratifs et
les accès éditoriaux à PostgreSQL restent à migrer ; ce lot ne prouve pas la
sortie complète du backend de Next.
