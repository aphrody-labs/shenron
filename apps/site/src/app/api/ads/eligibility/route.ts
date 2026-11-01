import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { baSubscription, sitePaypalSubscriptions } from "@/db/schema";
import { db } from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie, Authorization",
};

export async function GET() {
  try {
    const me = await getSessionUser();
    if (!me) return NextResponse.json({ adsAllowed: true }, { headers: PRIVATE_HEADERS });

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
    return NextResponse.json(
      { adsAllowed: stripe.length === 0 && paypal.length === 0 },
      { headers: PRIVATE_HEADERS },
    );
  } catch {
    // Fail closed if entitlement data is unavailable: never show ads to a possible paid member.
    return NextResponse.json({ adsAllowed: false }, { headers: PRIVATE_HEADERS });
  }
}
