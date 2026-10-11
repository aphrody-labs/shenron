// SPDX-License-Identifier: Apache-2.0
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Database } from "bun:sqlite";

const seeds = [
  "https://dragonball-super.com/en/",
  "https://www.db-z.com/dragon-ball-super-beerus-ou-et-comment-regarder-la-serie-en-france/",
];
const hash = (value: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");
type RobotsRule = { path: string; allow: boolean };
type InventoryKind = "page-link" | "asset" | "iframe" | "form-action" | "sitemap" | "api-candidate";
type InventoryEntry = {
  url: string;
  kind: InventoryKind;
  discoveredFrom: string;
  sourceSha256: string;
  discoveredOnly: boolean;
  observedAt?: string;
  observedSha256?: string;
  observedStatus?: number;
  resolutionUnverified: boolean;
};
type CaptureIdentity = { url: string; sha256?: string; status?: number; state?: string };
export type CrawlPublicationRights = "unreviewed" | "approved" | "rejected";
export type CrawlPublicationConfig = {
  publicationRights: CrawlPublicationRights;
  publicImagesPermitted: boolean;
};

/**
 * Resolve the editorial decision from the protected job environment.
 * The conservative defaults keep captures private until an administrator opts in.
 */
export function crawlPublicationConfig(
  env: Record<string, string | undefined> = Bun.env,
): CrawlPublicationConfig {
  const rights = env.SHENRON_CRAWL_PUBLICATION_RIGHTS ?? "unreviewed";
  if (rights !== "unreviewed" && rights !== "approved" && rights !== "rejected") {
    throw new Error("SHENRON_CRAWL_PUBLICATION_RIGHTS must be unreviewed, approved, or rejected");
  }
  const images = env.SHENRON_CRAWL_PUBLIC_IMAGES_PERMITTED ?? "false";
  if (images !== "true" && images !== "false") {
    throw new Error("SHENRON_CRAWL_PUBLIC_IMAGES_PERMITTED must be true or false");
  }
  const publicImagesPermitted = images === "true";
  if (publicImagesPermitted && rights !== "approved") {
    throw new Error(
      "SHENRON_CRAWL_PUBLIC_IMAGES_PERMITTED=true requires approved publication rights",
    );
  }
  return { publicationRights: rights, publicImagesPermitted };
}
export function compareCaptures(previous: CaptureIdentity[], current: CaptureIdentity[]) {
  const before = new Map(previous.map((row) => [row.url, row]));
  const after = new Map(current.map((row) => [row.url, row]));
  return {
    added: [...after.keys()].filter((url) => !before.has(url)).toSorted(),
    changed: current
      .filter(
        (row) =>
          row.sha256 && before.get(row.url)?.sha256 && row.sha256 !== before.get(row.url)?.sha256,
      )
      .map((row) => row.url)
      .toSorted(),
    unobserved: [...before.keys()].filter((url) => !after.has(url)).toSorted(),
    unavailable: current
      .filter((row) => row.state || row.status !== 200)
      .map((row) => row.url)
      .toSorted(),
  };
}
export function observedUrl(raw: string, base: string): string | undefined {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return;
    url.hash = "";
    return url.href;
  } catch {
    return;
  }
}
export const sitemapLimits = {
  documents: 16,
  documentBytes: 4 * 1024 * 1024,
  bytes: 16 * 1024 * 1024,
  urls: 2048,
};
export function qualifiedSitemapLimits(overrides: Partial<typeof sitemapLimits> = {}) {
  const limits = { ...sitemapLimits, ...overrides };
  const ceilings = {
    documents: 64,
    documentBytes: 8 * 1024 * 1024,
    bytes: 64 * 1024 * 1024,
    urls: 50000,
  };
  for (const key of Object.keys(limits) as (keyof typeof limits)[])
    if (!Number.isInteger(limits[key]) || limits[key] < 1 || limits[key] > ceilings[key])
      throw new Error(`Invalid sitemap budget: ${key}`);
  return limits;
}

