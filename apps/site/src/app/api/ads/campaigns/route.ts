import { and, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  baSubscription,
  siteAdCampaigns,
  siteAdCampaignPlacements,
  siteAdCreatives,
  siteAdPlacements,
  sitePaypalSubscriptions,
  siteAdvertisers,
} from "@/db/schema";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { allowsPublicAds } from "@/lib/public-ads";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
};

function emptyResponse() {
  return Response.json({ ads: [] }, { headers: PRIVATE_HEADERS });
}

export async function GET(request: Request) {
  const placement = new URL(request.url).searchParams.get("placement")?.trim() ?? "";
  const pathname = new URL(request.url).searchParams.get("path") ?? "";
  const locale = new URL(request.url).searchParams.get("locale") ?? "fr";
  if (
    !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(placement) ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    !["fr", "en", "ja"].includes(locale) ||
    !allowsPublicAds(pathname)
  ) {
    return emptyResponse();
  }

  try {
    const [me, [slot]] = await Promise.all([
      getSessionUser(),
      db
        .select()
        .from(siteAdPlacements)
        .where(and(eq(siteAdPlacements.slotKey, placement), eq(siteAdPlacements.active, true)))
        .limit(1),
    ]);
    if (
      !allowsPublicAds(pathname) ||
      !slot ||
      !slot.formats.length ||
      slot.blockedPathPrefixes.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix.replace(/\/$/, "")}/`),
      ) ||
      !slot.allowedPathPrefixes.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix.replace(/\/$/, "")}/`),
      )
    ) {
      return emptyResponse();
    }

    // The linked account is never given direct campaign inventory. Reuse the
    // same verified Stripe/PayPal entitlement result as AdSense, and fail closed.
    if (me && slot.exemptVip) {
      const now = new Date();
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
      if (stripe.length || paypal.length) return emptyResponse();
    }

    const now = new Date();
    const ads = await db
      .select({
        campaignId: siteAdCampaigns.id,
        creativeId: siteAdCreatives.id,
        format: siteAdCreatives.format,
        locale: siteAdCreatives.locale,
        headline: siteAdCreatives.headline,
        body: siteAdCreatives.body,
        imageUrl: siteAdCreatives.imageUrl,
      })
      .from(siteAdCampaigns)
      .innerJoin(
        siteAdCampaignPlacements,
        and(
          eq(siteAdCampaignPlacements.campaignId, siteAdCampaigns.id),
          eq(siteAdCampaignPlacements.placementId, slot.id),
        ),
      )
      .innerJoin(siteAdvertisers, eq(siteAdvertisers.id, siteAdCampaigns.advertiserId))
      .innerJoin(siteAdCreatives, eq(siteAdCreatives.campaignId, siteAdCampaigns.id))
      .where(
        and(
          eq(siteAdCampaigns.status, "active"),
          eq(siteAdvertisers.status, "approved"),
          eq(siteAdCreatives.status, "approved"),
          eq(siteAdCreatives.locale, locale),
          inArray(siteAdCreatives.format, slot.formats),
          or(isNull(siteAdCampaigns.startsAt), lte(siteAdCampaigns.startsAt, now)),
          or(isNull(siteAdCampaigns.endsAt), gte(siteAdCampaigns.endsAt, now)),
        ),
      )
      .orderBy(sql`random()`)
      .limit(20);

    return Response.json(
      {
        ads: ads.map((ad) => ({
          campaignId: ad.campaignId,
          creativeId: ad.creativeId,
          format: ad.format,
          locale: ad.locale,
          headline: ad.headline,
          body: ad.body,
          imageUrl: ad.imageUrl,
        })),
      },
      { headers: PRIVATE_HEADERS },
    );
  } catch {
    return emptyResponse();
  }
}
