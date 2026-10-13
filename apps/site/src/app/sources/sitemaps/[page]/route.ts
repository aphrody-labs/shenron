// SPDX-License-Identifier: Apache-2.0
import { sourceSitemapChunkResponse } from "@/lib/source-sitemaps";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ page: string }> }) {
  try {
    return await sourceSitemapChunkResponse((await params).page);
  } catch {
    return new Response(null, {
      status: 503,
      headers: { "Cache-Control": "no-store", "Retry-After": "60" },
    });
  }
}
