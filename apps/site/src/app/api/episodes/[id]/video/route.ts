// SPDX-License-Identifier: Apache-2.0
import { dbUniverse } from "@/lib/db-universe";
import { streamEpisodeVideo } from "@/lib/episode-video-proxy";
import { episodeMp4Source } from "@/lib/episode-playback";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id)) return new Response(null, { status: 404 });
  const episode = await dbUniverse.episode(Number(id));
  return streamEpisodeVideo(request, episode ? (episodeMp4Source(episode)?.href ?? null) : null);
}

export const HEAD = GET;
