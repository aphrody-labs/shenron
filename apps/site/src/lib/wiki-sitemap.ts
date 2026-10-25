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
