// SPDX-License-Identifier: Apache-2.0
/**
 * Pure, client- and server-safe helpers enforcing Dragon Ball FR's strict
 * Wiki rules:
 *  1. `Repères canoniques`, `Combats Décisifs` and standalone `Sources`
 *     never spawn buttons in `SOMMAIRE`;
 *  2. Every source rendered in the bottom verification block points directly
 *     to an internal `dragonballfr.com` resource (`/wiki/databooks/<id>?page=<n>`,
 *     `/wiki/manga/<id>`, `/wiki/episodes/<id>`, etc.).
 */
import { publicLegacyRedirect } from "@aphrody/shenron-config/legacy-routes";

export interface WikiSourceLike {
  n: number;
  label: string;
  kind: string;
  url?: string | null;
}

export interface EmbeddedLocationEvent {
  title: string;
  description: string;
  mangaRef?: string | null;
}

const SUPPRESSED_TOC_LABEL_RE =
  /^(?:rep[eè]res(?:\s+canoniques?)?|combats?\s+(?:d[ée]cisifs?|l[ée]gendaires?|majeurs?|chronologiques?)|affrontements?\s+(?:d[ée]cisifs?|majeurs?)|sources?(?:\s*(?:&|et)\s*r[ée]f[ée]rences?)?|r[ée]f[ée]rences?(?:\s+des\s+guides(?:\s+officiels)?)?)$/i;

const EMBEDDED_SOURCES_RE = /<!--\s*shenron-sources:\s*(\[[\s\S]*?\])\s*-->/i;
const EMBEDDED_EVENTS_RE = /<!--\s*shenron-events:\s*(\[[\s\S]*?\])\s*-->/i;
const ALL_EMBEDDED_META_RE = /<!--\s*shenron-(?:sources|events):\s*\[[\s\S]*?\]\s*-->/gi;

/** True when a section heading must never appear as a filter pill in `SOMMAIRE`. */
export function isSuppressedTocSectionLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  const cleaned = label.replace(/\s*\(\d+\)\s*$/, "").trim();
  return SUPPRESSED_TOC_LABEL_RE.test(cleaned);
}

/** Strips hidden `<!-- shenron-sources: ... -->` / `<!-- shenron-events: ... -->` metadata comments from Markdown prose. */
export function stripEmbeddedWikiMetadata(markdown: string | null | undefined): string {
  if (!markdown) return "";
  return markdown.replace(ALL_EMBEDDED_META_RE, "").trim();
}

/**
 * Normalizes a URL to a clean root-relative `dragonballfr.com` path, or `null`
 * if the URL is empty, malformed, or points to an external host.
 *
 * Also upgrades legacy databook `#planche-<n>` / `#page-<n>` hashes into
 * `?page=<n>` query parameters so `DatabookReader` opens directly on that plate.
 */
export function normalizeInternalDbfrUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed, "https://dragonballfr.com");
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.hostname !== "dragonballfr.com" ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }

    let pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    const redirected = publicLegacyRedirect(pathname);
    if (redirected) {
      pathname = redirected;
    }

    const searchParams = new URLSearchParams(parsed.search);
    let hash = parsed.hash;

    // Upgrade `/wiki/databooks/<id>#planche-71` -> `/wiki/databooks/<id>?page=71`
    if (/^\/wiki\/databooks\/\d+$/.test(pathname) && hash) {
      const plateMatch = /^#(?:planche|page)-(\d+)$/i.exec(hash);
      if (plateMatch) {
        if (!searchParams.has("page")) {
          searchParams.set("page", plateMatch[1]!);
        }
        hash = "";
      }
    }

    const qs = searchParams.toString();
    return `${pathname}${qs ? `?${qs}` : ""}${hash}`;
  } catch {
    return null;
  }
}

/**
 * Resolves a human textual manga reference (e.g. `"Chapitre 205"`,
 * `"Tome 18, Chapitre 205"`, `"Dragon Ball Super — Chapitre 13"`) to its
 * direct hosted reader URL on `dragonballfr.com` (`/wiki/manga/<id>`).
 */
