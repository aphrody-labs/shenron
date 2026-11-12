# Plan de Mise en Œuvre : Réplique Plateforme Anime Streaming (Crunchyroll Clean-Room)

Rédigé d'après `replica/crunchyroll/recon.md`, `replica/crunchyroll/features.csv` et le système de jetons `replica/crunchyroll/design/tokens.json`.

---

## 1. Périmètre & Objectifs

Bâtir l'expérience complète de découverte et de visionnage de la plateforme d'animés (tranche « Découvrir -> Fiche Série -> Lecture -> Watchlist ») intégrée à `tv.dragonballfr.com` / `apps/site/src/app/tv` sans aucune dépendance propriétaire ni code emprunté.

### Principes Clean-Room :
- 100% code original, zéro iframe non autorisée, zéro scraper en production.
- Rendu vectoriel haute performance, typographie accessible WCAG AAA.
- Utilisation du moteur HLS natif de Shenron (`packages/engine/src/video`) et du CDN Garage S3 / R2 (`cdn.dragonballfr.com/stream`).

---

## 2. Stack Technique Retenue

| Couche | Technologie | Justification |
| :--- | :--- | :--- |
| **Framework Frontend** | Next.js 16.5 + React 19 (Bun standalone) | Rendu SSR pour le SEO des fiches d'anime et lecteur vidéo optimisé sans rechargement. |
| **Styling & Design Tokens** | Tailwind CSS v4 + `replica/crunchyroll/design/tokens.json` | 14 paires de contraste AA/AAA validées, design fluide 390px à 1920px. |
| **Moteur Vidéo** | HLS.js 1.5+ / WebCodecs / Shaka Player | Support HLS multirésolution (1080p, 720p, 480p), dual-audio (VF / VOSTFR), sous-titres ASS/VTT. |
| **Base de Données** | PostgreSQL (`DATABASE_URL`) | Schéma unifié pour les saisons, épisodes, progression de lecture et watchlist. |
| **Gestion d'État Client** | Zustand / React Context | Suivi de progression temporelle (`currentTime`), reprise de lecture, état de mise en favori. |
| **Authentification** | Better Auth existant | Gestion des profils de visionnage et synchronisation multi-appareils. |

---

## 3. Schéma de Données (Postgres)

```sql
-- Séries et arcs narratifs
create table if not exists tv_series (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  title text not null,
  title_ja text,
  synopsis text not null,
  banner_url text not null,
  poster_url text not null,
  age_rating text not null default '12+',
  year integer not null,
  status text not null default 'completed' check (status in ('ongoing', 'completed', 'announced')),
  created_at timestamptz not null default now()
);

-- Saisons
create table if not exists tv_seasons (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references tv_series(id) on delete cascade,
  season_number integer not null,
  title text not null,
  created_at timestamptz not null default now(),
  unique (series_id, season_number)
);

-- Épisodes
create table if not exists tv_episodes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references tv_seasons(id) on delete cascade,
  episode_number integer not null,
  global_episode_number integer,
  slug text not null unique,
  title text not null,
  synopsis text,
  thumbnail_url text not null,
  duration_seconds integer not null,
  hls_manifest_url text not null,
  audio_tracks text[] not null default array['ja', 'fr'],
  subtitles text[] not null default array['fr'],
  intro_start_seconds integer,
  intro_end_seconds integer,
  created_at timestamptz not null default now()
);

-- Progression de lecture (Reprise de lecture)
create table if not exists tv_watch_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ba_user(id) on delete cascade,
  episode_id uuid not null references tv_episodes(id) on delete cascade,
  playback_position_seconds integer not null default 0,
  completed boolean not null default false,
  last_watched_at timestamptz not null default now(),
  unique (user_id, episode_id)
);
create index idx_tv_watch_progress_user on tv_watch_progress (user_id, last_watched_at desc);

-- Liste de suivi (Watchlist)
create table if not exists tv_watchlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ba_user(id) on delete cascade,
  series_id uuid not null references tv_series(id) on delete cascade,
  added_at timestamptz not null default now(),
  unique (user_id, series_id)
);
```

