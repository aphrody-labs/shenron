# Refonte majeure du wiki Dragon Ball — spécification d’architecture

Statut : proposition implémentable, révision 6 — 2026-09-19
Périmètre : PostgreSQL `shenron_site` (schéma `bot`), API/site Next, index RAG et SEO.

L'exploitation (releases, unités, Nginx, sondes, rétention) est détenue par
`aphrody-infra` ([`INFRA-DELEGATION.md`](../operations/INFRA-DELEGATION.md)).

Ce document est un contrat d’architecture. Il ne constitue pas une migration exécutable :
toute écriture de contenu doit passer par une migration idempotente, un snapshot et une
validation sur copie. Les lignes existantes restent la source de vérité jusqu’à la fin du
backfill. Une suppression est toujours logique (`visible = false`).

## État de l’implémentation

Les migrations 0017 à 0019 (`apps/site/src/db/migrations`, miroirs dans
`apps/bot/src/db/migrations`), les API `/api/wiki/{media,timelines,contributors,events}`,
le lecteur unifié (`apps/site/src/components/manga/UnifiedVolumeReader.tsx`) et les
sources RAG PostgreSQL (`packages/pipeline/scripts/_rag-sources-pg.ts`) sont livrés.
Une présence de fichier ne vaut pas validation : les critères restent ceux des
Sprints 2 à 6 ci-dessous.

La migration observée est transitoire : `bot.db_media_publications` sort les anciens
« Jump Anime Comics » et « Light Novel » du catalogue databooks avant leur normalisation
dans `bot.media_works`. Les anciennes URL sont stockées dans
`public.url_redirects(source_path, target_path, status_code, visible)` ; le nom
`public.redirects` employé plus bas est conceptuel.

## 1. Principes non négociables

- **Identité stable** : les clés numériques existantes ne changent pas ; chaque nouvel objet
  reçoit un `slug` canonique immuable et des alias historiques.
- **Preuve avant éditorial** : une relation canonique ou un crédit exige une source primaire
  enregistrée (`bot.db_sources`/`public.canon_references`) et un statut de vérification.
- **Séparation des continuités** : manga, anime, films, jeux et Xenoverse sont des timelines
  distinctes ; aucune fusion silencieuse d’un récit dérivé dans le manga.
- **Bitemporalité légère** : `published_at` décrit l’œuvre ; `created_at`, `updated_at` et
  `wiki_revisions` décrivent l’état éditorial du site.
- **Lecture seule par défaut** : API publiques paginées, requêtes paramétrées, et cache par
  combinaison de facettes. Les mutations passent par l’admin wiki avec audit.
- **Trilingue** : `name`, `name_ja`, `name_romaji`, plus les textes localisés versionnés ; le
  slug est indépendant de la langue (`son-goku`, jamais une traduction variable).

## Phase 1 — schéma de données et ontologie

### 1.1 Média, manga et variantes de lecture

Les tables actuelles `bot.db_manga_volumes` et `bot.db_manga_chapters` restent compatibles.
Les colonnes existantes (`series`, `volume_number`, `title`, `title_ja`, `cover`, `pages`,
`volume_id`, `visible`) sont conservées. Les tables suivantes normalisent ce qui manque sans
dupliquer les planches.

