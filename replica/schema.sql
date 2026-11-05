-- Pages œuvre DBFR : schéma proposé par /replica-architect (2026-11-05). Voir replica/architecture.md.
-- Postgres 15+. Nouvelles tables seulement ; aucune table existante (ba_*, site_*, catalogue) n'est modifiée.
-- Accès : une vérification d'autorisation par requête dans la couche de données (pas de RLS, rôle applicatif unique).

create table works (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  kind text not null check (kind in ('anime', 'film', 'game', 'manga')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  released_on date,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint published_has_date check (status <> 'published' or published_at is not null)
);
create index works_status_released_idx on works (status, released_on desc);

create table work_texts (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works (id) on delete cascade,
  lang text not null check (lang in ('fr', 'en', 'ja')),
  title text not null,
  intro text not null default '',
  story text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, lang)
);
create index work_texts_work_idx on work_texts (work_id);

create table work_videos (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works (id) on delete cascade,
  kind text not null check (kind in ('trailer', 'opening', 'ending', 'teaser', 'clip')),
  source text not null check (source in ('cdn', 'official_embed')),
  url text not null check (url ~ '^https://'),
  title text not null,
  lang text check (lang in ('fr', 'en', 'ja')),
  published_on date,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index work_videos_work_order_idx on work_videos (work_id, position, published_on desc);

create table characters (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works (id) on delete cascade,
  name text not null,
  voice_actor_ja text,
  voice_actor_fr text,
  portrait_url text check (portrait_url is null or portrait_url ~ '^https://cdn\.dragonballfr\.com/'),
  blurb text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index characters_work_order_idx on characters (work_id, position);

-- Diffusion : jour + heure locale + fuseau IANA, l'instant est calculé à la lecture (heure d'été).
create table broadcast_slots (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works (id) on delete cascade,
  region text not null check (region ~ '^[A-Z]{2}$'),
  platform text not null,
  weekday smallint not null check (weekday between 1 and 7),
  local_time time not null,
  time_zone text not null,
  url text check (url is null or url ~ '^https://'),
  verified_at timestamptz not null default now(),
  stale boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, region, platform, weekday)
);
create index broadcast_slots_work_region_idx on broadcast_slots (work_id, region);
create index broadcast_slots_verified_idx on broadcast_slots (verified_at);

create table staff_credits (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works (id) on delete cascade,
  role text not null,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index staff_credits_work_order_idx on staff_credits (work_id, position);

create table work_news (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references works (id) on delete cascade,
  title text not null,
  url text not null check (url ~ '^https://'),
  lang text not null check (lang in ('fr', 'en', 'ja')),
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, url)
);
create index work_news_work_date_idx on work_news (work_id, published_at desc);

-- Newsletter : double opt-in, pas de date de naissance, effacement par désinscription.
create table newsletter_signups (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique check (email_normalized = lower(email_normalized)),
  lang text not null check (lang in ('fr', 'en', 'ja')),
  consent_version text not null,
  consented_at timestamptz not null,
  confirm_token_hash bytea not null unique,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index newsletter_signups_pending_idx on newsletter_signups (created_at) where confirmed_at is null;
