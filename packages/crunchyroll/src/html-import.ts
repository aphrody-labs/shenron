// SPDX-License-Identifier: Apache-2.0
import type { CrunchyrollEpisodeMeta } from "./types";

export interface CrunchyrollHtmlImport {
  sourceUrl: string | null;
  episodes: CrunchyrollEpisodeMeta[];
  images: string[];
  metadataLanguage: string | null;
  provenance: { selector: string; type: "TVEpisode" | "VideoObject"; scriptIndex: number }[];
}

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

function officialUrl(value: unknown, kind: "watch" | "series"): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.origin !== "https://www.crunchyroll.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !new RegExp(`^/(?:[a-z]{2}(?:-[a-z]{2})?/)?${kind}/[A-Z0-9]{6,16}(?:/[a-z0-9-]+)?/?$`).test(
        url.pathname,
      )
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

function publicImage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      url.origin !== "https://imgsrv.crunchyroll.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.includes("/catalog/crunchyroll/") ||
      !/\.(?:png|jpe?g|webp)$/.test(url.pathname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}

function text(value: unknown, max: number): string | undefined {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    !Array.from(value).some(
      (char) =>
        char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === "<" || char === ">",
    )
    ? value.trim()
    : undefined;
}

function durationMs(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  if (!match || !match.slice(1).some(Boolean)) return undefined;
  const milliseconds = Math.round(
    (Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0)) * 1000,
  );
  return Number.isSafeInteger(milliseconds) && milliseconds > 0 && milliseconds <= 86_400_000
    ? milliseconds
    : undefined;
}

