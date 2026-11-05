// SPDX-License-Identifier: Apache-2.0
import { wikimediaUpstream } from "@/lib/first-party-media";
import { fetchCachedImage, imageResponse } from "@/lib/upstream-image-cache";

export const dynamic = "force-dynamic";

/**
 * Images Wikimedia (portrait de Toriyama, portraits du staff) servies depuis l'origine
 * du site : `upload.wikimedia.org` pose le cookie tiers `WMF-Uniq`. Liste blanche stricte :
 * deux hôtes Wikimedia, un chemin de fichier image, jamais d'autre destination.
 */
export async function GET(request: Request): Promise<Response> {
  // Chemin brut (encodé) : les paramètres dynamiques sont décodés, or l'URL Wikimedia ne l'est pas.
  const raw = new URL(request.url).pathname.replace(/^\/api\/ext-image\//, "");
  const upstream = wikimediaUpstream(raw.split("/"));
  if (!upstream) return new Response(null, { status: 404 });
  const image = await fetchCachedImage(upstream, {
    maxBytes: 4 * 1024 * 1024,
    ttlMs: 24 * 60 * 60 * 1000,
    userAgent: "DragonBallFR/1.0 (https://dragonballfr.com; contact@aphrody.com)",
  });
  return imageResponse(image, 604_800);
}
