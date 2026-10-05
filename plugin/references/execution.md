# Exécution Shenron — contrat partagé

Le plugin fonctionne **hors ligne d'abord** : il ne suppose ni l'accès à
dragonballfr.com, ni l'API, ni le MCP `dragonball_*`, ni le RAG, ni un checkout du
code Shenron ou d'Aphrody. Tout ce qu'il faut pour répondre voyage dans le dossier
du plugin.

## Ordre des sources

1. **Instantanés embarqués** (toujours disponibles) : références générées depuis le
   dépôt Shenron et scripts autonomes lancés par `bun`. Leur registre,
   [`instantane.json`](instantane.json), donne pour chaque fichier la révision Git
   et la date de ses sources. Sans Bun, lire directement les fichiers `.md` et
   `.json` des dossiers `references/`.
2. **Sources vivantes, facultatives** : API publique (`https://dragonballfr.com`,
   `https://bot.dragonballfr.com`), outils MCP `dragonball_*` (serveur
   `shenron-mcp` déclaré par ce plugin, ou le même catalogue exposé par un autre
   client), RAG. Elles **enrichissent** une réponse quand elles répondent ; elles ne
   la conditionnent jamais. Une seule sonde courte suffit : sur un délai dépassé, un
   503, un `error` dans la réponse ou un outil absent, revenir à l'instantané sans
   insister ni réessayer en boucle.
3. **Code du dépôt** (`apps/`, `packages/`, `docs/`), seulement s'il est présent :
   c'est un outil de mainteneur, jamais un prérequis.

## Statut de chaque fait

- **établi (instantané)** : lu dans une référence embarquée ; citer la source de
  l'enregistrement, puis la révision et la date de l'instantané.
- **établi (source vivante)** : lu dans une réponse de l'API, du MCP ou du RAG qui
  cite son passage primaire ; citer l'URL et la date de consultation.
- **non établi** : rien d'embarqué ni de joignable ne le prouve. Le dire, laisser le
  champ vide. Ne jamais inventer, extrapoler ni compléter de mémoire.

Un score RAG, une prose générée ou une recherche vide ne prouvent rien. Une source
vivante qui contredit l'instantané l'emporte si elle cite sa preuve ; signaler
l'écart. Fandom est interdit comme source, en rédaction comme en image ; le manga,
les scans et les déclarations d'Akira Toriyama priment.

## Effets externes

Une maintenance du plugin ne donne aucun droit de production. Une écriture
éditoriale, une commande Discord ou une action de service exige une demande qui
couvre cet effet **et** une authentification officielle disponible ; sans elle,
livrer la requête exacte et la proposition, sans rien écrire
([administration](../skills/shenron-admin/SKILL.md)). Les secrets restent dans
l'environnement protégé : jamais dans les prompts, arguments, URLs, fichiers du
plugin, reçus ou journaux. Les lecteurs et traducteurs proposent ; Shenron valide
et dépose. PostgreSQL est la source éditoriale, SQLite le réplica du bot : aucun
accès direct à une base depuis le plugin. Aucune écriture OCR ou traduction
pendant un gel des databooks.
