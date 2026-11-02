ALTER TABLE public."CardCatalogCard"
  ADD COLUMN IF NOT EXISTS "nameJa" text,
  ADD COLUMN IF NOT EXISTS "nameFr" text;
--> statement-breakpoint
UPDATE public."CardCatalogCard"
SET "nameJa" = "name"
WHERE "language" = 'ja' AND "nameJa" IS NULL;
--> statement-breakpoint
UPDATE public."CardCatalogCard"
SET "nameFr" = "name"
WHERE "language" = 'fr' AND "nameFr" IS NULL;