```sql
create type bot.media_kind as enum ('manga', 'databook', 'guide', 'light_novel', 'anime_comic', 'spin_off');
create type bot.edition_kind as enum ('tankobon', 'full_color', 'kanzenban', 'soshuuhen', 'bunko', 'digital', 'other');
create type bot.page_color as enum ('nb', 'color', 'mixed');

create table if not exists bot.media_works (
  id bigint generated always as identity primary key,
  slug text not null unique,
  kind bot.media_kind not null,
  series text not null,
  title text not null,
  title_ja text,
  title_romaji text,
  synopsis_fr text,
  source_id bigint references bot.db_sources(id),
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bot.media_editions (
  id bigint generated always as identity primary key,
  work_id bigint not null references bot.media_works(id),
  edition bot.edition_kind not null,
  label text not null,
  language text not null default 'ja',
  isbn text,
  publisher text,
  published_at date,
  page_color bot.page_color not null default 'nb',
  scan_policy text not null default 'self_hosted',
  visible boolean not null default true,
  unique (work_id, edition, language, isbn)
);

create table if not exists bot.media_volumes (
  id bigint generated always as identity primary key,
  edition_id bigint not null references bot.media_editions(id),
  legacy_volume_id bigint unique references bot.db_manga_volumes(id),
  number numeric(6,2) not null,
  slug text not null unique,
  title text,
  cover text,
  page_count integer,
  visible boolean not null default true,
  unique (edition_id, number)
);

create table if not exists bot.media_chapters (
  id bigint generated always as identity primary key,
  volume_id bigint not null references bot.media_volumes(id),
  legacy_chapter_id bigint unique references bot.db_manga_chapters(id),
  number numeric(8,2) not null,
  slug text not null unique,
  title text,
  pages jsonb not null default '[]',
  ocr_status text not null default 'unprocessed',
  visible boolean not null default true,
  unique (volume_id, number)
);

create table if not exists bot.media_page_assets (
  id bigint generated always as identity primary key,
  uri text not null,
  width integer,
  height integer,
  sha256 text not null,
  source_id bigint references bot.db_sources(id),
  unique (sha256)
);

-- Un asset physique peut être partagé par plusieurs éditions/chapitres sans
-- recopier le fichier ni perdre l'ordre de lecture propre à chaque chapitre.
create table if not exists bot.media_page_refs (
  chapter_id bigint not null references bot.media_chapters(id),
  asset_id bigint not null references bot.media_page_assets(id),
  ordinal integer not null check (ordinal > 0),
  page_label text,
  primary key (chapter_id, ordinal),
  unique (chapter_id, asset_id)
);
```

Pour les 42 tomes de la série DB, `media_works` représente l’œuvre et `media_volumes`
les volumes d’une édition donnée ; l’API publique `/api/wiki/media` expose cette hiérarchie
en lecture seule avec les filtres `kind`, `series`, `slug` et `edition`. Les éditions restent
imbriquées sous leur œuvre et les volumes sont comptés uniquement lorsqu’ils sont `visible`.
représente chaque tome/édition. Les planches ne sont jamais recopiées entre éditions : une
édition peut référencer un même `media_page_assets` par `media_page_refs` si le fichier est
strictement identique. Le catalogue actuel est backfillé par `legacy_*_id`, puis l’API utilise
une vue de compatibilité pendant deux releases.

Contraintes de qualité : `number` contigu par édition (sauf hors-série explicitement marqué),
SHA-256 obligatoire pour chaque asset, et aucune page publiée sans `source_id` ou preuve
d’acquisition. Un tome incomplet reste visible avec un badge « à compléter », jamais rempli
par interpolation.

### 1.2 Événements, combats et chronologies

`db_battles`, `db_timeline_events`, `db_tournaments`, `db_sagas` et `db_arcs` deviennent des
projections éditoriales d’un graphe unifié. On ne supprime pas les tables existantes dans la
première version.

