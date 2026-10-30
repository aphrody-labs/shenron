-- Editorially curated official Dragon Ball card catalog.
-- All public values, release details and image references are manually sourced.
CREATE TABLE IF NOT EXISTS public."CardCatalogSeries" (
  "id" text PRIMARY KEY,
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "publisher" text NOT NULL,
  "format" text NOT NULL,
  "language" text NOT NULL,
  "region" text NOT NULL,
  "description" text,
  "sourceLabel" text NOT NULL,
  "sourceUrl" text NOT NULL,
  "sourceAccessedAt" date NOT NULL,
  "status" text NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'published', 'archived')),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (length(trim("name")) > 0),
  CHECK (length(trim("publisher")) > 0),
  CHECK (length(trim("sourceLabel")) > 0),
  CHECK ("sourceUrl" ~ '^https?://')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CardCatalogSeries_status_idx"
  ON public."CardCatalogSeries" ("status", "name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public."CardCatalogSet" (
  "id" text PRIMARY KEY,
  "seriesId" text NOT NULL REFERENCES public."CardCatalogSeries"("id") ON DELETE RESTRICT,
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "productCode" text,
  "language" text NOT NULL,
  "region" text NOT NULL,
  "releaseDate" date,
  "releaseDatePrecision" text CHECK ("releaseDatePrecision" IS NULL OR "releaseDatePrecision" IN ('day', 'month', 'year', 'approximate')),
  "description" text,
  "sourceLabel" text NOT NULL,
  "sourceUrl" text NOT NULL,
  "sourceAccessedAt" date NOT NULL,
  "status" text NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'published', 'archived')),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (length(trim("name")) > 0),
  CHECK (length(trim("language")) > 0),
  CHECK (length(trim("region")) > 0),
  CHECK (length(trim("sourceLabel")) > 0),
  CHECK ("sourceUrl" ~ '^https?://'),
  CHECK (("releaseDate" IS NULL) = ("releaseDatePrecision" IS NULL))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CardCatalogSet_series_status_idx"
  ON public."CardCatalogSet" ("seriesId", "status", "name");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public."CardCatalogCard" (
  "id" text PRIMARY KEY,
  "setId" text NOT NULL REFERENCES public."CardCatalogSet"("id") ON DELETE RESTRICT,
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "cardNumber" text NOT NULL,
  "language" text NOT NULL,
  "region" text NOT NULL,
  "rarity" text,
  "releaseDate" date,
  "description" text,
  "frontImageUrl" text,
  "frontImageSourceUrl" text,
  "frontImageRights" text,
  "backImageUrl" text,
  "backImageSourceUrl" text,
  "backImageRights" text,
  "sourceLabel" text NOT NULL,
  "sourceUrl" text NOT NULL,
  "sourceAccessedAt" date NOT NULL,
  "status" text NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft', 'published', 'archived')),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (length(trim("name")) > 0),
  CHECK (length(trim("cardNumber")) > 0),
  CHECK (length(trim("language")) > 0),
  CHECK (length(trim("region")) > 0),
  CHECK (length(trim("sourceLabel")) > 0),
  CHECK ("sourceUrl" ~ '^https?://'),
  CHECK (("frontImageUrl" IS NULL AND "frontImageSourceUrl" IS NULL AND "frontImageRights" IS NULL) OR
         ("frontImageUrl" IS NOT NULL AND "frontImageUrl" ~ '^https?://' AND "frontImageSourceUrl" IS NOT NULL AND "frontImageSourceUrl" ~ '^https?://' AND "frontImageRights" IS NOT NULL AND length(trim("frontImageRights")) > 0)),
  CHECK (("backImageUrl" IS NULL AND "backImageSourceUrl" IS NULL AND "backImageRights" IS NULL) OR
         ("backImageUrl" IS NOT NULL AND "backImageUrl" ~ '^https?://' AND "backImageSourceUrl" IS NOT NULL AND "backImageSourceUrl" ~ '^https?://' AND "backImageRights" IS NOT NULL AND length(trim("backImageRights")) > 0))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CardCatalogCard_set_status_idx"
  ON public."CardCatalogCard" ("setId", "status", "cardNumber");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CardCatalogCard_public_release_idx"
  ON public."CardCatalogCard" ("status", "releaseDate", "name");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "CardCatalogCard_set_number_language_region_key"
  ON public."CardCatalogCard" ("setId", "cardNumber", "language", "region");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS public."CardCatalogValuation" (
  "id" text PRIMARY KEY,
  "cardId" text NOT NULL REFERENCES public."CardCatalogCard"("id") ON DELETE RESTRICT,
  "valueMin" numeric(16,4) NOT NULL CHECK ("valueMin" >= 0),
  "valueMax" numeric(16,4) NOT NULL CHECK ("valueMax" >= "valueMin"),
  "currency" text NOT NULL CHECK ("currency" ~ '^[A-Z]{3}$'),
  "condition" text NOT NULL CHECK (length(trim("condition")) > 0),
  "observedAt" date NOT NULL,
  "sourceLabel" text NOT NULL CHECK (length(trim("sourceLabel")) > 0),
  "sourceUrl" text NOT NULL CHECK ("sourceUrl" ~ '^https?://'),
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "CardCatalogValuation_card_observed_idx"
  ON public."CardCatalogValuation" ("cardId", "observedAt" DESC);
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON TABLE public."CardCatalogSeries" TO shenron;
GRANT SELECT, INSERT, UPDATE ON TABLE public."CardCatalogSet" TO shenron;
GRANT SELECT, INSERT, UPDATE ON TABLE public."CardCatalogCard" TO shenron;
GRANT SELECT, INSERT, UPDATE ON TABLE public."CardCatalogValuation" TO shenron;
