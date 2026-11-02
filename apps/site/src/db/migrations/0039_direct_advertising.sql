-- Direct sponsorship inventory and auditable campaign management.
CREATE TABLE public.site_advertisers (
  id text PRIMARY KEY,
  "legalName" text NOT NULL CHECK (length(trim("legalName")) BETWEEN 2 AND 200),
  "contactEmail" text NOT NULL CHECK (length("contactEmail") <= 254),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paused', 'rejected')),
  "contractReference" text,
  "createdBy" text REFERENCES public."User"(id) ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX site_advertisers_status_idx ON public.site_advertisers (status, "createdAt");
--> statement-breakpoint
CREATE TABLE public.site_ad_campaigns (
  id text PRIMARY KEY,
  "advertiserId" text NOT NULL REFERENCES public.site_advertisers(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 160),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_review', 'scheduled', 'active', 'paused', 'completed', 'rejected')),
  "startsAt" timestamptz,
  "endsAt" timestamptz,
  "budgetMinor" integer NOT NULL CHECK ("budgetMinor" > 0),
  "dailyCapMinor" integer CHECK ("dailyCapMinor" IS NULL OR "dailyCapMinor" > 0),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  "approvedBy" text REFERENCES public."User"(id) ON DELETE SET NULL,
  "approvedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CHECK ("endsAt" IS NULL OR "startsAt" IS NULL OR "endsAt" > "startsAt")
);
--> statement-breakpoint
CREATE INDEX site_ad_campaigns_advertiser_status_idx
  ON public.site_ad_campaigns ("advertiserId", status);
--> statement-breakpoint
CREATE INDEX site_ad_campaigns_schedule_idx
  ON public.site_ad_campaigns (status, "startsAt", "endsAt");
--> statement-breakpoint
CREATE TABLE public.site_ad_creatives (
  id text PRIMARY KEY,
  "campaignId" text NOT NULL REFERENCES public.site_ad_campaigns(id) ON DELETE CASCADE,
  locale text NOT NULL CHECK (locale IN ('fr', 'en', 'ja')),
  format text NOT NULL CHECK (format IN ('banner', 'native', 'rectangle')),
  headline text NOT NULL CHECK (length(trim(headline)) BETWEEN 2 AND 120),
  body text CHECK (body IS NULL OR length(body) <= 400),
  "imageUrl" text,
  "destinationUrl" text NOT NULL CHECK ("destinationUrl" LIKE 'https://%'),
  "contentSha256" text NOT NULL CHECK ("contentSha256" ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'paused', 'rejected')),
  "reviewedBy" text REFERENCES public."User"(id) ON DELETE SET NULL,
  "reviewedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX site_ad_creatives_campaign_status_idx
  ON public.site_ad_creatives ("campaignId", status);
--> statement-breakpoint
CREATE TABLE public.site_ad_placements (
  id text PRIMARY KEY,
  "slotKey" text NOT NULL UNIQUE,
  name text NOT NULL,
  formats text[] NOT NULL DEFAULT '{}',
  "allowedPathPrefixes" text[] NOT NULL DEFAULT '{}',
  "blockedPathPrefixes" text[] NOT NULL DEFAULT '{/admin,/studio,/desktop,/workshop}',
  "exemptVip" boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX site_ad_placements_active_idx ON public.site_ad_placements (active, "slotKey");
--> statement-breakpoint
CREATE TABLE public.site_ad_events_daily (
  id text PRIMARY KEY,
  day date NOT NULL,
  "campaignId" text NOT NULL REFERENCES public.site_ad_campaigns(id) ON DELETE CASCADE,
  "placementId" text NOT NULL REFERENCES public.site_ad_placements(id) ON DELETE RESTRICT,
  impressions integer NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks integer NOT NULL DEFAULT 0 CHECK (clicks >= 0 AND clicks <= impressions),
  "spendMinor" integer NOT NULL DEFAULT 0 CHECK ("spendMinor" >= 0),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency = 'EUR'),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_ad_events_daily_key UNIQUE (day, "campaignId", "placementId")
);
--> statement-breakpoint
CREATE INDEX site_ad_events_campaign_day_idx ON public.site_ad_events_daily ("campaignId", day DESC);
--> statement-breakpoint
CREATE TABLE public.site_billing_audit (
  id text PRIMARY KEY,
  "actorUserId" text REFERENCES public."User"(id) ON DELETE SET NULL,
  "actorKind" text NOT NULL CHECK ("actorKind" IN ('user', 'admin', 'system', 'provider')),
  action text NOT NULL,
  "entityType" text NOT NULL,
  "entityId" text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX site_billing_audit_entity_idx
  ON public.site_billing_audit ("entityType", "entityId", "createdAt" DESC);
--> statement-breakpoint
CREATE INDEX site_billing_audit_actor_idx
  ON public.site_billing_audit ("actorUserId", "createdAt" DESC);
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.site_advertisers TO shenron;
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.site_ad_campaigns TO shenron;
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.site_ad_creatives TO shenron;
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.site_ad_placements TO shenron;
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.site_ad_events_daily TO shenron;
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.site_billing_audit TO shenron;