---

## 4. Matrice des Écrans & Routes

| ID | Écran Répliqué | Route Shenron | Rôle |
| :--- | :--- | :--- | :--- |
| **S01** | Découvrir | `/tv` | Carrousel hero à la une, rangée « Continuer la lecture », catégories et sélections. |
| **S02** | Fiche Série | `/tv/series/:slug` | Affiche grand format, badge d'âge, bouton Watchlist, sélecteur de saison et grille d'épisodes avec miniatures. |
| **S03** | Lecteur Vidéo | `/tv/watch/:episode` | Lecteur plein écran HLS, sélecteur VF/VOSTFR, saut d'intro (85s), enchaînement épisode suivant. |
| **S04** | Watchlist | `/tv/watchlist` | Grille des séries favorites de l'utilisateur avec filtre par état (En cours, Terminée). |

---

## 5. Découpage en Tranches Verticales (Build Order)

### Tranche 1 : Shell & Navigation TV (`apps/site/src/app/tv/layout.tsx`)
- En-tête minimaliste sombre avec logo TV, barre de recherche, lien Watchlist et profil.
- Configuration du thème sombre immersif (`bg-[#0a0d14] text-white`).
- Intégration des jetons `tokens.json`.

### Tranche 2 : Lecteur HLS & Contrôles Immersifs (`S03`)
- Composant `TvVideoPlayer.tsx` avec barre de contrôle auto-masquable (3s d'inactivité).
- Saut automatique ou manuel de générique (« Passer l'intro »).
- Synchronisation de position de lecture (ping toutes les 15s vers `/api/tv/progress`).
- Bouton « Épisode Suivant » avec compte à rebours de 5 secondes en fin de générique de fin.

### Tranche 3 : Fiche Série & Navigation de Saison (`S02`)
- En-tête cinématique avec bannière assombrie en dégradé vertical.
- Accordéon ou onglets de saisons avec vignettes 16:9 de chaque épisode.
- Badge d'avancement de lecture (barre rouge/ambre sous la miniature).

### Tranche 4 : Page Découvrir & Continuer la Lecture (`S01`)
- Bannière Hero plein écran avec extrait vidéo automatique muet (ou image haute résolution).
- Rangée dynamique « Reprendre » alimentée par `tv_watch_progress`.
- Carrousels thématiques : Sagas Canoniques, Films, Séries Alternatives.

### Tranche 5 : Watchlist & Synchronisation Compte (`S04`)
- Bouton d'ajout/retrait immédiat avec mutation optimiste.
- Vue grille responsive (2 colonnes mobile, 4 colonnes desktop).

---

## 6. Les Points de Vigilance (The Parts that Bite)

1. **Rétrocompatibilité Safari / iOS** : Safari n'utilise pas MediaSource Extensions (MSE) pour HLS de la même façon que Chromium ; il requiert un fallback sur `<video src="...m3u8">` natif.
2. **Synchronisation Audio/Sous-titres** : Les sous-titres doivent rester calés à la milliseconde près même en cas de changement de résolution adaptative HLS.
3. **Persistance Hors-Connexion** : Pour les utilisateurs non connectés, la progression de lecture doit être conservée dans le `localStorage` et synchronisée lors de la connexion.

---

## 7. Critères d'Achèvement (Definition of Done)

- [ ] Les 4 écrans S01 à S04 sont fonctionnels et testés sur mobile (390px) et desktop (1920px).
- [ ] Zéro erreur de console, zéro fuite mémoire dans la boucle du lecteur vidéo.
- [ ] Accessibilité WCAG AA validée au clavier (Espace/K pour pause, F pour plein écran, M pour muet).
- [ ] Tests unitaires et e2e de lecture vidéo (`just deploy-check`).
