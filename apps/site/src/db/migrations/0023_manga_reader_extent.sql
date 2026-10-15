-- Additive reader coverage metadata. NULL legacy rows have unknown pagination, never implicit full coverage.
ALTER TABLE bot.db_manga_chapters ADD COLUMN IF NOT EXISTS reader_extent jsonb;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='bot.db_manga_chapters'::regclass AND conname='db_manga_chapters_reader_extent_kind') THEN
    ALTER TABLE bot.db_manga_chapters ADD CONSTRAINT db_manga_chapters_reader_extent_kind CHECK (
      reader_extent IS NULL OR (
        jsonb_typeof(reader_extent)='object'
        AND reader_extent ? 'kind'
        AND reader_extent->>'kind' IN ('preview','full','unknown')
      )
    );
  END IF;
END $$;
