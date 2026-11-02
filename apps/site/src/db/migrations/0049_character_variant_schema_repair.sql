-- Restore the character variant schema when older journal entries were skipped
-- by a production database whose migration cursor had already advanced.
-- Every operation is additive and safe when the original migration did run.

ALTER TABLE bot.db_character_variants
  ADD COLUMN IF NOT EXISTS article text,
  ADD COLUMN IF NOT EXISTS first_episode bigint,
  ADD COLUMN IF NOT EXISTS last_episode bigint,
  ADD COLUMN IF NOT EXISTS key_episodes jsonb;

ALTER TABLE bot.db_character_relations
  ADD COLUMN IF NOT EXISTS variant_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'db_character_relations_variant_id_fkey'
      AND conrelid = 'bot.db_character_relations'::regclass
  ) THEN
    ALTER TABLE bot.db_character_relations
      ADD CONSTRAINT db_character_relations_variant_id_fkey
      FOREIGN KEY (variant_id)
      REFERENCES bot.db_character_variants(id)
      ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS db_character_relations_variant_visible_order_idx
  ON bot.db_character_relations (character_id, variant_id, visible, sort_order, id);

CREATE TABLE IF NOT EXISTS bot.db_character_continuities (
  character_id bigint NOT NULL REFERENCES bot.db_characters(id) ON DELETE CASCADE,
  version_character_id bigint NOT NULL REFERENCES bot.db_characters(id) ON DELETE CASCADE,
  label text,
  sort_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  PRIMARY KEY (character_id, version_character_id),
  CHECK (character_id <> version_character_id)
);

CREATE INDEX IF NOT EXISTS db_character_continuities_version_idx
  ON bot.db_character_continuities (version_character_id, visible);

CREATE UNIQUE INDEX IF NOT EXISTS db_character_continuities_visible_version_unique
  ON bot.db_character_continuities (version_character_id) WHERE visible;

CREATE TABLE IF NOT EXISTS bot.db_character_variant_battles (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  variant_id integer NOT NULL REFERENCES bot.db_character_variants(id) ON DELETE CASCADE,
  battle_id integer NOT NULL REFERENCES bot.db_battles(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  CONSTRAINT db_character_variant_battles_variant_battle_unique UNIQUE (variant_id, battle_id)
);

CREATE INDEX IF NOT EXISTS db_character_variant_battles_visible_order_idx
  ON bot.db_character_variant_battles (variant_id, visible, sort_order, battle_id);

INSERT INTO bot.db_character_variant_battles (variant_id, battle_id, sort_order)
SELECT
  variant.id,
  battle.id,
  (row_number() OVER (
    PARTITION BY variant.id
    ORDER BY COALESCE(battle.manga_chapter_start, battle.episode_start, battle.manga_volume_start), battle.id
  ) - 1)::integer
FROM bot.db_character_variants AS variant
JOIN bot.db_battles AS battle ON battle.saga_id = variant.saga_id AND battle.visible
WHERE battle.combatants @> jsonb_build_array(jsonb_build_object('characterId', variant.character_id))
ON CONFLICT (variant_id, battle_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS bot.db_character_variant_technique_uses (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  variant_id integer NOT NULL REFERENCES bot.db_character_variants(id) ON DELETE CASCADE,
  technique_id integer NOT NULL REFERENCES bot.db_techniques(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_label text NOT NULL,
  source_url text,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS db_character_variant_technique_uses_visible_order_idx
  ON bot.db_character_variant_technique_uses (variant_id, visible, sort_order, id);

CREATE TABLE IF NOT EXISTS bot.db_character_variant_appearances (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  variant_id integer NOT NULL REFERENCES bot.db_character_variants(id) ON DELETE CASCADE,
  transformation_id integer REFERENCES bot.db_transformations(id) ON DELETE SET NULL,
  image text NOT NULL CHECK (length(btrim(image)) > 0),
  alt_text text NOT NULL DEFAULT '',
  source_url text,
  sort_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS db_character_variant_appearances_visible_order_idx
  ON bot.db_character_variant_appearances (variant_id, visible, sort_order, id);

CREATE TABLE IF NOT EXISTS bot.db_character_variant_staff_credits (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  variant_id integer NOT NULL REFERENCES bot.db_character_variants(id) ON DELETE CASCADE,
  episode_number text NOT NULL CHECK (length(btrim(episode_number)) > 0),
  scene_title text NOT NULL CHECK (length(btrim(scene_title)) > 0),
  animation_supervisor text NOT NULL CHECK (length(btrim(animation_supervisor)) > 0),
  supervisor_slug text,
  key_animators text,
  image text,
  alt_text text NOT NULL DEFAULT '',
  source_url text,
  episode_url text,
  sort_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS db_character_variant_staff_credits_order_idx
  ON bot.db_character_variant_staff_credits (variant_id, visible, sort_order, id);

CREATE TABLE IF NOT EXISTS bot.db_character_variant_voice_actors (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  variant_id integer NOT NULL REFERENCES bot.db_character_variants(id) ON DELETE CASCADE,
  voice_actor_id integer NOT NULL REFERENCES bot.db_voice_actors(id) ON DELETE CASCADE,
  role_notes text,
  sort_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true,
  UNIQUE (variant_id, voice_actor_id)
);

CREATE INDEX IF NOT EXISTS db_character_variant_voice_actors_order_idx
  ON bot.db_character_variant_voice_actors (variant_id, visible, sort_order, id);

DO $$
DECLARE
  table_name text;
  id_sequence regclass;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shenron') THEN
    FOREACH table_name IN ARRAY ARRAY[
      'db_character_variants',
      'db_character_relations',
      'db_character_continuities',
      'db_character_variant_battles',
      'db_character_variant_technique_uses',
      'db_character_variant_appearances',
      'db_character_variant_staff_credits',
      'db_character_variant_voice_actors'
    ] LOOP
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bot.%I TO shenron', table_name);
      id_sequence := pg_get_serial_sequence(format('bot.%I', table_name), 'id')::regclass;
      IF id_sequence IS NOT NULL THEN
        EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO shenron', id_sequence);
      END IF;
    END LOOP;
  END IF;
END $$;
