-- Assign a battle to the character version and saga where it belongs.
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

-- Seed links only when the battle already names this exact character ID and
-- belongs to the same saga as the character version.
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

DO $$
DECLARE
  id_sequence regclass;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'shenron') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE bot.db_character_variant_battles TO shenron';
    id_sequence := pg_get_serial_sequence('bot.db_character_variant_battles', 'id')::regclass;
    IF id_sequence IS NOT NULL THEN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO shenron', id_sequence);
    END IF;
  END IF;
END $$;
