-- Ensure the site application role can use character variants even when the
-- original table was created by the standalone setup script under another role.
DO $$
DECLARE
  id_sequence regclass;
BEGIN
  IF to_regclass('bot.db_character_variants') IS NOT NULL
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shenron') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bot.db_character_variants TO shenron';
    id_sequence := pg_get_serial_sequence('bot.db_character_variants', 'id')::regclass;
    IF id_sequence IS NOT NULL THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO shenron', id_sequence);
    END IF;
  END IF;
END $$;
