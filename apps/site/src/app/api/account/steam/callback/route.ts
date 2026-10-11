import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { sessionAuth } from "@/lib/host-auth";
import {
  clearSteamLinkCookieHeader,
  readCookie,
  readSteamLinkState,
  siteOriginForRequest,
  steamLinkCookieName,
  steamLinkCookieHeader,
  verifySteamOpenIdCallback,
} from "@/lib/steam-openid-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function finish(origin: string, result: "linked" | "error", cookieName: string) {
  const response = NextResponse.redirect(new URL(`/settings?steam=${result}`, origin), 303);
  response.headers.set("Set-Cookie", clearSteamLinkCookieHeader(cookieName, origin));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  const origin = siteOriginForRequest(request);
  if (!origin) return new Response("Invalid host", { status: 400 });
  const cookieName = steamLinkCookieName(origin);
  const params = new URL(request.url).searchParams;
  const state = readSteamLinkState(readCookie(request, cookieName));
  const session = await sessionAuth.api.getSession({ headers: request.headers });
  if (!state || state.origin !== origin || !session?.user?.id || session.user.id !== state.userId ||
      params.getAll("state").length !== 1 || params.get("state") !== state.state ||
      params.getAll("openid.mode").length !== 1 || params.get("openid.mode") !== "id_res") {
    return finish(origin, "error", cookieName);
  }

  const callback = new URL("/api/account/steam/callback", origin);
  callback.searchParams.set("state", state.state);
  const steamId = await verifySteamOpenIdCallback(params, callback.toString());
  if (!steamId) return finish(origin, "error", cookieName);

  const [existing] = await db.select().from(schema.baAccount).where(and(
    eq(schema.baAccount.userId, state.userId),
    eq(schema.baAccount.providerId, "steam"),
  )).limit(1);
  if (existing && existing.accountId !== steamId) return finish(origin, "error", cookieName);

  try {
    if (existing) {
      await db.update(schema.baAccount).set({ updatedAt: new Date() }).where(eq(schema.baAccount.id, existing.id));
    } else {
      await db.insert(schema.baAccount).values({
        id: randomUUID(),
        accountId: steamId,
        providerId: "steam",
        issuer: "https://steamcommunity.com/openid",
        userId: state.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  } catch {
    // A concurrent link may have claimed this Steam identity; never reassign it.
    return finish(origin, "error", cookieName);
  }
  return finish(origin, "linked", cookieName);
}
