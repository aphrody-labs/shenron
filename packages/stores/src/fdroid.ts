// SPDX-License-Identifier: Apache-2.0
import { asArray, asObject, asString, optString } from "./guard";
import { getJson } from "./http";
import type { SearchOptions, StoreConnector, StoreListing } from "./types";

/** F-Droid's public app search (search.f-droid.org): free and open-source Android apps. */
export const fdroid: StoreConnector = {
  id: "fdroid",
  async search(term, { language = "en" }: SearchOptions) {
    const url = `https://search.f-droid.org/api/search_apps?q=${encodeURIComponent(term)}&lang=${language}`;
    const apps = asArray(asObject(await getJson(url), "fdroid.search").apps, "fdroid.search.apps");
    return apps.map((app, index) => parseApp(app, `fdroid.search.apps[${index}]`));
  },
};

export function parseApp(app: unknown, path: string): StoreListing {
  const object = asObject(app, path);
  const url = asString(object.url, `${path}.url`);
  const packageName = url.split("/packages/")[1]?.replace(/\/+$/, "") ?? url;
  return {
    store: "fdroid",
    storeId: packageName,
    region: "all",
    title: asString(object.name, `${path}.name`),
    url,
    publisher: null,
    developer: optString(object.author),
    releaseDate: null,
    platforms: ["Android"],
    price: { amount: 0, currency: null, formatted: null, free: true },
    rating: null,
    ratingCount: null,
    addon: false,
  };
}
