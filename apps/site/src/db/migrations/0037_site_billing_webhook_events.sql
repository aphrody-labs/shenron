-- Registre d'idempotence pour les webhooks financiers déjà vérifiés par signature.
CREATE TABLE public.site_billing_webhook_events (
  id text PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('stripe', 'paypal')),
  event_id text NOT NULL,
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT site_billing_webhook_provider_event_unique UNIQUE (provider, event_id)
);
--> statement-breakpoint
CREATE INDEX site_billing_webhook_received_idx
  ON public.site_billing_webhook_events (received_at);
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.site_billing_webhook_events TO shenron;
