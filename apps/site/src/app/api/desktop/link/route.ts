// SPDX-License-Identifier: Apache-2.0
/**
 * GET /api/desktop/link?state=&port= — sign-in of Shenron Studio with Discord (loopback
 * redirect). Without a session: the sign-in page, back here afterwards. With one: a redirect
 * to the local server of the app (127.0.0.1 only) carrying a two-minute signed code.
 */
import { NextResponse } from "next/server";
import {
  DESKTOP_LINK,
  desktopCallbackUrl,
  desktopLinkPort,
  homeLanguage,
} from "@shenron/db/agent-homes/types";
import { env } from "@/lib/env";
import { signDesktopLink } from "@/lib/desktop-link";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const port = desktopLinkPort(url.searchParams.get("port"));
  if (!DESKTOP_LINK.state.test(state) || port === null)
    return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: noStore });
  const me = await getSessionUser();
  if (!me?.discordId) {
    const back = `${DESKTOP_LINK.sitePath}?state=${state}&port=${port}`;
    // Relative Location: behind nginx, `request.url` carries the internal origin
    // (`https://localhost:5011`), not the public host (same fix as /wiki/random).
    return new Response(null, {
      status: 302,
      headers: { ...noStore, location: `/signin?callbackURL=${encodeURIComponent(back)}` },
    });
  }
  const locale = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(request.headers.get("cookie") ?? "")?.[1];
  const code = signDesktopLink(
    env.BETTER_AUTH_SECRET,
    {
      discordId: me.discordId,
      name: me.user?.username ?? null,
      avatarUrl: me.user?.avatar ?? null,
      language: homeLanguage(locale),
    },
    state,
  );
  return NextResponse.redirect(desktopCallbackUrl(port, state, code), {
    status: 302,
    headers: noStore,
  });
}
