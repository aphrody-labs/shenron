// SPDX-License-Identifier: Apache-2.0
import { asArray, asObject, asString, isoDate, optNumber, optString } from "./guard";
import { getJson } from "./http";
import type { SearchOptions, StoreConnector, StoreListing } from "./types";

const STOREFRONT = "https://store.steampowered.com/api";

/** Steam storefront search: id, name and price of the hits (the same data the store search box uses). */
export const steam: StoreConnector = {
  id: "steam",
  async search(term, { region, language = "english" }: SearchOptions) {
    const url = `${STOREFRONT}/storesearch/?term=${encodeURIComponent(term)}&cc=${region}&l=${language}`;
    const items = asArray(asObject(await getJson(url), "steam.search").items, "steam.search.items");
    return items.map((item, index) =>
      parseSearchItem(item, `steam.search.items[${index}]`, region),
    );
  },
};

export function parseSearchItem(item: unknown, path: string, region: string): StoreListing {
  const object = asObject(item, path);
  const id = object.id;
  if (typeof id !== "number") throw new Error(`${path}.id: expected number`);
  const price = object.price === undefined ? null : asObject(object.price, `${path}.price`);
  const cents = price ? optNumber(price.final) : null;
  const currency = price ? optString(price.currency) : null;
  const name = asString(object.name, `${path}.name`);
  return {
    store: "steam",
    storeId: String(id),
    region,
    title: name,
    url: `https://store.steampowered.com/app/${id}/`,
    publisher: null,
    developer: null,
    releaseDate: null,
    platforms: platformsOf(object.platforms),
    price: price
      ? {
          amount: cents === null ? null : cents / 100,
          currency,
          formatted: null,
          free: cents === 0,
        }
      : null,
    rating: null,
    ratingCount: null,
    addon: object.type === "dlc" || /\b(pack|dlc|bundle|season pass)\b/i.test(name),
  };
}

function platformsOf(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return [];
  const flags = value as Record<string, unknown>;
  return (["windows", "mac", "linux"] as const).filter((key) => flags[key] === true);
}

/** Steam `appdetails`: release date, developers, publishers and the formatted price of one app. */
export async function steamDetails(
  appId: string,
  { region, language = "english" }: SearchOptions,
): Promise<StoreListing | null> {
  const url = `${STOREFRONT}/appdetails?appids=${encodeURIComponent(appId)}&cc=${region}&l=${language}`;
  const entry = asObject(
    asObject(await getJson(url), "steam.details")[appId],
    `steam.details.${appId}`,
  );
  if (entry.success !== true) return null;
  const data = asObject(entry.data, `steam.details.${appId}.data`);
  const price =
    data.price_overview === undefined ? null : asObject(data.price_overview, "price_overview");
  const release =
    data.release_date === undefined ? null : asObject(data.release_date, "release_date");
  const stringList = (value: unknown) =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  return {
    store: "steam",
    storeId: appId,
    region,
    title: asString(data.name, "name"),
    url: `https://store.steampowered.com/app/${appId}/`,
    publisher: stringList(data.publishers)[0] ?? null,
    developer: stringList(data.developers)[0] ?? null,
    releaseDate: release && release.coming_soon !== true ? steamDate(release.date) : null,
    platforms: platformsOf(data.platforms),
    price: price
      ? {
          amount: (optNumber(price.final) ?? 0) / 100,
          currency: optString(price.currency),
          formatted: optString(price.final_formatted),
          free: price.final === 0,
        }
      : {
          amount: data.is_free === true ? 0 : null,
          currency: null,
          formatted: null,
          free: data.is_free === true,
        },
    rating: null,
    ratingCount: null,
    addon: data.type === "dlc",
  };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Steam writes dates as `10 Sep, 2025` or `Sep 10, 2025` depending on the language; other shapes are null. */
export function steamDate(value: unknown): string | null {
  const text = optString(value);
  if (!text) return null;
  const dayFirst = /^(\d{1,2}) (\w{3})\w*,? (\d{4})$/.exec(text);
  const monthFirst = /^(\w{3})\w* (\d{1,2}),? (\d{4})$/.exec(text);
  const [day, month, year] = dayFirst
    ? [dayFirst[1], dayFirst[2], dayFirst[3]]
    : monthFirst
      ? [monthFirst[2], monthFirst[1], monthFirst[3]]
      : [];
  const monthIndex = month ? MONTHS.indexOf(month.toLowerCase()) : -1;
  if (!day || !year || monthIndex < 0) return isoDate(text);
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${day.padStart(2, "0")}`;
}
