-- Preserve legacy wiki records while allowing editors to unpublish them.
ALTER TABLE public."WikiCategory"
  ADD COLUMN IF NOT EXISTS "visible" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE public."WikiPage"
  ADD COLUMN IF NOT EXISTS "visible" boolean NOT NULL DEFAULT true;