export function pendingSitemaps(previous: {
  sitemapBudget?: { remaining?: unknown[] };
  sitemaps?: { url?: string; state?: string; reason?: string }[];
}): string[] {
  const candidates = [
    ...(previous.sitemapBudget?.remaining ?? []),
    ...(previous.sitemaps ?? [])
      .filter(
        (row) =>
          ["budget_exceeded", "unavailable_or_invalid", "unavailable"].includes(row.state ?? "") ||
          ["request_timeout", "request_failed"].includes(row.reason ?? ""),
      )
      .map((row) => row.url),
  ];
  return [
    ...new Set(
      candidates
        .filter((url): url is string => typeof url === "string")
        .map((url) => approvedSitemap(url, seeds[0]!))
        .filter((url): url is string => !!url),
    ),
  ].slice(0, 50000);
}

class CaptureSizeError extends Error {
  constructor(
    readonly limit: number,
    readonly accepted: number,
    readonly status: number,
  ) {
    super("Source exceeds the bounded capture size");
    this.name = "CaptureSizeError";
  }
}

export function acceptBodyChunk(consumed: number, size: number, limit: number): boolean {
  return Number.isSafeInteger(size) && size >= 0 && consumed + size <= limit;
}

export function approvedSitemap(raw: string, base: string): string | undefined {
  const value = observedUrl(raw, base);
  if (!value) return;
  const url = new URL(value);
  if (!["dragonball-super.com", "www.db-z.com"].includes(url.hostname)) return;
  if (!url.pathname.endsWith(".xml") || isPlaybackMedia(value)) return;
  return value;
}

export function parseSitemap(
  xml: string,
  maxUrls = sitemapLimits.urls,
  maxBytes = sitemapLimits.documentBytes,
): { index: boolean; urls: string[] } {
  if (new TextEncoder().encode(xml).byteLength > maxBytes)
    throw new Error("Sitemap exceeds document byte budget");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Sitemap declarations are forbidden");
  const root = xml
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  const opening = /^<(?:[\w.-]+:)?(sitemapindex|urlset)(?:\s[^<>]*|)>/i.exec(root);
  if (!opening || !new RegExp(`</(?:[\\w.-]+:)?${opening[1]}\\s*>$`, "i").test(root))
    throw new Error("Sitemap root is invalid");
  const urls: string[] = [];
  for (const match of root.matchAll(
    /<(?:[\w.-]+:)?loc\s*>(<!\[CDATA\[[\s\S]*?\]\]>|[^<>]*)<\/(?:[\w.-]+:)?loc\s*>/gi,
  )) {
    if (urls.length >= maxUrls) throw new Error("Sitemap exceeds URL budget");
    const value = match[1]!;
    const decoded = (
      value.startsWith("<![CDATA[")
        ? value.slice(9, -3)
        : value.replace(/&([^;]+);/g, (_, entity: string) => {
            const named: Record<string, string> = {
              amp: "&",
              lt: "<",
              gt: ">",
              quot: '"',
              apos: "'",
            };
            if (named[entity]) return named[entity];
            if (!/^#(?:[0-9]+|x[0-9a-f]+)$/i.test(entity))
              throw new Error("Unknown sitemap entity");
            const code =
              entity[1]?.toLowerCase() === "x"
                ? parseInt(entity.slice(2), 16)
                : Number(entity.slice(1));
            if (!code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff))
              throw new Error("Invalid sitemap character");
            return String.fromCodePoint(code);
          })
    ).trim();
    if (decoded) urls.push(decoded);
  }
  return { index: opening[1]!.toLowerCase() === "sitemapindex", urls };
}
export function robotsAccess(status: number): "rules" | "unavailable" | "unreachable" {
  // RFC 9309 section 2.3.1: an unavailable robots resource is distinct from
  // an unreachable origin. Rate limiting remains conservative and retryable.
  if (status >= 200 && status < 300) return "rules";
  if (status >= 400 && status < 500 && status !== 429) return "unavailable";
  return "unreachable";
}

