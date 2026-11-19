/**
 * Pure helpers for `app/sitemap.ts`.
 *
 * `NON_INDEXABLE_PATHS` lists registry destinations that are real routes but
 * must never be announced to crawlers: `/wiki/search` is `noindex,follow` and
 * `/wiki/random` answers a 302 to a random document.
 */
export const NON_INDEXABLE_PATHS: ReadonlySet<string> = new Set(["/wiki/search", "/wiki/random"]);

export function isIndexablePath(path: string): boolean {
  return !NON_INDEXABLE_PATHS.has(path);
}

/**
 * A `lastmod` is only a signal when it is a content date. Returns `undefined`
 * (the entry then carries no `lastmod`) for a missing, zero or invalid source
 * instead of falling back to the generation date.
 */
export function contentDate(value: Date | string | number | null | undefined): Date | undefined {
  if (value === null || value === undefined || value === 0 || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Unix seconds (the bot tables' timestamp unit) to a content date. */
export function contentDateFromSeconds(seconds: number | null | undefined): Date | undefined {
  return seconds ? contentDate(Number(seconds) * 1000) : undefined;
}
