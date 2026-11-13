# Plan de Mise en Œuvre : Répertoire Anime & Lecteur Sécurisé (VoirAnime Clean-Room)

Rédigé d'après `replica/voir-anime.to/recon.md`, `replica/voir-anime.to/stack.md` et `replica/voir-anime.to/features.csv`.

---

## 1. Objectifs & Stratégie Clean-Room

Remplacer l'architecture archaïque et encombrée de publicités (WordPress / PHP / jQuery / iframes intrusives de `voir-anime.to`) par un annuaire d'animés moderne, ultra-rapide, et un **Lecteur Sandboxté Sécurisé** intégré à Shenron :

1. **Zéro Publicité Malveillante / Zéro Popunder** : Toutes les sources vidéo externes sont encapsulées dans des composants façades isolés (`sandbox="allow-scripts allow-same-origin"`), bloquant tout pop-up ou redirection de navigation.
2. **Performance 100x Supérieure** : Remplacement des requêtes SQL WordPress lentes par un index statique pré-généré et des requêtes Bun SQL / RQLite D1 sub-millisecondes.
3. **Recherche Instantanée Sub-5ms** : Autocomplétion instantanée côté client sans round-trip lourd.
4. **Validation Automatique des Miroirs** : Tâche d'arrière-plan vérifiant quotidiennement la disponibilité des sources vidéo pour éliminer les liens morts.

---

## 2. Stack Technique de Remplacement

| Rôle                  | Cible Originale (Observée)       | Stack Souveraine Shenron                        | Pourquoi                                                                           |
| :-------------------- | :------------------------------- | :---------------------------------------------- | :--------------------------------------------------------------------------------- |
| **Moteur Web**        | WordPress 6.7 + PHP 8            | Bun v1.4.4 + Next.js 16.5                       | Temps de réponse divisé par 20, cold start sub-milliseconde.                       |
| **Interface & Rendu** | jQuery + Bootstrap 4 + Slick     | Tailwind CSS v4 + React 19                      | Interface fluide, zéro dépendance jQuery obsolète, mode sombre natif.              |
| **Sécurité Lecteur**  | Iframes non filtrées avec popups | Composant Façade Sandboxté (`SafePlayerFacade`) | Neutralise les scripts malveillants, bloque les popunders, préserve la vie privée. |
| **Base de Données**   | MySQL (Madara DB)                | PostgreSQL / Bun:sqlite                         | Modèle relationnel propre, clés UUID, typage strict des miroirs vidéo.             |
| **Recherche**         | Ajax Search Pro                  | MiniSearch en mémoire / Trigrames Postgres      | Recherche floue instantanée dès la première lettre saisie.                         |

---

## 3. Schéma de Données (`schema.sql`)

```sql
-- Répertoire des séries animées
create table if not exists anime_directory (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  title_alternatives text[] not null default array[]::text[],
  synopsis text not null,
  poster_url text not null,
  banner_url text,
  genres text[] not null,
  release_year integer not null,
  status text not null default 'completed' check (status in ('ongoing', 'completed', 'upcoming')),
  views_count bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_anime_dir_genres on anime_directory using gin (genres);
create index idx_anime_dir_year on anime_directory (release_year desc);
create index idx_anime_dir_views on anime_directory (views_count desc);

-- Épisodes et sources vidéo miroirs
create table if not exists anime_directory_episodes (
  id uuid primary key default gen_random_uuid(),
  anime_id uuid not null references anime_directory(id) on delete cascade,
  episode_number integer not null,
  title text not null,
  mirrors jsonb not null default '[]'::jsonb, -- [ { "provider": "hls_cdn", "url": "...", "quality": "1080p", "audio": "vostfr", "is_healthy": true } ]
  created_at timestamptz not null default now(),
  unique (anime_id, episode_number)
);
create index idx_anime_dir_episodes_anime on anime_directory_episodes (anime_id, episode_number);

-- Historique et signets anonymes ou connectés
create table if not exists anime_directory_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ba_user(id) on delete cascade,
  anime_id uuid not null references anime_directory(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, anime_id)
);
```

