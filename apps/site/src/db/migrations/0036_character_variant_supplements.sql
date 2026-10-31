-- Editable episode-level animation credits for each character saga variant.
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
  id_sequence regclass;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shenron') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bot.db_character_variant_staff_credits TO shenron';
    id_sequence := pg_get_serial_sequence('bot.db_character_variant_staff_credits', 'id')::regclass;
    IF id_sequence IS NOT NULL THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO shenron', id_sequence);
    END IF;
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bot.db_character_variant_voice_actors TO shenron';
    id_sequence := pg_get_serial_sequence('bot.db_character_variant_voice_actors', 'id')::regclass;
    IF id_sequence IS NOT NULL THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO shenron', id_sequence);
    END IF;
  END IF;
END $$;
