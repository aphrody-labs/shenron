import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { SITE_URL } from "@/lib/config";
import { db } from "@/lib/db";
import { baUser } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const user = await getCurrentUser();
  if (!user?.sessionUserId || user.sessionUserId === "token-admin") {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }
  const [authUser] = await db
    .select({ customerId: baUser.stripeCustomerId })
    .from(baUser)
    .where(eq(baUser.id, user.sessionUserId))
    .limit(1);
  if (!authUser?.customerId) {
    return NextResponse.json({ error: "Aucun profil de facturation Stripe" }, { status: 404 });
  }

  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: authUser.customerId,
      return_url: `${SITE_URL}/account/billing`,
    });
    return NextResponse.json({ url: portal.url });
  } catch {
    return NextResponse.json({ error: "Portail de facturation indisponible" }, { status: 503 });
  }
}