export function parseRobots(text: string): { rules: RobotsRule[]; sitemaps: string[] } {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  const sitemaps: string[] = [];
  let group: (typeof groups)[number] | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "sitemap") {
      sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!group || group.rules.length) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if (group && value && (field === "allow" || field === "disallow")) {
      group.rules.push({ path: value, allow: field === "allow" });
    }
  }
  const specific = groups.filter((entry) =>
    entry.agents.some(
      (agent) => !!agent && agent !== "*" && "shenron-source-crawl".includes(agent),
    ),
  );
  return {
    rules: (specific.length
      ? specific
      : groups.filter((entry) => entry.agents.includes("*"))
    ).flatMap((entry) => entry.rules),
    sitemaps: [...new Set(sitemaps)],
  };
}
export function robotsPermits(url: string, rules: RobotsRule[]): boolean {
  const parsed = new URL(url);
  const target = parsed.pathname + parsed.search;
  let winner: RobotsRule | undefined;
  let specificity = -1;
  for (const rule of rules) {
    const anchored = rule.path.endsWith("$");
    const path = anchored ? rule.path.slice(0, -1) : rule.path;
    const expression = path
      .split("*")
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    const length = path.replace(/\*/g, "").length;
    if (
      new RegExp("^" + expression + (anchored ? "$" : "")).test(target) &&
      (length > specificity || (length === specificity && rule.allow))
    ) {
      winner = rule;
      specificity = length;
    }
  }
  return winner?.allow ?? true;
}
export function isPlaybackMedia(url: string): boolean {
  return /\.(?:mp4|webm|mp3|m4a|m3u8|mpd|ts|m4s|aac|key)(?:[?#]|$)/i.test(url);
}
export function approvedUrl(raw: string, base: string, page: boolean): string | undefined {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return;
    url.hash = "";
    if (url.hostname === "dragonball-super.com") {
      if (page && !url.pathname.startsWith("/en/")) return;
    } else if (url.hostname === "www.db-z.com") {
      if (page && url.pathname !== new URL(seeds[1]!).pathname) return;
      if (!page && !url.pathname.startsWith("/wp-content/")) return;
    } else return;
    if (page) {
      const ids = url.searchParams.getAll("id");
      const officialUpdate =
        url.hostname === "dragonball-super.com" && url.pathname === "/en/updates/detail.html";
      // The official CMS uses opaque identities as well as dated identifiers.
      // Refuse ambiguous or malformed detail identities rather than merging pages.
      if (officialUpdate && (ids.length !== 1 || !/^[A-Za-z0-9_-]{1,128}$/.test(ids[0]!))) return;
      url.search = "";
      if (officialUpdate) url.searchParams.set("id", ids[0]!);
    }
    return url.href;
  } catch {
    return;
  }
}

export function resumableUrls(values: unknown, base: string, page: boolean): string[] {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => approvedUrl(value, base, page))
        .filter((value): value is string => !!value),
    ),
  ];
}
async function read(
  url: string,
  byteLimit = 16 * 1024 * 1024,
  onBytes?: (consumed: number, accepted: number) => void,
): Promise<{ status: number; type: string; bytes: Uint8Array; location: string | null }> {
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
    headers: { "User-Agent": "Shenron-source-crawl/1.4.4 (+https://dragonballfr.com)" },
  });
  const type = response.headers.get("content-type") ?? "";
  if (/^(?:audio|video)\//i.test(type) || /(?:mpegurl|dash\+xml)/i.test(type)) {
    await response.body?.cancel();
    throw new Error("Playback media is excluded from private site capture");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      const accepted = acceptBodyChunk(size, chunk.byteLength, byteLimit);
      onBytes?.(chunk.byteLength, accepted ? chunk.byteLength : 0);
      if (!accepted) throw new CaptureSizeError(byteLimit, size, response.status);
      size += chunk.byteLength;
      chunks.push(chunk);
    }
  }
  const bytes = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return { status: response.status, type, bytes, location: response.headers.get("location") };
}
export async function crawl(
  output: string,
  options: { previousManifest?: string; sitemapLimits?: Partial<typeof sitemapLimits> } = {},
): Promise<void> {
  const directory = resolve(output);
  const limits = qualifiedSitemapLimits(options.sitemapLimits);
  const publication = crawlPublicationConfig();
  const previous = options.previousManifest
    ? JSON.parse(await readFile(resolve(options.previousManifest), "utf8"))
    : undefined;
  if (
    previous &&
    (previous.schema !== "shenron-source-crawl/v1" ||
      !Array.isArray(previous.pages) ||
      !Array.isArray(previous.media) ||
      (previous.sitemaps !== undefined && !Array.isArray(previous.sitemaps)) ||
      (previous.remainingPages !== undefined && !Array.isArray(previous.remainingPages)) ||
      (previous.remainingAssets !== undefined && !Array.isArray(previous.remainingAssets)) ||
      (previous.sitemapBudget?.remaining !== undefined &&
        !Array.isArray(previous.sitemapBudget.remaining)))
  )
    throw new Error("Previous capture manifest invalid");
  await mkdir(join(directory, "bodies"), { recursive: true, mode: 0o700 });
  // Sitemap/page discovery is intentionally split over bounded passes. Keep only
  // approved URLs from the prior pass so a successful partial crawl can progress.
  const frontier = [
    ...new Set([...seeds, ...resumableUrls(previous?.remainingPages, seeds[0]!, true)]),
  ];
  const seen = new Set<string>();
  const assets = new Set(resumableUrls(previous?.remainingAssets, seeds[0]!, false));
  const pages: Record<string, unknown>[] = [];
  const media: Record<string, unknown>[] = [];
  const corpus: Record<string, unknown>[] = [];
  const robots: Record<string, unknown>[] = [];
  const sitemapCaptures: Record<string, unknown>[] = [];
  const sitemapQueue: string[] = previous ? pendingSitemaps(previous).slice(0, limits.urls) : [];
  const deferredSitemaps: string[] = [];
  const inventory = new Map<string, InventoryEntry>();
  const observe = (raw: string, base: string, kind: InventoryKind, sourceSha256: string) => {
    const url = observedUrl(raw, base);
    if (!url) return;
    const key = JSON.stringify([url, kind, base]);
    inventory.set(key, {
      url,
      kind,
      discoveredFrom: base,
      sourceSha256,
      discoveredOnly: true,
      resolutionUnverified: kind === "api-candidate",
    });
    if (kind === "sitemap") {
      const captured = sitemapCaptures.find((row) => row.url === url && row.sha256);
      if (captured)
        Object.assign(inventory.get(key)!, {
          discoveredOnly: false,
          observedAt: captured.fetchedAt,
          observedSha256: captured.sha256,
          observedStatus: captured.status,
        });
    }
  };
  const forbidden = new Map<string, RobotsRule[]>();
  const robotsUnavailable = new Set<string>();
  for (const origin of ["https://dragonball-super.com", "https://www.db-z.com"]) {
    try {
      const r = await read(origin + "/robots.txt");
      const text = new TextDecoder().decode(r.bytes);
      const access = robotsAccess(r.status);
      if (access === "unreachable") robotsUnavailable.add(origin);
      const { rules, sitemaps } =
        access === "rules" ? parseRobots(text) : { rules: [], sitemaps: [] };
      forbidden.set(origin, rules);
      robots.push({
        url: origin + "/robots.txt",
        status: r.status,
        access,
        policy: "rfc9309-2.3.1",
        fetchedAt: new Date().toISOString(),
        rules,
        sitemaps,
        sha256: hash(r.bytes),
      });
      for (const sitemap of sitemaps) {
        observe(sitemap, origin + "/robots.txt", "sitemap", hash(r.bytes));
        const approved = approvedSitemap(sitemap, origin + "/robots.txt");
        if (approved && sitemapQueue.length < limits.urls && !sitemapQueue.includes(approved))
          sitemapQueue.push(approved);
      }
    } catch {
      robotsUnavailable.add(origin);
      robots.push({
        url: origin + "/robots.txt",
        state: "unavailable",
        fetchedAt: new Date().toISOString(),
      });
    }
  }
  const permitted = (url: string) => {
    const parsed = new URL(url);
    if (robotsUnavailable.has(parsed.origin)) return false;
    return robotsPermits(url, forbidden.get(parsed.origin) ?? []);
  };
  const sitemapSeen = new Set<string>();
  let sitemapBytes = 0;
  let consumedBodyBytes = 0;
  let storedBytes = 0;
  let sitemapUrls = 0;
  while (
    sitemapQueue.length &&
    sitemapSeen.size < limits.documents &&
    consumedBodyBytes < limits.bytes &&
    sitemapUrls < limits.urls
  ) {
    const url = sitemapQueue.shift()!;
    if (sitemapSeen.has(url)) continue;
    sitemapSeen.add(url);
    if (!permitted(url)) {
      sitemapCaptures.push({
        url,
        state: robotsUnavailable.has(new URL(url).origin)
          ? "robots_unavailable"
          : "robots_excluded",
      });
      continue;
    }
    const consumedBeforeRequest = consumedBodyBytes;
    try {
      const r = await read(
        url,
        Math.min(limits.documentBytes, limits.bytes - consumedBodyBytes),
        (consumed, accepted) => {
          consumedBodyBytes += consumed;
          sitemapBytes += accepted;
        },
      );
      const digest = hash(r.bytes);
      const fetchedAt = new Date().toISOString();
      await writeFile(join(directory, "bodies", digest), r.bytes, { mode: 0o600 });
      storedBytes += r.bytes.byteLength;
      const row: Record<string, unknown> = {
        url,
        status: r.status,
        contentType: r.type,
        sha256: digest,
        bytes: r.bytes.byteLength,
        fetchedAt,
      };
      sitemapCaptures.push(row);
      for (const reference of inventory.values())
        if (reference.url === url && reference.kind === "sitemap")
          Object.assign(reference, {
            discoveredOnly: false,
            observedAt: fetchedAt,
            observedSha256: digest,
            observedStatus: r.status,
          });
      if (r.status >= 300 && r.status < 400 && r.location) {
        observe(r.location, url, "sitemap", digest);
        const destination = approvedSitemap(r.location, url);
        row.redirectLocation = observedUrl(r.location, url);
        row.redirectApproved = !!destination;
        if (destination && !sitemapSeen.has(destination) && sitemapQueue.length < limits.urls)
          sitemapQueue.push(destination);
      }
      if (r.status !== 200) continue;
      const parsed = parseSitemap(
        new TextDecoder().decode(r.bytes),
        limits.urls - sitemapUrls,
        limits.documentBytes,
      );
      sitemapUrls += parsed.urls.length;
      row.index = parsed.index;
      row.listedUrls = parsed.urls.length;
      for (const listed of parsed.urls) {
        observe(listed, url, parsed.index ? "sitemap" : "page-link", digest);
        const next = parsed.index ? approvedSitemap(listed, url) : approvedUrl(listed, url, true);
        if (!next || isPlaybackMedia(next)) continue;
        if (parsed.index) {
          if (
            !sitemapSeen.has(next) &&
            !sitemapQueue.includes(next) &&
            sitemapQueue.length < limits.urls
          )
            sitemapQueue.push(next);
        } else if (!frontier.includes(next) && frontier.length < 128) frontier.push(next);
      }
    } catch (error) {
      const captured = sitemapCaptures.find((row) => row.url === url);
      const reason =
        error instanceof CaptureSizeError
          ? "body_byte_budget"
          : error instanceof Error && error.message === "Sitemap exceeds URL budget"
            ? "listed_url_budget"
            : error instanceof Error && error.name === "TimeoutError"
              ? "request_timeout"
              : captured
                ? "xml_parse_rejected"
                : "request_failed";
      const state =
        reason === "body_byte_budget" || reason === "listed_url_budget"
          ? "budget_exceeded"
          : captured
            ? "invalid"
            : "unavailable";
      if (
        (state === "budget_exceeded" || state === "unavailable") &&
        !deferredSitemaps.includes(url)
      )
        deferredSitemaps.push(url);
      if (captured) Object.assign(captured, { state, reason });
      else
        sitemapCaptures.push({
          url,
          state,
          reason,
          consumedBodyBytes: consumedBodyBytes - consumedBeforeRequest,
          ...(error instanceof CaptureSizeError
            ? { status: error.status, acceptedBodyBytes: error.accepted, byteLimit: error.limit }
            : {}),
          fetchedAt: new Date().toISOString(),
        });
    }
  }
  while (frontier.length && seen.size < 128) {
    const url = frontier.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    if (!permitted(url)) {
      pages.push({
        url,
        state: robotsUnavailable.has(new URL(url).origin)
          ? "robots_unavailable"
          : "robots_excluded",
      });
      continue;
    }
    try {
      const r = await read(url);
      const digest = hash(r.bytes);
      await writeFile(join(directory, "bodies", digest), r.bytes, { mode: 0o600 });
      const row: Record<string, unknown> = {
        url,
        status: r.status,
        contentType: r.type,
        bytes: r.bytes.byteLength,
        sha256: digest,
        fetchedAt: new Date().toISOString(),
      };
      pages.push(row);
      if (r.status >= 300 && r.status < 400 && r.location) {
        const destination = approvedUrl(r.location, url, true);
        row.redirectLocation = new URL(r.location, url).href;
        row.redirectApproved = !!destination;
        if (destination && !seen.has(destination) && !frontier.includes(destination))
          frontier.push(destination);
      }
      if (r.status !== 200 || !r.type.includes("text/html")) continue;
      const text: string[] = [];
      const titles: string[] = [];
      const links = new Set<string>();
      const rewriter = new HTMLRewriter()
        .on("[style]", {
          element(element) {
            for (const match of (element.getAttribute("style") ?? "").matchAll(
              /url\(\s*["']?([^"')\s]+)["']?\s*\)/g,
            )) {
              observe(match[1]!, url, "asset", digest);
              const next = approvedUrl(match[1]!, url, false);
              if (next && !isPlaybackMedia(next)) assets.add(next);
            }
          },
        })
        .on("title", {
          text(chunk) {
            titles.push(chunk.text);
          },
        })
        .on("h1,h2,h3,p,li", {
          text(chunk) {
            text.push(chunk.text);
          },
        })
        .on("a[href]", {
          element(element) {
            const raw = element.getAttribute("href");
            if (!raw) return;
            try {
              links.add(new URL(raw, url).href);
            } catch {
              return;
            }
            observe(raw, url, "page-link", digest);
            const next = approvedUrl(raw, url, true);
            if (next && !seen.has(next) && !frontier.includes(next)) frontier.push(next);
          },
        })
        .on("iframe[src],form[action]", {
          element(element) {
            const raw = element.getAttribute(element.tagName === "form" ? "action" : "src");
            if (raw)
              observe(raw, url, element.tagName === "form" ? "form-action" : "iframe", digest);
          },
        })
        .on("img,link,script,source,video", {
          element(element) {
            const candidates = [
              element.getAttribute("src"),
              element.getAttribute("data-src"),
              element.getAttribute("poster"),
            ];
            if (element.tagName === "link") candidates.push(element.getAttribute("href"));
            const srcset = element.getAttribute("srcset") ?? element.getAttribute("data-srcset");
            if (srcset)
              candidates.push(...srcset.split(",").map((entry) => entry.trim().split(/\s+/)[0]!));
            for (const raw of candidates) {
              if (!raw) continue;
              observe(raw, url, "asset", digest);
              const next = approvedUrl(raw, url, false);
              if (next && !isPlaybackMedia(next)) assets.add(next);
            }
          },
        });
      await rewriter
        .transform(
          new Response(new TextDecoder().decode(r.bytes), {
            headers: { "Content-Type": "text/html" },
          }),
        )
        .text();
      row.title = titles.join("").trim();
      row.links = [...links];
      corpus.push({
        url,
        title: row.title,
        text: text.join(" ").replace(/\s+/g, " ").trim(),
        fetchedAt: row.fetchedAt,
        sourceSha256: digest,
      });
    } catch {
      pages.push({ url, state: "unavailable", fetchedAt: new Date().toISOString() });
    }
  }
  let totalBytes = 0;
  const queue = [...assets];
  const assetsSeen = new Set<string>();
  while (queue.length && assetsSeen.size < 256 && totalBytes < 128 * 1024 * 1024) {
    const url = queue.shift()!;
    if (assetsSeen.has(url) || isPlaybackMedia(url)) continue;
    assetsSeen.add(url);
    if (!permitted(url)) {
      media.push({
        url,
        state: robotsUnavailable.has(new URL(url).origin)
          ? "robots_unavailable"
          : "robots_excluded",
      });
      continue;
    }
    try {
      const r = await read(url);
      const digest = hash(r.bytes);
      await writeFile(join(directory, "bodies", digest), r.bytes, { mode: 0o600 });
      totalBytes += r.bytes.byteLength;
      media.push({
        url,
        status: r.status,
        contentType: r.type,
        bytes: r.bytes.byteLength,
        sha256: digest,
        fetchedAt: new Date().toISOString(),
        publicCandidate: publication.publicImagesPermitted,
        publicationRights: publication.publicationRights,
      });
      if (r.status === 200 && r.type.includes("text/css")) {
        for (const match of new TextDecoder()
          .decode(r.bytes)
          .matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) {
          const next = approvedUrl(match[1]!, url, false);
          observe(match[1]!, url, "asset", digest);
          if (next && !isPlaybackMedia(next) && !assetsSeen.has(next)) queue.push(next);
        }
        for (const match of new TextDecoder()
          .decode(r.bytes)
          .matchAll(/@import\s+["']([^"']+)["']/gi)) {
          const next = approvedUrl(match[1]!, url, false);
          observe(match[1]!, url, "asset", digest);
          if (next && !isPlaybackMedia(next) && !assetsSeen.has(next)) queue.push(next);
        }
      }
      if (r.status === 200 && /javascript/i.test(r.type)) {
        const source = new TextDecoder().decode(r.bytes);
        for (const match of source.matchAll(
          /(?:fetch|axios\.(?:get|post))\s*\(\s*["']([^"']+)["']/g,
        )) {
          observe(match[1]!, url, "api-candidate", digest);
        }
      }
    } catch {
      media.push({ url, state: "unavailable" });
    }
  }
  const report = {
    schema: "shenron-source-crawl/v1",
    verifiedAt: new Date().toISOString(),
    seeds,
    robots,
    sitemaps: sitemapCaptures,
    sitemapBudget: {
      limits,
      bytes: sitemapBytes,
      consumedBodyBytes,
      storedBytes,
      chunkOvershootBytes: Math.max(0, consumedBodyBytes - limits.bytes),
      listedUrls: sitemapUrls,
      remaining: [...new Set([...sitemapQueue, ...deferredSitemaps])],
    },
    pages,
    media,
    privateArchive: true,
    remainingPages: frontier,
    remainingAssets: queue,
    bytes: totalBytes,
    inventoryEntries: inventory.size,
    privateSearchIndex: "capture-index.sqlite",
    ragIndexed: false,
    trainingEligible: false,
  };
  const index = new Database(join(directory, "capture-index.sqlite"), { create: true });
  try {
    index.exec(
      "CREATE TABLE IF NOT EXISTS captures (url TEXT NOT NULL, kind TEXT NOT NULL, sha256 TEXT, status INTEGER, state TEXT, title TEXT, PRIMARY KEY(url, kind)); CREATE VIRTUAL TABLE IF NOT EXISTS source_text USING fts5(url UNINDEXED, title, text); CREATE TABLE IF NOT EXISTS references_inventory (url TEXT NOT NULL, kind TEXT NOT NULL, discovered_from TEXT NOT NULL, source_sha256 TEXT NOT NULL, PRIMARY KEY(url, kind, discovered_from));",
    );
    index.transaction(() => {
      index.exec(
        "DELETE FROM captures; DELETE FROM source_text; DELETE FROM references_inventory;",
      );
      const insertCapture = index.prepare("INSERT INTO captures VALUES (?, ?, ?, ?, ?, ?)");
      for (const [kind, rows] of [
        ["page", pages],
        ["asset", media],
        ["sitemap", sitemapCaptures],
      ] as const) {
        for (const row of rows)
          insertCapture.run(
            String(row.url),
            kind,
            row.sha256 ? String(row.sha256) : null,
            typeof row.status === "number" ? row.status : null,
            row.state ? String(row.state) : null,
            row.title ? String(row.title) : null,
          );
      }
      const insertText = index.prepare(
        "INSERT INTO source_text (url, title, text) VALUES (?, ?, ?)",
      );
      for (const row of corpus)
        insertText.run(String(row.url), String(row.title), String(row.text));
      const insertReference = index.prepare("INSERT INTO references_inventory VALUES (?, ?, ?, ?)");
      for (const row of inventory.values())
        insertReference.run(row.url, row.kind, row.discoveredFrom, row.sourceSha256);
    })();
  } finally {
    index.close();
  }
  await chmod(join(directory, "capture-index.sqlite"), 0o600);
  await writeFile(
    join(directory, "inventory.json"),
    JSON.stringify(
      {
        schema: "shenron-source-inventory/v1",
        verifiedAt: report.verifiedAt,
        privateArchive: true,
        backendSchemaObserved: false,
        entries: [...inventory.values()],
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  if (options.previousManifest) {
    if (
      previous.schema !== "shenron-source-crawl/v1" ||
      !Array.isArray(previous.pages) ||
      !Array.isArray(previous.media) ||
      (previous.sitemaps !== undefined && !Array.isArray(previous.sitemaps))
    )
      throw new Error("Previous capture manifest invalid");
    await writeFile(
      join(directory, "delta.json"),
      JSON.stringify(
        {
          schema: "shenron-source-delta/v1",
          verifiedAt: report.verifiedAt,
          previousVerifiedAt: previous.verifiedAt,
          ...compareCaptures([...previous.pages, ...previous.media, ...(previous.sitemaps ?? [])], [
            ...pages,
            ...media,
            ...sitemapCaptures,
          ] as CaptureIdentity[]),
          unobservedDoesNotProveRemoval: true,
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
  }
  await writeFile(join(directory, "manifest.json"), JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  await writeFile(
    join(directory, "corpus.jsonl"),
    corpus.map((row) => JSON.stringify(row)).join("\n") + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      pages: pages.length,
      assets: media.length,
      bytes: totalBytes,
      remainingPages: frontier.length,
      remainingAssets: queue.length,
    }),
  );
}
if (import.meta.main) {
  const index = Bun.argv.indexOf("--out");
  const previousIndex = Bun.argv.indexOf("--previous");
  const limits: Partial<typeof sitemapLimits> = {};
  for (const [flag, key] of [
    ["--sitemap-documents", "documents"],
    ["--sitemap-document-bytes", "documentBytes"],
    ["--sitemap-bytes", "bytes"],
    ["--sitemap-urls", "urls"],
  ] as const) {
    const position = Bun.argv.indexOf(flag);
    if (position >= 0) limits[key] = Number(Bun.argv[position + 1]);
  }
  await crawl(
    index >= 0
      ? Bun.argv[index + 1]!
      : resolve(import.meta.dir, "../../var/reports/beerus-site-crawl"),
    {
      previousManifest: previousIndex >= 0 ? Bun.argv[previousIndex + 1] : undefined,
      sitemapLimits: limits,
    },
  );
}
