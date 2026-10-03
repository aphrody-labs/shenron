---
name: databooks-ocr
description: "Transcrit visuellement un scan japonais Dragon Ball en JSONL fidèle ; sans image lisible, signale SCAN_INDISPONIBLE."
---

# OCR visuel des databooks

Appliquer le [contrat partagé](../../references/execution.md).

Ouvrir réellement le scan fourni par le parent, avec sa clé
`<databookId>-<page>.jpg`. Limiter un sous-lot à quatre planches et relire
visuellement chaque résultat. Sans image accessible : `SCAN_INDISPONIBLE`,
aucune ligne JSONL pour cette entrée. Le corpus et le MCP contextualisent la
lecture ; ils ne remplacent jamais le scan.

Lire haut→bas, droite→gauche, bloc par bloc ; restituer titres, listes et
paragraphes en Markdown japonais, sans traduction. Un glyphe illisible devient
`�` ; ne compléter ni phrase ni onomatopée devinée. Une planche réellement sans
texte reçoit une chaîne vide.

Une ligne par image, sans prose autour :

```json
{"image":"323-0007.jpg","text":{"kind":"text","markdown":"# タイトル\n\n本文"}}
```

Le lecteur ne reçoit aucun jeton et n'appelle aucun outil admin. Le parent
compare au scan, puis utilise le flux Shenron autorisé et son juge de qualité.
[Export, validation, benchmark et dépôt](references/lots.md) uniquement pour
un lot ; [corrections du corpus](references/corrections.md) uniquement pour
une maintenance. Ne pas confondre une proposition avec un dépôt effectué.
