// SPDX-License-Identifier: Apache-2.0
/** Shenron's intake boundary; Bun Video remains the owner of decoding and encoding. */
export interface EpisodeVideoDelivery {
  producer: "bun-video";
  episodeId: number;
  source: { url: string; sha256: string; bytes: number };
  video: { width: number; height: number; durationSeconds: number };
  frames: Array<{
    url: string;
    sha256: string;
    bytes: number;
    width: number;
    height: number;
    timecodeSeconds: number;
    format: "png";
  }>;
  /** External, normalized tracks only; burned-in text is never a selectable track. */
  subtitles?: Array<{ url: string; language: string; label: string; sha256: string }>;
}

export interface EpisodeVideoExpectation {
  episodeId: number;
  sourceUrl: string;
  sourceSha256: string;
  publicAssetOrigin: string;
}

function hash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function positiveInteger(value: unknown, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= maximum;
}
function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0)!;
    return code < 32 || code === 127;
  });
}
function publicUrl(value: string): URL {
  if (typeof value !== "string" || !URL.canParse(value))
    throw new Error("Invalid public media URL");
  const url = new URL(value);
  const path = decodeURIComponent(url.pathname);
  if (
    value.length > 4096 ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.href !== value ||
    hasControlCharacters(path) ||
    path.includes("\\") ||
    path.split("/").some((segment) => segment === "." || segment === "..")
  )
    throw new Error("Public media URLs must be exact HTTPS URLs without credentials or query data");
  return url;
}
function asset(value: string, origin: string, suffix: string): string {
  const url = publicUrl(value);
  if (url.origin !== origin || !url.pathname.toLowerCase().endsWith(suffix))
    throw new Error("Media artifact is outside its configured public origin or format");
  return url.href;
}

/** Returns only supported editorial fields, with technical provenance kept separately. */
export function episodeVideoPatch(input: EpisodeVideoDelivery, expected: EpisodeVideoExpectation) {
  const origin = publicUrl(
    expected.publicAssetOrigin + (expected.publicAssetOrigin.endsWith("/") ? "" : "/"),
  );
  if (
    origin.pathname !== "/" ||
    origin.hostname.endsWith(".r2.dev") ||
    origin.hostname.endsWith(".r2.cloudflarestorage.com")
  )
    throw new Error("Media publication requires a configured custom-domain origin");
  if (
    input?.producer !== "bun-video" ||
    !positiveInteger(input.episodeId, 2147483647) ||
    input.episodeId !== expected.episodeId ||
    !hash(expected.sourceSha256) ||
    input.source?.sha256 !== expected.sourceSha256 ||
    input.source?.url !== expected.sourceUrl ||
    !hash(input.source?.sha256) ||
    !positiveInteger(input.source?.bytes, 2 * 1024 ** 3)
  )
    throw new Error("Episode source differs from the qualified producer handoff");
  publicUrl(input.source.url);
  const video = input.video;
  if (
    !positiveInteger(video?.width, 16384) ||
    !positiveInteger(video?.height, 16384) ||
    typeof video?.durationSeconds !== "number" ||
    !Number.isFinite(video.durationSeconds) ||
    video.durationSeconds < 1 ||
    video.durationSeconds > 86400 ||
    !Array.isArray(input.frames) ||
    !input.frames.length ||
    input.frames.length > 600
  )
    throw new Error("Invalid video dimensions, duration or bounded frame delivery");
  const times = new Set<number>();
  const urls = new Set<string>();
  const frames = input.frames.map((frame, index) => {
    if (
      frame?.format !== "png" ||
      !hash(frame.sha256) ||
      !positiveInteger(frame.bytes, 33 * 1024 ** 2) ||
      frame.width !== video.width ||
      frame.height !== video.height ||
      typeof frame.timecodeSeconds !== "number" ||
      !Number.isFinite(frame.timecodeSeconds) ||
      frame.timecodeSeconds < 0 ||
      frame.timecodeSeconds >= video.durationSeconds ||
      times.has(frame.timecodeSeconds) ||
      urls.has(frame.url)
    )
      throw new Error(
        "Frames must be unique original-resolution PNG artifacts with valid timestamps",
      );
    const imagePath = asset(frame.url, origin.origin, ".png");
    times.add(frame.timecodeSeconds);
    urls.add(frame.url);
    return {
      source: "bun-video" as const,
      sourceId: `bun-video:${input.source.sha256}:${frame.timecodeSeconds}`,
      sourceUrl: input.source.url,
      episodeNumber: null,
      imagePath,
      timecodeSec: frame.timecodeSeconds,
      width: frame.width,
      height: frame.height,
      characterNames: [] as string[],
      tags: [] as string[],
      caption: null,
      isNotable: false,
      sortOrder: index,
    };
  });
  const subtitles = input.subtitles?.map((track) => {
    if (
      !hash(track.sha256) ||
      !/^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(track.language) ||
      typeof track.label !== "string" ||
      !track.label.trim() ||
      track.label.length > 120 ||
      !track.label.isWellFormed() ||
      hasControlCharacters(track.label)
    )
      throw new Error("Invalid external subtitle artifact");
    return {
      lang: track.language,
      label: track.label,
      src: asset(track.url, origin.origin, ".vtt"),
    };
  });
  if (
    subtitles &&
    (subtitles.length > 32 ||
      new Set(subtitles.map((track) => track.src)).size !== subtitles.length)
  )
    throw new Error("External subtitle tracks must be bounded and unique");
  return {
    episodeId: input.episodeId,
    patch: {
      durationSec: Math.floor(video.durationSeconds),
      frames,
      ...(subtitles ? { subtitles } : {}),
    },
    provenance: {
      producer: input.producer,
      source: { url: input.source.url, sha256: input.source.sha256, bytes: input.source.bytes },
      video: { width: video.width, height: video.height, durationSeconds: video.durationSeconds },
      frames: input.frames.map((frame) => ({
        url: frame.url,
        sha256: frame.sha256,
        bytes: frame.bytes,
        width: frame.width,
        height: frame.height,
        timecodeSeconds: frame.timecodeSeconds,
        format: frame.format,
      })),
      ...(input.subtitles
        ? {
            subtitles: input.subtitles.map((track) => ({
              url: track.url,
              language: track.language,
              label: track.label,
              sha256: track.sha256,
            })),
          }
        : {}),
      extractionPerformed: false,
      reencodingPerformed: false,
    },
  };
}