```sql
create type bot.narrative_event_kind as enum ('event', 'battle', 'tournament', 'war');
create type bot.timeline_kind as enum ('manga', 'anime', 'film', 'oav', 'game', 'xenoverse', 'other');
create type bot.canon_rank as enum ('absolute', 'supervised', 'official_extension', 'non_canon', 'apocryphal', 'unverified');

create table if not exists bot.narrative_timelines (
  id bigint generated always as identity primary key,
  slug text not null unique,
  kind bot.timeline_kind not null,
  label text not null,
  parent_id bigint references bot.narrative_timelines(id),
  source_id bigint references bot.db_sources(id),
  visible boolean not null default true
);

create table if not exists bot.narrative_events (
  id bigint generated always as identity primary key,
  slug text not null unique,
  kind bot.narrative_event_kind not null,
  title text not null,
  title_ja text,
  title_romaji text,
  synopsis_fr text,
  timeline_id bigint not null references bot.narrative_timelines(id),
  saga_id bigint references bot.db_sagas(id),
  arc_id bigint references bot.db_arcs(id),
  canon bot.canon_rank not null default 'unverified',
  start_order numeric(10,3),
  end_order numeric(10,3),
  source_id bigint references bot.db_sources(id),
  visible boolean not null default true
);

create table if not exists bot.narrative_event_aliases (
  event_id bigint not null references bot.narrative_events(id),
  alias text not null,
  locale text not null default 'fr',
  primary key (event_id, alias, locale)
);

create table if not exists bot.narrative_event_participants (
  event_id bigint not null references bot.narrative_events(id),
  character_id bigint not null references bot.db_characters(id),
  role text not null default 'participant',
  outcome text,
  primary key (event_id, character_id, role)
);

create table if not exists bot.narrative_event_relations (
  from_event_id bigint not null references bot.narrative_events(id),
  to_event_id bigint not null references bot.narrative_events(id),
  relation text not null check (relation in ('contains','variant_of','adaptation_of','precedes','branches_from')),
  primary key (from_event_id, to_event_id, relation)
);
```

Un doublon apparent n’est pas écrasé : le combat manga et son adaptation anime sont deux
événements avec `adaptation_of`; l’équivalent Xenoverse est `variant_of` sur une timeline
`xenoverse`. Une clé de dédoublonnage candidate (`normalized_title`, participants triés,
timeline, bornes) sert uniquement à la revue humaine et ne déclenche jamais une fusion.

### 1.3 Contributeurs, crédits et hub méta

```sql
create type bot.contributor_category as enum ('author','editorial_staff','animation','voice','music','scenario','publisher','other');

create table if not exists bot.contributors (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  name_ja text,
  name_romaji text,
  category bot.contributor_category not null,
  birth_date date,
  death_date date,
  biography_fr text,
  spotlight_rank integer,
  source_id bigint references bot.db_sources(id),
  visible boolean not null default true
);

create table if not exists bot.contributor_credits (
  id bigint generated always as identity primary key,
  contributor_id bigint not null references bot.contributors(id),
  role text not null,
  credit_scope text not null check (credit_scope in ('work','series','episode','film','game','track','character')),
  work_id bigint references bot.media_works(id),
  episode_id bigint references bot.db_episodes(id),
  movie_id bigint references bot.db_movies(id),
  game_id bigint references bot.db_games(id),
  soundtrack_id bigint references bot.db_soundtracks(id),
  character_id bigint references bot.db_characters(id),
  source_id bigint references bot.db_sources(id),
  visible boolean not null default true,
  check (num_nonnulls(work_id, episode_id, movie_id, game_id, soundtrack_id, character_id) = 1)
);
```

Akira Toriyama reçoit `spotlight_rank = 0` uniquement lorsque sa preuve biographique et ses
crédits sont validés. La page hub ne recopie pas sa biographie : elle affiche un synopsis court
et un lien vers `/wiki/contributors/akira-toriyama`. Les autres personnes sont filtrables par
catégorie et rôle, avec pagination et chargement différé.

### 1.4 Dépréciation des catégories obsolètes

1. Exporter un snapshot PG, compter les références et produire `legacy_category_map` :
   `jump-anime-comics → {anime_comic, manga, film, guide}` selon la preuve de chaque entrée ;
   `light-novel → media_kind = light_novel`.
2. Créer les nouvelles lignes avec un `legacy_id`, conserver le slug quand il est unique et
   générer un alias quand il collisionne.