---

## 4. API & Endpoints

| Méthode & Chemin                  | Rôle                             | Entrée                       | Sortie                                           | Sécurité                       |
| :-------------------------------- | :------------------------------- | :--------------------------- | :----------------------------------------------- | :----------------------------- |
| GET `/api/directory/anime`        | Liste filtrée du catalogue       | `genre`, `year`, `page`      | JSON paginé                                      | Public (Cache CDN 5 min)       |
| GET `/api/directory/anime/:slug`  | Fiche complète et épisodes       | `slug`                       | Métadonnées + liste des épisodes                 | Public (Cache CDN 10 min)      |
| GET `/api/directory/search`       | Recherche floue temps réel       | `q=goku`                     | Array de résultats `{ id, title, slug, poster }` | Public (Sous 10ms)             |
| GET `/api/directory/episodes/:id` | Récupère les miroirs vidéo sains | `id`                         | Sources filtrées (`is_healthy: true`)            | Public, rate-limité            |
| POST `/api/directory/report-dead` | Signale un lecteur HS            | `{ episode_id, mirror_url }` | 200 OK                                           | Public (protection anti-flood) |

---

## 5. Découpage en Tranches Verticales (Build Order)

### Tranche 1 : Lecteur Vidéo Sécurisé Façade (`SafePlayerFacade.tsx`)

- Détection du clic utilisateur (« Lancer la vidéo ») avant tout montage de lecteur.
- Sandbox d'iframe imperméable : `sandbox="allow-scripts allow-same-origin"`, `referrerpolicy="no-referrer"`.
- Blocage strict de `window.open` et des redirections non sollicitées.

### Tranche 2 : Catalogue & Moteur de Recherche Instantané

- Page `/anime` avec grille de jaquettes adaptative.
- Barre de filtres combinés (Genres : Action, Arts Martiaux, Shōnen, Années : 1986 à 2026).
- Moteur de recherche local avec index pré-chargé (20 Ko zippé pour 1 000 entrées).

### Tranche 3 : Fiche Série & Sélecteur de Miroirs

- Page `/anime/:slug` affichant synopsis, genres, année et statut.
- Sélecteur de version audio (VF / VOSTFR) et de lecteur miroir (Miroir Principal CDN, Lecteur HLS de secours).
- Rétention de l'épisode en cours de visionnage dans le `localStorage`.

### Tranche 4 : Moniteur de Santé Automatique des Miroirs

- Tâche quotidienne en arrière-plan (`scripts/ops/verify-anime-mirrors.ts`) testant la disponibilité HTTP des flux sans exécuter les trackers publicitaires.
- Désactivation automatique des sources vidéo renvoyant 404 ou 410.

---

## 6. Les Points de Vigilance (The Parts that Bite)

1. **Isolation des Popunders** : Les hébergeurs vidéo tiers injectent des gestionnaires d'événements sur le document hôte. L'iframe doit impérativement résider sur un sous-domaine isolé ou dans une balise sans privilèges de navigation parente (`allow-top-navigation` strictement interdit).
2. **Fraîcheur des Liens** : Les hébergeurs tiers changent fréquemment de nom de domaine pour échapper aux blocages. Le fallback prioritaire doit toujours être le CDN propre de Shenron (`cdn.dragonballfr.com`).

---

## 7. Critères d'Achèvement (Definition of Done)

- [ ] L'annuaire s'affiche sans aucune publicité, popup ni bannière intrusive.
- [ ] La recherche répond en moins de 10ms pour toute requête sur le catalogue Dragon Ball.
- [ ] La façade de lecture isole complètement l'utilisateur contre les malwares et popunders.
- [ ] Zéro rupture de layout entre écran mobile (390px) et écran large (1920px).
