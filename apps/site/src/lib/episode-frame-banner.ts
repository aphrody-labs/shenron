// SPDX-License-Identifier: Apache-2.0
import type { EpisodeFrame } from "@aphrody/shenron-db/bot-schema";

export type BannerFrameScope = { series?: string; episodeStart?: number; episodeEnd?: number };
type BannerEpisode = {
  series: string;
  number_in_series: number | null;
  frames: EpisodeFrame[] | null;
};
type ImageMetadata = { width: number; height: number; format: string };
const CDN_ORIGIN = "https://cdn.dragonballfr.com";
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_PROBES = 4;

/** Restrict public frame probes to the owned CDN and episode-frame namespaces. */
export function canonicalFrameUrl(value: string | null): string | null {
  if (!value) return null;
  const path = value.replace(/^\.\//, "");
  const raw = path.startsWith("assets/ext/db_episodes_frames/") ? `${CDN_ORIGIN}/${path}` : value;
  if (!URL.canParse(raw)) return null;
  const url = new URL(raw);
  if (
    url.origin !== CDN_ORIGIN ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/(?:media\/episodes\/\d+\/|assets\/ext\/db_episodes_frames\/)[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp)$/.test(
      url.pathname,
    ) ||
    decodeURIComponent(url.pathname)
      .split("/")
      .some((segment) => segment === ".." || segment === ".")
  )
    return null;
  return url.href;
}

/** Dimensions come from the fetched artifact, never from a presumed HD filename. */
export async function measurePublicFrame(url: string): Promise<ImageMetadata | null> {
  if (canonicalFrameUrl(url) !== url) return null;
  const Image = Reflect.get(Bun, "Image") as
    | (new (bytes: Uint8Array) => { metadata(): Promise<ImageMetadata> })
    | undefined;
  if (!Image) return null;
  try {
    const response = await fetch(url, {
      redirect: "error",
      credentials: "omit",
      signal: AbortSignal.timeout(2500),
    });
    if (
      response.status !== 200 ||
      !response.body ||
      !/^image\/(?:png|jpeg|webp)(?:;|$)/i.test(response.headers.get("content-type") ?? "")
    ) {
      await response.body?.cancel();
      return null;
    }
    const declared = response.headers.get("content-length");
    if (
      declared !== null &&
      (!Number.isSafeInteger(Number(declared)) ||
        Number(declared) <= 0 ||
        Number(declared) > MAX_BYTES)
    ) {
      await response.body.cancel();
      return null;
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        length += next.value.length;
        if (length > MAX_BYTES || chunks.length >= 4096) {
          await reader.cancel();
          return null;
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    if (
      !length ||
      (declared !== null && !response.headers.get("content-encoding") && length !== Number(declared))
    )
      return null;
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return await new Image(bytes).metadata();
  } catch {
    return null;
  }
}

/** Rows must come from the canonical visible-episode reader. No unrelated series fallback. */
export async function selectEpisodeFrameBanner(
  episodes: readonly BannerEpisode[],
  scope: BannerFrameScope = {},
  measure: (url: string) => Promise<ImageMetadata | null> = measurePublicFrame,
): Promise<string> {
  const candidates = episodes
    .slice(0, 32)
    .filter(
      (episode) =>
        (!scope.series || episode.series === scope.series) &&
        (scope.episodeStart === undefined ||
          (episode.number_in_series !== null && episode.number_in_series >= scope.episodeStart)) &&
        (scope.episodeEnd === undefined ||
          (episode.number_in_series !== null && episode.number_in_series <= scope.episodeEnd)),
    )
    .flatMap((episode) => (Array.isArray(episode.frames) ? episode.frames.slice(0, 12) : []))
    .filter(
      (frame) =>
        (frame.source === "bun-video" || frame.source === "ffmpeg") &&
        Boolean(frame.sourceId) &&
        frame.timecodeSec !== null &&
        Number.isFinite(frame.timecodeSec) &&
        frame.timecodeSec >= 0,
    )
    .toSorted((a, b) => Number(b.isNotable) - Number(a.isNotable) || a.sortOrder - b.sortOrder);
  const urls = [
    ...new Set(
      candidates
        .map((frame) => canonicalFrameUrl(frame.imagePath))
        .filter((url): url is string => Boolean(url)),
    ),
  ];
  for (const url of urls.slice(0, MAX_PROBES)) {
    const metadata = await measure(url).catch(() => null);
    if (
      metadata &&
      Number.isFinite(metadata.width) &&
      Number.isFinite(metadata.height) &&
      metadata.width >= 1280 &&
      metadata.height >= 720 &&
      ["png", "jpeg", "webp"].includes(metadata.format)
    )
      return url;
  }
  return "";
}