3. Réécrire toutes les FK, liens internes et sources RAG dans une transaction vérifiable.
4. Créer ou alimenter `public.url_redirects` (`source_path`, `target_path`, `status_code=301`,
   `visible`) et une règle de non-régression SEO : chaque ancienne URL résout vers une seule URL
   canonique.
5. Marquer les anciennes catégories `visible = false`, renseigner `replaced_by_id` et
   conserver leurs révisions. Aucun `DELETE` physique.
6. Rebuild RAG isolé, purge des chunks orphelins, puis validation de 100 % des liens entrants.
7. Après deux releases sans trafic résiduel, seulement alors retirer les routes mortes du code.

## Phase 2 — architecture de l’information et UX

### 2.1 Lecteur manga unifié : machine à états

États : `loading → ready | error`; dans `ready`, `selecting_edition`, `reading`, `prefetching`,
`completed`. Transitions :

| Événement | Garde | Action |
|---|---|---|
| `OPEN(volume, edition?)` | volume visible | choisir l’édition canonique, charger page 1 |
| `SELECT_EDITION(id)` | édition disponible | conserver `ordinal`, reset si hors bornes |
| `NEXT` / `PREV` | page dans les bornes | mettre à jour URL et précharger voisin |
| `JUMP(ordinal)` | entier valide | afficher page cible, pousser historique |
| `LOAD_FAILURE` | retry épuisé | `error`, conserver dernière page |
| `END_VOLUME` | dernière page | proposer tome suivant, sans navigation forcée |

URL canonique : `/manga/dragon-ball/volume-01?page=12&edition=tankobon`; les paramètres de
présentation non canoniques (`fit`, `theme`) ne sont pas indexés. Le sélecteur affiche une
étiquette, langue, couleur, nombre de pages et statut de complétude ; il interdit de prétendre
qu’une édition absente est disponible.

Desktop : colonne de lecture centrée (largeur maximale contrôlée), rail miniature optionnel,
barre supérieure fixe (tome, édition, page, progression). Mobile : une seule planche, gestes
précédent/suivant, boutons accessibles, `IntersectionObserver` pour préchargement ±1 et cache
limité. Chaque image porte `width/height`, `alt` localisé et `decoding=async`; le SSR livre la
métadonnée puis hydrate le lecteur.

### 2.2 Navigation et databooks

Le rail devient un drawer responsive, avec groupes accordéon mémorisés par utilisateur :

```text
Dragon Ball
├─ Manga (42 tomes)       [lecteur unifié]
├─ Databooks               ├ Daizenshuu
│                          ├ Chōzenshū / guides
│                          └ Sōshūhen
├─ Light novels            [œuvres dérivées, statut visible]
├─ Anime & films
├─ Chronologies & combats  [facettes]
├─ Jeux & timelines        [Xenoverse séparé]
└─ Autour de Dragon Ball   [contributeurs, OST, seiyū]
```

La navigation est pilotée par un manifeste typé (label, route, permission, compteur), non par
des conditions dispersées dans les composants. Le fil d’Ariane et les données structurées
reflètent la même hiérarchie.

### 2.3 Wireframe du hub méta

```text
┌ Autour de Dragon Ball ──────────────────────────────────────────┐
│ HERO · AKIRA TORIYAMA                                           │
│ [portrait]  Auteur · créateur · impact documenté                 │
│ synopsis court                                                → Bio│
├ Explorer l’équipe ───────────────────────────────────────────────┤
│ [Tous] [Auteur] [Éditorial] [Animation] [Doublage] [Musique]     │
│ Recherche…  Année…  Œuvre…                                      │
│ ┌ carte contributeur ┐ ┌ carte contributeur ┐ …                 │
│ │ rôle · œuvres       │ │ rôle · œuvres       │                 │
│ └─────────────────────┘ └─────────────────────┘       [charger] │
├ Réseau de crédits (graphe accessible en liste)                   │
│ œuvres ↔ personnes ↔ rôles · export JSON-LD                      │
└ Sources et révisions                                              ┘
```