export function resolveMangaChapterHref(rawRef: string | null | undefined): string | null {
  if (!rawRef || typeof rawRef !== "string") return null;
  const text = rawRef.trim();
  if (!text) return null;

  const isSuper = /\b(?:dragon\s+ball\s+super|dbs)\b/i.test(text);
  const chapMatch = /(?:chapitres?|chap\.?|ch\.?)\s*n?°?\s*(\d{1,3})\b/i.exec(text);
  if (chapMatch) {
    const num = Number(chapMatch[1]);
    if (isSuper && num >= 1 && num <= 103) {
      return `/wiki/manga/${1314 + num}`;
    }
    if (!isSuper && num >= 1 && num <= 519) {
      return `/wiki/manga/${20000 + num}`;
    }
  }

  const volMatch = /\btomes?\s*n?°?\s*(\d{1,2})\b/i.exec(text);
  if (!isSuper && volMatch) {
    const vol = Number(volMatch[1]);
    if (vol >= 1 && vol <= 42) {
      return `/wiki/manga/volume/${500 + vol}`;
    }
  }

  return null;
}

/**
 * Normalizes and filters a list of Wiki sources so that every kept item has a
 * non-empty label and, when a URL is present, a verified internal `dragonballfr.com`
 * path.
 */
export function normalizeInternalWikiSources<T extends WikiSourceLike>(
  sources: readonly T[] | null | undefined,
  { requireInternalUrl = true }: { requireInternalUrl?: boolean } = {},
): Array<Omit<T, "url"> & { url: string | null }> {
  if (!sources || sources.length === 0) return [];
  const seen = new Set<string>();
  const out: Array<Omit<T, "url"> & { url: string | null }> = [];

  for (const item of sources) {
    if (!item || !item.label?.trim()) continue;
    const normalizedUrl = normalizeInternalDbfrUrl(item.url);
    if (requireInternalUrl && !normalizedUrl) continue;
    if (!requireInternalUrl && item.url && !normalizedUrl) continue;

    const dedupeKey = `${normalizedUrl ?? ""}::${item.label.trim()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      ...item,
      label: item.label.trim(),
      url: normalizedUrl,
    });
  }

  return out;
}

/**
 * Extracts structured `WikiSourceLike[]` embedded in `<!-- shenron-sources: [...] -->`
 * inside `article` and merges them with `columnSources`, returning strictly verified
 * internal `dragonballfr.com` sources.
 */
export function mergeArticleAndColumnSources(
  article: string | null | undefined,
  columnSources: readonly WikiSourceLike[] | null | undefined,
): Array<WikiSourceLike & { url: string | null }> {
  const combined: WikiSourceLike[] = [];
  if (article) {
    const match = EMBEDDED_SOURCES_RE.exec(article);
    if (match?.[1]) {
      try {
        const parsed: unknown = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (
              item &&
              typeof item === "object" &&
              typeof (item as WikiSourceLike).label === "string"
            ) {
              combined.push({
                n:
                  typeof (item as WikiSourceLike).n === "number"
                    ? (item as WikiSourceLike).n
                    : combined.length + 1,
                kind:
                  typeof (item as WikiSourceLike).kind === "string"
                    ? (item as WikiSourceLike).kind
                    : "databook",
                label: (item as WikiSourceLike).label,
                url: (item as WikiSourceLike).url ?? null,
              });
            }
          }
        }
      } catch {
        // Ignore malformed metadata comment and fall back to columnSources.
      }
    }
  }

  if (columnSources && columnSources.length > 0) {
    combined.push(...columnSources);
  }

  return normalizeInternalWikiSources(combined, { requireInternalUrl: true });
}

/**
 * Extracts structured `EmbeddedLocationEvent[]` embedded in `<!-- shenron-events: [...] -->`
 * inside `article`, falling back to `columnEvents`.
 */
export function mergeArticleAndColumnEvents(
  article: string | null | undefined,
  columnEvents: readonly EmbeddedLocationEvent[] | null | undefined,
): EmbeddedLocationEvent[] {
  if (article) {
    const match = EMBEDDED_EVENTS_RE.exec(article);
    if (match?.[1]) {
      try {
        const parsed: unknown = JSON.parse(match[1]);
        if (Array.isArray(parsed)) {
          const valid = parsed
            .filter(
              (ev): ev is EmbeddedLocationEvent =>
                Boolean(ev) &&
                typeof ev === "object" &&
                typeof (ev as EmbeddedLocationEvent).title === "string" &&
                typeof (ev as EmbeddedLocationEvent).description === "string",
            )
            .map((ev) => ({
              title: ev.title.trim(),
              description: ev.description.trim(),
              mangaRef: typeof ev.mangaRef === "string" ? ev.mangaRef.trim() : null,
            }))
            .filter((ev) => ev.title.length > 0 && ev.description.length > 0);
          if (valid.length > 0) return valid;
        }
      } catch {
        // Ignore malformed comment and fall back to columnEvents.
      }
    }
  }
  return (columnEvents ?? []).filter((ev) => Boolean(ev?.title));
}
