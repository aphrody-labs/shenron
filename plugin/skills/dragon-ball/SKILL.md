---
name: dragon-ball
description: "Vérifie les faits Dragon Ball depuis la référence sourcée embarquée (hors ligne), enrichie par les sources Shenron vivantes quand elles répondent ; cite les preuves et distingue les supports."
---

# Faits Dragon Ball

Appliquer le [contrat partagé](../../references/execution.md) : instantané d'abord,
sources vivantes ensuite et seulement si elles répondent.

## 1. Instantané embarqué (toujours)

Depuis le dossier de cette skill :

```bash
bun scripts/faits.ts sections            # thèmes disponibles
bun scripts/faits.ts cherche "Kaio-ken"  # recherche transverse, source par ligne
bun scripts/faits.ts section techniques  # un thème entier (JSON)
bun scripts/faits.ts citation <id>       # déclaration d'auteur intégrale
```

Sans Bun, lire [la référence sourcée](references/faits.md) (données complètes dans
`references/faits.json`). Elle contient : hiérarchie des sources, couverture du
manga, techniques (graphie, lecture, premier chapitre prouvé par deux databooks),
niveaux de puissance officiels avec chapitre ou databook, multiplicateurs de forme,
économie en zénis, graphies japonaises prouvées, lieux et objets attestés, publications
dérivées de l'éditeur, déclarations d'Akira Toriyama.

**Non embarqué, donc non établi hors ligne** : chronologie en années, bornes des
sagas et arcs, races, transformations, fiches de personnages, texte des databooks,
planches du manga. Ne pas les reconstituer de mémoire.

Canon : [skill dédiée](../dragon-ball-canon/SKILL.md) (`scripts/canon.js`, hors ligne).
Japonais : [lexique et traduction](../dragon-ball-japonais/SKILL.md).

## 2. Sources vivantes (facultatives)

Si l'API ou le MCP répondent, ils complètent l'instantané :

| Besoin | MCP `dragonball_*` | API publique |
| --- | --- | --- |
| Passage du corpus | `rag_search`, `rag_context` | `/api/public/rag/search` |
| Fiche du wiki | `wiki_search`, `wiki_get` | `/api/public/wiki/search` |
| Manga | `manga_search`, puis `manga_page`, `manga_chapter`, `manga_chapter_page` | `/api/public/manga/search` |
| Databook | `databooks_search`, `databooks_plates`, `databooks_get` | `/api/databooks/search` |
| Chronologie | `timeline` | `/api/timeline` |

Détails : [API REST](references/api.md), [MCP et GraphQL](references/mcp-graphql.md).
Lire `error`, `mode`, `sources` et `data_coverage` : un index absent ou une
recherche vide ne prouve aucune absence. Le RAG découvre des passages ; son score et
la prose de `rag_ask` ne sont pas une preuve. Une transcription n'est pas une lecture
vérifiée du scan.

## Réponse

Pour chaque fait : valeur → statut (« établi (instantané, révision, date) »,
« établi (source vivante) » ou « non établi ») → preuve (ouvrage et planche,
tome et chapitre, URL). Distinguer manga, databook, anime et jeux et signaler leurs
divergences. Ne pas extrapoler un chiffre de puissance hors de son support et de son
contexte. `scanlate` exige Koharu et ses modèles ; une délégation A2A exige une
demande qui couvre cet effet ; une écriture passe par
[l'administration](../shenron-admin/SKILL.md).
