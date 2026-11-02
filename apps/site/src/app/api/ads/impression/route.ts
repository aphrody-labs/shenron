import { and, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import {
  baSubscription,
  siteAdCampaignPlacements,
  siteAdCampaigns,
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

function noAd() {
  return NextResponse.json({ ad: null }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  const placementKey = request.nextUrl.searchParams.get("placement") ?? "";
  const pathname = request.nextUrl.searchParams.get("path") ?? "";
  const locale = request.nextUrl.searchParams.get("locale") ?? "fr";
  const campaignId = request.nextUrl.searchParams.get("campaign") ?? "";
  const creativeId = request.nextUrl.searchParams.get("creative") ?? "";
  if (
    !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(placementKey) ||
    !/^[a-z0-9_-]{3,80}$/.test(campaignId) ||
    !/^[a-z0-9_-]{3,80}$/.test(creativeId) ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    !["fr", "en", "ja"].includes(locale) ||
    !allowsPublicAds(pathname)
  ) {
    return noAd();
  }

  try {
    const [me, [placement]] = await Promise.all([
      getSessionUser(),
      db
        .select()
        .from(siteAdPlacements)
        .where(and(eq(siteAdPlacements.slotKey, placementKey), eq(siteAdPlacements.active, true)))
        .limit(1),
    ]);
    if (
      !placement ||
      placement.blockedPathPrefixes.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix.replace(/\/$/, "")}/`),
      ) ||
      !placement.allowedPathPrefixes.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix.replace(/\/$/, "")}/`),
      )
    ) {
      return noAd();
    }

    const now = new Date();
    if (me && placement.exemptVip) {
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
      if (stripe.length || paypal.length) return noAd();
    }

    const [ad] = await db
      .select({
        campaignId: siteAdCampaigns.id,
        creativeId: siteAdCreatives.id,
        format: siteAdCreatives.format,
        locale: siteAdCreatives.locale,
        headline: siteAdCreatives.headline,
        body: siteAdCreatives.body,
        imageUrl: siteAdCreatives.imageUrl,
        destinationUrl: siteAdCreatives.destinationUrl,
      })
      .from(siteAdCampaigns)
      .innerJoin(
        siteAdCampaignPlacements,
        and(
          eq(siteAdCampaignPlacements.campaignId, siteAdCampaigns.id),
          eq(siteAdCampaignPlacements.placementId, placement.id),
        ),
      )
      .innerJoin(siteAdvertisers, eq(siteAdvertisers.id, siteAdCampaigns.advertiserId))
      .innerJoin(siteAdCreatives, eq(siteAdCreatives.campaignId, siteAdCampaigns.id))
      .where(
        and(
          eq(siteAdCampaigns.id, campaignId),
          eq(siteAdCreatives.id, creativeId),
          eq(siteAdCampaigns.status, "active"),
          eq(siteAdvertisers.status, "approved"),
          eq(siteAdCreatives.status, "approved"),
          eq(siteAdCreatives.locale, locale),
          inArray(siteAdCreatives.format, placement.formats),
          or(isNull(siteAdCampaigns.startsAt), lte(siteAdCampaigns.startsAt, now)),
          or(isNull(siteAdCampaigns.endsAt), gte(siteAdCampaigns.endsAt, now)),
        ),
      )
      .limit(1);
    if (!ad) return noAd();

    const day = now.toISOString().slice(0, 10);
    await db
      .insert(siteAdEventsDaily)
      .values({ day, campaignId: ad.campaignId, placementId: placement.id, impressions: 1 })
      .onConflictDoUpdate({
        target: [
          siteAdEventsDaily.day,
          siteAdEventsDaily.campaignId,
          siteAdEventsDaily.placementId,
        ],
        set: { impressions: sql`${siteAdEventsDaily.impressions} + 1`, updatedAt: now },
      });

    return NextResponse.json(
      {
        ad: {
          creativeId: ad.creativeId,
          format: ad.format,
          locale: ad.locale,
          headline: ad.headline,
          body: ad.body,
          imageUrl: ad.imageUrl,
          destinationUrl: `/api/ads/click?creative=${encodeURIComponent(ad.creativeId)}&placement=${encodeURIComponent(placementKey)}&path=${encodeURIComponent(pathname)}&locale=${encodeURIComponent(locale)}`,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return noAd();
  }
}
