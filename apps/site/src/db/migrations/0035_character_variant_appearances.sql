-- Optional alternate portrait photos attached to a specific character saga.
-- Each visible row becomes one image-only thumbnail button on the portrait.
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

DO $$
DECLARE
  id_sequence regclass;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shenron') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bot.db_character_variant_appearances TO shenron';
    id_sequence := pg_get_serial_sequence('bot.db_character_variant_appearances', 'id')::regclass;
    IF id_sequence IS NOT NULL THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO shenron', id_sequence);
    END IF;
  END IF;
END $$;
