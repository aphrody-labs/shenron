ALTER TABLE public."CardCatalogCard"
  ADD COLUMN IF NOT EXISTS "frontImageWidth" integer,
  ADD COLUMN IF NOT EXISTS "frontImageHeight" integer;
--> statement-breakpoint
ALTER TABLE public."CardCatalogCard"
  ADD CONSTRAINT "CardCatalogCard_front_image_dimensions_check"
  CHECK (
    ("frontImageWidth" IS NULL AND "frontImageHeight" IS NULL)
    OR (
      "frontImageWidth" IS NOT NULL
      AND "frontImageHeight" IS NOT NULL
      AND "frontImageWidth" BETWEEN 1 AND 10000
      AND "frontImageHeight" BETWEEN 1 AND 10000
    )
  );
