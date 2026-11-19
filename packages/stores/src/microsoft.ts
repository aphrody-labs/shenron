// SPDX-License-Identifier: Apache-2.0
import { asArray, asObject, asString, optNumber, optString } from "./guard";
import { getJson } from "./http";
import type { SearchOptions, StoreConnector, StoreListing } from "./types";

/**
 * Microsoft Store search through the public storefront endpoint the Store app itself calls. It is
 * not a documented API: the shape is checked strictly, and a change makes the connector fail loudly.
 */
export const microsoft: StoreConnector = {
  id: "microsoft",
  async search(term, { region, language }: SearchOptions) {
    const locale = `${language ?? "en"}-${region.toUpperCase()}`;
    const url = `https://storeedgefd.dsx.mp.microsoft.com/v9.0/pages/searchResults?market=${region.toUpperCase()}&locale=${locale}&query=${encodeURIComponent(term)}&deviceFamily=Windows.Desktop`;
    const body = await getJson(url);
    // The endpoint answers with an array whose second element carries the payload.
    const root = Array.isArray(body) ? (body[1] ?? body[0]) : body;
    const payload = asObject(asObject(root, "microsoft.search").Payload, "microsoft.search.Payload");
    const results = asArray(payload.SearchResults, "microsoft.search.Payload.SearchResults");
    return results.map((result, index) => parseResult(result, `microsoft.search.Payload.SearchResults[${index}]`, region));
  },
};

export function parseResult(result: unknown, path: string, region: string): StoreListing {
  const object = asObject(result, path);
  const id = asString(object.ProductId, `${path}.ProductId`);
  const title = asString(object.Title, `${path}.Title`);
  const price = optNumber(object.Price);
  return {
    store: "microsoft",
    storeId: id,
    region,
    title,
    url: `https://apps.microsoft.com/detail/${id}`,
    publisher: optString(object.PublisherName),
    developer: null,
    releaseDate: null,
    platforms: /\(xbox\)/i.test(title) ? ["Xbox"] : ["Windows"],
    price: { amount: price, currency: null, formatted: optString(object.DisplayPrice), free: price === 0 },
    rating: optNumber(object.AverageRating),
    ratingCount: optNumber(object.RatingsCount),
    addon: optString(object.ProductKind) === "Durable" || /\b(pack|dlc|bundle|season pass)\b/i.test(title),
  };
}
