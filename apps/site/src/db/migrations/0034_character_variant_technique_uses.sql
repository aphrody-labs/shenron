-- Record every cited technique use within a character's selected saga.
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

DO $$
DECLARE
  id_sequence regclass;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shenron') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bot.db_character_variant_technique_uses TO shenron';
    id_sequence := pg_get_serial_sequence('bot.db_character_variant_technique_uses', 'id')::regclass;
    IF id_sequence IS NOT NULL THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO shenron', id_sequence);
    END IF;
  END IF;
END $$;
