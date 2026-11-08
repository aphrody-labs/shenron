import { sessionAuth } from "@/lib/host-auth";
import {
  createSteamLinkFlow,
  siteOriginForRequest,
  steamLinkCookieHeader,
} from "@/lib/steam-openid-link";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = siteOriginForRequest(request);
  if (!origin) return new Response("Invalid host", { status: 400 });
  const session = await sessionAuth.api.getSession({ headers: request.headers });
  if (!session?.user?.id)
    return Response.redirect(new URL("/signin?callbackURL=%2Fsettings", origin));

  const flow = createSteamLinkFlow(session.user.id, origin);
  const response = Response.redirect(flow.authorizationUrl, 303);
  response.headers.set(
    "Set-Cookie",
    steamLinkCookieHeader(flow.cookieName, flow.cookieValue, flow.cookieOptions),
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
