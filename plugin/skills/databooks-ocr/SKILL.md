---
name: databooks-ocr
description: "Transcrit visuellement un scan japonais Dragon Ball fourni en JSONL fidèle, sans pipeline ni réseau ; sans image lisible, signale SCAN_INDISPONIBLE."
---

# OCR visuel des databooks

Appliquer le [contrat partagé](../../references/execution.md).

Le travail se fait **sur l'image fournie**, ouverte réellement (outil de lecture
d'image), sans chaîne OCR, sans API et sans dépôt. Clé attendue :
`<databookId>-<page>.jpg` ; sans clé, utiliser le nom du fichier fourni. Limiter un
sous-lot à quatre planches et relire visuellement chaque résultat. Sans image
accessible : `SCAN_INDISPONIBLE`, aucune ligne JSONL pour cette entrée. Un corpus,
un MCP ou un ancien texte peuvent contextualiser la lecture ; ils ne remplacent
jamais le scan.

Lire haut→bas, droite→gauche, bloc par bloc ; restituer titres, listes et
paragraphes en Markdown japonais, sans traduction. Un glyphe illisible devient `�` ;
ne compléter ni phrase ni onomatopée devinée. Une planche réellement sans texte
reçoit une chaîne vide. Une petite zone se relit sur un recadrage (si un outil de
recadrage est disponible) ; sinon le signaler.

Une ligne par image, sans prose autour :

```json
{"image":"323-0007.jpg","text":{"kind":"text","markdown":"# タイトル\n\n本文"}}
```

Contrôles hors ligne utiles : noms propres avec
`bun ../dragon-ball-japonais/scripts/lexique.js termes "<texte>"` (un nom absent du
lexique n'est pas une faute) ; confusions fréquentes et contre-exemples dans les
[invariants de correction](references/corrections.md).

Le lecteur ne reçoit aucun jeton et n'appelle aucun outil admin : il livre le JSONL
et ses limites (zones illisibles, doutes). Le dépôt est un effet externe séparé :
voir [administration](../shenron-admin/SKILL.md), qui sans authentification produit
la requête exacte sans l'exécuter. [Commandes de lot du dépôt](references/lots.md) :
mainteneurs seulement. Ne pas confondre une proposition avec un dépôt effectué.
