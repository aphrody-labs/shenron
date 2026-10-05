# Canon — l'arbitre de canonicité

`/wiki/canon` répond à une affirmation par un verdict déterministe, sans modèle
de langage ni wiki de fans : un rang, la raison et les preuves imprimées.
Usage côté agents : skill `dragon-ball-canon` du plugin
(`plugin/skills/dragon-ball-canon/SKILL.md`).

## Rangs

Définis dans `apps/site/src/lib/canon-engine.ts` :

| Rang | Ce qu'il range |
| --- | --- |
| `CANON_ABSOLU` | Manga original (42 tomes), Jaco, Minus, ce que Toriyama a écrit lui-même |
| `CANON_SUPERVISE` | Manga Super, films Battle of Gods, Broly et Super Hero, Daima |
| `EXTENSION_OFFICIELLE` | Daizenshuu, Super Exciting Guide, Chōzenshū (supervisés ou préfacés) |
| `NON_CANON_DERIVE` | Fillers DB/DBZ, films Toei 1986-1995, GT, jeux, SDBH |
| `APOCRYPHE_FANON` | Rumeurs, fausses interviews, AF, Multiverse |

Un `score` exprime l'autorité du rang, pas une probabilité.

## Données

- **Doctrine** (rangs, règles, sujets tranchés, familles de formulations) :
  `public."CanonConfig"`, éditée dans `/admin/canon`.
- **Preuves** : `public.canon_references`, une ligne par preuve — déclarations
  d'Akira Toriyama (corpus d'auteur local, filtré par `REFUSÉ` contre tout miroir
  de wiki de fans), planches de databooks transcrites et traduites, saisies
  manuelles de `/admin/canon` (jamais réécrites par l'ingestion).
- **Ingestion** : `bun apps/site/scripts/canon-ingest.ts` (une passe),
  `--source databooks`, `--simuler` (rapport sans écriture), `--boucle
  [--intervalle 900]`. Idempotente par empreinte ; une preuve disparue de sa
  source est masquée (`visible = false`), jamais supprimée ; chaque passage
  laisse une ligne dans `public.canon_ingest_runs`.
- **Traductions des citations** : `apps/site/scripts/inventaires/canon-citations-fr.json`,
  réattachées à chaque passe (par identifiant, sinon par texte).
- **Questions posées** : comptées dans `public.canon_verdicts`.

Tables et colonnes : migrations `0013_canon_config.sql` et `0014_canon_tables.sql`
de `apps/site/src/db/migrations`.

## Surfaces

| Surface | Entrée |
| --- | --- |
| Page publique | `/wiki/canon` ; bloc « Est-ce canon ? » de l'accueil (`/admin/home`) |
| API | `GET /api/canon?q=` (verdict, références, planches, fiches), `GET /api/canon` (doctrine), `GET /api/canon/references?q=&provenance=` |
| MCP | `dragonball.canon_check`, `dragonball.canon_references` (`shenron-mcp`) |
| Discord | `/canon verifier`, `/canon doctrine`, `/canon sujets`, `/canon citations`, `/canon jour` (admin) ; le cron `canon-daily` publie un sujet tranché par jour dans le salon réglé |

## Règles

- Manga, scans et déclarations d'Akira Toriyama priment ; Fandom, Reddit et
  toute interview sans source publiée sont exclus.
- Une déclaration d'auteur est une pièce publiée, pas automatiquement un
  verdict. Un sujet non tranché reste non tranché : aucun rang n'est inventé.
- Citer édition, support, année et lien ; vérifier la planche quand elle est
  disponible. Références d'appui : [`toriyama-interviews.md`](toriyama-interviews.md),
  [`toriyama-databook-seg.md`](../reference/toriyama-databook-seg.md).
