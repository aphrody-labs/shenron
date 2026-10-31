-- Objects declared by earlier migrations or by the Drizzle schemas that production never received.
-- Every statement is additive and idempotent; no data is read or rewritten.

-- 0017 declared `visible` and its partial index, but the table pre-existed without the column.
ALTER TABLE public.url_redirects
  ADD COLUMN IF NOT EXISTS "visible" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS url_redirects_visible_idx
  ON public.url_redirects (source_path) WHERE visible;
--> statement-breakpoint

-- 0017 index on the publications listing (type, date).
CREATE INDEX IF NOT EXISTS db_media_publications_type_date_idx
  ON bot.db_media_publications (publication_type, published_at);
--> statement-breakpoint

-- bot-schema.ts declares the ISBN of the dragonballcn volumes (the SQLite replica already has it).
ALTER TABLE bot.dragonballcn_volumes
  ADD COLUMN IF NOT EXISTS "isbn" text;