/** Parses saved public metadata inertly. Imported prose is source evidence, never an instruction. */
export async function parseCrunchyrollHtml(
  html: string,
  expectedWatchUrl?: string,
): Promise<CrunchyrollHtmlImport> {
  if (typeof html !== "string" || html.length > 10 * 1024 * 1024)
    throw new Error("Invalid Crunchyroll HTML input");
  const expected = expectedWatchUrl === undefined ? null : officialUrl(expectedWatchUrl, "watch");
  if (expectedWatchUrl !== undefined && !expected) throw new Error("Invalid expected watch URL");
  const canonicals: string[] = [];
  const scripts: { index: number; text: string }[] = [];
  let current: { index: number; text: string } | undefined;
  let scriptIndex = 0;
  let language: string | undefined;
  const parser = new HTMLRewriter()
    .on("html", {
      element(element) {
        language ??= text(element.getAttribute("lang"), 20);
      },
    })
    .on("link", {
      element(element) {
        if ((element.getAttribute("rel") ?? "").toLowerCase().split(/\s+/).includes("canonical")) {
          const url = officialUrl(element.getAttribute("href"), "watch");
          if (url) canonicals.push(url.href);
        }
      },
    })
    .on("script", {
      element(element) {
        current = undefined;
        const index = scriptIndex++;
        if ((element.getAttribute("type") ?? "").toLowerCase().trim() === "application/ld+json") {
          current = { index, text: "" };
          scripts.push(current);
        }
      },
      text(chunk) {
        if (current) current.text += chunk.text;
      },
    });
  await parser.transform(new Response(html)).text();
  const uniqueCanonical = [...new Set(canonicals)];
  if (
    uniqueCanonical.length > 1 ||
    (expected && uniqueCanonical.length === 1 && uniqueCanonical[0] !== expected.href)
  )
    throw new Error("Crunchyroll page identity mismatch");
  const source = uniqueCanonical[0] ? new URL(uniqueCanonical[0]) : null;
  const result: CrunchyrollHtmlImport = {
    sourceUrl: source?.href ?? null,
    episodes: [],
    images: [],
    provenance: [],
    metadataLanguage:
      language && /^[a-z]{2,3}(?:-[a-zA-Z]{2,8})?$/.test(language) ? language : null,
  };
  if (!source) return result;
  const records: { value: Record<string, unknown>; index: number }[] = [];
  for (const script of scripts) {
    let value: unknown;
    try {
      value = JSON.parse(script.text);
    } catch {
      continue;
    }
    const top = Array.isArray(value) ? value : [value];
    for (const item of top.slice(0, 1000)) {
      if (!object(item)) continue;
      const graph = Array.isArray(item["@graph"]) ? item["@graph"].slice(0, 1000) : [item];
      for (const entry of graph)
        if (object(entry)) records.push({ value: entry, index: script.index });
    }
  }
  const hasType = (entry: Record<string, unknown>, type: string) =>
    entry["@type"] === type || (Array.isArray(entry["@type"]) && entry["@type"].includes(type));
  const episodes = records.filter(({ value }) => hasType(value, "TVEpisode"));
  // Multiple episode identities cannot share one unqualified VideoObject safely.
  if (episodes.length !== 1) return result;
  const episode = episodes[0]!;
  const identity = officialUrl(episode.value.url ?? episode.value["@id"], "watch");
  if (!identity || identity.href !== source.href) return result;
  if (
    episode.value["@id"] !== undefined &&
    officialUrl(episode.value["@id"], "watch")?.href !== source.href
  )
    return result;
  const number = episode.value.episodeNumber;
  if (!Number.isSafeInteger(number) || (number as number) < 1) return result;
  const videos = records.filter(({ value }) => hasType(value, "VideoObject"));
  const video = videos.length === 1 ? videos[0] : undefined;
  if (!video) return result;
  for (const key of ["url", "@id"]) {
    if (
      video.value[key] !== undefined &&
      officialUrl(video.value[key], "watch")?.href !== source.href
    )
      return result;
  }
  const series = object(episode.value.partOfSeries)
    ? episode.value.partOfSeries
    : object(video.value.partOfSeries)
      ? video.value.partOfSeries
      : null;
  const seriesUrl = officialUrl(series?.["@id"] ?? series?.url, "series");
  if (!seriesUrl) return result;
  const title = text(video.value.name, 1000) ?? text(episode.value.name, 1000);
  const duration = durationMs(video.value.duration);
  if (!title || duration === undefined) return result;
  const id = /\/watch\/([A-Z0-9]{6,16})/.exec(source.pathname)![1]!;
  const seriesId = /\/series\/([A-Z0-9]{6,16})/.exec(seriesUrl.pathname)![1]!;
  const description = text(video.value.description, 10_000);
  const published = episode.value.datePublished ?? video.value.uploadDate;
  const airDate =
    typeof published === "string" && Number.isFinite(Date.parse(published)) ? published : undefined;
  const audio = text(video.value.inLanguage, 20);
  result.episodes.push({
    id,
    seriesId,
    episodeNumber: number as number,
    title,
    slugTitle: /\/watch\/[A-Z0-9]{6,16}\/([a-z0-9-]+)\/?$/.exec(source.pathname)?.[1],
    durationMs: duration,
    watchUrl: source.href,
    ...(description ? { description } : {}),
    ...(airDate ? { airDate } : {}),
    ...(audio ? { audioLocale: audio } : {}),
  });
  // The page language describes the metadata, not the episode's audio or subtitle tracks.
  const candidates = [
    episode.value.thumbnailUrl,
    episode.value.image,
    ...(Array.isArray(video.value.thumbnailUrl)
      ? video.value.thumbnailUrl
      : [video.value.thumbnailUrl]),
  ];
  result.images = [...new Set(candidates.map(publicImage).filter((url): url is string => !!url))];
  result.provenance = [
    {
      selector: 'script[type="application/ld+json"]',
      type: "TVEpisode",
      scriptIndex: episode.index,
    },
    {
      selector: 'script[type="application/ld+json"]',
      type: "VideoObject",
      scriptIndex: video.index,
    },
  ];
  return result;
}
