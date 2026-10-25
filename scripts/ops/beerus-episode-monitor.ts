#!/usr/bin/env bun
// SPDX-License-Identifier: Apache-2.0
import { isAbsolute, join } from "node:path";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
export const SOURCES = [
  { kind: "official", lang: "ja", url: "https://dragonball-super.com/" },
  { kind: "official", lang: "en", url: "https://dragonball-super.com/en/" },
  { kind: "netflix", lang: "fr", url: "https://www.netflix.com/fr/title/83189604" },
  {
    kind: "crunchyroll",
    lang: "fr",
    url: "https://www.crunchyroll.com/fr/series/GT00389311/dragon-ball-super-beerus",
  },
  { kind: "shenron", lang: "fr", url: "https://dragonballfr.com/api/episodes/877" },
] as const;
type Source = (typeof SOURCES)[number];
export type Candidate = {
  episode: 3;
  lang: string;
  source: string;
  title: string | null;
  synopsis: string | null;
  images: string[];
  watchUrls: string[];
};
export type Observation = {
  source: string;
  kind: Source["kind"];
  lang: string;
  httpStatus: number | null;
  status: string;
  candidate: Candidate | null;
  facts: Record<string, string | number | boolean | null>;
};
const clean = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 12_000);

/** Retain public canonical links only; query strings may contain signed credentials. */
export function publicUrl(value: string, base: string): string | null {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" || url.username || url.password || url.search) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function maxWorkers(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(4, Math.floor(value))) : 4;
}

export async function boundedMap<T, R>(
  values: readonly T[],
  workers: number,
  task: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from<R>({ length: values.length });
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(values.length, maxWorkers(workers)) }, async () => {
      while (next < values.length) {
        const index = next++;
        results[index] = await task(values[index]!);
      }
    }),
  );
  return results;
}

export async function extractOfficialEpisode3(
  html: string,
  source: string,
  lang: string,
): Promise<Candidate | null> {
  let sections = 0;
  let title = "";
  let description = "";
  const images = new Set<string>();
  await new HTMLRewriter()
    .on('[id="ep-03"]', {
      element: () => {
        sections++;
      },
    })
    .on('[id="ep-03"] .str-txt h4', {
      text: (chunk) => {
        title += chunk.text;
      },
    })
    .on('[id="ep-03"] .str-txt', {
      text: (chunk) => {
        description += chunk.text;
      },
    })
    .on('[id="ep-03"] img[src]', {
      element(element) {
        const url = publicUrl(element.getAttribute("src") ?? "", source);
        if (!url) return;
        const parsed = new URL(url);
        if (
          parsed.origin === new URL(source).origin &&
          /^\/img\/story\/st03-\d+\.(?:jpe?g|png|webp)$/i.test(parsed.pathname)
        )
          images.add(url);
      },
    })
    .transform(new Response(html))
    .text();
  if (sections !== 1) return null;
  const normalizedTitle = clean(title);
  const normalizedDescription = clean(description);
  const synopsis =
    normalizedTitle && normalizedDescription.startsWith(normalizedTitle)
      ? normalizedDescription.slice(normalizedTitle.length).trim()
      : normalizedDescription;
  if (!normalizedTitle && !synopsis && !images.size) return null;
  return {
    episode: 3,
    lang,
    source,
    title: normalizedTitle || null,
    synopsis: synopsis || null,
    images: [...images].toSorted(),
    watchUrls: [],
  };
}

export async function extractCrunchyrollEpisode3(html: string, source: string): Promise<string[]> {
  const links = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string") return;
    const url = publicUrl(value, source);
    if (
      url &&
      new URL(url).hostname === "www.crunchyroll.com" &&
      /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?watch\/[A-Z0-9]+(?:\/[^/]+)?$/i.test(new URL(url).pathname)
    )
      links.add(url);
  };
  const scripts: string[] = [];
  let currentScript = -1;
  await new HTMLRewriter()
    .on(
      '[data-episode-number="3"] a[href], [data-episode_number="3"] a[href], [episode_number="3"] a[href], #episode_number3 a[href]',
      {
        element: (element) => add(element.getAttribute("href")),
      },
    )
    .on('script[type="application/ld+json"]', {
      element() {
        currentScript = scripts.push("") - 1;
      },
      text(chunk) {
        if (currentScript >= 0) scripts[currentScript] += chunk.text;
      },
    })
    .transform(new Response(html))
    .text();
  function visit(value: unknown, depth = 0): void {
    if (depth > 16 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    const record = value as Record<string, unknown>;
    if (
      (record["@type"] === "TVEpisode" || record["@type"] === "Episode") &&
      (record.episodeNumber === 3 || record.episodeNumber === "3")
    )
      add(record.url);
    Object.values(record).forEach((item) => visit(item, depth + 1));
  }
  for (const script of scripts) {
    try {
      visit(JSON.parse(script));
    } catch {
      /* Malformed structured data is not evidence. */
    }
  }
  return [...links].toSorted();
}

