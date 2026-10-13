// SPDX-License-Identifier: Apache-2.0
import { sourceSitemapIndexResponse } from "@/lib/source-sitemaps";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return await sourceSitemapIndexResponse();
  } catch {
    return new Response(null, {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "60" },
    });
  }
}
