import { STATIC_PREFIX, SITE_URL } from "@/lib/config";
import { pwaLocale } from "@/lib/pwa";
import { serviceWorkerSource } from "@/lib/pwa-worker";

export function GET(request: Request) {
  const locale = pwaLocale(new URL(request.url).searchParams.get("lang"));
  const staticOrigin = new URL(STATIC_PREFIX || SITE_URL, SITE_URL).origin;
  return new Response(serviceWorkerSource(locale, staticOrigin), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Service-Worker-Allowed": "/",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