Le graphe est une vue progressive (pas un rendu de milliers de nœuds) : liste tabulaire
accessible d’abord, visualisation après interaction. Les crédits non prouvés sont exclus du
compteur public et signalés dans l’admin.
L’endpoint public `GET /api/wiki/contributors` sert cette vue avec recherche `q`, catégories,
filtre spotlight, tri déterministe et pagination plafonnée à 100 ; ses facettes sont calculées
avant la pagination afin que les compteurs restent cohérents avec le corpus visible.

## Phase 3 — recherche et facettes

Payload versionné :

```json
{
  "q": "Goku Vegeta",
  "page": 1,
  "limit": 24,
  "sort": "chronology",
  "filters": {
    "kind": ["battle", "tournament"],
    "canon": ["absolute", "supervised", "non_canon"],
    "timeline": ["manga", "xenoverse"],
    "characterIds": [1, 2],
    "sagaIds": [7],
    "arcIds": [],
    "orderFrom": null,
    "orderTo": null
  }
}
```

Endpoints : `GET /api/wiki/events?q=...&type=battle&type=tournament&timeline=xenoverse` et
`GET /api/wiki/timelines`. Le second expose les continuités visibles avec `event_count` calculé
sur les événements visibles, afin que le filtre de timeline ne promette jamais un volume faux.
Les valeurs sont répétables, validées par une liste blanche et normalisées dans l’URL. Une URL
sans filtre reste canonique ; les combinaisons filtrées portent `noindex,follow` sauf les
landing pages explicitement autorisées (`type`, `timeline`). Réponse : `{data, facets, page,
pageCount, canonicalUrl}`. `facets` est calculé sur le jeu filtré sauf sa propre dimension,
avec compte exact et tri déterministe.

Index minimum : `(visible, timeline_id, kind, canon)`, `(event_id, character_id)`,
`(saga_id, arc_id, start_order)`, trigramme sur les titres et recherche plein texte pondérée
FR/JA. Le moteur exécute d’abord les ID de facettes, ensuite le texte, puis la pagination ; il
ne charge jamais les participants complets dans la requête de comptage.

## Phase 4 — cas limites et audit de rupture

- **Combat manga/anime/Xenoverse** : conserver trois objets, relation `adaptation_of` ou
  `variant_of`, et afficher un sélecteur de continuité. Une page canonique doit déclarer sa
  timeline dans JSON-LD.
- **Light novel hybride** : classer l’œuvre comme `light_novel`, attacher des tags de contenu
  (`official_material`, `derivative`, `mixed`) et un `canon_rank` par assertion, jamais un
  canon global ambigu. Les personnages cités ne deviennent pas automatiquement canoniques.
- **Jump anime comics** : mapper entrée par entrée, vérifier les ISBN/pages et préserver les
  anciens liens par 301. Les couvertures ou planches déjà présentes sont dédupliquées par hash,
  jamais par nom de fichier.
- **Doublons de personnes** : table d’alias et revue manuelle ; fusion seulement si l’identité
  et la source concordent. Les crédits restent auditables après fusion.
- **Échelles volumineuses** : curseur (`id`, `start_order`) pour API, `limit ≤ 100`, SSR des
  24 premières cartes, virtualisation client au-delà de 200, `ETag` et cache court par payload.
- **Pages manquantes / droits** : état explicite `missing` ou `restricted`, placeholder
  accessible ; jamais d’URL inventée ni de fallback silencieux vers une autre édition.
- **SEO/i18n** : un slug, alternates `fr/en/ja`, canonical stable, redirection avant rendu,
  titres localisés indépendants du chemin.
- **RAG** : source ID et `entity_type/entity_id` obligatoires dans chaque chunk ; les
  catégories masquées ne sont pas réindexées ; les relations de variantes sont exposées dans
  les métadonnées pour éviter les réponses fusionnées.

