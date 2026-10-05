# Databooks — transcription, OCR et API

Procédure d'export, de transcription et de réinjection des planches de
databooks. Les règles de qualité (juges, découpe, lexique) sont dans
[`databooks-doctrine.md`](../reference/databooks-doctrine.md) ; la traduction
dans [`TRADUCTION-DATABOOKS.md`](TRADUCTION-DATABOOKS.md) ; les consignes à
donner à un modèle de vision dans
[`prompt-transcription-databooks.md`](prompt-transcription-databooks.md).

## 1. Exporter des lots

```bash
bun apps/site/scripts/export-databooks-ocr.ts --sortie <dossier-lots> --taille 400
```

`DATABASE_URL` vient de l'environnement (dernière ligne `^DATABASE_URL=` du
`.env`, jamais la première).

| Option           | Défaut            | Rôle                                                 |
| ---------------- | ----------------- | ---------------------------------------------------- |
| `--sortie <dir>` | `~/databooks-ocr` | Racine des lots                                      |
| `--taille <n>`   | `400`             | Planches par lot                                     |
| `--lot <n>`      | —                 | N'exporter qu'un lot                                 |
| `--largeur <px>` | `1600`            | Redimensionnement (l'OCR n'a pas besoin de 4 000 px) |
| `--qualite <n>`  | `82`              | Qualité JPEG                                         |
| `--tout`         | non               | Inclure les planches déjà transcrites                |
| `--plan`         | non               | N'estime que le volume, n'écrit rien                 |
| `--force`        | non               | Refaire un lot déjà présent                          |

Chaque lot est autonome et la commande est relançable (les lots écrits sont
sautés) :

```
lot-001/
  manifeste.json     # entrées + format de réponse attendu
  images/1-0001.jpg  # <databookId>-<page sur 4 chiffres>.jpg
```

Une entrée de `manifeste.json` :

```json
{
	"databookId": 1,
	"page": 1,
	"titre": "Dragon Ball Daizenshuu 1 — Complete Illustrations",
	"kind": "artbook",
	"categorie": "Art Book",
	"image": "images/1-0001.jpg"
}
```

Les manifestes récents portent aussi les empreintes SHA-256 du scan original et
du JPEG réduit, exigées par les adaptateurs de candidats Koharu/Aphrody
([`koharu/README.md`](../products/koharu/README.md)).

## 2. Chaîne OCR Aphrody

L'OCR des lots tourne hors ligne avec la CLI `aphrody` compilée avec la feature
`ocr` (poste GPU) ; Shenron reste le juge et l'unique écrivain :

```bash
aphrody ocr shenron doctor
aphrody ocr shenron emit <id> --out <lot>
bun apps/site/scripts/databooks.ts verifie <lot>/resultats.jsonl
bun apps/site/scripts/depose-transcriptions.ts <lot>/resultats.jsonl --simulation
bun apps/site/scripts/databooks.ts depose <lot>/resultats.jsonl
```

Les sous-commandes exactes se lisent par `aphrody ocr shenron --help`.

Règles :

- `--skip-done` rend la reprise idempotente.
- Un résultat sans texte n'est jamais déposé par défaut : il ne doit pas effacer
  une transcription existante.
- Le dépôt n'a lieu qu'après les deux juges : l'audit natif d'Aphrody (jetons de
  contrôle, boucles, CJK compris, alphabet étranger mêlé au japonais) et
  `classerDefaut` de ce dépôt. En cas de défaut bloquant, le JSONL est conservé
  pour relecture et rien n'est déposé.
- Un lot mixte n'est pas publié partiellement : séparer les pages saines des
  pages fautives et auditer le sous-lot avant dépôt.
- Ne pas utiliser `--force` pour contourner l'audit : une page vide, en boucle
  ou dans une langue étrangère se relit sur son scan.
- Un lot de planches très lourdes (plus de 4 Mio en moyenne) va directement à
  PP-OCR : un VLM y est trop lent pour un gain nul (mesuré).
- Le jeton d'écriture vient de l'environnement ; il n'apparaît ni dans les
  journaux ni dans ce document.

