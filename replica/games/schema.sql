-- SPDX-License-Identifier: Apache-2.0
-- Sovereign Dragon Ball 2.5D Game Replica Schema
-- Generated with /replica-architect for Shenron & DragonBallFR.com

create extension if not exists "pgcrypto";

-- 1. Profil Joueur & Données Compétitives
create table if not exists game_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  battle_points bigint not null default 1000 check (battle_points >= 0),
  zenis bigint not null default 500 check (zenis >= 0),
  rank_tier text not null default 'Saibaiman'
    check (rank_tier in ('Saibaiman', 'Terrien', 'Guerrier Saiyan', 'Super Saiyan', 'Majin', 'Dieu de la Destruction', 'Ange', 'Grand Prêtre')),
  matches_played integer not null default 0 check (matches_played >= 0),
  matches_won integer not null default 0 check (matches_won >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_game_profiles_bp on game_profiles (battle_points desc);
create index if not exists idx_game_profiles_user on game_profiles (user_id);

-- 2. Combattants Canoniques
create table if not exists game_fighters (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_-]+$'),
  name text not null,
  name_ja text not null,
  style text not null check (style in ('balanced', 'rush', 'power', 'trickster', 'brute', 'team', 'boss')),
  base_hp real not null default 100.0 check (base_hp > 0),
  base_ki real not null default 100.0 check (base_ki >= 0),
  base_power_level bigint not null check (base_power_level > 0),
  emblem_svg text not null default '/sprites/emblems/kame.svg',
  wiki_slug text not null,
  is_unlocked_default boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_game_fighters_slug on game_fighters (slug);
create index if not exists idx_game_fighters_style on game_fighters (style);

-- 3. Transformations & Multiplicateurs de Puissance
create table if not exists game_fighter_forms (
  id uuid primary key default gen_random_uuid(),
  fighter_id uuid not null references game_fighters(id) on delete cascade,
  form_id text not null check (form_id ~ '^[a-z0-9_-]+$'),
  name text not null,
  name_ja text not null,
  power_multiplier real not null default 1.0 check (power_multiplier >= 1.0),
  power_level bigint not null check (power_level > 0),
  aura_type text not null default 'white' check (aura_type in ('white', 'kaioken', 'super_saiyan', 'super_saiyan_2', 'super_saiyan_3', 'god', 'blue', 'ultra_instinct')),
  aura_color_rgba real[] not null default array[1.0, 1.0, 1.0, 0.7],
  atlas_key text not null,
  created_at timestamptz not null default now(),
  unique (fighter_id, form_id)
);
create index if not exists idx_game_fighter_forms_fighter on game_fighter_forms (fighter_id);

-- 4. Coups Spéciaux & Attaques de Rayon (Kikōha)
create table if not exists game_moves (
  id uuid primary key default gen_random_uuid(),
  fighter_id uuid not null references game_fighters(id) on delete cascade,
  move_key text not null check (move_key ~ '^[a-z0-9_-]+$'),
  name text not null,
  name_ja text not null,
  move_type text not null check (move_type in ('normal', 'special', 'super_lv1', 'ultimate_lv3', 'beam', 'throw')),
  ki_cost real not null default 0.0 check (ki_cost >= 0.0 and ki_cost <= 700.0),
  damage real not null check (damage > 0),
  is_beam boolean not null default false,
  is_ultimate boolean not null default false,
  startup_frames integer not null default 4 check (startup_frames >= 1),
  active_frames integer not null default 3 check (active_frames >= 1),
  recovery_frames integer not null default 8 check (recovery_frames >= 0),
  sfx_key text not null default 'sfx_punch',
  created_at timestamptz not null default now(),
  unique (fighter_id, move_key)
);
create index if not exists idx_game_moves_fighter on game_moves (fighter_id);
create index if not exists idx_game_moves_type on game_moves (move_type);

-- 5. Arènes de Combat & Terrains Tenkaichi
create table if not exists game_stages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_-]+$'),
  name text not null,
  name_ja text not null,
  arena_id text not null unique,
  has_ring_out boolean not null default false,
  is_destructible boolean not null default true,
  bgm_track text not null default 'bgm_tenkaichi',
  cdn_texture_prefix text not null default 'https://cdn.dragonballfr.com/games/stages',
  created_at timestamptz not null default now()
);
create index if not exists idx_game_stages_slug on game_stages (slug);

