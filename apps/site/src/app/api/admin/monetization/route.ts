import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  siteAdCampaigns,
  siteAdCampaignPlacements,
  siteAdCreatives,
  siteAdPlacements,
  siteAdEventsDaily,
  siteAdvertisers,
  siteBillingAudit,
} from "@/db/schema";
import { adminUserOrToken, isAdminOrToken } from "@/lib/admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(status: number, code: string) {
  return NextResponse.json(
    { error: code },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

function sameOrigin(request: NextRequest): boolean {
  return request.headers.get("origin") === new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  if (!(await isAdminOrToken(request))) return jsonError(403, "forbidden");
  const [advertisers, campaigns, creatives, placements, dailyEvents] = await Promise.all([
    db.select().from(siteAdvertisers).orderBy(desc(siteAdvertisers.createdAt)).limit(100),
    db
      .select({ campaign: siteAdCampaigns, advertiserName: siteAdvertisers.legalName })
      .from(siteAdCampaigns)
      .innerJoin(siteAdvertisers, eq(siteAdCampaigns.advertiserId, siteAdvertisers.id))
      .orderBy(desc(siteAdCampaigns.createdAt))
      .limit(100),
    db.select().from(siteAdCreatives).orderBy(desc(siteAdCreatives.createdAt)).limit(200),
    db.select().from(siteAdPlacements).orderBy(siteAdPlacements.slotKey).limit(100),
    db.select().from(siteAdEventsDaily).orderBy(desc(siteAdEventsDaily.day)).limit(500),
  ]);
  return NextResponse.json(
    { advertisers, campaigns, creatives, placements, dailyEvents },
    {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    },
  );
}

export async function POST(request: NextRequest) {
  const decision = await adminUserOrToken(request);
  if (!decision.allowed) return jsonError(403, "forbidden");
  if (!sameOrigin(request)) return jsonError(403, "invalid_origin");
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return jsonError(415, "json_required");
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.action !== "string") {
    return jsonError(400, "invalid_payload");
  }
  const actorUserId = decision.me?.user?.id ?? null;
  const actorKind = decision.token ? "system" : "admin";

  try {
    if (body.action === "placement.upsert") {
      const slotKey = typeof body.slotKey === "string" ? body.slotKey.trim() : "";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const formats: unknown[] = Array.isArray(body.formats) ? body.formats : [];
      const allowedPathPrefixes: unknown[] = Array.isArray(body.allowedPathPrefixes)
        ? body.allowedPathPrefixes
        : [];
      const blockedPathPrefixes: unknown[] = Array.isArray(body.blockedPathPrefixes)
        ? body.blockedPathPrefixes
        : ["/admin", "/studio", "/desktop", "/workshop"];
      const validPrefixes = (items: unknown[]) =>
        items.length <= 40 &&
        items.every(
          (item) =>
            typeof item === "string" &&
            item.startsWith("/") &&
            !item.startsWith("//") &&
            !item.includes("?") &&
            !item.includes("#") &&
            item.length <= 160,
        );
      const allowedPrefixes = allowedPathPrefixes.filter(
        (item): item is string => typeof item === "string",
      );
      const blockedPrefixes = blockedPathPrefixes.filter(
        (item): item is string => typeof item === "string",
      );
      const safeAllowed = allowedPrefixes.filter((prefix) =>
        prefix === "/"
          ? false
          : !["/admin", "/studio", "/desktop", "/workshop"].some(
              (blocked) => prefix === blocked || prefix.startsWith(`${blocked}/`),
            ),
      );
      if (
        !/^[a-z0-9][a-z0-9_-]{1,63}$/.test(slotKey) ||
        name.length < 2 ||
        name.length > 100 ||
        !formats.length ||
        formats.length > 3 ||
        !formats.every(
          (format) =>
            typeof format === "string" && ["banner", "native", "rectangle"].includes(format),
        ) ||
        new Set(formats).size !== formats.length ||
        !validPrefixes(allowedPathPrefixes) ||
        !validPrefixes(blockedPathPrefixes) ||
        !safeAllowed.length
      ) {
        return jsonError(400, "invalid_placement");
      }
      const [placement] = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(siteAdPlacements)
          .values({
            slotKey,
            name,
            formats: formats as string[],
            allowedPathPrefixes: safeAllowed,
            blockedPathPrefixes: blockedPrefixes,
            exemptVip: body.exemptVip !== false,
            active: false,
          })
          .onConflictDoUpdate({
            target: siteAdPlacements.slotKey,
            set: {
              name,
              formats: formats as string[],
              allowedPathPrefixes: safeAllowed,
              blockedPathPrefixes: blockedPrefixes,
              exemptVip: body.exemptVip !== false,
              active: false,
              updatedAt: new Date(),
            },
          })
          .returning();
        await tx.insert(siteBillingAudit).values({
          actorUserId,
          actorKind,
          action: "placement.upserted",
          entityType: "placement",
          entityId: row!.id,
        });
        return [row];
      });
      return NextResponse.json({ placement });
    }

    if (body.action === "advertiser.create") {
      const legalName = typeof body.legalName === "string" ? body.legalName.trim() : "";
      const contactEmail = typeof body.contactEmail === "string" ? body.contactEmail.trim() : "";
      if (
        legalName.length < 2 ||
        legalName.length > 200 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) ||
        contactEmail.length > 254
      ) {
        return jsonError(400, "invalid_advertiser");
      }
      const [created] = await db.transaction(async (tx) => {
        const [advertiser] = await tx
          .insert(siteAdvertisers)
          .values({
            legalName,
            contactEmail,
            contractReference:
              typeof body.contractReference === "string"
                ? body.contractReference.trim().slice(0, 160)
                : null,
            createdBy: actorUserId,
          })
          .returning();
        await tx.insert(siteBillingAudit).values({
          actorUserId,
          actorKind,
          action: "advertiser.created",
          entityType: "advertiser",
          entityId: advertiser!.id,
        });
        return [advertiser];
      });
      return NextResponse.json({ advertiser: created }, { status: 201 });
    }

    if (body.action === "campaign.create") {
      const advertiserId = typeof body.advertiserId === "string" ? body.advertiserId : "";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const budgetMinor = Number(body.budgetMinor);
      const dailyCapMinor = body.dailyCapMinor == null ? null : Number(body.dailyCapMinor);
      if (
        !advertiserId ||
        name.length < 2 ||
        name.length > 160 ||
        !Number.isSafeInteger(budgetMinor) ||
        budgetMinor <= 0 ||
        budgetMinor > 2_000_000_000 ||
        (dailyCapMinor !== null &&
          (!Number.isSafeInteger(dailyCapMinor) ||
            dailyCapMinor <= 0 ||
            dailyCapMinor > budgetMinor))
      ) {
        return jsonError(400, "invalid_campaign");
      }
      const [advertiser] = await db
        .select()
        .from(siteAdvertisers)
        .where(and(eq(siteAdvertisers.id, advertiserId), eq(siteAdvertisers.status, "approved")))
        .limit(1);
      if (!advertiser) return jsonError(409, "advertiser_not_approved");

      const rawPlacementIds: unknown[] = Array.isArray(body.placementIds) ? body.placementIds : [];
      const placementIds: string[] = [
        ...new Set(rawPlacementIds.filter((value): value is string => typeof value === "string")),
      ];
      if (!placementIds.length || placementIds.length > 20) {
        return jsonError(400, "campaign_placement_required");
      }
      const validPlacements = await db
        .select({ id: siteAdPlacements.id, formats: siteAdPlacements.formats })
        .from(siteAdPlacements)
        .where(
          and(
            inArray(siteAdPlacements.id, placementIds as [string, ...string[]]),
            eq(siteAdPlacements.active, true),
          ),
        );
      if (validPlacements.length !== placementIds.length) {
        return jsonError(400, "invalid_campaign_placement");
      }

      const startsAt = body.startsAt ? new Date(body.startsAt) : null;
      const endsAt = body.endsAt ? new Date(body.endsAt) : null;
      if (
        (startsAt && !Number.isFinite(startsAt.getTime())) ||
        (endsAt && !Number.isFinite(endsAt.getTime())) ||
        (startsAt && endsAt && endsAt <= startsAt)
      ) {
        return jsonError(400, "invalid_schedule");
      }
      const [created] = await db.transaction(async (tx) => {
        const [campaign] = await tx
          .insert(siteAdCampaigns)
          .values({
            advertiserId,
            name,
            budgetMinor,
            dailyCapMinor,
            startsAt,
            endsAt,
          })
          .returning();
        await tx.insert(siteAdCampaignPlacements).values(
          placementIds.map((placementId: string) => ({
            campaignId: campaign!.id,
            placementId,
          })),
        );
        await tx.insert(siteBillingAudit).values({
          actorUserId,
          actorKind,
          action: "campaign.created",
          entityType: "campaign",
          entityId: campaign!.id,
        });
        return [campaign];
      });
      return NextResponse.json({ campaign: created }, { status: 201 });
    }

    if (body.action === "creative.create") {
      const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
      const locale = body.locale;
      const format = body.format;
      const headline = typeof body.headline === "string" ? body.headline.trim() : "";
      const text = typeof body.body === "string" ? body.body.trim() : "";
      const destinationUrl =
        typeof body.destinationUrl === "string" ? body.destinationUrl.trim() : "";
      const imageUrl =
        typeof body.imageUrl === "string" && body.imageUrl.trim() ? body.imageUrl.trim() : null;
      let destination: URL;
      try {
        destination = new URL(destinationUrl);
      } catch {
        return jsonError(400, "invalid_destination_url");
      }
      if (
        destination.protocol !== "https:" ||
        !["fr", "en", "ja"].includes(locale) ||
        !["banner", "native", "rectangle"].includes(format) ||
        headline.length < 2 ||
        headline.length > 120 ||
        text.length > 400
      ) {
        return jsonError(400, "invalid_creative");
      }
      if (imageUrl) {
        try {
          if (new URL(imageUrl).protocol !== "https:") return jsonError(400, "invalid_image_url");
        } catch {
          return jsonError(400, "invalid_image_url");
        }
      }
      const [campaign] = await db
        .select()
        .from(siteAdCampaigns)
        .where(
          and(
            eq(siteAdCampaigns.id, campaignId),
            inArray(siteAdCampaigns.status, ["draft", "pending_review"]),
          ),
        )
        .limit(1);
      if (!campaign) return jsonError(409, "campaign_not_editable");
      const content = JSON.stringify({
        locale,
        format,
        headline,
        body: text,
        imageUrl,
        destinationUrl,
      });
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
      const contentSha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");

      const [created] = await db.transaction(async (tx) => {
        const [creative] = await tx
          .insert(siteAdCreatives)
          .values({
            campaignId,
            locale,
            format,
            headline,
            body: text || null,
            imageUrl,
            destinationUrl,
            contentSha256,
          })
          .returning();
        await tx
          .update(siteAdCampaigns)
          .set({ status: "pending_review", updatedAt: new Date() })
          .where(eq(siteAdCampaigns.id, campaignId));
        await tx.insert(siteBillingAudit).values({
          actorUserId,
          actorKind,
          action: "creative.submitted",
          entityType: "creative",
          entityId: creative!.id,
        });
        return [creative];
      });
      return NextResponse.json({ creative: created }, { status: 201 });
    }

    return jsonError(400, "unsupported_action");
  } catch {
    return jsonError(500, "monetization_write_failed");
  }
}

