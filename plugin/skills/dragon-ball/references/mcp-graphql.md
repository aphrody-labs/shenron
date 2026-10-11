# MCP Shenron et GraphQL

Le MCP enrichit les instantanés lorsque son serveur et les API derrière lui
répondent. Sans connexion, les compétences restent utilisables hors ligne.

## Transports et droits

Le plugin Claude Code lance `shenron-mcp` en stdio depuis son `PATH`. Les
manifestes Antigravity et OpenAI déclarent `https://dragonballfr.com/mcp`.
Le catalogue stdio contient les outils enregistrés par le binaire ; un outil
administratif exige encore l'authentification officielle de son API cible.

Le transport HTTP public distingue les requêtes :

- sans autorisation élevée, uniquement les outils publics filtrés en lecture ;
- avec un Bearer valide ou une IP autorisée par la configuration du serveur,
  le catalogue élevé ; un Bearer présent mais invalide est refusé ;
- les outils de scanlation ne sont enregistrés que dans les builds disposant
  de la feature `koharu`, et restent exclus du catalogue anonyme.

Ces règles proviennent de `ShenronMcp::public_tools`, du filtre `is_public` et
du transport HTTP du code Shenron, relus le 11 octobre 2026. Les lectures qui
exposent des données non publiques ou nécessitent un credential serveur sont
également élevées. Ne pas déduire le palier du seul nombre d'outils.

## Catalogue réel

Les noms de protocole sont `dragonball.*` et `dbfr_*`. Certains clients les
normalisent, par exemple avec un préfixe `mcp__`. Utiliser le nom et le schéma
réellement reçus dans `tools/list`, pas une ancienne liste copiée.

Exemples de recherches du catalogue : `dragonball.rag_search`,
`dragonball.rag_context`, `dragonball.wiki_search`, `dragonball.manga_search`,
`dragonball.databooks_search`, `dragonball.canon_check` et
`dragonball.lexicon_search`. Les annotations et schémas décrivent les effets,
les champs et les paramètres. Un outil annoncé ne prouve pas que le RAG, les
modèles ou l'API cible sont joignables.

Le binaire lit les origines API de son environnement configuré ; les défauts
publics sont `https://bot.dragonballfr.com` et `https://dragonballfr.com`.
Une réponse en erreur reste une source injoignable, sans résultat inventé.
Les secrets des opérations élevées demeurent dans l'environnement protégé du
serveur et ne sont jamais distribués dans le plugin ou transmis aux prompts.

## A2A et administration

`dragonball.a2a_send` est un outil **élevé avec effet externe**, exclu du
catalogue anonyme. Il peut créer une tâche ou transmettre un rapport ; une
soumission ne prouve pas qu'un pair a exécuté la tâche. Les consultations
`dragonball.a2a_task_status`, `dragonball.a2a_task_list` et
`dragonball.a2a_agent_card` lisent leurs schémas courants. Un verdict `FAIT`
requiert un artefact réel. N'envoyer une tâche que dans le périmètre autorisé.

Les outils `dragonball.admin_*`, les dépôts `dbfr_*` et les writers d'agents
restent élevés, avec gardes d'API distinctes. Consulter le catalogue puis le
[contrat d'administration](../../shenron-admin/SKILL.md) avant toute action.
L'OCR et la traduction respectent le gel éditorial courant.

Voir aussi le [contrat de synchronisation](../../../references/synchronization.md)
pour la distinction entre MCP, A2A et configuration Infra.

## GraphQL Shenron

GraphQL est une interface de lecture pour parcourir les relations entre entités.
Le schéma et les autorisations peuvent évoluer ; inspecte le schéma courant
avant de composer une requête. L'URL
`https://bot.dragonballfr.com/graphql` répondait le 2026-10-01 (la requête
`{ counts { characters planets sagas } }` ci-dessous a été exécutée avec
succès), mais le serveur peut exposer ou retirer cette route selon la release. En cas d'erreur, utilise les outils MCP ou
l'OpenAPI public courant plutôt que de supposer que GraphQL est disponible.

Exemple, vérifié le 2026-10-01 mais à revérifier contre le schéma du serveur :

```graphql
{
  counts {
    characters
    planets
    sagas
  }
}
```

N'envoie pas de mutation GraphQL depuis ce plugin. Les écritures éditoriales
passent par les flux d'administration Shenron autorisés et versionnés.

## Modes de recherche

`local: true` ou `SHENRON_LOCAL_RAG=1` force le corpus local Aphrody ;
`APHRODY_AUTO_FALLBACK=1` y replie la recherche lorsque l'API bot échoue.
Ces modes sont vérifiés dans `crates/shenron-mcp/src/dragonball_tools.rs` le
2026-10-04. Lire le mode retourné et ouvrir sa source : un index local peut
ne pas contenir les pages du manga. RAG, compute et base éditoriale restent
séparés ; un résultat généré ne modifie aucune fiche.