-- 6. Chapitres Canoniques de l'Histoire (42 Tomes Toriyama)
create table if not exists game_canon_chapters (
  id uuid primary key default gen_random_uuid(),
  sequence_order integer not null unique check (sequence_order >= 1 and sequence_order <= 100),
  saga_id text not null check (saga_id in ('pilaf', 'tenkaichi_21', 'red_ribbon', 'tenkaichi_22', 'piccolo_daimao', 'tenkaichi_23', 'saiyans', 'namek_frieza', 'androids_cell', 'majin_buu', 'super_beerus')),
  tome integer not null check (tome >= 1 and tome <= 82),
  manga_chapter integer not null check (manga_chapter >= 1 and manga_chapter <= 600),
  page_start integer not null default 1 check (page_start >= 1),
  title text not null,
  title_ja text not null,
  player_fighter_id uuid not null references game_fighters(id) on delete restrict,
  enemy_fighter_id uuid not null references game_fighters(id) on delete restrict,
  stage_id uuid not null references game_stages(id) on delete restrict,
  boss_hp real not null default 150.0 check (boss_hp > 0),
  daizenshuu_notice text not null,
  databook_lot text not null default 'databooks-lot-001',
  dramatic_finish_move text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_game_canon_chapters_seq on game_canon_chapters (sequence_order);
create index if not exists idx_game_canon_chapters_saga on game_canon_chapters (saga_id);

-- 7. Sessions de Combat & Télémétrie Déterministe
create table if not exists game_match_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references game_profiles(user_id) on delete cascade,
  opponent_user_id uuid references game_profiles(user_id) on delete set null,
  mode text not null check (mode in ('story', 'arcade', 'tournament', 'training', 'versus', 'online_rollback', 'shenron_quest')),
  chapter_id uuid references game_canon_chapters(id) on delete set null,
  stage_id uuid not null references game_stages(id) on delete restrict,
  winner_user_id uuid references game_profiles(user_id) on delete set null,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  total_frames bigint not null default 0 check (total_frames >= 0),
  dramatic_finish_triggered boolean not null default false,
  dragon_balls_summoned boolean not null default false,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned', 'desynced')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_game_match_sessions_user on game_match_sessions (user_id, created_at desc);
create index if not exists idx_game_match_sessions_mode on game_match_sessions (mode);
create index if not exists idx_game_match_sessions_status on game_match_sessions (status);

-- 8. Inventaire des 7 Dragon Balls & Vœux de Shenron
create table if not exists game_dragon_ball_inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references game_profiles(user_id) on delete cascade,
  balls_bitmask integer not null default 0 check (balls_bitmask >= 0 and balls_bitmask <= 127), -- 127 = 0b1111111 (7 sphères)
  shenron_wishes_granted integer not null default 0 check (shenron_wishes_granted >= 0),
  last_wish_type text check (last_wish_type in ('full_heal', 'max_ki', 'revive_ally', 'zenis_grant', 'unlock_fighter')),
  last_wish_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_game_db_inventory_user on game_dragon_ball_inventory (user_id);

-- 9. Classement Compétitif Saisonnier (Leaderboard BP)
create table if not exists game_leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references game_profiles(user_id) on delete cascade,
  season_id text not null check (season_id ~ '^S[0-9]{2}$'),
  bp bigint not null check (bp >= 0),
  rank_position integer not null check (rank_position >= 1),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  updated_at timestamptz not null default now(),
  unique (season_id, user_id)
);
create index if not exists idx_game_leaderboard_season_bp on game_leaderboard_entries (season_id, bp desc);

-- Règles d'Accès & Sécurité
-- L'accès en lecture est public pour le catalogue (combattants, coups, arènes, chapitres) et le classement.
-- L'écriture sur les profils et l'inventaire est protégée par le token de session utilisateur (Better Auth).
-- Les modifications administratives du catalogue sont réservées au rôle 'admin'.
