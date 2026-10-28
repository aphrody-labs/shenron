-- Migration 0025: Stripe, Abonnements, Dons et Publicités (DBFR)

-- 1. Extension de la table utilisateur pour Stripe
ALTER TABLE public.ba_user
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ba_user_stripe_customer_idx" ON public.ba_user ("stripeCustomerId");
--> statement-breakpoint

-- 2. Table des abonnements (Better Auth / Stripe Plugin)
CREATE TABLE IF NOT EXISTS public.ba_subscription (
  "id" text PRIMARY KEY,
  "plan" text NOT NULL,
  "referenceId" text NOT NULL,
  "stripeCustomerId" text NOT NULL,
  "stripeSubscriptionId" text NOT NULL UNIQUE,
  "status" text NOT NULL,
  "periodStart" timestamp,
  "periodEnd" timestamp,
  "cancelAtPeriodEnd" boolean DEFAULT false,
  "seats" integer,
  "trialStart" timestamp,
  "trialEnd" timestamp,
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ba_subscription_ref_idx" ON public.ba_subscription ("referenceId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ba_subscription_cust_idx" ON public.ba_subscription ("stripeCustomerId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ba_subscription_status_idx" ON public.ba_subscription ("status");
--> statement-breakpoint

-- 3. Table des dons (Kamehameha / Genki Dama de soutien)
CREATE TABLE IF NOT EXISTS public.site_donations (
  "id" text PRIMARY KEY,
  "userId" text REFERENCES public.ba_user("id") ON DELETE SET NULL,
  "donorName" text NOT NULL,
  "donorEmail" text,
  "amount" integer NOT NULL, -- en centimes EUR
  "currency" text NOT NULL DEFAULT 'eur',
  "message" text,
  "isAnonymous" boolean NOT NULL DEFAULT false,
  "stripeCheckoutSessionId" text UNIQUE,
  "stripePaymentIntentId" text UNIQUE,
  "status" text NOT NULL DEFAULT 'pending', -- 'pending', 'succeeded', 'failed'
  "tier" text, -- ex: 'senzu', 'dragon_ball', 'genki_dama'
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_donations_status_idx" ON public.site_donations ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_donations_user_idx" ON public.site_donations ("userId");
--> statement-breakpoint

-- 4. Table des encarts publicitaires et paramètres de diffusion
CREATE TABLE IF NOT EXISTS public.site_ad_slots (
  "id" text PRIMARY KEY,
  "slotKey" text NOT NULL UNIQUE, -- ex: 'reader_bottom', 'manga_sidebar', 'header_banner'
  "name" text NOT NULL,
  "format" text NOT NULL, -- 'banner', 'rectangle', 'responsive'
  "adClient" text NOT NULL, -- ex: 'ca-pub-XXXXXXXXXX'
  "adSlot" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "exemptVip" boolean NOT NULL DEFAULT true, -- exempté pour les abonnés VIP
  "createdAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

-- Permissions pour l'utilisateur de l'application
GRANT ALL PRIVILEGES ON TABLE public.ba_subscription TO shenron;
GRANT ALL PRIVILEGES ON TABLE public.site_donations TO shenron;
GRANT ALL PRIVILEGES ON TABLE public.site_ad_slots TO shenron;
