// SPDX-License-Identifier: Apache-2.0
type Page = { title: string; slug: string };
type Branch = {
  name: string;
  slug: string;
  pages: Page[];
  children: { name: string; slug: string; pages: Page[] }[];
};

export function wikiSearchMatches(query: string, ...values: string[]): boolean {
  const fold = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .trim();
  const needle = fold(query);
  return !needle || values.some((value) => fold(value).includes(needle));
}

/** Matching a category exposes its entire branch, so editors can still navigate it. */
export function filterWikiBranches<T extends Branch>(categories: T[], query: string): T[] {
  return categories.flatMap((category) => {
    if (wikiSearchMatches(query, category.name, category.slug)) return [category];
    const pages = category.pages.filter((page) => wikiSearchMatches(query, page.title, page.slug));
    const children = category.children.flatMap((child) => {
      if (wikiSearchMatches(query, child.name, child.slug)) return [child];
      const matchedPages = child.pages.filter((page) =>
        wikiSearchMatches(query, page.title, page.slug),
      );
      return matchedPages.length ? [{ ...child, pages: matchedPages }] : [];
    });
    return pages.length || children.length ? [{ ...category, pages, children }] : [];
  });
}
