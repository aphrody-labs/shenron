// SPDX-License-Identifier: Apache-2.0
import { catalogPageNumber, catalogPublicUrl } from "../../lib/catalog-explorer-contract";
import { readerAssetUrl } from "../../lib/reader-assets";

export function worldCatalogUrl(
  input: {
    category?: string;
    page?: unknown;
    q?: string;
    id?: string;
  } = {},
): string {
  if (!input.category) return "/api/catalog";
  const query = new URLSearchParams({ category: input.category });
  if (input.id !== undefined) query.set("id", input.id);
  else {
    query.set("page", String(catalogPageNumber(input.page ?? 1)));
    if (input.q?.trim()) query.set("q", input.q.trim().slice(0, 200));
  }
  return `/api/catalog?${query}`;
}

export function worldPublicHref(value: unknown): string | null {
  return catalogPublicUrl(value);
}

export function worldImageUrl(value: unknown): string | null {
  const publicUrl = catalogPublicUrl(value);
  return publicUrl ? readerAssetUrl(publicUrl) : null;
}
