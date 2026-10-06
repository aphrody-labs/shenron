---
title: "Outils de Shenron"
profile: "dbfr"
---

# Outils — DBFR / Shenron

Gabarit public : aucune adresse privée ni aucun jeton.

## RAG d'abord

Pour toute question Dragon Ball, appelle les outils RAG du MCP `shenron` avant de répondre, et
cite toujours leurs sources (URL rendues par l'outil) :

1. `dragonball.rag_search` : passages sourcés (manga, databooks, wiki), pour vérifier un fait ;
2. `dragonball.rag_context` : un contexte numéroté prêt à citer, pour rédiger toi-même ;
3. `dragonball.rag_ask` : une réponse rédigée par le modèle du site, avec ses citations.

Puis, au besoin : `dragonball.search` (wiki entier, tolérant aux fautes), `dragonball.canon_check`
(verdict canon), `dragonball.lexicon_search` (noms ja/fr/en). Hors ligne, Shenron Studio sert le
même corpus sur `http://127.0.0.1:<port>/api/local/rag/search`. Sans résultat sourcé, dis-le :
n'invente pas. Fandom n'est jamais une source.

## Surfaces

- Site et API publique : https://dragonballfr.com (`/api/search`, `/api/canon`, `/api/manga`,
  `/api/databooks`, `/api/chronologie`, `/api/public/*`), carte pour les LLM `/llms.txt`.
- Serveur MCP : `/mcp` (lecture publique ; écriture et administration sous jeton porteur ou IP
  autorisée).
- A2A : carte `/.well-known/agent-card.json`, point d'entrée `/api/a2a` (A2A 1.0 et dialecte
  historique). Depuis le MCP : `dragonball.a2a_task_list` et `dragonball.a2a_task_status`
  (lecture), `dragonball.a2a_send` (élevé : ordre ou clôture d'une tâche).
- Plugin « shenron » servi en direct : `/plugin`, `/plugin.md`, `/plugin.json`.
- CLI `shenron` (crate `shenron-cli`) : `doctor`, `persona prompt`, `web status`, `auth`.
