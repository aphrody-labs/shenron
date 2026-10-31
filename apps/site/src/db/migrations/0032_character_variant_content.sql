-- SPDX-License-Identifier: Apache-2.0

ALTER TABLE bot.db_character_variants
  ADD COLUMN IF NOT EXISTS article text;

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
