#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { createEpisodeTimelineHandler } from "../../apps/site/src/lib/episode-video-generation";
import { isShenronEpisodeVideoURL } from "../../apps/site/src/lib/episode-video-source";

export const episodeVideoSource = Object.freeze({
  id: 877,
  sha256: "d34399a0b71922d663667cdb2075659ae0b259bf56ecda9fef64ca1578173114",
  url: "https://cdn.dragonballfr.com/media/episodes/877/d34399a0b71922d663667cdb2075659ae0b259bf56ecda9fef64ca1578173114/source.mp4",
  file: "/home/ubuntu/reports/shenron/beerus-episode3/intake/mugiwara-20261025/source.mp4",
});

type TimelineDependencies = Omit<
  NonNullable<Parameters<typeof createEpisodeTimelineHandler>[0]>,
  "source"
>;

function videoAvailable(): boolean {
  const runtime = Bun as typeof Bun & { Video?: { available: boolean } };
  return runtime.Video?.available === true;
}

export async function verifyEpisodeVideoFile(path: string, expectedHash: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("invalid_source_hash");
  const file = Bun.file(path);
  if (!(await file.exists()) || file.size < 1 || file.size > 1024 ** 3)
    throw new Error("source_unavailable");
  const hash = new Bun.CryptoHasher("sha256");
  let bytes = 0;
  for await (const chunk of file.stream()) {
    bytes += chunk.byteLength;
    if (bytes > 1024 ** 3) throw new Error("source_too_large");
    hash.update(chunk);
  }
  if (hash.digest("hex") !== expectedHash) throw new Error("source_integrity_failed");
  return { bytes, sha256: expectedHash };
}

/** The caller must verify the fixed file before exposing this handler. */
export function createEpisodeVideoServiceHandler(overrides: TimelineDependencies = {}) {
  const available = overrides.available ?? videoAvailable;
  const timeline = createEpisodeTimelineHandler({
    ...overrides,
    source: async (url, id, hash) => {
      if (
        id !== episodeVideoSource.id ||
        hash !== episodeVideoSource.sha256 ||
        url.href !== episodeVideoSource.url ||
        !isShenronEpisodeVideoURL(url)
      )
        throw new Error("invalid_source");
      return episodeVideoSource.file;
    },
  });
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method !== "GET")
      return Response.json(
        { error: "method_not_allowed" },
        { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } },
      );
    if (url.pathname === "/healthz" && !url.search) {
      const ready = available();
      return Response.json(
        {
          ok: ready,
          episodeId: episodeVideoSource.id,
          sourceHash: episodeVideoSource.sha256,
          videoAvailable: ready,
        },
        { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (url.pathname !== `/api/episodes/${episodeVideoSource.id}/timeline`)
      return Response.json(
        { error: "source_not_found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    return timeline(request, episodeVideoSource.id, [{ embedUrl: episodeVideoSource.url }]);
  };
}

export async function verifyEpisodeVideoServiceSource() {
  if (!isShenronEpisodeVideoURL(new URL(episodeVideoSource.url)))
    throw new Error("source_not_approved");
  if (!videoAvailable()) throw new Error("video_unavailable");
  return verifyEpisodeVideoFile(episodeVideoSource.file, episodeVideoSource.sha256);
}

export async function serveEpisodeVideo(port: number) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("invalid_port");
  await verifyEpisodeVideoServiceSource();
  return Bun.serve({
    hostname: "127.0.0.1",
    port,
    idleTimeout: 30,
    fetch: createEpisodeVideoServiceHandler(),
  });
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  if (args.length === 1 && args[0] === "--check") {
    console.log(JSON.stringify({ ok: true, ...(await verifyEpisodeVideoServiceSource()) }));
  } else if (args.length === 2 && args[0] === "--port" && /^(0|[1-9]\d{0,4})$/.test(args[1]!)) {
    const server = await serveEpisodeVideo(Number(args[1]));
    console.log(
      JSON.stringify({
        listening: server.url.href,
        episodeId: episodeVideoSource.id,
        sourceHash: episodeVideoSource.sha256,
        publicRouteInstalled: false,
      }),
    );
  } else {
    throw new Error("Usage: bun scripts/ops/episode-video-service.ts --check | --port <0..65535>");
  }
}
