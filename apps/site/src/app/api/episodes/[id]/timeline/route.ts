// SPDX-License-Identifier: Apache-2.0
import { dbUniverse } from "@/lib/db-universe";
import { episodeTimeline } from "@/lib/episode-video-generation";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  if (!/^(875|876)$/.test(id)) return Response.json({ error: "source_not_found" }, { status: 404 });
  try {
    const episode = await dbUniverse.episode(Number(id));
    return episodeTimeline(request, Number(id), episode?.players ?? null);
  } catch {
    return Response.json(
      { error: "generation_failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
