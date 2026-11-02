CREATE TABLE public.site_ad_campaign_placements (
  "campaignId" text NOT NULL REFERENCES public.site_ad_campaigns(id) ON DELETE CASCADE,
  "placementId" text NOT NULL REFERENCES public.site_ad_placements(id) ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_ad_campaign_placements_pk PRIMARY KEY ("campaignId", "placementId")
);
--> statement-breakpoint
CREATE INDEX site_ad_campaign_placements_placement_idx
  ON public.site_ad_campaign_placements ("placementId", "campaignId");
--> statement-breakpoint
GRANT ALL PRIVILEGES ON TABLE public.site_ad_campaign_placements TO shenron;
--> statement-breakpoint
