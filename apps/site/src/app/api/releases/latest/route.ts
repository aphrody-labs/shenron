// SPDX-License-Identifier: Apache-2.0
/** GET /api/releases/latest: public manifest of the latest release (`@/lib/releases`). */
import { assetUrl, latestRelease } from "@/lib/releases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const manifest = await latestRelease();
  if (!manifest) return Response.json({ error: "No release published." }, { status: 404 });
  const origin = new URL(request.url).origin;
  return Response.json(
    {
      ...manifest,
      assets: manifest.assets.map((a) => Object.assign({}, a, { url: origin + assetUrl(a.name) })),
    },
    { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
