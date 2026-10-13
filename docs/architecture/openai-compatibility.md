<!-- SPDX-License-Identifier: Apache-2.0 -->

# Compatibilité OpenAI et Codex de Shenron

État inspecté le **2026-10-07**. Cette matrice définit les preuves de livraison du
chantier demandé par le propriétaire : UI desktop, passerelle, chat CLI, MCP,
serveur HTTP, mémoire et compactage. L'ajout de l'amont ne prouve pas leur
compatibilité ni leur activation en production.

## Sources de contrat et propriétaires

Shenron ne vendore ni ne construit le dépôt `openai/codex`. Les contrats
Responses et app-server sont vérifiés contre la documentation officielle
[Responses](https://developers.openai.com/api/reference/resources/responses)
et [Codex app-server](https://developers.openai.com/codex/app-server), puis
implémentés dans leurs propriétaires Aphrody (`aphrody-model-client`,
`aphrody-gateway` et `aphrody-app-server`). Shenron consomme ces capacités et
garde ses adaptations de domaine dans ses propres paquets; il ne copie ni les
sources ni les types générés de Codex. Les validations restent versionnées dans
la matrice ci-dessous et n'impliquent pas une activation en production.

## Trois contrats distincts

| Contrat          | Rôle dans Shenron                           | Exigence officielle                                                                                      |
| ---------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Responses API    | Passerelle d'inférence et client de modèles | Objets `response`, items typés, appels d'outils et résultats corrélés, événements SSE et erreurs OpenAI. |
| Codex app-server | Sessions communes au desktop et à la CLI    | RPC bidirectionnel, initialisation, threads, turns, items, interruption et compactage.                   |
| MCP              | Outils Dragon Ball et capacités Aphrody     | Découverte et appel d'outils via le serveur MCP du domaine, avec ses droits et son authentification.     |

Un endpoint de texte Chat Completions ne couvre pas le contrat Responses. Une
route RPC portant un nom Codex ne prouve pas la conformité de ses paramètres,
réponses ou notifications. MCP ne remplace ni Responses ni app-server.

## Réutilisation des propriétaires Aphrody

Inventaire établi dans le checkout Aphrody courant ; une crate présente sur
disque n'est pas nécessairement disponible au commit Aphrody consommé par
Shenron. Les dépendances doivent conserver une révision immuable et passer les
portes de leur propriétaire avant intégration.

| Capacité              | Propriétaire existant                                         | Réutilisation et limite mesurée                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client OpenAI         | `crates/ai/model-client` : `aphrody-model-client`             | `OpenAiCompatClient`, `ProviderRuntime`, `OpenAiWire::Responses`, constructeurs et parseurs Responses existent. Vérifier préservation des items et capacités du modèle, pas seulement les deltas texte. |
| Passerelle HTTP       | `crates/ai/gateway` : `aphrody-gateway`                       | `server::router` expose actuellement `/v1/models` et `/v1/chat/completions` ; `/v1/responses` et `/v1/responses/compact` restent absents de cette table de routes inspectée.                            |
| Runtime d'agent       | `crates/ai/agent-runtime` : `aphrody-agent-runtime`           | `AgentRuntimeBuilder` possède modèle, historique, reprise, fork et outils ; `ModelChoice::local_responses` existe. Réutiliser la boucle, l'annulation et les appels d'outils.                           |
| Protocole desktop/CLI | `crates/contracts/app-protocol` : `aphrody-app-protocol`      | Types de requêtes, notifications, items et threads existants ; vérifier contre les schémas de la documentation officielle.                                                                               |
| Serveur de sessions   | `crates/ai/app-server` : `aphrody-app-server`                 | `AppServer::with_home`, `handle`, `drain_notifications`, `serve_stdio_with` et les méthodes `thread/*` et `turn/*` existent. Leur présence ne prouve pas la parité du protocole.                        |
| Historique durable    | `crates/ai/rollout` : `aphrody-rollout`                       | Réutiliser persistance et reprise des sessions ; qualifier la conservation des items natifs et les restaurations après compactage.                                                                      |
| Home et mémoire       | `crates/ai/agent-home`, `crates/ai/memory`, `crates/ai/store` | Propriétaires `aphrody-agent-home`, `aphrody-memory`, `aphrody-store` : un home isolé par domaine et propriétaire, aucune copie de leurs moteurs dans Shenron.                                          |
| RAG Dragon Ball       | `aphrody-rag` et `aphrody-rag-core`, adaptateurs Shenron      | Garder les citations primaires et l'isolation ; le gel OCR/traduction reste applicable.                                                                                                                 |
| MCP                   | `aphrody-mcp` et `shenron-mcp`                                | Serveur Aphrody canonique pour ses capacités ; Shenron conserve son contrat éditorial et son contrôle d'accès. Aucun alias MCP déprécié à configurer.                                                   |

## Écarts vérifiés au démarrage

- `aphrody-gateway` documente et route Chat Completions et Models. Il faut ajouter
  ou brancher Responses chez ce propriétaire pour couvrir l'utilisation Codex.
- `aphrody-app-server` contrôle déjà l'initialisation d'une connexion. Son
  traitement de `thread/compact/start` renvoie actuellement
  `{"status":"started"}` ; le contrat officiel renvoie `{}` immédiatement et
  porte la progression sur les notifications `turn/*` et `item/*`.
- Le chat Shenron Bun possède déjà home, mémoire et stockage de conversation
  dans `packages/api/src/chat`. Le câblage des mêmes sessions natives dans
  l'UI, la CLI et le serveur HTTP doit être vérifié explicitement.

Ces constats sont des inspections de sources, sans compilation de Codex,
preuve de fonctionnement du modèle réel ni mesure de production dans ce lot.

## Matrice de clôture du chantier

| Surface demandée      | Exigence à satisfaire                                                                                                            | Preuve nécessaire avant clôture                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amont Codex           | Clone officiel épinglé et provenance conservée                                                                                   | Gitlink `160000`, origine officielle, HEAD exact, arbre amont propre, `LICENSE` et `NOTICE` présents ; reconstruction par `submodule update`.               |
| Passerelle OpenAI     | `/v1/models`, `/v1/chat/completions`, `/v1/responses`, `/v1/responses/compact` exposés avec le contrat réellement pris en charge | Requêtes d'un client officiel et de Codex vers le modèle réel, erreurs et SSE vérifiés ; annonce explicite des capacités absentes.                          |
| Responses             | Input multimodal et items d'outils corrélés, usage et statuts terminaux préservés                                                | Tours texte, outils et reprise ; frames découpées, erreur amont, déconnexion, backpressure et annulation qualifiées.                                        |
| App-server            | `initialize` puis `initialized` une fois par connexion ; paramètres/réponses/notifications alignés sur l'épingle                 | Comparaison des schémas amont et Aphrody, refus avant initialisation et seconde initialisation, sessions stdio qualifiées.                                  |
| Chat CLI              | Même identité, home, modèle et session que les autres surfaces ; stream et interruption natifs                                   | Exécution réelle d'un dialogue avec outils, arrêt, reprise après redémarrage et statut terminal vérifié.                                                    |
| UI desktop            | Shenron Studio présente les deltas, outils, erreurs, sources et états des turns ; chaînes localisées FR/EN/JA                    | Parcours dans le vrai binaire packagé : démarrage, dialogue, interruption, reprise et compactage ; aucune preuve limitée au navigateur simulé.              |
| Serveur HTTP          | Hôte Shenron branche les mêmes sessions et les droits du propriétaire                                                            | Requêtes HTTP réelles sur artefact livré, séparation de deux propriétaires, refus d'accès et arrêt propre.                                                  |
| Serveur MCP           | Catalogue et résultats exploitables par Codex et Responses, droits conservés                                                     | Handshake, `tools/list`, appel Dragon Ball avec source primaire, cas négatif d'autorisation ; transports stdio et HTTP déployés qualifiés.                  |
| Mémoire               | Domaine et propriétaire isolés, opt-in respecté, données persistantes récupérées sans fuiter                                     | Deux utilisateurs, redémarrage réel, rappel et suppression ciblée ; aucune donnée privée dans Git ou artefacts publics.                                     |
| Compactage Responses  | Fenêtre `output` officielle entière et items opaques conservés                                                                   | Rejouer toute la fenêtre de `/responses/compact`, puis message suivant, avec appels d'outils et `phase` préservés ; refus clair d'un fournisseur incapable. |
| Compactage app-server | `thread/compact/start` asynchrone, événements et historique cohérents                                                            | Réponse `{}`, item `contextCompaction`, statut terminal, reprise après redémarrage et nouveau turn après compactage.                                        |
| Production            | Build, packaging, installation et activation des artefacts du même SHA                                                           | Portes Bun/Rust du périmètre, sommes des artefacts, déploiement Infra sur DBFR, santé HTTP/MCP, conversation réelle et retour arrière qualifié.             |

## Règles de transport et de contexte

L'app-server Codex parle JSON-RPC 2.0 avec le champ `jsonrpc` omis sur le fil ;
le transport stdio utilise un objet JSON par ligne. Le client envoie
`initialize` avec `clientInfo`, puis la notification `initialized`. Le
transport WebSocket de la documentation officielle reste expérimental ; toute
connexion non locale doit avoir l'authentification prévue, avant
l'initialisation RPC. Un succès de connexion n'accorde aucun droit au domaine.

`turn/start` ne termine pas le tour : le client lit les notifications jusqu'à
`turn/completed`. `turn/interrupt` renvoie `{}` puis conduit à un tour de statut
`interrupted`. Le compactage app-server produit un item `contextCompaction` ;
la notification historique `thread/compacted` est dépréciée.

Pour Responses sans état fournisseur, conserver les items `output` complets,
notamment les raisonnements chiffrés, les appels/résultats d'outils et le champ
assistant `phase`. La réponse de `/responses/compact` devient la fenêtre
canonique suivante **dans son intégralité** : aucun filtrage ou remplacement
par un résumé Shenron. Les items chiffrés restent opaques et liés au fournisseur.
La mémoire persistante d'un utilisateur et la fenêtre de contexte d'un modèle
ont des contrats séparés.

Le compactage automatique Responses emploie
`context_management: [{"type":"compaction","compact_threshold":...}]` lorsqu'il
est pris en charge. Le mode chaîné `previous_response_id` reçoit uniquement les
nouveaux inputs et conserve l'identifiant ; les instructions précédentes ne
sont pas automatiquement reportées. `conversation` et `previous_response_id`
ne se combinent pas. Une éventuelle conversion Chat Completions ne doit pas
supprimer silencieusement des items Responses qu'elle ne sait pas représenter.

## Sources officielles consultées

- [Codex app-server](https://developers.openai.com/codex/app-server) : transports,
  initialisation, threads, tours, notifications et compactage.
- [État de conversation](https://developers.openai.com/api/docs/guides/conversation-state) :
  conservation des items, `phase`, Conversations et chaînage Responses.
- [Compactage](https://developers.openai.com/api/docs/guides/compaction) : compactage
  automatique et fenêtre canonique du endpoint autonome.
- [Référence Responses](https://developers.openai.com/api/reference/resources/responses/methods/create)
  et [compact](https://developers.openai.com/api/reference/resources/responses/methods/compact).
- [Dépôt officiel Codex](https://github.com/openai/codex) : référence amont, non vendored.

Les documents web peuvent évoluer après cette inspection. Toute divergence
exige une nouvelle qualification, sans transformer une intention ou un test
synthétique en preuve d'activation.
