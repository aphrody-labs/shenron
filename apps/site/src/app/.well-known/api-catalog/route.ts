// SPDX-License-Identifier: Apache-2.0
/**
 * GET /.well-known/api-catalog (RFC 9727): linkset (RFC 9264) listing the public API, its
 * OpenAPI description and the human-readable guide. The route is more specific than the
 * `/.well-known/[...path]` Better Auth relay, so it answers first.
 */
import { SITE_URL } from "@/lib/config";

export const runtime = "nodejs";

const PROFILE = "https://www.rfc-editor.org/info/rfc9727";

export function GET(): Response {
  const body = {
    linkset: [
      {
        anchor: `${SITE_URL}/api`,
        "service-desc": [
          { href: `${SITE_URL}/api/public/openapi.json`, type: "application/openapi+json" },
        ],
        "service-doc": [{ href: `${SITE_URL}/llms.txt`, type: "text/plain" }],
      },
    ],
  };
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": `application/linkset+json; profile="${PROFILE}"`,
      "Cache-Control": "public, max-age=600, s-maxage=3600",
    },
  });
}