Après un dépôt accepté : vérifier les compteurs par l'API, puis relancer le
réplica et le RAG selon la doctrine.

## 3. Réinjecter par l'API

```bash
curl -X POST https://dragonballfr.com/api/databooks/1/transcription \
  -H "Authorization: Bearer $DATABOOKS_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"merge","pages":[{"number":1,"text":"…"},{"number":2,"text":"…"}]}'
```

- **`merge` (défaut)** — ne touche que le champ `text` des pages citées ;
  l'image et les pages absentes restent intactes. Idempotent : c'est le mode des
  traitements par lots.
- **`replace`** — remplace tout le tableau de pages ; à réserver à une reprise
  complète (les images non redonnées sont conservées).
- `description` (facultatif) — chapô de la fiche, en Markdown.
- `"text": null` **efface** la transcription d'une page. Une chaîne vide ou
  blanche est **ignorée** : c'est presque toujours une planche illisible, et
  l'effacer détruirait une bonne transcription au passage suivant.

Réponse :

```json
{
	"id": 1,
	"mode": "merge",
	"deposited": 2,
	"ignored": 0,
	"duplicates": 0,
	"unknownPages": 0,
	"totalPages": 40,
	"transcribedPages": 2
}
```

Les anciens noms (`deposees`, `ignorees`, `doublons`, `pagesInconnues`, `pagesTotal`,
`pagesTranscrites`) restent servis en doublon déprécié jusqu'à la version 1.4.0.

`unknownPages` > 0 signale un décalage entre le lot exporté et la base :
réexporter le lot. Chaque dépôt écrit une révision dans `public.wiki_revisions`,
réversible depuis `/admin/wiki/history`. Limites : 40 000 caractères par
planche, 2 000 pages par appel.

## 4. API databooks

Lecture publique, écriture par jeton porteur. CORS ouvert : l'écriture est
protégée par le jeton, pas par l'origine.

| Méthode  | Route                                                     | Auth  |
| -------- | --------------------------------------------------------- | ----- |
| `GET`    | `/api/databooks?q=&kind=&category=&limit=&offset=&order=` | —     |
| `GET`    | `/api/databooks/:id`                                      | —     |
| `POST`   | `/api/databooks`                                          | jeton |
| `PATCH`  | `/api/databooks/:id`                                      | jeton |
| `DELETE` | `/api/databooks/:id`                                      | jeton |
| `POST`   | `/api/databooks/:id/transcription`                        | jeton |

- `q` fait une recherche plein texte française (titre, titre japonais, auteur,
  description), adossée à l'index GIN `db_databooks_fts`.
- `includeHidden=1` n'a d'effet qu'avec un jeton valide.
- Jeton : `DATABOOKS_API_TOKEN`, repli sur `SHENRON_ADMIN_TOKEN`. Sans jeton
  configuré, toute écriture est refusée.

## 5. Index Redis

Miroir de lecture (`dbfr:databook:*`), tenu à jour à chaque écriture passant
par l'API par `apps/site/src/lib/databooks-redis.ts`. PostgreSQL reste la source
de vérité ; une panne Redis ne fait jamais échouer une écriture. Premier
remplissage ou réparation :

```bash
bun apps/site/scripts/index-databooks-redis.ts --purge
```

| Clé                             | Type          | Contenu                        |
| ------------------------------- | ------------- | ------------------------------ |
| `dbfr:databook:<id>`            | string (JSON) | fiche sérialisée + `pageCount` |
| `dbfr:databooks:all`            | set           | identifiants publiés           |
| `dbfr:databooks:kind:<kind>`    | set           | par type d'ouvrage             |
| `dbfr:databooks:category:<cat>` | set           | par catégorie éditoriale       |

## 6. MCP

`shenron-mcp` expose `dragonball.databooks_search` (fiches sans planches),
`dragonball.databooks_get` (fiche, planches et transcriptions, plafond
`maxPages` ; `pageCount`, `transcribedPages` et `truncatedPages`, anciens
`pagesTranscrites` et `pagesTronquees` en doublon déprécié) et
`dragonball.databooks_plates`. Les schémas actifs se lisent par `tools/list`.
