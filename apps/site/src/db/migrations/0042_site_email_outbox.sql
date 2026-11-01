-- SPDX-License-Identifier: Apache-2.0
-- Transactional confirmation messages are queued in the same transaction as webhook state changes.
CREATE TABLE public.site_email_outbox (
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
--> statement-breakpoint
CREATE INDEX site_email_outbox_ready_idx
  ON public.site_email_outbox (status, available_at);
--> statement-breakpoint
CREATE INDEX site_email_outbox_locked_idx
  ON public.site_email_outbox (status, locked_at);
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.site_email_outbox TO shenron;
