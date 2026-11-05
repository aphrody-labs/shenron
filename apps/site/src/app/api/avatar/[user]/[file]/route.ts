// SPDX-License-Identifier: Apache-2.0
import { discordAvatarUpstream } from "@/lib/first-party-media";
import { fetchCachedImage, imageResponse } from "@/lib/upstream-image-cache";

export const dynamic = "force-dynamic";

/**
 * Avatar Discord servi depuis l'origine du site : `cdn.discordapp.com` pose un cookie
 * tiers `__cf_bm` sur chaque avatar affiché. Seuls les identifiants Discord valides
 * (snowflake + hash hexadécimal) et trois tailles sont acceptés : ce n'est pas un proxy ouvert.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ user: string; file: string }> },
): Promise<Response> {
  const { user, file } = await params;
  const upstream = discordAvatarUpstream(user, file, new URL(request.url).searchParams.get("s"));
  if (!upstream) return new Response(null, { status: 404 });
  const image = await fetchCachedImage(upstream, {
    maxBytes: 512 * 1024,
    ttlMs: 6 * 60 * 60 * 1000,
    userAgent: "DragonBallFR/1.0 (https://dragonballfr.com)",
  });
  return imageResponse(image, 604_800);
}
