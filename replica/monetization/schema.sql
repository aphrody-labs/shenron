-- Schéma cible incrémental pour compléter les tables financières existantes.
-- Ne pas exécuter directement : produire une migration Drizzle approuvée par le runbook Infra.
-- Tables déjà existantes : ba_subscription, site_donations, site_ad_slots,
-- site_billing_webhook_events (migration apps/site/src/db/migrations/0029_*).

CREATE TABLE site_payment_accounts (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES ba_user(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe', 'paypal')),
  external_customer_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_customer_id),
  UNIQUE (user_id, provider)
);
CREATE INDEX site_payment_accounts_user_idx ON site_payment_accounts (user_id);

CREATE TABLE site_advertisers (
  id text PRIMARY KEY,
  legal_name text NOT NULL,
  contact_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paused', 'rejected')),
  contract_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_advertisers_status_idx ON site_advertisers (status, created_at);

CREATE TABLE site_ad_campaigns (
  id text PRIMARY KEY,
  advertiser_id text NOT NULL REFERENCES site_advertisers(id) ON DELETE RESTRICT,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_review', 'scheduled', 'active', 'paused', 'completed', 'rejected')),
  starts_at timestamptz,
  ends_at timestamptz,
  budget_minor bigint NOT NULL CHECK (budget_minor >= 0),
  daily_cap_minor bigint CHECK (daily_cap_minor IS NULL OR daily_cap_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  approved_by text REFERENCES ba_user(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX site_ad_campaigns_advertiser_status_idx ON site_ad_campaigns (advertiser_id, status);
CREATE INDEX site_ad_campaigns_schedule_idx ON site_ad_campaigns (status, starts_at, ends_at);

CREATE TABLE site_ad_creatives (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES site_ad_campaigns(id) ON DELETE CASCADE,
  locale text NOT NULL CHECK (locale IN ('fr', 'en', 'ja')),
  format text NOT NULL CHECK (format IN ('banner', 'native', 'rectangle')),
  headline text NOT NULL,
  body text,
  image_url text,
  destination_url text NOT NULL,
  content_sha256 char(64) NOT NULL,
  status text NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'paused', 'rejected')),
  reviewed_by text REFERENCES ba_user(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_ad_creatives_campaign_status_idx ON site_ad_creatives (campaign_id, status);

CREATE TABLE site_ad_placements (
  id text PRIMARY KEY,
  slot_key text NOT NULL UNIQUE,
  name text NOT NULL,
  formats text[] NOT NULL,
  allowed_path_prefixes text[] NOT NULL DEFAULT '{}',
  blocked_path_prefixes text[] NOT NULL DEFAULT '{}',
  consent_mode text NOT NULL DEFAULT 'contextual'
    CHECK (consent_mode IN ('contextual', 'personalized')),
  exempt_vip boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE site_ad_events_daily (
  day date NOT NULL,
  campaign_id text NOT NULL REFERENCES site_ad_campaigns(id) ON DELETE CASCADE,
  placement_id text NOT NULL REFERENCES site_ad_placements(id) ON DELETE RESTRICT,
  impressions bigint NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks bigint NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  spend_minor bigint NOT NULL DEFAULT 0 CHECK (spend_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, campaign_id, placement_id),
  CHECK (clicks <= impressions)
);
CREATE INDEX site_ad_events_campaign_day_idx ON site_ad_events_daily (campaign_id, day DESC);

CREATE TABLE site_ad_campaign_placements (
  campaign_id text NOT NULL REFERENCES site_ad_campaigns(id) ON DELETE CASCADE,
  placement_id text NOT NULL REFERENCES site_ad_placements(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, placement_id)
);
CREATE INDEX site_ad_campaign_placements_placement_idx
  ON site_ad_campaign_placements (placement_id, campaign_id);

CREATE TABLE site_billing_audit (
  id text PRIMARY KEY,
  actor_user_id text REFERENCES ba_user(id) ON DELETE SET NULL,
  actor_kind text NOT NULL CHECK (actor_kind IN ('user', 'admin', 'system', 'provider')),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_billing_audit_entity_idx ON site_billing_audit (entity_type, entity_id, created_at DESC);
CREATE INDEX site_billing_audit_actor_idx ON site_billing_audit (actor_user_id, created_at DESC);

-- Added by migration 0042_site_email_outbox.sql.
CREATE TABLE site_email_outbox (
  id text PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  recipient text NOT NULL,
  subject text NOT NULL,
  text_body text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_email_outbox_ready_idx ON site_email_outbox (status, available_at);
CREATE INDEX site_email_outbox_locked_idx ON site_email_outbox (status, locked_at);

-- Added by migration 0043_site_subscription_checkout_reservations.sql.
CREATE TABLE site_subscription_checkout_reservations (
  id text NOT NULL UNIQUE,
  user_id text PRIMARY KEY REFERENCES ba_user(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe', 'paypal')),
  plan text NOT NULL CHECK (plan IN ('vip_monthly', 'vip_annual')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX site_subscription_checkout_reservations_expiry_idx
  ON site_subscription_checkout_reservations (expires_at);
