// SPDX-License-Identifier: Apache-2.0
import { streamEpisodeVideo } from "@/lib/episode-video-proxy";
import { episodeMp4Source } from "@/lib/episode-playback";
import { lookupPublicEpisode } from "@/lib/episode-api-read";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id)) return new Response(null, { status: 404 });
  const lookup = await lookupPublicEpisode(Number(id));
  if (lookup.status === "unavailable") {
    return Response.json(
      { error: "episode_temporarily_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "30" } },
    );
  }
  return streamEpisodeVideo(
    request,
    lookup.status === "found" ? (episodeMp4Source(lookup.episode)?.href ?? null) : null,
  );
}

export const HEAD = GET;
