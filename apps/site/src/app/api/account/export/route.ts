import { readAccountData } from "@/lib/account-data";
import { getShenronUserResult } from "@/lib/shenron";
import { getSessionUser } from "@/lib/session";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getSessionUser();
  if (!me?.user) return Response.json({ error: "Connexion requise" }, { status: 401 });
  const [siteData, botProfile, steam] = await Promise.all([
    readAccountData({
      authUserId: me.sessionUserId,
      appUserId: me.user.id,
      discordId: me.discordId,
    }),
    getShenronUserResult(me.discordId),
    db
      .select({ steamId: schema.baAccount.accountId })
      .from(schema.baAccount)
      .where(
        and(
          eq(schema.baAccount.userId, me.sessionUserId),
          eq(schema.baAccount.providerId, "steam"),
        ),
      )
      .limit(1),
  ]);
  return Response.json(
    {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      account: {
        id: me.user.id,
        discordId: me.discordId,
        username: me.user.username,
        avatar: me.user.avatar,
        createdAt: me.user.createdAt,
        steamId: steam[0]?.steamId ?? null,
      },
      ...siteData,
      botProfile: botProfile.status === "ok" ? botProfile.user : null,
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="dbfr-account-${me.discordId}.json"`,
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
