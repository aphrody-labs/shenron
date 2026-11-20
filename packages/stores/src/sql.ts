// SPDX-License-Identifier: Apache-2.0
import type { StoreListing } from "./types";

/** Dollar-quote a value with a tag the value does not contain, so no input can end the literal early. */
export function lit(value: string | number | boolean | null): string {
  if (value === null) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  let tag = "q";
  while (value.includes(`$${tag}$`)) tag += "q";
  return `$${tag}$${value}$${tag}$`;
}

const textArray = (items: string[]) => `ARRAY[${items.map((item) => lit(item)).join(",")}]::text[]`;

const TABLE = "bot.db_game_store_listings";

/**
 * Upsert statements for `bot.db_game_store_listings`. `changed_at` moves only when a tracked field
 * (title, release date, price, rating) differs, so readers of the change feed see real changes, not polls.
 */
export function upsertSql(listings: readonly StoreListing[]): string {
  const statements = listings.map((l) => {
    const values = [
      lit(l.store),
      lit(l.storeId),
      lit(l.region),
      lit(l.title),
      lit(l.url),
      lit(l.publisher),
      lit(l.developer),
      l.releaseDate ? `${lit(l.releaseDate)}::date` : "NULL",
      textArray(l.platforms),
      lit(l.price?.amount ?? null),
      lit(l.price?.currency ?? null),
      lit(l.price?.formatted ?? null),
      lit(l.price?.free ?? null),
      lit(l.rating),
      lit(l.ratingCount),
      lit(l.addon),
    ].join(", ");
    return `INSERT INTO ${TABLE} (store, store_id, region, title, url, publisher, developer, release_date, platforms, price_amount, price_currency, price_formatted, free, rating, rating_count, addon)
VALUES (${values})
ON CONFLICT (store, store_id, region) DO UPDATE SET
  title = EXCLUDED.title, url = EXCLUDED.url, publisher = EXCLUDED.publisher, developer = EXCLUDED.developer,
  release_date = EXCLUDED.release_date, platforms = EXCLUDED.platforms, price_amount = EXCLUDED.price_amount,
  price_currency = EXCLUDED.price_currency, price_formatted = EXCLUDED.price_formatted, free = EXCLUDED.free,
  rating = EXCLUDED.rating, rating_count = EXCLUDED.rating_count, addon = EXCLUDED.addon, last_seen = now(),
  changed_at = CASE WHEN (${TABLE}.title, ${TABLE}.release_date, ${TABLE}.price_amount, ${TABLE}.rating)
    IS DISTINCT FROM (EXCLUDED.title, EXCLUDED.release_date, EXCLUDED.price_amount, EXCLUDED.rating) THEN now() ELSE ${TABLE}.changed_at END;`;
  });
  return ["BEGIN;", ...statements, "COMMIT;"].join("\n");
}
