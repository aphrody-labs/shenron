# Données Dragon Ball Xenoverse 2

Assets et données extraits du jeu **Dragon Ball Xenoverse 2** (v1.25.02, FR), utilisés
par le wiki et l'économie de Shenron. Les parsers et outils détenus par Shenron vivent
dans `crates/shenron-re` ; le dépôt propriétaire `dbxv2` n'est pas requis pour les builds.

## Contenu

- `<CODE>.png` — 145 portraits de visages (atlas UI `CHARA01.emb`), 1 par code perso XV2 3 lettres.
- `xv2-portraits.json` — manifest brut des portraits (code → costume de base).
- `../xv2-catalog.json` — **source de vérité** : noms FR exacts du jeu (`.msg`) :
  - `characters` : 164 codes → noms (Son Goku, Krilin, Bulma…).
  - `skills` : 4 catégories — `super`, `ultimate`, `awoken`, `evasive` (~730 noms uniques) + descriptions.
- `../xv2-skillsets.json` — loadout par perso (code → super/ultimate/evasive/awoken),
  décodé de `custom_skill.cus` + `char_model_spec.cms` (chaîne CMS→CUS→.msg validée :
  Goku ressort avec Kamehameha/Genkidama, Vegeta avec Big Bang/Final Flash…).
- `_QA.png` — planche-contact des portraits posés (vérification visuelle).

## Seeds (catalogue-driven)

Tout est piloté par `xv2-catalog.json` (noms factuels du jeu = vérité), **pas** par un
mapping en dur. Le catalogue est produit par un **parser `.msg` robuste** (lecture des
valeurs par position via la table d'entrées — un parser naïf désaligne les noms, ex.
`G13` confondu avec "Bulma" alors que c'est "C-13").

Code : `apps/bot/src/db/xv2/` (`content.ts` planifie, `apply.ts` écrit, `cli.ts`).
**Cible par défaut : PostgreSQL `bot.*`**, source de vérité du wiki ; le reverse-sync
(15 min) recopie ces tables dans le SQLite du bot. Écrire directement le réplica de
production ne sert à rien : le prochain pull remplace ces tables.

```sh
cd apps/bot
bun db:seed-xv2-all --dry-run              # plan (comptes par table), aucune écriture
bun db:seed-xv2-all                        # tout, en une transaction PostgreSQL
bun db:seed-xv2-techniques                 # une étape : techniques, characters, char-meta,
                                           # portraits, transformations, char-techniques
DATABASE_PATH=/copie/bot.db ALLOW_SQLITE_WIKI_WRITE=1 bun db:seed-xv2-all --target sqlite
```

Règles (testées par `tests/xv2-seed.test.ts`) :

- **Additif** : aucun `DELETE` (la suppression éditoriale est logique, `visible = false`).
  Une ligne masquée compte comme présente : jamais ressuscitée, jamais modifiée, jamais liée.
- **Le choix des éditeurs prime** : seuls les champs vides se remplissent (description,
  race, genre, portrait) ; un portrait posé à la main identifie le personnage du code
  (« Zabon » = `ZBN`, « Majin Boo » = `BUL`), donc pas de doublon « Zarbon » ou « Buu ».
- Un nom du wiki sous-titré (« Broly (DBS) ») n'obtient un portrait que sur le nom exact
  du jeu ; les codes d'avatar `XA*` et les variantes d'époque (« DB Super », « mini »,
  « Retenu ») ne deviennent ni portrait ni transformation.
- En PostgreSQL : verrou des quatre tables, lecture du snapshot sous verrou, identifiants
  après le maximum, une révision `public.wiki_revisions` par ligne (`editorId` `xv2-content`).
- Une étape seule n'écrit jamais d'identifiant créé par une étape absente.
- Idempotent : un second passage ne planifie rien.

Contrôle du catalogue contre l'index privé du jeu (`dbxv2_msg`, `dbxv2_characters`), ignoré
sans la base : `DBXV2_DB_PATH=../../var/dbxv2/dbxv2.sqlite bun test --isolate tests/xv2-catalog-source.test.ts`.
Le 2026-10-23 : 164 noms de personnages, 516/290/35/66 compétences et les 153 codes de
loadout concordent avec le jeu (entités XML décodées). Seule correction : `URN` = « Oolong ».

Sur une base vide, l'extraction produit 708 techniques (super 429, ultime 213, esquive 50,
awoken 16), 79 personnages, 50 races/genres, 18 transformations et 1119 liens. Sur le réplica
du 2026-10-08 (import antérieur déjà absorbé), il reste 7 portraits et 26 transformations.

## Couverture obtenue (import historique)

- **db_characters : 58 → 108** persos (81 avec portrait XV2).
- **db_techniques : 120 → 825** (705 ajoutées : super 428, ultime 211, esquive 50, awoken 16 ; **747 avec description d'effet**).
- **db_transformations : 43 → 81** (formes de puissance liées aux persos).
- **db_character_techniques : +1206 liens** (130 persos liés à leur moveset XV2 réel).

`/wiki` (`Wiki.ts`) affiche `portrait_xv2` en priorité, fallback `image`.

## Régénérer depuis le jeu

Côté outils d'extraction conservés hors de Shenron (jeu possédé légalement) :

- `_bridge_portraits.py` → ré-extrait les portraits + manifest depuis `CHARA01.emb.unpacked`.
- `_xv2_catalog.py` → ré-extrait `xv2-catalog.json` (parser `.msg` maison : clés + valeurs FR).

**Ne pas redistribuer les assets du jeu hors de ce dépôt privé.**
