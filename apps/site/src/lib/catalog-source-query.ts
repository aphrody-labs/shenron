// SPDX-License-Identifier: Apache-2.0
export const CATALOG_SOURCE_KINDS = [
  "publisher",
  "reference",
  "archive",
  "wayback",
  "encyclopedia",
  "statistics",
  "media",
] as const;
export const CATALOG_SOURCE_ORDERS = ["source", "title", "recent", "oldest", "relevance"] as const;
export type CatalogSourceOrder = (typeof CATALOG_SOURCE_ORDERS)[number];
export type CatalogSourceFilters = {
  order: CatalogSourceOrder;
  focus: "all" | "dragon-ball";
  kind: string;
  domain: string;
};
export function isSourceCatalog(category: string) {
  return ["sources", "archive_movies", "archive_images"].includes(category);
}
export function catalogSourceFilters(
  category: string,
  input: Record<string, unknown> = {},
): CatalogSourceFilters {
  const order = CATALOG_SOURCE_ORDERS.includes(input.order as CatalogSourceOrder)
    ? (input.order as CatalogSourceOrder)
    : category === "sources"
      ? "source"
      : "title";
  const focus =
    input.focus === "all"
      ? "all"
      : input.focus === "dragon-ball" || isSourceCatalog(category)
        ? "dragon-ball"
        : "all";
  const kind =
    category === "sources" &&
    CATALOG_SOURCE_KINDS.includes(input.kind as (typeof CATALOG_SOURCE_KINDS)[number])
      ? String(input.kind)
      : "";
  const domain =
    typeof input.domain === "string" &&
    /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(input.domain) &&
    input.domain.length <= 253
      ? input.domain.toLowerCase().replace(/^www\./, "")
      : "";
  return { order, focus, kind, domain };
}
export function catalogSourceHost(value: unknown) {
  try {
    return typeof value === "string"
      ? new URL(value).hostname.toLowerCase().replace(/^www\./, "")
      : "";
  } catch {
    return "";
  }
}
/** URL-only controls keep one server query and preserve late pages without hydrating the catalogue. */
export function catalogBrowseHref(category: string, input: Record<string, unknown>, page = 1) {
  const query = new URLSearchParams();
  for (const key of ["q", "parent", "order", "focus", "kind", "domain"])
    if (typeof input[key] === "string" && input[key]) query.set(key, input[key] as string);
  query.set("page", String(page));
  return `/catalog/${encodeURIComponent(category)}?${query}`;
}
