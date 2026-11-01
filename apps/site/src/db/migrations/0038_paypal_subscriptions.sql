-- PayPal subscriptions and one-time donation reconciliation.
ALTER TABLE public.site_donations
  ADD COLUMN "paymentProvider" text NOT NULL DEFAULT 'stripe'
    CHECK ("paymentProvider" IN ('stripe', 'paypal')),
  ADD COLUMN "paypalOrderId" text,
  ADD COLUMN "paypalCaptureId" text,
  ADD CONSTRAINT site_donations_paypal_order_unique UNIQUE ("paypalOrderId"),
  ADD CONSTRAINT site_donations_paypal_capture_unique UNIQUE ("paypalCaptureId");
--> statement-breakpoint
CREATE TABLE public.site_paypal_subscriptions (
  id text PRIMARY KEY,
  "userId" text REFERENCES public.ba_user(id) ON DELETE SET NULL,
  plan text NOT NULL,
  "paypalSubscriptionId" text NOT NULL,
  status text NOT NULL DEFAULT 'APPROVAL_PENDING',
  "startedAt" timestamptz,
  "nextBillingAt" timestamptz,
  "lastPaymentAt" timestamptz,
  "cancelledAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_paypal_subscriptions_provider_subscription_unique UNIQUE ("paypalSubscriptionId")
);
--> statement-breakpoint
CREATE INDEX site_paypal_subscriptions_user_status_idx
  ON public.site_paypal_subscriptions ("userId", status);
--> statement-breakpoint
CREATE INDEX site_paypal_subscriptions_status_idx
  ON public.site_paypal_subscriptions (status, "updatedAt");
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.site_paypal_subscriptions TO shenron;