export async function PATCH(request: NextRequest) {
  const decision = await adminUserOrToken(request);
  if (!decision.allowed) return jsonError(403, "forbidden");
  if (!sameOrigin(request)) return jsonError(403, "invalid_origin");
  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.action !== "string" ||
    typeof body.id !== "string"
  ) {
    return jsonError(400, "invalid_payload");
  }

  const actorUserId = decision.me?.user?.id ?? null;
  const actorKind = decision.token ? "system" : "admin";
  try {
    if (body.action === "placement.update") {
      const active = body.active;
      const exemptVip = body.exemptVip;
      if (typeof active !== "boolean" && typeof exemptVip !== "boolean") {
        return jsonError(400, "invalid_placement_update");
      }
      if (active === false) {
        const [placement] = await db
          .select({ id: siteAdPlacements.id })
          .from(siteAdPlacements)
          .where(eq(siteAdPlacements.id, body.id))
          .limit(1);
        if (placement) {
          const [campaign] = await db
            .select({ id: siteAdCampaignPlacements.campaignId })
            .from(siteAdCampaignPlacements)
            .innerJoin(siteAdCampaigns, eq(siteAdCampaigns.id, siteAdCampaignPlacements.campaignId))
            .where(
              and(
                eq(siteAdCampaignPlacements.placementId, body.id),
                eq(siteAdCampaigns.status, "active"),
              ),
            )
            .limit(1);
          if (campaign) return jsonError(409, "pause_campaigns_before_disabling_placement");
        }
      }
      const [updated] = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(siteAdPlacements)
          .set({
            ...(typeof active === "boolean" ? { active } : {}),
            ...(typeof exemptVip === "boolean" ? { exemptVip } : {}),
            updatedAt: new Date(),
          })
          .where(eq(siteAdPlacements.id, body.id))
          .returning();
        if (row)
          await tx.insert(siteBillingAudit).values({
            actorUserId,
            actorKind,
            action: "placement.updated",
            entityType: "placement",
            entityId: row.id,
          });
        return [row];
      });
      return updated
        ? NextResponse.json({ placement: updated })
        : jsonError(404, "placement_not_found");
    }

    if (
      body.action === "advertiser.review" &&
      ["approved", "paused", "rejected"].includes(body.status)
    ) {
      const [updated] = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(siteAdvertisers)
          .set({ status: body.status, updatedAt: new Date() })
          .where(eq(siteAdvertisers.id, body.id))
          .returning();
        if (row)
          await tx.insert(siteBillingAudit).values({
            actorUserId,
            actorKind,
            action: `advertiser.${body.status}`,
            entityType: "advertiser",
            entityId: row.id,
          });
        return [row];
      });
      return updated
        ? NextResponse.json({ advertiser: updated })
        : jsonError(404, "advertiser_not_found");
    }

    if (
      body.action === "creative.review" &&
      ["approved", "paused", "rejected"].includes(body.status)
    ) {
      const [creative] = await db
        .select()
        .from(siteAdCreatives)
        .where(eq(siteAdCreatives.id, body.id))
        .limit(1);
      if (!creative) return jsonError(404, "creative_not_found");
      if (body.status === "approved") {
        const [campaign] = await db
          .select({ status: siteAdCampaigns.status, advertiserStatus: siteAdvertisers.status })
          .from(siteAdCampaigns)
          .innerJoin(siteAdvertisers, eq(siteAdCampaigns.advertiserId, siteAdvertisers.id))
          .where(eq(siteAdCampaigns.id, creative.campaignId))
          .limit(1);
        if (
          campaign?.advertiserStatus !== "approved" ||
          !["draft", "pending_review", "scheduled"].includes(campaign.status)
        ) {
          return jsonError(409, "campaign_not_approvable");
        }
      }
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(siteAdCreatives)
          .set({
            status: body.status,
            reviewedBy: actorUserId,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(siteAdCreatives.id, creative.id))
          .returning();
        await tx.insert(siteBillingAudit).values({
          actorUserId,
          actorKind,
          action: `creative.${body.status}`,
          entityType: "creative",
          entityId: creative.id,
        });
        return row;
      });
      return NextResponse.json({ creative: updated });
    }

    if (body.action === "campaign.approve" || body.action === "campaign.pause") {
      const [campaign] = await db
        .select({ campaign: siteAdCampaigns, advertiserStatus: siteAdvertisers.status })
        .from(siteAdCampaigns)
        .innerJoin(siteAdvertisers, eq(siteAdCampaigns.advertiserId, siteAdvertisers.id))
        .where(eq(siteAdCampaigns.id, body.id))
        .limit(1);
      if (!campaign) return jsonError(404, "campaign_not_found");
      const nextStatus = body.action === "campaign.pause" ? "paused" : "active";
      if (nextStatus === "active") {
        const placements = await db
          .select({ id: siteAdCampaignPlacements.placementId, formats: siteAdPlacements.formats })
          .from(siteAdCampaignPlacements)
          .innerJoin(
            siteAdPlacements,
            eq(siteAdPlacements.id, siteAdCampaignPlacements.placementId),
          )
          .where(
            and(
              eq(siteAdCampaignPlacements.campaignId, body.id),
              eq(siteAdPlacements.active, true),
            ),
          );
        const [creative] = await db
          .select({ id: siteAdCreatives.id, format: siteAdCreatives.format })
          .from(siteAdCreatives)
          .where(
            and(eq(siteAdCreatives.campaignId, body.id), eq(siteAdCreatives.status, "approved")),
          )
          .limit(1);
        if (
          campaign.advertiserStatus !== "approved" ||
          !creative ||
          !placements.length ||
          placements.some(({ formats }) => !formats.includes(creative.format))
        )
          return jsonError(409, "campaign_missing_approval");
      }
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(siteAdCampaigns)
          .set({
            status: nextStatus,
            approvedBy: nextStatus === "active" ? actorUserId : campaign.campaign.approvedBy,
            approvedAt: nextStatus === "active" ? new Date() : campaign.campaign.approvedAt,
            updatedAt: new Date(),
          })
          .where(eq(siteAdCampaigns.id, body.id))
          .returning();
        await tx.insert(siteBillingAudit).values({
          actorUserId,
          actorKind,
          action: `campaign.${nextStatus}`,
          entityType: "campaign",
          entityId: body.id,
        });
        return row;
      });
      return NextResponse.json({ campaign: updated });
    }
    return jsonError(400, "unsupported_action");
  } catch {
    return jsonError(500, "monetization_write_failed");
  }
}
