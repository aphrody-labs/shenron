CREATE TABLE IF NOT EXISTS public.site_watch_progress (
  "userId" text NOT NULL,
  "kind" text NOT NULL,
  "itemId" text NOT NULL,
  "seconds" integer NOT NULL,
  "duration" integer NOT NULL,
  "completed" boolean NOT NULL DEFAULT false,
  "language" text,
  "title" text NOT NULL,
  "href" text NOT NULL,
  "image" text,
  "caption" text,
  "updatedAtMs" bigint NOT NULL,
  CONSTRAINT site_watch_progress_pk PRIMARY KEY ("userId", "kind", "itemId"),
  CONSTRAINT site_watch_progress_kind_check CHECK ("kind" IN ('episode', 'movie')),
  CONSTRAINT site_watch_progress_position_check CHECK (
    "seconds" >= 0 AND "duration" >= 1 AND "seconds" <= "duration"
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS site_watch_progress_user_recent_idx
  ON public.site_watch_progress ("userId", "updatedAtMs" DESC);
