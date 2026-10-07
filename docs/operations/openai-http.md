<!-- SPDX-License-Identifier: Apache-2.0 -->

# Façade HTTP OpenAI de Shenron

Le serveur Bun répond à `/v1/models`, `/v1/chat/completions`, `/v1/responses`
et `/v1/responses/compact` avant le site Next, y compris pendant son démarrage.
Le moteur reste le fournisseur natif Aphrody : Shenron transmet le corps et
le flux sans reconstruire les items d’outils, les raisonnements ni le compactage.

## Configuration et droits

`SHENRON_OPENAI_BASE_URL` sélectionne explicitement le fournisseur et prend
priorité sur le modèle desktop géré. Le chemin peut terminer par `/v1` ou
désigner son origine. Sans cette variable, le chat desktop conserve ses routes
Models/Chat existantes ; les autres routes utilisent, dans cet ordre,
`APHRODY_AI_CHAT_BASE_URL`, `APHRODY_SHENRON_LLM_BASE_URL`,
`APHRODY_LOCAL_MODEL_URL`, puis le routeur natif géré.

Un client sur la machine locale est admis par la garde existante : pair et hôte
loopback, origine du navigateur cohérente. Pour un client distant,
`SHENRON_OPENAI_TOKEN` doit être configuré dans le store protégé et présenté
comme jeton Bearer. Il n’est jamais transmis au fournisseur. Le jeton amont
est `SHENRON_OPENAI_API_KEY`, sinon `APHRODY_AI_CHAT_API_KEY` ; les cookies
du client ne sont pas relayés. Aucune valeur secrète ne figure dans ce document.
La présence de cette configuration ne modifie pas les droits MCP ou ceux du
chat métier `/api/v1/chat`.

Le transport préserve les statuts et en-têtes utiles du fournisseur, notamment
`x-request-id` et `retry-after`, transmet les octets SSE sans mise en tampon
complète et propage l’annulation. Les redirections ne sont pas suivies.
Les réponses ne sont pas mises en cache et ne posent pas de cookie fournisseur.
Une configuration absente ou invalide répond 503 ; une panne de transport
répond 502, sans divulguer son URL ni ses identifiants.

## Qualification du 7 octobre 2026

- [x] Façade reliée au serveur Bun réel et testée avant démarrage de Next.
- [x] Tests de transmission d’items opaques, outils, `context_management`, SSE
      français/japonais, authentification, annulation et erreurs amont.
- [x] TypeScript du serveur, oxlint et oxfmt du périmètre.
- [x] MCP public : handshake et catalogue de 48 outils constatés sur DBFR ;
      recherche `dragonball.rag_search` réussie via le proxy MCP Aphrody, avec URLs
      de sources conservées.
- [x] Fournisseur DBFR : `/v1/models` répond 200 ; `/v1/responses` reconnaît
      la route et rejette une requête vide avec 400.
- [x] Binaire Linux Bun compilé depuis le worktree propre `ed054786`, 865 modules,
      83 817 952 octets ; `version` et `help` exécutés. SHA-256 :
      `d2ddceefb4283c340bbc68cb010029d3009be35f82237fd03ac80e7cfeb8b502`.
      Ce binaire de qualification n’embarque pas le site ni les ressources natives.
- [ ] Artefact complet de ce lot installé et activé en production.
- [ ] Dialogue Responses réel, outils et reprise avec le modèle livré.
- [ ] Compactage fournisseur puis nouveau tour : le modèle DBFR actuel
      répond **404** sur `/v1/responses/compact`. La façade conserve cet échec ;
      elle ne fabrique pas une fenêtre chiffrée compatible OpenAI.
- [ ] UI desktop, CLI et app-server partageant des sessions natives qualifiées.

Le chat métier et sa mémoire persistante gardent leur contrat. Les réponses
OpenAI brutes ne sont pas automatiquement des conversations Shenron.
La [matrice complète](../architecture/openai-compatibility.md) conserve les
critères de clôture de l’objectif, au-delà de cette façade de transport.

Références officielles : [Responses](https://developers.openai.com/api/reference/resources/responses/methods/create),
[compactage](https://developers.openai.com/api/docs/guides/compaction),
[app-server](https://developers.openai.com/codex/app-server).
