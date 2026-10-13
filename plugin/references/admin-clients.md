# Clients MCP administratifs

Le serveur public reste accessible anonymement en lecture seule. Le compte du
propriétaire et ses agents utilisent la même URL `https://dragonballfr.com/mcp`
avec un Bearer fourni par le store privé du client. Aucun jeton ne vit dans ce
plugin public, son manifeste, les arguments de lancement ou les rapports.

Pour Codex, une entrée privée de configuration utilise les champs natifs suivants
([documentation officielle](https://learn.chatgpt.com/docs/developer-commands#codex-mcp)) :

```toml
[mcp_servers.shenron]
url = "https://dragonballfr.com/mcp"
bearer_token_env_var = "SHENRON_MCP_TOKEN"
```

`SHENRON_MCP_TOKEN` est une référence client : injecter sa valeur depuis le store
autorisé avant le démarrage du client. Le serveur accepte les entrées de
`SHENRON_MCP_TOKENS`, ainsi que ses credentials administratifs
`SHENRON_ADMIN_TOKEN`, `SHENRON_API_ADMIN_TOKEN` et `DBFR_TOKEN`. Les valeurs
courtes sont rejetées ; une authentification inconnue renvoie 401, sans
déclassement silencieux. Ne pas élargir `SHENRON_MCP_ALLOWED_IPS` pour remplacer
l'authentification.

Les autres clients doivent utiliser leur mécanisme de secrets ou de référence
d'environnement documenté. Une interpolation d'environnement non supportée ne
constitue pas une configuration authentifiée. Les manifestes OpenAI et AGY du
plugin restent des manifestes publics ; l'élévation est propre au client installé.

Codex accepte aussi `http_headers_helper` et Claude Code `headersHelper`
([Codex](https://learn.chatgpt.com/docs/extend/mcp#streamable-http-servers),
[Claude Code](https://code.claude.com/docs/en/mcp)). Ces commandes lisent le coffre
privé et renvoient uniquement un objet JSON d'en-têtes au client. Sur Windows,
le helper installé `~/.aphrody/bin/shenron-agent.ts --headers` lit
`Bun.secrets` dans Windows Credential Manager (`shenron-mcp`, `owner-admin`).
La configuration ne contient que son chemin absolu et celui du runtime Bun.

Le client Aphrody utilise `bearer_token_env_var = "SHENRON_MCP_TOKEN"`.
Le wrapper privé `shenron-agent.ts -- aphrody mcp …` injecte cette variable dans
le seul processus enfant. Ne jamais lancer `--headers` dans un terminal interactif
ni copier sa sortie dans un rapport. Une connexion rejetée doit être corrigée
avant de déclarer l'accès administratif opérationnel.

L'authentification entrante et l'authentification des API aval sont distinctes.
Les commandes et services du bot préfèrent `SHENRON_API_ADMIN_TOKEN`, puis
`SHENRON_ADMIN_TOKEN`. Les dépôts databooks préfèrent
`SHENRON_DATABOOKS_API_TOKEN`, puis `DATABOOKS_API_TOKEN`, `SHENRON_ADMIN_TOKEN`
et `DBFR_TOKEN`. Les outils `agent_*` gardent leur clé `SHENRON_AGENT_API_KEY`
et leurs scopes : un Bearer administratif entrant ne fabrique pas cette clé.

Après configuration et reconnexion, vérifier `tools/list` authentifié et anonyme
séparément, puis lire un catalogue administratif. L'exposition des outils ne
prouve pas qu'une API aval accepte son credential. Les écritures demandées se
vérifient par une lecture indépendante selon le [contrat administratif](../skills/shenron-admin/SKILL.md).
