// SPDX-License-Identifier: Apache-2.0
import { streamEpisodeVideo } from "@/lib/episode-video-proxy";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return streamEpisodeVideo(request, new URL(request.url).searchParams.get("source"));
}
export const HEAD = GET;
