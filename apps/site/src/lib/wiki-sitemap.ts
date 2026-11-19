import { CHARACTER_DUPLICATE_REDIRECTS, formatCharacterSlug } from "@/lib/wiki-slugs";

type CharacterIdentity = {
  id: number;
  name: string;
  nameRomaji?: string | null;
  nameJa?: string | null;
};

/** Sitemap URLs must use canonical character records, never redirected duplicate IDs. */
export function canonicalCharacterSitemapRows<T extends CharacterIdentity>(
  rows: readonly T[],
): T[] {
  const slugs = new Set<string>();
  return rows.filter((row) => {
    if (CHARACTER_DUPLICATE_REDIRECTS[row.id]) return false;
    const slug = formatCharacterSlug(row);
    if (slugs.has(slug)) return false;
    slugs.add(slug);
    return true;
  });
}

/**
 * Sitemap tuples for slug-addressed detail pages. Rows with an empty or
 * non-string slug are dropped and each slug is emitted once, in input order.
 */
export function slugSitemapPaths(
  prefix: string,
  rows: readonly { slug: unknown }[],
): Array<[string, number, undefined]> {
  const base = prefix.replace(/\/+$/, "");
  const seen = new Set<string>();
  const out: Array<[string, number, undefined]> = [];
  for (const { slug } of rows) {
    if (typeof slug !== "string" || slug.trim() === "" || seen.has(slug)) continue;
    seen.add(slug);
    out.push([`${base}/${slug}`, 0.5, undefined]);
  }
  return out;
}
