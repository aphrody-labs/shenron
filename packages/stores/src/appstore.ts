// SPDX-License-Identifier: Apache-2.0
import { asArray, asObject, asString, isoDate, optNumber, optString } from "./guard";
import { getJson } from "./http";
import type { SearchOptions, StoreConnector, StoreListing } from "./types";

/** Apple's iTunes Search API (documented, no key): software results of one storefront country. */
export const appstore: StoreConnector = {
  id: "appstore",
  async search(term, { region }: SearchOptions) {
    const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=software&country=${region}&limit=200`;
    const results = asArray(
      asObject(await getJson(url), "appstore.search").results,
      "appstore.search.results",
    );
    return results.map((result, index) =>
      parseResult(result, `appstore.search.results[${index}]`, region),
    );
  },
};

export function parseResult(result: unknown, path: string, region: string): StoreListing {
  const object = asObject(result, path);
  const id = object.trackId;
  if (typeof id !== "number") throw new Error(`${path}.trackId: expected number`);
  const price = optNumber(object.price);
  return {
    store: "appstore",
    storeId: String(id),
    region,
    title: asString(object.trackName, `${path}.trackName`),
    url: optString(object.trackViewUrl) ?? `https://apps.apple.com/${region}/app/id${id}`,
    publisher: optString(object.sellerName),
    developer: optString(object.artistName),
    releaseDate: isoDate(object.releaseDate),
    platforms: ["iOS"],
    price: {
      amount: price,
      currency: optString(object.currency),
      formatted: optString(object.formattedPrice),
      free: price === 0,
    },
    rating: optNumber(object.averageUserRating),
    ratingCount: optNumber(object.userRatingCount),
    addon: false,
  };
}
