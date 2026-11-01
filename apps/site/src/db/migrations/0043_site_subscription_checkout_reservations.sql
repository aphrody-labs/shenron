-- Serialize subscription checkout attempts across Stripe and PayPal per user.
CREATE TABLE public.site_subscription_checkout_reservations (
  id text NOT NULL,
  user_id text PRIMARY KEY REFERENCES public.ba_user(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe', 'paypal')),
  plan text NOT NULL CHECK (plan IN ('vip_monthly', 'vip_annual')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX site_subscription_checkout_reservations_id_unique
  ON public.site_subscription_checkout_reservations (id);
--> statement-breakpoint
CREATE INDEX site_subscription_checkout_reservations_expiry_idx
  ON public.site_subscription_checkout_reservations (expires_at);
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.site_subscription_checkout_reservations TO shenron;