async function boundedBody(response: Response): Promise<string> {
  if (Number(response.headers.get("content-length")) > MAX_BODY_BYTES)
    throw new Error("body-limit");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_BODY_BYTES) throw new Error("body-limit");
      chunks.push(chunk.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

export async function observeSource(
  source: Source,
  fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<Observation> {
  const observation: Observation = {
    source: source.url,
    kind: source.kind,
    lang: source.lang,
    httpStatus: null,
    status: "unconfirmed",
    candidate: null,
    facts: {},
  };
  try {
    const response = await fetcher(source.url, {
      headers: { "user-agent": "ShenronEpisodeMonitor/1.0", accept: "text/html,application/json" },
      credentials: "omit",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    observation.httpStatus = response.status;
    if (!response.ok) {
      observation.status = response.status === 403 ? "access-blocked" : "http-error";
      await response.body?.cancel();
      return observation;
    }
    const body = await boundedBody(response);
    if (source.kind === "official") {
      observation.candidate = await extractOfficialEpisode3(body, source.url, source.lang);
      observation.status = observation.candidate
        ? "candidate-needs-review"
        : "episode-3-not-observed";
    } else if (source.kind === "crunchyroll") {
      if (/cf-chl|challenge-platform|Just a moment|Enable JavaScript and cookies/i.test(body)) {
        observation.status = "access-blocked";
      } else {
        const watchUrls = await extractCrunchyrollEpisode3(body, source.url);
        if (watchUrls.length)
          observation.candidate = {
            episode: 3,
            lang: source.lang,
            source: source.url,
            title: null,
            synopsis: null,
            images: [],
            watchUrls,
          };
        observation.status = watchUrls.length ? "candidate-needs-review" : "episode-3-not-observed";
      }
    } else if (source.kind === "shenron") {
      const data = JSON.parse(body);
      const item = data?.data?.episode ?? data?.data ?? data?.episode ?? data;
      observation.facts = {
        requestedId: 877,
        returnedId: typeof item?.id === "number" ? item.id : null,
        series: typeof item?.series === "string" ? clean(item.series) : null,
        number: typeof item?.numberInSeries === "number" ? item.numberInSeries : null,
      };
      observation.status = "catalogue-observed";
    } else {
      let text = "";
      await new HTMLRewriter()
        .on("body", {
          text: (chunk) => {
            text += chunk.text;
          },
        })
        .on("script,style", {
          element: (element) => {
            element.remove();
          },
        })
        .transform(new Response(body))
        .text();
      observation.facts = {
        mentionsEpisode3: /3\s*[ÉE]pisodes/.test(text),
        playbackVerified: false,
      };
      observation.status = "catalogue-only-not-playback";
    }
  } catch (error) {
    observation.status =
      error instanceof Error && error.message === "body-limit"
        ? "body-limit"
        : "network-or-parse-error";
  }
  return observation;
}

export function snapshotFingerprint(value: unknown): string {
  function stable(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(stable);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .filter(([key]) => key !== "observedAt")
          .toSorted(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, stable(entry)]),
      );
    return item;
  }
  return new Bun.CryptoHasher("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

export async function runMonitor(out: string, workers = 4): Promise<Record<string, unknown>> {
  if (!isAbsolute(out)) throw new Error("--out must be an absolute directory");
  const observations = await boundedMap(SOURCES, workers, (source) => observeSource(source));
  const candidates = observations.flatMap((item) => (item.candidate ? [item.candidate] : []));
  const fingerprint = snapshotFingerprint(observations);
  const statePath = join(out, "state.json");
  let previous: unknown = null;
  try {
    previous = (await Bun.file(statePath).json()).fingerprint;
  } catch {
    /* First observation. */
  }
  const observedAt = new Date().toISOString();
  const changed = previous !== fingerprint;
  const summary = {
    observedAt,
    changed,
    fingerprint,
    workers: maxWorkers(workers),
    candidateCount: candidates.length,
    publication: "none-review-required",
    sources: observations.map(({ source, status, httpStatus }) => ({ source, status, httpStatus })),
  };
  await Bun.write(
    join(out, "candidates.json"),
    JSON.stringify(
      { observedAt, observations, candidates, publication: "none-review-required" },
      null,
      2,
    ),
  );
  await Bun.write(statePath, JSON.stringify({ observedAt, fingerprint, changed }, null, 2));
  await Bun.write(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  return summary;
}

export function parseOptions(args: string[]): { out: string; workers: number } {
  let out = "";
  let workers = 4;
  if (!args.includes("--once")) throw new Error("--once is required");
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--once") continue;
    if (arg === "--out") out = args[++index] ?? "";
    else if (arg === "--workers") workers = Number(args[++index]);
    else if (arg === "--workers4") workers = 4;
    else throw new Error("Unsupported argument");
  }
  if (!isAbsolute(out)) throw new Error("--out must be an absolute directory");
  if (!Number.isInteger(workers) || workers < 1)
    throw new Error("--workers must be a positive integer");
  return { out, workers: maxWorkers(workers) };
}

if (import.meta.main) {
  const options = parseOptions(Bun.argv.slice(2));
  console.log(JSON.stringify(await runMonitor(options.out, options.workers)));
}
