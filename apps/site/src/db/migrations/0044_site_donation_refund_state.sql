ALTER TABLE public.site_donations
  ADD COLUMN "refundedAmount" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE public.site_donations
SET "refundedAmount" = amount
WHERE status = 'refunded' AND "paymentProvider" = 'stripe';
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.site_donations TO shenron;
