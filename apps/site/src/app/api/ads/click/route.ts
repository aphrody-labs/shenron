import { and, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import {
  baSubscription,
  siteAdCampaigns,
  siteAdCampaignPlacements,
  siteAdCreatives,
  siteAdEventsDaily,
  siteAdPlacements,
  sitePaypalSubscriptions,
  siteAdvertisers,
} from "@/db/schema";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { allowsPublicAds } from "@/lib/public-ads";

export const dynamic = "force-dynamic";

function unavailable() {
  return NextResponse.json({ error: "ad_unavailable" }, { status: 404 });
}

export async function GET(request: NextRequest) {
  const creativeId = request.nextUrl.searchParams.get("creative") ?? "";
  const placementKey = request.nextUrl.searchParams.get("placement") ?? "";
  const pathname = request.nextUrl.searchParams.get("path") ?? "";
  if (
    !/^[a-z0-9_-]{3,80}$/.test(creativeId) ||
    !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(placementKey) ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    !allowsPublicAds(pathname)
  ) {
    return unavailable();
  }

  try {
    const [placement] = await db
      .select()
      .from(siteAdPlacements)
      .where(and(eq(siteAdPlacements.slotKey, placementKey), eq(siteAdPlacements.active, true)))
      .limit(1);
    if (
      !placement ||
      placement.blockedPathPrefixes.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix.replace(/\/$/, "")}/`),
      ) ||
      !placement.allowedPathPrefixes.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix.replace(/\/$/, "")}/`),
      )
    ) {
      return unavailable();
    }

    const now = new Date();
    const me = await getSessionUser();
    if (me) {
      const [stripe, paypal] = await Promise.all([
        db
          .select({ id: baSubscription.id })
          .from(baSubscription)
          .where(
            and(
              eq(baSubscription.referenceId, me.sessionUserId),
              inArray(baSubscription.status, ["active", "trialing"]),
              gt(baSubscription.periodEnd, now),
            ),
          )
          .limit(1),
        db
          .select({ id: sitePaypalSubscriptions.id })
          .from(sitePaypalSubscriptions)
          .where(
            and(
              eq(sitePaypalSubscriptions.userId, me.sessionUserId),
              eq(sitePaypalSubscriptions.status, "ACTIVE"),
              or(
                isNull(sitePaypalSubscriptions.nextBillingAt),
                gt(sitePaypalSubscriptions.nextBillingAt, now),
              ),
            ),
          )
          .limit(1),
      ]);
      if (stripe.length || paypal.length) return unavailable();
    }

    const [creative] = await db
      .select({
        id: siteAdCreatives.id,
        destinationUrl: siteAdCreatives.destinationUrl,
        campaignId: siteAdCampaigns.id,
      })
      .from(siteAdCreatives)
      .innerJoin(siteAdCampaigns, eq(siteAdCampaigns.id, siteAdCreatives.campaignId))
      .innerJoin(
        siteAdCampaignPlacements,
        and(
          eq(siteAdCampaignPlacements.campaignId, siteAdCampaigns.id),
          eq(siteAdCampaignPlacements.placementId, placement.id),
        ),
      )
      .innerJoin(siteAdvertisers, eq(siteAdvertisers.id, siteAdCampaigns.advertiserId))
      .where(
        and(
          eq(siteAdCreatives.id, creativeId),
          eq(siteAdCreatives.status, "approved"),
          eq(siteAdCampaigns.status, "active"),
          eq(siteAdvertisers.status, "approved"),
          inArray(siteAdCreatives.format, placement.formats),
          inArray(
            siteAdCreatives.locale,
            ["fr", "en", "ja"].filter(
              (locale) => locale === (request.nextUrl.searchParams.get("locale") ?? "fr"),
            ),
          ),
          or(isNull(siteAdCampaigns.startsAt), lte(siteAdCampaigns.startsAt, now)),
          or(isNull(siteAdCampaigns.endsAt), gte(siteAdCampaigns.endsAt, now)),
        ),
      )
      .limit(1);
    if (!creative) return unavailable();

    const day = now.toISOString().slice(0, 10);
    await db
      .insert(siteAdEventsDaily)
      .values({
        day,
        campaignId: creative.campaignId,
        placementId: placement.id,
        clicks: 1,
      })
      .onConflictDoUpdate({
        target: [
          siteAdEventsDaily.day,
          siteAdEventsDaily.campaignId,
          siteAdEventsDaily.placementId,
        ],
        set: {
          clicks: sql`${siteAdEventsDaily.clicks} + 1`,
          updatedAt: now,
        },
      });

    return NextResponse.redirect(creative.destinationUrl, 302);
  } catch {
    return unavailable();
  }
}
