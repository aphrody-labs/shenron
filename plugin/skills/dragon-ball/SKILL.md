---
name: dragon-ball
description: "Vérifie les faits Dragon Ball via les sources Shenron, cite les preuves et distingue les supports."
---

# Faits Dragon Ball

Appliquer le [contrat partagé](../../references/execution.md).

Ne répondre à un fait que depuis une preuve vérifiée. Sans source accessible,
signaler la limite et laisser le champ non établi vide.

| Besoin | Outil `dragonball_*` |
| --- | --- |
| Trouver un passage | `rag_search`, `rag_context` ; ouvrir les sources pertinentes |
| Fiche existante | `wiki_search`, puis `wiki_get` |
| Canon | `canon_check`, `canon_references` ; [doctrine](../dragon-ball-canon/SKILL.md) |
| Manga | `manga_search`, puis page/chapitre/planche correspondant |
| Databook | `databooks_search` pour l'ouvrage, `databooks_planches` pour son texte, `databooks_get` pour le détail |
| Japonais | [lexique et traduction](../dragon-ball-japonais/SKILL.md) |
| Écriture autorisée | [administration](../shenron-admin/SKILL.md) |

Le RAG découvre des passages ; son score et la prose de `rag_ask` ne sont pas
une preuve. Lire `error`, `mode`, `sources` et `data_coverage` : un index absent
ou une recherche vide ne prouve aucune absence dans le manga. Une transcription
n'est pas une lecture vérifiée du scan. Le wiki rapporte ses données ; une
citation éditoriale doit remonter au passage primaire.

Citer l'URL et l'identifiant de la pièce (tome, chapitre, ouvrage, planche),
distinguer manga, databook, anime et jeux, signaler leurs divergences. Ne pas
extrapoler un chiffre de puissance hors de son support et contexte.

Charger selon le besoin : [API REST](references/api.md) sans MCP ;
[MCP/GraphQL, modes locaux et effets externes](references/mcp-graphql.md) pour
l'intégration. `scanlate` nécessite Koharu et ses modèles ; une délégation A2A
nécessite une demande couvrant cet effet. Ne pas annoncer un service opérationnel
sans sonde. Les repères [hors ligne](references/lore.md) orientent seulement la
recherche et ne fondent aucun fait.
