// SPDX-License-Identifier: Apache-2.0
import { dbUniverse } from "@/lib/db-universe";
import { streamEpisodeVideo } from "@/lib/episode-video-proxy";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!/^[1-9]\d{0,9}$/.test(id)) return new Response(null, { status: 404 });
  const source = await dbUniverse.episodeStream(Number(id));
  return streamEpisodeVideo(request, source?.url ?? null);
}

export const HEAD = GET;
