<!-- SPDX-License-Identifier: Apache-2.0 -->
# Compatibilité OpenAI & Codex

Le document d'autorité pour l'intégration d'OpenAI, du protocole app-server de Codex et de la passerelle Responses API est consigné dans :

➡️ [**Compatibilité OpenAI et Codex de Shenron**](../architecture/openai-compatibility.md)

### Résumé des Frontières d'Intégration
* **Passerelle Responses API** : `/v1/responses` et `/v1/responses/compact` exposés via `aphrody-gateway`.
* **Codex App-Server** : Handshake JSON-RPC 2.0 (`initialize`/`initialized`), cycles `thread/*`, `turn/*` et compaction sans altération des items opaques.
* **Serveur MCP** : Découverte et exécution d'outils Dragon Ball sourcés via `dragonballfr.com/mcp`.
