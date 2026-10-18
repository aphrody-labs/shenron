import { dbxv2SiteGate } from "@/lib/dbxv2-gate";
import { getDbxv2Service } from "@/lib/dbxv2";
import { isCurrentUserAdmin } from "@/lib/session";

/**
 * Same-origin relay of the signed DBXV2 resources (textures, sounds, videos, models) of the private
 * explorer. A browser blocks the cross-port loopback proxy (CORP `NotSameSite`, no CORS for
 * `fetch`), so the page loads them here. Closed (404, never 401/403) without the site gate or an
 * admin session; the proxy still verifies the HMAC signature and expiry, and the token never
 * leaves the server. `Range` is forwarded (audio/video seeking).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function relay(request: Request, context: { params: Promise<{ path: string[] }> }) {
  if (!dbxv2SiteGate().enabled || !(await isCurrentUserAdmin()))
    return new Response(null, { status: 404 });
  let service;
  try {
    service = await getDbxv2Service();
  } catch {
    return new Response(null, { status: 404 });
  }
  const { path } = await context.params;
  return service.relay(path, new URL(request.url).search, request);
}

export { relay as GET, relay as HEAD };
