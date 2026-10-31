-- Persist and edit the character relation cards from the site admin.
CREATE TABLE IF NOT EXISTS bot.db_character_relations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  character_id bigint NOT NULL,
  related_character_id bigint,
  category text NOT NULL CHECK (category IN ('family', 'friend', 'enemy')),
  relation_type text,
  name text NOT NULL,
  name_ja text,
  image text,
  slug text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  visible boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS db_character_relations_character_idx
  ON bot.db_character_relations (character_id, visible, sort_order, id);

DO $$
DECLARE
  id_sequence regclass;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shenron') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bot.db_character_relations TO shenron';
    id_sequence := pg_get_serial_sequence('bot.db_character_relations', 'id')::regclass;
    IF id_sequence IS NOT NULL THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO shenron', id_sequence);
    END IF;
  END IF;
END $$;
