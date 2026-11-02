-- Store a site-owned illustration and accessible description for each battle.
ALTER TABLE bot.db_battles
  ADD COLUMN IF NOT EXISTS image text,
  ADD COLUMN IF NOT EXISTS image_alt text NOT NULL DEFAULT '';
