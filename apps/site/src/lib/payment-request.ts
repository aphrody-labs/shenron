// SPDX-License-Identifier: Apache-2.0
import { siteTrustedOrigins } from "@aphrody/shenron-auth/origins";
import { SITE_URL } from "@/lib/config";

/**
 * Origins allowed to start a payment. Behind the gateway, Next sees its own listening
 * address in `request.url` (`http://127.0.0.1:…`), never the public origin the browser
 * sends in `Origin`: the public site origin and the trusted site origins are accepted too.
 */
export function paymentOrigins(
  request: Request,
  production = process.env.NODE_ENV === "production",
): Set<string> {
  const origins = new Set(siteTrustedOrigins({ production }));
  origins.add(new URL(request.url).origin);
  try {
    origins.add(new URL(SITE_URL).origin);
  } catch {
    // An invalid configured URL only removes that candidate.
  }
  return origins;
}

/** Require browser payment mutations to originate from this site's JSON client. */
export function isSameOriginPaymentRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  const contentType = request.headers.get("content-type") ?? "";
  return (
    origin !== null &&
    paymentOrigins(request).has(origin) &&
    contentType.toLowerCase().startsWith("application/json")
  );
}

/** Explicit "payment provider not configured" answer: never a bare 500. */
export function paymentProviderUnavailable(provider: "stripe" | "paypal"): Response {
  return Response.json(
    {
      error: "provider_unavailable",
      message: "Paiement temporairement indisponible.",
      provider,
    },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}