## Phase 5 — plan d’exécution et critères de validation

### Sprint 1 — inventaire et contrats

- Exporter schémas/volumétrie, identifier collisions de slug et catégories à migrer.
- Ajouter les types TypeScript du payload, les JSON Schemas et les fixtures minimales.
- Critères : snapshot restaurable, zéro secret commité, matrice de mapping signée et tests de
  compatibilité des routes existantes.

### Sprint 2 — tables et backfill média

- Migration idempotente des tables média, index et vues de compatibilité.
- Backfill des 42 tomes, chapitres et éditions ; audit SHA-256 et pages.
- Critères : comptes source = comptes cible, FK sans orphelin, aucun `DELETE`, rollback testé
  sur copie et lecteur legacy toujours fonctionnel.

### Sprint 3 — événements et contributeurs

- Migration du graphe d’événements, participants, timelines et crédits.
- Revue des doublons, attribution des preuves, construction du spotlight Toriyama.
- Critères : chaque entrée visible a source + slug + timeline/catégorie ; tests de relations
  cycliques et de canonicité ; endpoints paginés répondent avec 200/4xx déterministes.

### Sprint 4 — recherche et RAG

- Implémenter facettes, curseur, URL canonique et indexes ; tests de plan SQL.
- Rebuild RAG en processus isolé, purge des chunks orphelins et évaluation Recall@k.
- Les nouvelles sources PG sont enregistrées sous `media_works`, `narrative_timelines`,
  `narrative_events` et `contributors` dans `PG_SOURCES` (`media_works: renduMediaWorks`,
  `narrative_timelines: renduNarrativeTimelines`); `rag-build.ts` injecte leur clé de registre comme
  `source_id` et n’indexe que les lignes visibles.
- Critères : combinaisons de facettes stables, latence p95 mesurée sur volumétrie réelle,
  aucune catégorie masquée dans l’index, citations traçables et zéro chunk orphelin. Le dernier
  gold run est `FAIT` : 172/172 sources présentes et Recall@5 80,2 % ≥ seuil 80 %. Le
  contrôle d’alignement est également `FAIT` (59 995 / 59 995, aucun orphelin) ; la métrique dense hybride reste à mesurer ; le repli BM25 est la preuve de référence locale.

### Sprint 5 — lecteur et navigation

- Brancher la FSM sur l’API média ; préchargement, reprise de page, accessibilité clavier et
  mobile ; déployer le drawer et le hub méta.
- Critères : parcours 42 tomes sur desktop/mobile, édition absente gérée explicitement,
  Lighthouse/accessibilité sans régression bloquante, URLs canoniques et sitemap valides.

### Sprint 6 — migration SEO et bascule

- Activer les 301, publier les landing pages autorisées, masquer les catégories obsolètes,
  revalider sitemap et liens entrants.
- Produire l'artefact par `bun run build:server`, puis laisser
  `aphrody-infra` publier la release, sonder les API/cache/RAG et
  conserver le rollback. Le dépôt Shenron ne bascule pas directement les services.
- Critères de sortie : 0 FK orpheline, 0 lien interne cassé dans l’audit, 100 % des anciennes
  URLs importantes redirigées, rollback documenté et bilan admin publié.

## Checklist de livraison

- [x] Migration idempotente, snapshot et restauration testés sur copie.
- [x] `visible = false` utilisé pour toute dépréciation ; aucune suppression physique.
- [ ] Sources, canon, crédits et variantes vérifiés par preuve.
- [x] `bun` uniquement ; tests ciblés exécutés, et `gen:entries` non requis (aucune commande/event modifié).
- [ ] Index RAG reconstruit hors premier plan et chunks orphelins contrôlés.
- [ ] API, lecteur, navigation, sitemap, alternates et 301 vérifiés en production miroir.
