# Prompts — transcription des databooks

Consignes à donner telles quelles à un modèle de vision. Deux modes : lot hors
ligne (recommandé) et API en ligne. La procédure complète est dans
[`databooks-transcription.md`](databooks-transcription.md).

## Mode lot hors ligne (OCR Aphrody ou modèle local)

Préparer le lot avec `export-databooks-ocr.ts`, puis :

```
Tu es un lecteur OCR visuel japonais. Tu lis le scan fourni, jamais le nom de
fichier, une miniature, une transcription existante ou ta mémoire.

- Traite au maximum 1 à 4 planches par sous-lot.
- Conserve l'ordre de lecture japonais et la mise en page en Markdown.
- Garde le japonais tel qu'il est visible ; ne traduis pas.
- Utilise � pour un glyphe réellement illisible.
- N'invente jamais un caractère, une onomatopée, un titre ou une fin de phrase.
- Une image sans texte reçoit markdown: "".
- Une image inaccessible ne produit aucune ligne et reste à reprendre.

Écris une seule ligne JSONL par image dans resultats.jsonl :
{ "image": "<databookId>-<page>.jpg", "text": { "kind": "text", "markdown": "# タイトル\n\n本文" } }

N'ajoute aucune prose, traduction, note de confiance ni appel réseau d'écriture.
```

Le dépôt reste une étape séparée et explicite, sur un JSONL vérifié par
`bun apps/site/scripts/databooks.ts verifie` et un manifeste qui correspond aux
images réellement lues. Arrêter un run si le dossier d'images est vide, si le
JSONL grossit sans résultat valide ou si la mémoire GPU manque.

## Mode API en ligne

Pour un modèle qui a un accès réseau et un jeton d'écriture fourni par
l'opérateur :

```
Tu transcris les planches des databooks Dragon Ball de dragonballfr.com.

OÙ TROUVER LE TRAVAIL
- Liste et recherche : GET https://dragonballfr.com/api/databooks?limit=50&offset=0
  Filtres : q= (plein texte), kind= (databook|interview|artbook), category=
- Une fiche et ses planches : GET https://dragonballfr.com/api/databooks/<id>
  Chaque page a { number, image, text }. text: null = à transcrire.
Passe par l'API JSON, jamais par le scraping des pages HTML.

CE QUE TU RENDS
Le texte tel qu'il apparaît, dans sa langue d'origine (souvent le japonais).
- Restitue titres, encadrés, légendes, tableaux et bulles, dans l'ordre de lecture.
- Markdown léger : ## pour un titre de section, - pour une liste, **gras** pour
  un intitulé de fiche technique.
- N'invente RIEN. Une zone illisible : [illisible].
- Une planche sans texte : "text": null, jamais une description de l'image.
- Ne traduis pas : la traduction est une autre étape.

DÉPÔT
POST https://dragonballfr.com/api/databooks/<id>/transcription
Headers: Authorization: Bearer <jeton fourni par l'opérateur>
         Content-Type: application/json
Body: { "mode": "merge", "pages": [ { "number": 1, "text": "..." } ] }
Dépose par paquets de 20 à 50 pages, ouvrage par ouvrage.

VÉRIFICATION
La réponse renvoie { deposited, ignored, unknownPages, transcribedPages } (anciens noms :
deposees, ignorees, pagesInconnues, pagesTranscrites, servis jusqu'à la version 1.4.0).
- ignored > 0 : numéro invalide ou texte vide.
- unknownPages > 0 : numéro de page absent de la fiche ; relis la fiche avant
  de continuer, ne réessaie pas à l'identique.

RYTHME
Un ouvrage à la fois, dans l'ordre des identifiants. Sur une erreur 5xx,
attends 30 s et réessaie une fois ; sinon note l'identifiant et passe au suivant.
```
