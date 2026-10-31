-- Editable links from one character identity to its alternate timelines.
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shenron') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bot.db_character_continuities TO shenron';
  END IF;
END $$;
